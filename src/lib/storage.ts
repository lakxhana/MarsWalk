import {apiRequest as api} from './apiClient';
// Shared mission API persistence
// Stores scientific observations, delayed communication messages, and field tasks.
// Safely migrates existing localStorage entries without deletion.
// Provides validated JSON import / export and explicit error handling.
//
// Note: Archival NASA images and orbital HiRISE tiles require network connectivity on first fetch.

export type LocationStatus = 'verified' | 'unverified' | 'catalog_only';

export interface GeoLocation {
  lon?: number;
  lat?: number;
  x?: number;
  z?: number;
  elevationMeters?: number;
  description?: string;
  coordinateReference?: string;
}

export interface ObservationEditHistory {
  editedAt: string;
  previousNote: string;
  previousQuestion: string | null;
  planVersion: number;
}

export interface ObservationRecord {
  id: string; // Stable UUID or timestamp-based ID
  siteId: string;
  siteName: string;
  targetName: string;
  location: GeoLocation;
  locationStatus: LocationStatus;
  cameraLocation?: GeoLocation;
  targetLocation?: GeoLocation;
  audioRef?: string; // Persisted data URL of crew voice recording
  imageRef: string; // URL or blob key
  imageCaption: string;
  imageIsArchival: boolean;
  imageSource: string;
  note: string;
  question: string | null;
  timestamp: string; // ISO 8601
  createdAtSimTime?: number;
  missionElapsedSeconds?: number;
  activityDurationSeconds?: number;
  taskId: string | null;
  planVersion: number;
  editHistory: ObservationEditHistory[];
}

export type CommMessageStatus = 'queued' | 'in_transit' | 'delivered' | 'replied';

export interface CommMessage {
  adviceContext?: import('./adviceTiming').AdviceContext;
  replyAdviceContext?: import('./adviceTiming').AdviceContext;
  id: string;
  kind?: 'question' | 'status_update' | 'observation_update' | 'chat';
  observationId: string;
  observationSnapshot?: ObservationRecord;
  statusSnapshot?: MissionStatusSnapshot;
  statusCreatedAtSimTime?: number;
  siteId: string;
  siteName: string;
  taskId: string | null;
  questionText: string;
  originalPlanVersion: number;
  originalPlanSummary: string;
  status: CommMessageStatus;
  direction: 'uplink' | 'downlink'; // uplink: Explorer -> Science Team; downlink: Science Team -> Explorer
  sentAtSimTime: number; // simulated seconds
  deliveredAtSimTime: number; // simulated seconds
  earliestPossibleReplyAtSimTime?: number; // simulated seconds
  replyText?: string;
  replySentAtSimTime?: number;
  replyDeliveredAtSimTime?: number;
  replyPlanVersion?: number;
  planDifference?: string | null; // e.g. "Plan changed since request: Destination changed..."
  scienceTeamAuthor?: string;
}

export interface MissionStatusSnapshot {
  slopeLimitDeg?: number;
  comparison?: import('./planComparison').ComparisonInput;
  planning?:{paceMps:number;paceObserved:boolean;arrivalMinutes:number;returnMinutes:number;stopAllowanceMinutes:number;replyMinutes:number;reachableDistanceMeters:number|null};
  mapMode?: 'regional';
  routeDistanceMeters?:number;
  routeTotalMeters?:number;
  progressPercent?:number;
  operations?: import('./crewOperations').OperationsReport;
  missionId?: string;
  explorerId?: string;
  sequenceNumber?: number;
  capturedAtSimTime?: number;
  headingRadians?: number;
  movementState?: 'Walking' | 'Stopped' | 'Recording' | 'Returning' | 'Investigating';
  activityEvent?: string;
  currentTaskId?: string | null;
  currentTaskName?: string | null;
  taskSummary?: Array<{ id: string; title: string; status: TaskStatus }>;
  remainingMissionMinutes?: number | null;
  planVersion: number;
  planSummary: string;
  destinationName: string;
  position: { x: number; z: number };
  coordinateReference: string;
  missionElapsedSeconds: number;
  missionBudgetMinutes: number;
  reserveMinutes: number;
  returnEstimateMinutes: number | null;
  base?: { x: number; z: number; name: string } | null;
  plannedRoutePoints?: Array<{ x: number; z: number }>;
}

export type TaskStatus = 'pending' | 'in_progress' | 'blocked_on_advice' | 'completed';

export interface FieldTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  blockedByMessageId?: string;
  estimatedMinutes: number;
  isIndependent: boolean;
  requiresEarthAdvice?: boolean;
  category: 'sampling' | 'survey' | 'atmospheric' | 'maintenance' | 'navigation';
  siteId?: string;
}

export interface ExportDataPayload {
  format: 'marswalk_data_v1';
  exportedAt: string;
  version: 1;
  observations: ObservationRecord[];
  messages: CommMessage[];
  tasks: FieldTask[];
  settings: {
    oneWayDelayMinutes: number;
    clockSpeedMultiplier: number;
  };
}

// Legacy import is explicit only; fresh databases start empty.
export const getStoredMission = <T,>() => api<T | null>('mission');
export const saveStoredMission = (value: unknown) => api('mission','PUT',value);
export async function migrateLegacyNotebook(): Promise<number> {
  if(typeof window === 'undefined') return 0;
  const health = await api<{databaseId:string}>('health');
  const migrationKey = `marswalk_sqlite_migrated_${health.databaseId}`;
  if(localStorage.getItem(migrationKey)) return 0;
  const legacy = await import('./legacyStorage');
  await legacy.migrateLegacyNotebook();
  const [observations,messages,tasks] = await Promise.all([legacy.getAllObservations(),legacy.getAllMessages(),legacy.getAllTasks()]);
  let migrationId = localStorage.getItem('marswalk_migration_id');
  if(!migrationId){migrationId=crypto.randomUUID();localStorage.setItem('marswalk_migration_id',migrationId);}
  await api('import','POST',{observations,messages,tasks,migrationId});
  localStorage.setItem(migrationKey,'true');
  return observations.length;
}
export async function getAllObservations(): Promise<ObservationRecord[]> {return (await api<ObservationRecord[]>('observations')).sort((a,b)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime());}
export async function getObservationById(id:string): Promise<ObservationRecord | null> {return (await getAllObservations()).find(o=>o.id===id) ?? null;}
export async function saveObservation(record:ObservationRecord): Promise<void> {await api('observations','PUT',record);}
export async function deleteObservation(id:string): Promise<void> {await api('observations','DELETE',{ids:[id]});}
export async function getAllMessages(): Promise<CommMessage[]> {return (await api<CommMessage[]>('messages')).sort((a,b)=>b.sentAtSimTime-a.sentAtSimTime);}
export async function saveMessage(message:CommMessage): Promise<void> {await api('messages','PUT',message);}
export async function deleteMessages(ids:string[]): Promise<void> {if(ids.length)await api('messages','DELETE',{ids});}
export async function getAllTasks(): Promise<FieldTask[]> {return api<FieldTask[]>('tasks');}
export async function saveTask(task:FieldTask): Promise<void> {await api('tasks','PUT',task);}

export async function exportAllDataAsJSON(settings = { oneWayDelayMinutes: 5, clockSpeedMultiplier: 1 }): Promise<string> {
  const [observations, messages, tasks] = await Promise.all([
    getAllObservations(),
    getAllMessages(),
    getAllTasks(),
  ]);

  const payload: ExportDataPayload = {
    format: 'marswalk_data_v1',
    version: 1,
    exportedAt: new Date().toISOString(),
    observations,
    messages,
    tasks,
    settings,
  };

  return JSON.stringify(payload, null, 2);
}

export interface ImportValidationResult {
  success: boolean;
  importedObservations: number;
  importedMessages: number;
  importedTasks: number;
  error?: string;
}

export async function importDataFromJSON(jsonString: string): Promise<ImportValidationResult> {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return { success: false, importedObservations: 0, importedMessages: 0, importedTasks: 0, error: 'File content is not a valid JSON object.' };
    }

    if (parsed.format !== 'marswalk_data_v1' || parsed.version !== 1) {
      return {
        success: false,
        importedObservations: 0,
        importedMessages: 0,
        importedTasks: 0,
        error: 'Unsupported or missing format header. Expected "marswalk_data_v1".',
      };
    }

    if (!Array.isArray(parsed.observations) || !Array.isArray(parsed.messages) || !Array.isArray(parsed.tasks)) {
      return {
        success: false,
        importedObservations: 0,
        importedMessages: 0,
        importedTasks: 0,
        error: 'Invalid schema: observations, messages, and tasks arrays are required.',
      };
    }

    // Validate each observation record
    for (let i = 0; i < parsed.observations.length; i++) {
      const o = parsed.observations[i];
      if (!o.id || typeof o.id !== 'string') {
        return { success: false, importedObservations: 0, importedMessages: 0, importedTasks: 0, error: `Observation #${i + 1} has an invalid or missing "id".` };
      }
      if (!o.siteId || typeof o.siteId !== 'string') {
        return { success: false, importedObservations: 0, importedMessages: 0, importedTasks: 0, error: `Observation "${o.id}" is missing required "siteId".` };
      }
      if (typeof o.note !== 'string') {
        return { success: false, importedObservations: 0, importedMessages: 0, importedTasks: 0, error: `Observation "${o.id}" is missing required "note" text.` };
      }
    }

    await api('import','POST',parsed);

    return {
      success: true,
      importedObservations: parsed.observations.length,
      importedMessages: parsed.messages.length,
      importedTasks: parsed.tasks.length,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      importedObservations: 0,
      importedMessages: 0,
      importedTasks: 0,
      error: `JSON parse or storage failure: ${message}`,
    };
  }
}
