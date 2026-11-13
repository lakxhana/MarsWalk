import type { CommMessage } from './storage';

export function getDeliveredUplinkMessages(
  messages: CommMessage[],
  simTime: number,
): CommMessage[] {
  return messages.filter(
    (message) => message.direction === 'uplink' && simTime >= message.deliveredAtSimTime,
  );
}

export function getDeliveredMissionActivity(
  messages: CommMessage[],
  simTime: number,
  missionId: string,
): CommMessage[] {
  return getDeliveredUplinkMessages(messages, simTime)
    .filter((message) => message.statusSnapshot?.missionId === missionId)
    .sort((a, b) =>
      (a.statusSnapshot?.sequenceNumber ?? 0) - (b.statusSnapshot?.sequenceNumber ?? 0) ||
      a.deliveredAtSimTime - b.deliveredAtSimTime,
    );
}

export function getLatestMissionActivity(messages: CommMessage[]): CommMessage | null {
  return messages.reduce<CommMessage | null>((latest, message) => {
    if (!latest) return message;
    return (message.statusSnapshot?.sequenceNumber ?? 0) >
      (latest.statusSnapshot?.sequenceNumber ?? 0)
      ? message
      : latest;
  }, null);
}

export function getReplayActivity(
  messages: CommMessage[],
  selectedMessageId: string | null,
): CommMessage[] {
  if (!selectedMessageId) return messages;
  const selected = messages.find((message) => message.id === selectedMessageId);
  if (!selected) return messages;
  const cutoff = selected.statusSnapshot?.sequenceNumber ?? 0;
  return messages.filter((message) => (message.statusSnapshot?.sequenceNumber ?? 0) <= cutoff);
}

/** Staleness starts at receipt: propagation delay is expected, not an outage. */
export function isReportOverdue(message: CommMessage | null, simTime: number, intervalSeconds: number): boolean {
  return message !== null && simTime - message.deliveredAtSimTime > intervalSeconds * 2;
}
