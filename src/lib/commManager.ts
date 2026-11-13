// Simulated Communication & Mission State Manager
// Models communication delay between Mars Explorer and remote Earth Science Team.
// Maintains message state machine (queued -> in_transit -> delivered -> replied),
// tracks simulated mission time, and detects plan version discrepancies.

import {
  type CommMessage,
  type FieldTask,
  type ObservationRecord,
  type MissionStatusSnapshot,
  deleteMessages,
  getAllMessages,
  getAllTasks,
  saveMessage,
  saveTask,
  saveObservation,
} from './storage';

export interface CommSettings {
  oneWayDelayMinutes: number; // default 5.0
  clockSpeedMultiplier: number; // 1, 5, 10, 30, 60
  simStartLMSTSeconds: number; // 14:30:00 = 52200
}

export const DEFAULT_COMM_SETTINGS: CommSettings = {
  oneWayDelayMinutes: 5.0,
  clockSpeedMultiplier: 1,
  simStartLMSTSeconds: 52200, // 14:30 LMST
};

export function formatSimLMST(seconds: number): string {
  const normalized = Math.floor(seconds) % 86400;
  const h = Math.floor(normalized / 3600);
  const m = Math.floor((normalized % 3600) / 60);
  const s = normalized % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} LMST`;
}

export function formatSecondsCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export interface PlanSnapshot {
  version: number;
  summary: string;
  destinationName: string;
  totalDistanceMeters: number;
  maxSlopeDeg: number;
}

function createMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

/**
 * Sends a question from Mars Explorer to Science Team.
 * Transition: Message created in 'in_transit' to Earth.
 * Blocks only tasks explicitly marked as requiring Earth advice.
 */
export async function sendQuestionToScienceTeam(params: {
  observation: ObservationRecord;
  questionText: string;
  simTime: number;
  oneWayDelayMinutes: number;
  currentPlan: PlanSnapshot;
  statusSnapshot?: MissionStatusSnapshot;
  activeTaskId?: string | null;
}): Promise<CommMessage> {
  const { observation, questionText, simTime, oneWayDelayMinutes, currentPlan, activeTaskId } = params;
  const delaySec = Math.round(oneWayDelayMinutes * 60);

  const messageId = createMessageId('msg');

  const message: CommMessage = {
    id: messageId,
    kind: 'question',
    observationId: observation.id,
    observationSnapshot: { ...observation, question: questionText.trim() },
    statusSnapshot: params.statusSnapshot,
    siteId: observation.siteId,
    siteName: observation.siteName,
    taskId: activeTaskId || observation.taskId || null,
    questionText: questionText.trim(),
    originalPlanVersion: currentPlan.version,
    originalPlanSummary: currentPlan.summary,
    status: 'in_transit',
    direction: 'uplink',
    sentAtSimTime: simTime,
    deliveredAtSimTime: simTime + delaySec,
    earliestPossibleReplyAtSimTime: simTime + delaySec * 2,
  };

  await saveMessage(message);

  // Update observation with the question
  const updatedObs: ObservationRecord = {
    ...observation,
    question: questionText.trim(),
  };
  await saveObservation(updatedObs);

  // If a task was linked, mark it blocked on advice
  if (activeTaskId) {
    const tasks = await getAllTasks();
    const targetTask = tasks.find((t) => t.id === activeTaskId);
    if (targetTask?.requiresEarthAdvice && targetTask.status !== 'completed') {
      const updatedTask: FieldTask = {
        ...targetTask,
        status: 'blocked_on_advice',
        blockedByMessageId: messageId,
      };
      await saveTask(updatedTask);
    }
  }

  return message;
}

export async function sendMissionStatusUpdate(params: {
  statusSnapshot: MissionStatusSnapshot;
  simTime: number;
  oneWayDelayMinutes: number;
  observationSnapshot?: ObservationRecord;
}): Promise<CommMessage> {
  const { statusSnapshot, simTime, oneWayDelayMinutes, observationSnapshot } = params;
  const delaySec = Math.round(oneWayDelayMinutes * 60);
  const existing = await getAllMessages();
  const oldStatusUpdates = existing
    .filter((message) => message.kind === 'status_update')
    .sort((a, b) => (a.statusSnapshot?.sequenceNumber ?? 0) - (b.statusSnapshot?.sequenceNumber ?? 0));
  if (oldStatusUpdates.length >= 500) {
    await deleteMessages(oldStatusUpdates.slice(0, oldStatusUpdates.length - 499).map((message) => message.id));
  }
  const isObservation = Boolean(observationSnapshot);
  const message: CommMessage = {
    id: createMessageId('status'),
    kind: isObservation ? 'observation_update' : 'status_update',
    observationId: observationSnapshot?.id || `status-${createMessageId('snapshot')}`,
    observationSnapshot,
    statusSnapshot: { ...statusSnapshot, position: { ...statusSnapshot.position } },
    statusCreatedAtSimTime: statusSnapshot.capturedAtSimTime ?? simTime,
    siteId: observationSnapshot?.siteId || 'mission-status',
    siteName: observationSnapshot?.siteName || 'Mission status',
    taskId: observationSnapshot?.taskId || statusSnapshot.currentTaskId || null,
    questionText: isObservation
      ? 'Observation recorded'
      : `${statusSnapshot.activityEvent || 'Mission status update'} · Plan v${statusSnapshot.planVersion}`,
    originalPlanVersion: statusSnapshot.planVersion,
    originalPlanSummary: statusSnapshot.planSummary,
    status: 'in_transit',
    direction: 'uplink',
    sentAtSimTime: simTime,
    deliveredAtSimTime: simTime + delaySec,
  };
  await saveMessage(message);
  return message;
}

/**
 * Science Team transmits guidance back to Mars.
 * Sets message reply fields and initiates downlink.
 */
export async function sendReplyFromScienceTeam(params: {
  messageId: string;
  replyText: string;
  simTime: number;
  oneWayDelayMinutes: number;
  authorName?: string;
}): Promise<CommMessage> {
  const {
    messageId,
    replyText,
    simTime,
    oneWayDelayMinutes,
    authorName = 'Dr. Sarah Lindqvist (Lead Sedimentologist, Jezero Science Team)',
  } = params;

  const messages = await getAllMessages();
  const msg = messages.find((m) => m.id === messageId);
  if (!msg) throw new Error(`Message ${messageId} not found`);

  const delaySec = Math.round(oneWayDelayMinutes * 60);

  const updated: CommMessage = {
    ...msg,
    replyText: replyText.trim(),
    scienceTeamAuthor: authorName,
    replySentAtSimTime: simTime,
    replyDeliveredAtSimTime: simTime + delaySec,
    replyPlanVersion: msg.originalPlanVersion,
    planDifference: null,
  };

  await saveMessage(updated);
  return updated;
}

/**
 * Ticks message statuses according to simulated time:
 * - Uplink: in_transit -> delivered (once simTime >= deliveredAtSimTime)
 * - Downlink reply: once simTime >= replyDeliveredAtSimTime -> status becomes 'replied'
 */
export async function tickMessageStatuses(
  messages: CommMessage[],
  simTime: number,
): Promise<{ updatedMessages: CommMessage[]; hasChanges: boolean }> {
  let hasChanges = false;
  const updatedMessages = [...messages];

  for (let i = 0; i < updatedMessages.length; i++) {
    const msg = updatedMessages[i];
    if (msg.status === 'in_transit' && simTime >= msg.deliveredAtSimTime && !msg.replyText) {
      updatedMessages[i] = {
        ...msg,
        status: 'delivered',
      };
      await saveMessage(updatedMessages[i]);
      hasChanges = true;
    } else if (
      msg.replyText &&
      msg.replyDeliveredAtSimTime &&
      simTime >= msg.replyDeliveredAtSimTime &&
      msg.status !== 'replied'
    ) {
      updatedMessages[i] = {
        ...msg,
        status: 'replied',
      };
      await saveMessage(updatedMessages[i]);
      hasChanges = true;
    }
  }

  return { updatedMessages, hasChanges };
}

export async function sendCrewMessage(params: { text: string; direction: 'uplink' | 'downlink'; simTime: number; oneWayDelayMinutes: number }): Promise<CommMessage> {
  const text = params.text.trim();
  if (!text || text.length > 2000) throw new Error('Enter a message of up to 2,000 characters.');
  if (!Number.isFinite(params.oneWayDelayMinutes) || params.oneWayDelayMinutes < 0) throw new Error('Invalid signal delay.');
  const message: CommMessage = {
    id: createMessageId('chat'), kind: 'chat', direction: params.direction,
    observationId: '', siteId: 'mission', siteName: 'Crew communication', taskId: null,
    questionText: text, originalPlanVersion: 0, originalPlanSummary: '', status: 'in_transit',
    sentAtSimTime: params.simTime, deliveredAtSimTime: params.simTime + Math.round(params.oneWayDelayMinutes * 60),
  };
  await saveMessage(message);
  return message;
}
