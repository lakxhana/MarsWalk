export interface MissionTiming {
  remainingMinutes: number;
  returnMinutes: number | null;
  reserveMinutes: number;
  availableStopMinutes: number | null;
  overrunMinutes: number;
}

export function advanceSimulationTime(
  currentSimTime: number,
  elapsedSeconds: number,
  simulationPaused: boolean,
): number {
  return simulationPaused ? currentSimTime : currentSimTime + elapsedSeconds;
}

export function calculateMissionTiming(
  budgetMinutes: number,
  elapsedSeconds: number,
  returnMinutes: number | null,
  reserveMinutes: number,
): MissionTiming {
  const remainingMinutes = Math.max(0, budgetMinutes - elapsedSeconds / 60);
  return {
    remainingMinutes,
    returnMinutes,
    reserveMinutes,
    availableStopMinutes:
      returnMinutes === null ? null : remainingMinutes - returnMinutes - reserveMinutes,
    overrunMinutes: Math.max(0, elapsedSeconds / 60 - budgetMinutes),
  };
}

export function calculateItineraryMinutes(
  travelToStopMinutes: number | null,
  remainingObservationMinutes: number,
  returnFromStopMinutes: number | null,
  reserveMinutes: number,
): number | null {
  if (travelToStopMinutes === null || returnFromStopMinutes === null) return null;
  return travelToStopMinutes + remainingObservationMinutes + returnFromStopMinutes + reserveMinutes;
}

export function calculateReplyWindow(
  availableStopMinutes: number | null,
  oneWayDelayMinutes: number,
): { earliestReplyMinutes: number; arrivesBeforeReturnDeparture: boolean | null } {
  const earliestReplyMinutes = oneWayDelayMinutes * 2;
  return {
    earliestReplyMinutes,
    arrivesBeforeReturnDeparture:
      availableStopMinutes === null ? null : earliestReplyMinutes < availableStopMinutes,
  };
}

export type CommunicationStage =
  | 'in_transit_to_earth'
  | 'delivered_to_earth'
  | 'reply_in_transit'
  | 'reply_received';

export function getCommunicationStage(
  message: {
    deliveredAtSimTime: number;
    replyText?: string;
    replyDeliveredAtSimTime?: number;
  },
  simTime: number,
): CommunicationStage {
  if (message.replyText) {
    return message.replyDeliveredAtSimTime !== undefined && simTime >= message.replyDeliveredAtSimTime
      ? 'reply_received'
      : 'reply_in_transit';
  }
  return simTime >= message.deliveredAtSimTime ? 'delivered_to_earth' : 'in_transit_to_earth';
}
