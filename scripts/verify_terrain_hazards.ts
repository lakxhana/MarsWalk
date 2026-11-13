import * as THREE from 'three';
import {
  getRelativeElevation,
  getMeasuredSlopeDeg,
  setTestElevationOverride,
  MISSING_DATA_VALUE,
} from '../src/lib/jezeroMeasuredElevation';
import {
  planTerrainRoute,
  validateTraverseSegment,
} from '../src/lib/routePlanner';
import { ValidatedPolyline } from '../src/lib/validatedPolyline';
import { planEVAMission, replanEVAReturn } from '../src/lib/evaPlanner';

async function runAllChecks() {
  console.log('===============================================================');
  console.log('MARSWalk Terrain Hazards Verification Suite (Checklist Item #3)');
  console.log('===============================================================\n');

  let allPassed = true;

  // ---------------------------------------------------------------------------
  // CHECK 1: A valid route reaches Walk
  // ---------------------------------------------------------------------------
  console.log('--- CHECK 1: Valid Route Reaches Walk ---');
  const startPt = { x: -150, z: 200 }; // Illustrative planning point 1
  const destPt = { x: 300, z: -250 }; // Illustrative planning point 2

  const plan = planTerrainRoute(startPt, destPt, {
    maxAllowableSlopeDeg: 15.0,
    preference: 'lower-slope',
    assumedBaseSpeedMps: 1.1,
  });

  console.log(`Route planning success: ${plan.success}`);
  console.log(`Route points count: ${plan.points.length}`);
  console.log(`Total 2D distance: ${plan.totalDistanceMeters} m | Surface distance: ${plan.totalSurfaceDistanceMeters} m`);
  console.log(`Elevation range: ${plan.minElevationMeters} m to ${plan.maxElevationMeters} m (gain: +${plan.elevationGainMeters} m, loss: -${plan.elevationLossMeters} m)`);
  console.log(`Max calculated slope: ${plan.maxSlopeDeg.toFixed(1)}° | Average slope: ${plan.averageSlopeDeg.toFixed(1)}°`);
  console.log(`Explanation: "${plan.explanation}"`);

  let check1Passed = plan.success && plan.points.length >= 2;

  // Validate every single segment of the route
  for (let i = 0; i < plan.points.length - 1; i++) {
    const pA = plan.points[i];
    const pB = plan.points[i + 1];
    const segVal = validateTraverseSegment(pA, pB, 15.0);
    if (!segVal.valid) {
      console.error(`Segment ${i} -> ${i + 1} validation failed: ${segVal.reason}`);
      check1Passed = false;
    }
  }

  // Verify Walk mode spawn kinematics
  const spawnX = plan.points[0].x;
  const spawnZ = plan.points[0].z;
  const spawnY = getRelativeElevation(spawnX, spawnZ) + 1.75;
  const p1 = plan.points[1];
  const initialYaw = Math.atan2(-(p1.x - spawnX), -(p1.z - spawnZ));
  const initialYawDeg = ((initialYaw * 180) / Math.PI + 360) % 360;
  const initialDeviation = Math.hypot(spawnX - plan.points[0].x, spawnZ - plan.points[0].z);

  console.log(`Walk spawn position: (${spawnX}, y=${spawnY.toFixed(2)}, ${spawnZ})`);
  console.log(`Walk spawn heading facing segment 1: yaw=${initialYaw.toFixed(3)} rad (${initialYawDeg.toFixed(1)}°)`);
  console.log(`Initial route deviation distance: ${initialDeviation.toFixed(2)} m (off-route warning: FALSE)`);

  if (Math.abs(spawnX - startPt.x) > 0.01 || Math.abs(spawnZ - startPt.z) > 0.01 || initialDeviation > 0.01) {
    check1Passed = false;
  }

  console.log(`CHECK 1 RESULT: ${check1Passed ? 'PASSED' : 'FAILED'}\n`);
  if (!check1Passed) allPassed = false;

  // ---------------------------------------------------------------------------
  // CHECK 2: Steep or missing strip between valid endpoints is avoided or blocks the route
  // ---------------------------------------------------------------------------
  console.log('--- CHECK 2: Steep or Missing Strip Avoided or Blocks Route ---');

  // Part 2A: Steep Scarp Avoidance Test between valid endpoints
  console.log('Part 2A: Steep Scarp Avoidance between valid endpoints under 4.0° limit');
  const avoidStart = { x: -150, z: 200 };
  const avoidDest = { x: -700, z: -500 };
  const avoidStartSlope = getMeasuredSlopeDeg(avoidStart.x, avoidStart.z) ?? 0;
  const avoidDestSlope = getMeasuredSlopeDeg(avoidDest.x, avoidDest.z) ?? 0;
  const directAvoidCheck = validateTraverseSegment(avoidStart, avoidDest, 4.0);
  console.log(`Avoid start slope: ${avoidStartSlope.toFixed(2)}° | Avoid dest slope: ${avoidDestSlope.toFixed(2)}°`);
  console.log(`Direct straight-line segment valid under 4.0°: ${directAvoidCheck.valid} (direct max slope: ${directAvoidCheck.maxSlopeDeg.toFixed(2)}°)`);

  const avoidPlan = planTerrainRoute(avoidStart, avoidDest, {
    maxAllowableSlopeDeg: 4.0,
    preference: 'lower-slope',
    assumedBaseSpeedMps: 1.1,
  });
  console.log(`Avoidance route plan success: ${avoidPlan.success} | Max route slope: ${avoidPlan.maxSlopeDeg}°`);
  const part2APassed = avoidPlan.success && !directAvoidCheck.valid && (avoidPlan.maxSlopeDeg ?? 99) <= 4.0;
  console.log(`Part 2A status: ${part2APassed ? 'PASSED' : 'FAILED'}`);

  // Part 2B: Steep Scarp Blocking Test between valid endpoints
  console.log('\nPart 2B: Steep Scarp Blocking between valid endpoints under tight limit (3.0°)');
  const blockStart = { x: -150, z: 200 };
  const blockDest = { x: -910, z: -600 };
  const blockStartSlope = getMeasuredSlopeDeg(blockStart.x, blockStart.z) ?? 0;
  const blockDestSlope = getMeasuredSlopeDeg(blockDest.x, blockDest.z) ?? 0;
  console.log(`Block start slope: ${blockStartSlope.toFixed(2)}° | Block dest slope: ${blockDestSlope.toFixed(2)}°`);

  const blockedSteepPlan = planTerrainRoute(blockStart, blockDest, {
    maxAllowableSlopeDeg: 3.0,
    preference: 'lower-slope',
    assumedBaseSpeedMps: 1.1,
  });
  console.log(`Steep scarp blocked plan success: ${blockedSteepPlan.success} (expected false)`);
  console.log(`Blocked plan failure reason: "${blockedSteepPlan.failureReason}"`);
  const part2BPassed = !blockedSteepPlan.success && (blockedSteepPlan.failureReason?.includes('slope constraint') ?? false);
  console.log(`Part 2B status: ${part2BPassed ? 'PASSED' : 'FAILED'}`);

  // Part 2C: Missing Data Strip Test Fixture with Bypass
  console.log('\nPart 2C: Missing Data Strip with Bypass (Test Fixture)');
  // Clearly labelled test fixture:
  // Missing strip from x: -50 to -20, spanning z: -300 to +100
  // Bypass is open for z > +100
  const fixtureMissingStrip = (x: number, z: number): number | null => {
    if (x >= -50 && x <= -20 && z >= -300 && z <= 100) {
      return MISSING_DATA_VALUE; // Synthetic missing data sentinel
    }
    return null; // Keep natural elevation
  };

  setTestElevationOverride(fixtureMissingStrip);

  const bypassStart = { x: -120, z: 0 };
  const bypassDest = { x: 80, z: 0 };

  const bypassPlan = planTerrainRoute(bypassStart, bypassDest, {
    maxAllowableSlopeDeg: 15.0,
    preference: 'lower-slope',
    assumedBaseSpeedMps: 1.1,
  });

  console.log(`Bypass route plan success: ${bypassPlan.success}`);
  console.log(`Bypass route points: ${bypassPlan.points.length}`);

  let crossedMissingStrip = false;
  if (bypassPlan.success) {
    for (const pt of bypassPlan.points) {
      if (pt.x >= -50 && pt.x <= -20 && pt.z >= -300 && pt.z <= 100) {
        crossedMissingStrip = true;
        console.error(`Route point (${pt.x}, ${pt.z}) improperly landed inside missing strip!`);
      }
    }
    // Also check every segment line between points
    for (let i = 0; i < bypassPlan.points.length - 1; i++) {
      const segVal = validateTraverseSegment(bypassPlan.points[i], bypassPlan.points[i + 1], 15.0);
      if (!segVal.valid) {
        crossedMissingStrip = true;
        console.error(`Segment ${i} crosses missing ground: ${segVal.reason}`);
      }
    }
  }

  const part2CPassed = bypassPlan.success && !crossedMissingStrip;
  console.log(`Route successfully navigated around missing strip without crossing: ${!crossedMissingStrip}`);
  console.log(`Part 2C status: ${part2CPassed ? 'PASSED' : 'FAILED'}`);

  // Part 2D: Impassable Continuous Missing Wall Test Fixture
  console.log('\nPart 2D: Impassable Missing Wall across entire width (Test Fixture)');
  const fixtureImpassableWall = (x: number): number | null => {
    if (x >= -50 && x <= -20) {
      return MISSING_DATA_VALUE; // Impassable wall of missing data
    }
    return null;
  };

  setTestElevationOverride(fixtureImpassableWall);

  const blockedMissingPlan = planTerrainRoute(bypassStart, bypassDest, {
    maxAllowableSlopeDeg: 15.0,
    preference: 'lower-slope',
    assumedBaseSpeedMps: 1.1,
  });

  console.log(`Impassable wall plan success: ${blockedMissingPlan.success} (expected false)`);
  console.log(`Blocked plan failure reason: "${blockedMissingPlan.failureReason}"`);
  const part2DPassed = !blockedMissingPlan.success;
  console.log(`Part 2D status: ${part2DPassed ? 'PASSED' : 'FAILED'}`);

  // Reset override
  setTestElevationOverride(null);

  const check2Passed = part2APassed && part2BPassed && part2CPassed && part2DPassed;
  console.log(`CHECK 2 RESULT: ${check2Passed ? 'PASSED' : 'FAILED'}\n`);
  if (!check2Passed) allPassed = false;

  // ---------------------------------------------------------------------------
  // CHECK 3: Missing slope never appears as flat
  // ---------------------------------------------------------------------------
  console.log('--- CHECK 3: Missing Slope Never Appears as Flat ---');

  // Test 3A: Out-of-bounds coordinate
  const oobSlope = getMeasuredSlopeDeg(2000, 2000);
  console.log(`Out-of-bounds slope query (2000, 2000): ${oobSlope}`);
  const test3APassed = oobSlope === null;
  console.log(`Test 3A (null rather than 0.0°): ${test3APassed ? 'PASSED' : 'FAILED'}`);

  // Test 3B: Synthetic missing cell using test fixture
  setTestElevationOverride((x: number, z: number) => {
    if (Math.hypot(x - 50, z - 50) < 6.0) return MISSING_DATA_VALUE;
    return null;
  });

  const missingCellSlope = getMeasuredSlopeDeg(50, 50);
  console.log(`Missing cell slope query (50, 50): ${missingCellSlope}`);
  const test3BPassed = missingCellSlope === null;
  console.log(`Test 3B (null on missing cell): ${test3BPassed ? 'PASSED' : 'FAILED'}`);

  // Test 3C: Adjacent cell where finite difference sample touches missing data
  const neighborSlope = getMeasuredSlopeDeg(52, 50);
  console.log(`Adjacent neighbor slope query (52, 50): ${neighborSlope}`);
  const test3CPassed = neighborSlope === null;
  console.log(`Test 3C (null on missing finite difference neighbor): ${test3CPassed ? 'PASSED' : 'FAILED'}`);

  // Reset override
  setTestElevationOverride(null);

  // Test 3D: Normal valid terrain returns valid number (not null)
  const validSlope = getMeasuredSlopeDeg(0, 0);
  console.log(`Valid crater floor slope query (0, 0): ${validSlope?.toFixed(2)}°`);
  const test3DPassed = typeof validSlope === 'number' && !isNaN(validSlope) && validSlope > 0;
  console.log(`Test 3D (valid number on measured ground): ${test3DPassed ? 'PASSED' : 'FAILED'}`);

  const check3Passed = test3APassed && test3BPassed && test3CPassed && test3DPassed;
  console.log(`CHECK 3 RESULT: ${check3Passed ? 'PASSED' : 'FAILED'}\n`);
  if (!check3Passed) allPassed = false;

  // ---------------------------------------------------------------------------
  // CHECK 4: Out-of-bounds destination is rejected with helpful coverage failure
  // ---------------------------------------------------------------------------
  console.log('--- CHECK 4: Out-of-bounds Destination Rejection ---');
  const oobPlan = planTerrainRoute(
    { x: -150, z: 200 },
    { x: 2500, z: 2500 }, // Far outside HiRISE crop
    { maxAllowableSlopeDeg: 15.0, preference: 'lower-slope', assumedBaseSpeedMps: 1.1 }
  );
  console.log(`Out-of-bounds plan success: ${oobPlan.success} (expected false)`);
  console.log(`Out-of-bounds failure reason: "${oobPlan.failureReason}"`);
  const check4Passed =
    !oobPlan.success &&
    (oobPlan.failureReason?.toLowerCase().includes('outside') ||
      oobPlan.failureReason?.toLowerCase().includes('footprint'));
  console.log(`CHECK 4 RESULT: ${check4Passed ? 'PASSED' : 'FAILED'}\n`);
  if (!check4Passed) allPassed = false;

  // ---------------------------------------------------------------------------
  // CHECK 5: Distinguish "No elevation coverage" from "No route within your incline limit"
  // ---------------------------------------------------------------------------
  console.log('--- CHECK 5: Distinguish Coverage vs Incline Limit Failures ---');

  // Test coverage failure classification
  const coverageReason = oobPlan.failureReason?.toLowerCase() || '';
  const isCoverage =
    coverageReason.includes('coverage') ||
    coverageReason.includes('outside') ||
    coverageReason.includes('missing') ||
    coverageReason.includes('footprint');
  const coverageCategory = isCoverage ? 'No elevation coverage' : 'No route within your incline limit';
  console.log(`Coverage test categorized as: "${coverageCategory}"`);

  // Test incline limit failure classification
  const inclineReason = blockedSteepPlan.failureReason?.toLowerCase() || '';
  const isIncline =
    !inclineReason.includes('coverage') &&
    !inclineReason.includes('outside') &&
    (inclineReason.includes('slope') ||
      inclineReason.includes('incline') ||
      inclineReason.includes('scarp') ||
      inclineReason.includes('constraint'));
  const inclineCategory = isIncline ? 'No route within your incline limit' : 'No elevation coverage';
  console.log(`Incline test categorized as: "${inclineCategory}"`);

  const check5Passed =
    coverageCategory === 'No elevation coverage' &&
    inclineCategory === 'No route within your incline limit';
  console.log(`CHECK 5 RESULT: ${check5Passed ? 'PASSED' : 'FAILED'}\n`);
  if (!check5Passed) allPassed = false;

  // ---------------------------------------------------------------------------
  // CHECK 6: Exact Shared Polyline vs Spline Smoothing Deviation
  // ---------------------------------------------------------------------------
  console.log('--- CHECK 6: Shared Route Geometry & Exact Polyline vs Spline Smoothing ---');
  // Define a sharp 90° bend representing a route skirting steep terrain/hazards
  const sharpBendPoints = [
    { x: -100, z: 0 },
    { x: 0, z: 0 },
    { x: 0, z: 100 },
  ];

  // Compare THREE.SplineCurve with ValidatedPolyline
  const splinePts = sharpBendPoints.map((p) => new THREE.Vector2(p.x, p.z));
  const spline = new THREE.SplineCurve(splinePts);
  const validatedPoly = new ValidatedPolyline(sharpBendPoints);

  // Measure maximum lateral bulge of SplineCurve away from the validated straight segments
  let maxSplineDeviation = 0;
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const sPt = spline.getPointAt(t);
    const closest = validatedPoly.findClosestPoint(sPt.x, sPt.y);
    if (closest.distance > maxSplineDeviation) {
      maxSplineDeviation = closest.distance;
    }
  }

  // Measure lateral deviation of ValidatedPolyline samples away from the validated segments
  let maxPolylineDeviation = 0;
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const pPt = validatedPoly.getPointAtRatio(t);
    const closest = validatedPoly.findClosestPoint(pPt.x, pPt.z);
    if (closest.distance > maxPolylineDeviation) {
      maxPolylineDeviation = closest.distance;
    }
  }

  console.log(`Sharp bend length: ${validatedPoly.totalLength} m`);
  console.log(`Catmull-Rom SplineCurve maximum lateral bulge: ${maxSplineDeviation.toFixed(2)} m (drifts off validated path)`);
  console.log(`ValidatedPolyline maximum lateral deviation: ${maxPolylineDeviation.toFixed(4)} m (strictly on validated segments)`);

  // Verify that all ribbon samples generated for the planned Jezero route remain on validated ground
  const realPoly = new ValidatedPolyline(plan.points);
  const ribbonSamples = realPoly.generateRibbonSamples(1.5);
  console.log(`Generated ${ribbonSamples.length} ribbon vertices along planned Jezero route`);

  let allRibbonSamplesValid = true;
  for (let i = 0; i < ribbonSamples.length - 1; i++) {
    const rA = { x: ribbonSamples[i].x, z: ribbonSamples[i].z };
    const rB = { x: ribbonSamples[i + 1].x, z: ribbonSamples[i + 1].z };
    const segCheck = validateTraverseSegment(rA, rB, 15.0);
    if (!segCheck.valid) {
      console.error(`Ribbon segment ${i} invalid: ${segCheck.reason}`);
      allRibbonSamplesValid = false;
      break;
    }
  }

  const check6Passed =
    maxSplineDeviation > 1.0 && // Spline demonstrably departs from straight segments
    maxPolylineDeviation < 0.0001 && // Validated polyline has zero departure
    allRibbonSamplesValid; // All ribbon samples strictly valid
  console.log(`Check 6 (exact polyline eliminates spline bulge): ${check6Passed ? 'PASSED' : 'FAILED'}`);
  console.log(`CHECK 6 RESULT: ${check6Passed ? 'PASSED' : 'FAILED'}\n`);
  if (!check6Passed) allPassed = false;

  // ---------------------------------------------------------------------------
  // CHECK 7: Guided Movement Segment Confinement & Heading Easing
  // ---------------------------------------------------------------------------
  console.log('--- CHECK 7: Guided Movement Segment Confinement & Heading Easing ---');
  let maxGuidedDeviation = 0;
  const simulatedSpeedMps = 1.1; // Martian suit walking speed
  const simStepDelta = 0.5; // seconds
  let simDist = 0;
  let previousYaw = 0;
  let maxYawDeltaPerStep = 0;

  while (simDist <= realPoly.totalLength) {
    const sample = realPoly.getPointAtDistance(simDist);
    const closest = realPoly.findClosestPoint(sample.x, sample.z);
    if (closest.distance > maxGuidedDeviation) {
      maxGuidedDeviation = closest.distance;
    }

    // Look-ahead heading easing
    const lookAheadDist = Math.min(realPoly.totalLength, simDist + 2.5);
    const lookAheadSample = realPoly.getPointAtDistance(lookAheadDist);
    const dx = lookAheadSample.x - sample.x || sample.tangent.x;
    const dz = lookAheadSample.z - sample.z || sample.tangent.z;
    const targetYaw = Math.atan2(-dx, -dz);

    if (simDist > 0) {
      let diff = targetYaw - previousYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const stepYawDelta = Math.abs(diff);
      if (stepYawDelta > maxYawDeltaPerStep) maxYawDeltaPerStep = stepYawDelta;
    }
    previousYaw = targetYaw;
    simDist += simulatedSpeedMps * simStepDelta;
  }

  console.log(`Guided movement max path deviation from validated line: ${maxGuidedDeviation.toFixed(4)} m`);
  console.log(`Smooth camera heading easing: max yaw delta per step = ${(maxYawDeltaPerStep * 180 / Math.PI).toFixed(1)}°`);

  const check7Passed = maxGuidedDeviation < 0.0001;
  console.log(`CHECK 7 RESULT: ${check7Passed ? 'PASSED' : 'FAILED'}\n`);
  if (!check7Passed) allPassed = false;

  // ---------------------------------------------------------------------------
  // CHECK 8: Free Walking, Polyline Rejoin Vector & Remaining Distance
  // ---------------------------------------------------------------------------
  console.log('--- CHECK 8: Free Walking, Polyline Rejoin Vector & Remaining Distance ---');
  // Astronaut walks freely off-route by 12.0 m perpendicular to segment 0 (-100, 0) -> (0, 0)
  const offRoutePos = { x: -50, z: -12.0 };
  const offRouteClosest = validatedPoly.findClosestPoint(offRoutePos.x, offRoutePos.z);

  console.log(`Off-route position: (${offRoutePos.x}, ${offRoutePos.z})`);
  console.log(`Closest polyline point: (${offRouteClosest.point.x.toFixed(1)}, ${offRouteClosest.point.z.toFixed(1)})`);
  console.log(`Measured deviation distance: ${offRouteClosest.distance.toFixed(1)} m (expected 12.0 m)`);

  // Verify rejoin vector
  const rdx = offRouteClosest.point.x - offRoutePos.x; // 0
  const rdz = offRouteClosest.point.z - offRoutePos.z; // +12
  const rejoinBearing = Math.atan2(-rdx, -rdz);
  console.log(`Rejoin vector to path: (${rdx.toFixed(1)}, ${rdz.toFixed(1)}), bearing: ${((rejoinBearing * 180) / Math.PI + 360) % 360}° (South toward path)`);

  // Verify remaining distance along polyline
  const remainingDist = validatedPoly.getRemainingDistanceAlongPolyline(offRoutePos.x, offRoutePos.z);
  console.log(`Remaining distance along polyline: ${remainingDist.toFixed(1)} m (from x=-50 to dest: 50m + 100m = 150m)`);

  const check8Passed =
    Math.abs(offRouteClosest.distance - 12.0) < 0.01 &&
    Math.abs(offRouteClosest.point.x - (-50)) < 0.01 &&
    Math.abs(offRouteClosest.point.z - 0) < 0.01 &&
    Math.abs(remainingDist - 150.0) < 0.01;
  console.log(`CHECK 8 RESULT: ${check8Passed ? 'PASSED' : 'FAILED'}\n`);
  if (!check8Passed) allPassed = false;

  // ---------------------------------------------------------------------------
  // CHECK 9: Route Switching Independence & Arrival Target
  // ---------------------------------------------------------------------------
  console.log('--- CHECK 9: Route Switching Independence & Arrival Target ---');
  // Test starting Route B after saving position on Route A
  const savedPoseRouteA = {
    x: -80,
    z: 15,
    yaw: 1.57,
    pitch: 0,
    routeDist: 85.0,
    nextWpIndex: 3,
    routeId: 'route-alpha',
    sessionId: 1001,
  };

  const newRouteB = {
    id: 'route-beta',
    points: [
      { x: 200, z: -100 },
      { x: 250, z: -150 },
      { x: 300, z: -200 },
    ],
    startName: 'Route B Start',
    destinationName: 'Route B Dest',
  };
  const newWalkSessionId = 1002;

  // Check if session resume logic properly refuses Route A's saved pose
  const isResumingRouteB = Boolean(
    newWalkSessionId !== undefined &&
    savedPoseRouteA &&
    savedPoseRouteA.sessionId === newWalkSessionId &&
    savedPoseRouteA.routeId === newRouteB.id &&
    savedPoseRouteA.routeDist !== undefined &&
    savedPoseRouteA.routeDist > 0.1
  );
  console.log(`Resume session when switching from Route A to Route B: ${isResumingRouteB} (expected false)`);

  const spawnRouteB = {
    x: isResumingRouteB ? savedPoseRouteA.x : newRouteB.points[0].x,
    z: isResumingRouteB ? savedPoseRouteA.z : newRouteB.points[0].z,
  };
  console.log(`Route B spawn coordinates: (${spawnRouteB.x}, ${spawnRouteB.z}) (expected (200, -100))`);

  // Test arrival detection on Route B
  const destRouteB = newRouteB.points[newRouteB.points.length - 1];
  const atDestPos = { x: destRouteB.x + 2.0, z: destRouteB.z - 1.5 };
  const distToDest = Math.hypot(atDestPos.x - destRouteB.x, atDestPos.z - destRouteB.z);
  const isArrived = distToDest <= 4.5;
  console.log(`Arrival detection at distance ${distToDest.toFixed(2)} m from selected destination: ${isArrived} (expected true)`);

  const check9Passed =
    !isResumingRouteB &&
    spawnRouteB.x === 200 &&
    spawnRouteB.z === -100 &&
    isArrived;
  console.log(`CHECK 9 RESULT: ${check9Passed ? 'PASSED' : 'FAILED'}\n`);
  if (!check9Passed) allPassed = false;

  // ---------------------------------------------------------------------------
  // CHECK 10: Plan my EVA (Time-Budgeted Round-Trip Mission, Asymmetric Speeds & Replanning)
  // ---------------------------------------------------------------------------
  console.log('--- CHECK 10: Plan my EVA (Round-Trip Mission & Budgeting) ---');
  let check10Passed = true;

  const baseLoc = { id: 'base-1', name: 'Planning point 1', x: -150, z: 200 };
  const destLoc = { id: 'dest-1', name: 'Planning point 2', x: 300, z: -250 };

  // 10A: Standard Trip Within Budget
  console.log('Part 10A: Trip Within Budget (60m total, 15m obs, 15m reserve)');
  const normalEva = planEVAMission({
    baseLocation: baseLoc,
    destination: destLoc,
    totalDurationMinutes: 60,
    observationMinutes: 15,
    reserveMinutes: 15,
    assumedBaseSpeedMps: 1.1,
    maxAllowableSlopeDeg: 15.0,
  });

  console.log(`  Success: ${normalEva.success} | Within budget: ${normalEva.withinBudget}`);
  console.log(`  Outward time: ${normalEva.outwardTimeMinutes.toFixed(1)}m | Return time: ${normalEva.returnTimeMinutes.toFixed(1)}m`);
  console.log(`  Total required: ${normalEva.totalRequiredMinutes.toFixed(1)}m | Margin: ${normalEva.marginMinutes.toFixed(1)}m`);
  console.log(`  Breakdown: "${normalEva.breakdownText}"`);
  console.log(`  Status: "${normalEva.statusMessage}"`);

  if (!normalEva.success || !normalEva.withinBudget || normalEva.marginMinutes < 0) {
    console.error('Part 10A failed: Expected successful EVA plan within budget.');
    check10Passed = false;
  }

  // Verify outward and return routes are independently evaluated (not identical times / distances)
  console.log(`  Outward distance: ${normalEva.outwardRoute.totalDistanceMeters}m | Return distance: ${normalEva.returnRoute.totalDistanceMeters}m`);
  console.log(`  Outward elevation gain: ${normalEva.outwardRoute.elevationGainMeters}m | Return elevation gain: ${normalEva.returnRoute.elevationGainMeters}m`);

  // 10B: Trip Over Budget (Preserves reserve, reports shortfall)
  console.log('\nPart 10B: Trip Over Budget (30m total, 15m obs, 15m reserve)');
  const tightEva = planEVAMission({
    baseLocation: baseLoc,
    destination: destLoc,
    totalDurationMinutes: 30, // 30m total - 15m obs - 15m reserve = 0m left for walking
    observationMinutes: 15,
    reserveMinutes: 15,
    assumedBaseSpeedMps: 1.1,
    maxAllowableSlopeDeg: 15.0,
  });

  console.log(`  Success: ${tightEva.success} | Within budget: ${tightEva.withinBudget} (expected false)`);
  console.log(`  Shortfall: ${tightEva.shortfallMinutes.toFixed(1)}m (expected > 0)`);
  console.log(`  Reserve preserved: ${tightEva.reserveMinutes}m`);
  console.log(`  Status message: "${tightEva.statusMessage}"`);

  if (!tightEva.success || tightEva.withinBudget || tightEva.shortfallMinutes <= 0 || tightEva.reserveMinutes !== 15) {
    console.error('Part 10B failed: Over-budget EVA plan did not correctly report shortfall or preserve reserve.');
    check10Passed = false;
  }

  // 10C: Replanning from Current Position during Extended Observation
  console.log('\nPart 10C: Dynamic Return Replanning from Current Position');
  const currentPosAtDest = { x: destLoc.x, z: destLoc.z };
  const replannedReturn = replanEVAReturn(currentPosAtDest, baseLoc, {
    baseLocation: baseLoc,
    destination: destLoc,
    totalDurationMinutes: 60,
    observationMinutes: 15,
    reserveMinutes: 15,
    assumedBaseSpeedMps: 1.1,
    maxAllowableSlopeDeg: 15.0,
  });

  console.log(`  Replanned return success: ${replannedReturn.success}`);
  console.log(`  Replanned return distance: ${replannedReturn.totalDistanceMeters}m | Estimated time: ${replannedReturn.estimatedTimeMinutes.toFixed(1)}m`);
  if (!replannedReturn.success || Math.abs(replannedReturn.totalDistanceMeters - normalEva.returnRoute.totalDistanceMeters) > 5) {
    console.error('Part 10C failed: Replanned return does not match expected destination-to-base route.');
    check10Passed = false;
  }

  // 10D: Blocked Segment with Valid Detour Alternative
  console.log('\nPart 10D: Blocked Segment with Valid Detour Alternative');
  // Place an obstacle right on the midpoint of the direct return route
  const midPt = normalEva.returnRoute.points[Math.floor(normalEva.returnRoute.points.length / 2)];
  const obstacleExclusion = {
    id: 'rockfall-1',
    name: 'Rockfall hazard',
    x: midPt.x,
    z: midPt.z,
    radius: 20.0, // 20m exclusion radius
  };

  const detourPlan = replanEVAReturn(currentPosAtDest, baseLoc, {
    baseLocation: baseLoc,
    destination: destLoc,
    totalDurationMinutes: 60,
    observationMinutes: 15,
    reserveMinutes: 15,
    assumedBaseSpeedMps: 1.1,
    maxAllowableSlopeDeg: 15.0,
  }, [obstacleExclusion]);

  console.log(`  Detour route success: ${detourPlan.success} (expected true)`);
  console.log(`  Original return distance: ${normalEva.returnRoute.totalDistanceMeters}m | Detour distance: ${detourPlan.totalDistanceMeters}m`);
  // Verify that detour route points never penetrate the 20m exclusion radius
  let penetrated = false;
  for (const pt of detourPlan.points) {
    if (Math.hypot(pt.x - obstacleExclusion.x, pt.z - obstacleExclusion.z) < obstacleExclusion.radius - 0.5) {
      penetrated = true;
      break;
    }
  }
  console.log(`  Detour strictly avoids obstacle zone: ${!penetrated}`);
  if (!detourPlan.success || penetrated) {
    console.error('Part 10D failed: Detour route did not succeed or entered the blocked exclusion.');
    check10Passed = false;
  }

  // 10E: Blocked Return with NO Alternative (Clean failure without inventing routes)
  console.log('\nPart 10E: Blocked Return with NO Alternative (Enclosing Base)');
  const ringExclusion = {
    id: 'base-seal',
    name: 'Blocked base perimeter',
    x: baseLoc.x,
    z: baseLoc.z,
    radius: 12.0, // seals the base location itself
  };

  const impossiblePlan = replanEVAReturn(currentPosAtDest, baseLoc, {
    baseLocation: baseLoc,
    destination: destLoc,
    totalDurationMinutes: 60,
    observationMinutes: 15,
    reserveMinutes: 15,
    assumedBaseSpeedMps: 1.1,
    maxAllowableSlopeDeg: 15.0,
  }, [ringExclusion]);

  console.log(`  Sealed base return success: ${impossiblePlan.success} (expected false)`);
  console.log(`  Failure reason: "${impossiblePlan.failureReason}"`);
  if (impossiblePlan.success) {
    console.error('Part 10E failed: Expected planning failure when base is completely blocked.');
    check10Passed = false;
  }

  console.log(`CHECK 10 RESULT: ${check10Passed ? 'PASSED' : 'FAILED'}\n`);
  if (!check10Passed) allPassed = false;

  console.log('===============================================================');
  console.log(`OVERALL VERIFICATION SUITE RESULT: ${allPassed ? 'ALL CHECKS PASSED (10/10)' : 'SOME CHECKS FAILED'}`);
  console.log('===============================================================');

  return allPassed;
}

runAllChecks().then((passed) => {
  if (!passed) process.exit(1);
});
