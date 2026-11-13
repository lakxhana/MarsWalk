import {
  advanceSimulationTime,
  calculateItineraryMinutes,
  calculateMissionTiming,
  calculateReplyWindow,
  getCommunicationStage,
} from '../src/lib/missionTiming';

let failures = 0;

function assertEqual(actual: number | string | boolean | null, expected: number | string | boolean | null, label: string) {
  if (actual !== expected) {
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
    failures++;
  } else {
    console.log(`PASS ${label}`);
  }
}

const afterTwelveMinutes = calculateMissionTiming(60, 12 * 60, 21, 10);
assertEqual(
  advanceSimulationTime(52_200, 8 * 60, false),
  52_680,
  'the shared simulation clock advances eight minutes for an eight-minute stationary activity',
);
assertEqual(
  advanceSimulationTime(52_200, 8 * 60, true),
  52_200,
  'pause simulation freezes the shared clock and communication progression',
);
assertEqual(afterTwelveMinutes.remainingMinutes, 48, '60-minute mission has 48 minutes left after 12 minutes');
assertEqual(afterTwelveMinutes.availableStopMinutes, 17, 'available stop time reserves return and 10-minute reserve');

const replyWindow = calculateReplyWindow(afterTwelveMinutes.availableStopMinutes, 10);
assertEqual(replyWindow.earliestReplyMinutes, 20, 'earliest possible reply uses outbound plus inbound delay');
assertEqual(replyWindow.arrivesBeforeReturnDeparture, false, '20-minute reply cannot arrive before the 17-minute departure window');

const afterStationaryNote = calculateMissionTiming(60, 12 * 60 + 8 * 60, 21, 10);
assertEqual(afterStationaryNote.remainingMinutes, 40, 'stationary recording consumes eight minutes on the shared clock');
assertEqual(afterStationaryNote.availableStopMinutes, 9, 'recording time is not subtracted a second time');
assertEqual(
  calculateItineraryMinutes(12, 0, 21, 10),
  43,
  'itinerary separates future travel and reserve from already elapsed time',
);
assertEqual(
  calculateMissionTiming(60, 12 * 60, null, 10).availableStopMinutes,
  null,
  'unknown return route does not create a positive stop-time allowance',
);

const sentAt = 52_200 + 12 * 60;
const message = {
  deliveredAtSimTime: sentAt + 10 * 60,
  replyText: 'Advice',
  replyDeliveredAtSimTime: sentAt + 20 * 60,
};
assertEqual(
  getCommunicationStage(message, sentAt + 8 * 60),
  'reply_in_transit',
  'message progresses by the same eight simulated minutes spent recording',
);
assertEqual(
  getCommunicationStage(message, sentAt + 20 * 60),
  'reply_received',
  'reply is received only at its simulated delivery time',
);

if (failures > 0) throw new Error(`${failures} mission timing test(s) failed`);
