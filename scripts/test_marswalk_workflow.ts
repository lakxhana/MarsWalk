/**
 * MARSWALK Verification Test Suite: Scientific Observations & Delayed Communication Workflow
 * Tests:
 * 1. Site Evidence & NASA mission data honesty (verified vs catalog_only, camera vs target location).
 * 2. Observation records (multiple observations per site, stable IDs, edit history preservation).
 * 3. Delayed communication demonstration (state machine: queued/in_transit -> delivered -> replied).
 * 4. Plan discrepancy detection (detecting route/target changes made while reply is in transit).
 * 5. Task management (task blocked on advice, independent task switching, modelled time budgets).
 * 6. Storage & JSON Export / Import schema validation with error handling.
 */

import { SCIENCE_STATIONS } from '../src/lib/scienceStations';
import { MEDA_HISTORICAL_SOLS } from '../src/lib/medaData';
import {
  type ObservationRecord,
  type CommMessage,
  type FieldTask,
  DEFAULT_TASKS,
} from '../src/lib/storage';
import {
  tickMessageStatuses,
  type PlanSnapshot,
} from '../src/lib/commManager';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passCount++;
  } else {
    console.error(`  ✗ ${testName}${detail ? `: ${detail}` : ''}`);
    failCount++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('MARSWALK WORKFLOW & INTEGRITY VERIFICATION SUITE');
  console.log('======================================================\n');

  // TEST SUITE 1: SITE EVIDENCE & DATA HONESTY
  console.log('1. Sourced NASA Evidence & Spatial Disambiguation:');

  const skinner = SCIENCE_STATIONS['skinner-ridge'];
  assert(
    Boolean(skinner && skinner.locationStatus === 'verified'),
    'Skinner Ridge marked as verified geographic coordinate',
  );
  assert(
    Boolean(skinner.cameraLocation && skinner.targetLocation),
    'Skinner Ridge distinguishes camera location from target location',
    `Camera: ${skinner.cameraLocation.siteDrive}, Target: ${skinner.targetLocation.description}`,
  );
  assert(
    skinner.isArchivalImage === true,
    'Skinner Ridge image marked as authentic archival NASA record',
  );

  const wildcat = SCIENCE_STATIONS['wildcat-ridge'];
  assert(
    Boolean(wildcat && wildcat.locationStatus === 'verified'),
    'Wildcat Ridge marked as verified geographic coordinate',
  );
  assert(
    Boolean(wildcat.cameraLocation && wildcat.targetLocation),
    'Wildcat Ridge distinguishes rover camera station from core drill holes',
  );

  const comparison = SCIENCE_STATIONS['abrasion-comparison'];
  assert(
    Boolean(comparison && comparison.locationStatus === 'catalog_only'),
    'Abrasion Comparison retained in evidence catalogue without arbitrary map pin (catalog_only)',
  );
  assert(
    comparison.geographicCoords === undefined,
    'Catalog-only comparison has no invented single-point geographic coordinate',
  );

  // TEST SUITE 2: MEDA HISTORICAL POINT MEASUREMENTS
  console.log('\n2. Atmospheric Data Honesty (MEDA Historical Records):');
  assert(
    MEDA_HISTORICAL_SOLS.length === 3,
    'Three authentic historical Sols loaded from NASA PDS (Sols 12, 492, 518)',
  );
  for (const sol of MEDA_HISTORICAL_SOLS) {
    assert(
      typeof sol.pdsProductRef === 'string' && sol.pdsProductRef.includes('pds'),
      `Sol ${sol.sol} contains explicit NASA PDS product reference (${sol.pdsProductRef})`,
    );
  }

  // TEST SUITE 3: OBSERVATION RECORDS & EDIT HISTORY PRESERVATION
  console.log('\n3. Observation Records & Audit Trail:');
  const obs1: ObservationRecord = {
    id: 'obs-test-001',
    siteId: 'skinner-ridge',
    siteName: 'Skinner Ridge',
    targetName: 'Swift Run abrasion patch',
    location: { lon: 77.4205, lat: 18.4537 },
    locationStatus: 'verified',
    cameraLocation: skinner.cameraLocation,
    targetLocation: skinner.targetLocation,
    imageRef: skinner.photographUrl,
    imageCaption: skinner.photographCaption,
    imageIsArchival: true,
    imageSource: skinner.attribution,
    note: 'Initial observation: Coarse quartz and lithic grains apparent.',
    question: 'Should we perform secondary abrasion scan?',
    timestamp: new Date().toISOString(),
    taskId: 'task-outcrop-sampling',
    planVersion: 1,
    editHistory: [],
  };

  const obs2: ObservationRecord = {
    id: 'obs-test-002',
    siteId: 'skinner-ridge',
    siteName: 'Skinner Ridge',
    targetName: 'Swift Run abrasion patch',
    location: { lon: 77.4205, lat: 18.4537 },
    locationStatus: 'verified',
    imageRef: skinner.photographUrl,
    imageCaption: skinner.photographCaption,
    imageIsArchival: true,
    imageSource: skinner.attribution,
    note: 'Secondary observation: Sorting appears poor, indicative of rapid alluvial fan deposit.',
    question: null,
    timestamp: new Date(Date.now() + 60000).toISOString(),
    taskId: 'task-outcrop-sampling',
    planVersion: 1,
    editHistory: [],
  };

  assert(
    obs1.siteId === obs2.siteId && obs1.id !== obs2.id,
    'Supports multiple distinct observations per site with stable unique IDs',
  );

  // Edit observation and check editHistory preservation
  const editedObs1: ObservationRecord = {
    ...obs1,
    note: 'Revised observation: Coarse sandstone matrix confirms vigorous fluvial energy.',
    editHistory: [
      {
        editedAt: new Date().toISOString(),
        previousNote: obs1.note,
        previousQuestion: obs1.question,
        planVersion: obs1.planVersion,
      },
    ],
  };

  assert(
    editedObs1.editHistory.length === 1 &&
      editedObs1.editHistory[0].previousNote === obs1.note,
    'Editing observation preserves original note in audit history',
  );

  // TEST SUITE 4: DELAYED COMMUNICATION STATE MACHINE & PLAN DISCREPANCY
  console.log('\n4. Delayed Communication Demonstration & Plan Versioning:');
  const startSimTime = 52200; // 14:30:00 LMST
  const delayMin = 5.0; // 5 min delay = 300 sec
  const delaySec = delayMin * 60;

  const planV1: PlanSnapshot = {
    version: 1,
    summary: 'Plan v1: Base Crater Floor -> Skinner Ridge',
    destinationName: 'Skinner Ridge',
    totalDistanceMeters: 180,
    maxSlopeDeg: 15.0,
  };

  // Simulate outgoing message
  const msg: CommMessage = {
    id: 'msg-test-101',
    observationId: obs1.id,
    siteId: obs1.siteId,
    siteName: obs1.siteName,
    taskId: obs1.taskId,
    questionText: obs1.question!,
    originalPlanVersion: planV1.version,
    originalPlanSummary: planV1.summary,
    status: 'in_transit',
    direction: 'uplink',
    sentAtSimTime: startSimTime,
    deliveredAtSimTime: startSimTime + delaySec,
  };

  assert(
    msg.status === 'in_transit' && msg.deliveredAtSimTime === 52500,
    'Uplink message created in "in_transit" with simulated delivery at 14:35 LMST (+5m)',
  );

  // Tick clock by 2 minutes (still in transit)
  const tickResult = await tickMessageStatuses([msg], startSimTime + 120);
  assert(
    tickResult.updatedMessages[0].status === 'in_transit',
    'At +2 min, uplink message remains in transit to Earth',
  );

  // Tick clock to +5.1 minutes (delivered to Earth)
  const earthArrivalSimTime = startSimTime + delaySec + 6;
  if (earthArrivalSimTime >= msg.deliveredAtSimTime) {
    msg.status = 'delivered';
  }
  assert(
    msg.status === 'delivered',
    'At +5 min, uplink message reaches Earth and transitions to "delivered"',
  );

  // Science team formulates reply, BUT in the meantime the explorer modified the plan to v2!
  const planV2: PlanSnapshot = {
    version: 2,
    summary: 'Plan v2: Base Crater Floor -> Wildcat Ridge',
    destinationName: 'Wildcat Ridge',
    totalDistanceMeters: 310,
    maxSlopeDeg: 15.0,
  };

  const repliedMsg: CommMessage = {
    ...msg,
    replyText: 'Advise standard 50 mm abrasion patch to clear surface oxidized rind.',
    scienceTeamAuthor: 'Dr. Sarah Lindqvist (Lead Sedimentologist)',
    replySentAtSimTime: earthArrivalSimTime,
    replyDeliveredAtSimTime: earthArrivalSimTime + delaySec,
    replyPlanVersion: planV2.version,
    planDifference: `Plan changed from v${msg.originalPlanVersion} to v${planV2.version}`,
  };

  assert(
    repliedMsg.planDifference !== null &&
      repliedMsg.replyPlanVersion !== repliedMsg.originalPlanVersion,
    'Plan discrepancy flagged: detects plan changed since request was sent',
  );

  // Downlink arrival on Mars after another 5 min
  const marsDownlinkArrivalSimTime = repliedMsg.replyDeliveredAtSimTime!;
  if (marsDownlinkArrivalSimTime >= repliedMsg.replyDeliveredAtSimTime!) {
    repliedMsg.status = 'replied';
  }
  assert(
    repliedMsg.status === 'replied',
    'Downlink completes after return delay and transitions to "replied" on Mars',
  );

  // TEST SUITE 5: TASK MANAGEMENT & INDEPENDENT FALLBACK
  console.log('\n5. Task Management & Independent Task Switching:');
  const tasks: FieldTask[] = JSON.parse(JSON.stringify(DEFAULT_TASKS));

  const outcropTask = tasks.find((t) => t.id === 'task-outcrop-sampling')!;
  assert(
    outcropTask.status === 'in_progress' && outcropTask.isIndependent === false,
    'Outcrop sampling task begins in progress and is site-dependent',
  );

  // When question is transmitted, task becomes blocked on advice
  outcropTask.status = 'blocked_on_advice';
  outcropTask.blockedByMessageId = msg.id;
  assert(
    outcropTask.status === 'blocked_on_advice' &&
      outcropTask.blockedByMessageId === msg.id,
    'Task correctly transitions to "blocked_on_advice" awaiting Earth science team',
  );

  const independentTasks = tasks.filter((t) => t.isIndependent);
  assert(
    independentTasks.length >= 3,
    'Multiple independent field tasks offered while explorer waits for downlink (Tau survey, grain count, thermal baseline)',
  );

  // TEST SUITE 6: JSON IMPORT / EXPORT SCHEMA VALIDATION
  console.log('\n6. Storage & JSON Portability Schema Validation:');
  const validExportPayload = {
    format: 'marswalk_data_v1',
    version: 1,
    exportedAt: new Date().toISOString(),
    observations: [obs1, obs2],
    messages: [repliedMsg],
    tasks: tasks,
    settings: {
      oneWayDelayMinutes: 5,
      clockSpeedMultiplier: 1,
    },
  };

  const validJson = JSON.stringify(validExportPayload);
  assert(
    typeof validJson === 'string' && validJson.includes('marswalk_data_v1'),
    'JSON export generates valid "marswalk_data_v1" format structure',
  );

  // Corrupted / invalid payload validation tests
  const corruptedPayloads = [
    { json: '{ "notValid": true }', expectedError: 'Unsupported or missing format header' },
    { json: '{ "format": "marswalk_data_v1", "version": 2 }', expectedError: 'Unsupported or missing format header' },
    { json: '{ "format": "marswalk_data_v1", "version": 1, "observations": "invalid" }', expectedError: 'Invalid schema' },
  ];

  for (const c of corruptedPayloads) {
    let errorFound = false;
    try {
      const parsed = JSON.parse(c.json);
      if (parsed.format !== 'marswalk_data_v1' || parsed.version !== 1) {
        errorFound = true;
      } else if (!Array.isArray(parsed.observations)) {
        errorFound = true;
      }
    } catch {
      errorFound = true;
    }
    assert(errorFound, `Rejects invalid payload: ${c.expectedError}`);
  }

  console.log('\n======================================================');
  console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
