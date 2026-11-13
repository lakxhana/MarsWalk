import {
  getDeliveredMissionActivity,
  isReportOverdue,
  getLatestMissionActivity,
  getReplayActivity,
  getDeliveredUplinkMessages,
} from '../src/lib/earthMonitoring';
import type { CommMessage } from '../src/lib/storage';

let failures = 0;

function assertEqual(actual: number | string | boolean, expected: number | string | boolean, label: string) {
  if (actual !== expected) {
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
    failures++;
  } else {
    console.log(`PASS ${label}`);
  }
}

function packet(id: string, sequence: number, captured: number, delivered: number): CommMessage {
  return {
    id,
    kind: 'status_update',
    observationId: id,
    statusSnapshot: {
      missionId: 'test-mission',
      sequenceNumber: sequence,
      capturedAtSimTime: captured,
      planVersion: 1,
      planSummary: 'Test plan',
      destinationName: 'User waypoint',
      position: { x: sequence, z: 0 },
      coordinateReference: 'Simulated local coordinates',
      missionElapsedSeconds: captured,
      missionBudgetMinutes: 60,
      reserveMinutes: 10,
      returnEstimateMinutes: null,
    },
    siteId: 'mission-status',
    siteName: 'Mission status',
    taskId: null,
    questionText: 'Status',
    originalPlanVersion: 1,
    originalPlanSummary: 'Test plan',
    status: 'in_transit',
    direction: 'uplink',
    sentAtSimTime: captured,
    deliveredAtSimTime: delivered,
  };
}

const first = packet('first', 1, 100, 180);
const second = packet('second', 2, 110, 170);
const pending = packet('pending', 3, 120, 200);
const delivered = getDeliveredUplinkMessages([first, second, pending], 175);
assertEqual(delivered.length, 1, 'Earth does not see packets before their simulated delivery time');

const activity = getDeliveredMissionActivity(
  [first, second, pending],
  180,
  'test-mission',
);
assertEqual(activity[activity.length - 1].id, 'second', 'late stale packets do not overwrite the higher sequence');
assertEqual(getLatestMissionActivity(activity)?.id ?? '', 'second', 'latest position follows sequence, not delivery order');

const replay = getReplayActivity(activity, 'first');
assertEqual(replay.length, 1, 'replay includes only delivered packets up to the selected sequence');
assertEqual(replay.some((message) => message.id === 'second'), false, 'replay does not expose future events');

const delayed = packet('delayed', 9, 0, 600);
assertEqual(isReportOverdue(delayed, 610, 10), false, 'normal ten-minute signal delay is not an overdue report');
assertEqual(isReportOverdue(delayed, 621, 10), true, 'two missed intervals flag an overdue report');
assertEqual(isReportOverdue(delayed, 621, 30), false, 'configured reporting interval controls staleness');
assertEqual(isReportOverdue(null, 1000, 10), false, 'waiting for first report is distinct from overdue');

if (failures > 0) throw new Error(`${failures} Earth monitoring test(s) failed`);
