// Terrain-Aware Route Planner for Jezero HiRISE Demonstration Area
// Runs A* pathfinding over measured HiRISE DTM (DTEEC_048842_1985_048908_1985_U01).
//
// Calculates true horizontal distances, elevations (Mars MOLA datum), slopes,
// and walking traversal times using Martian-gravity-adjusted hiking mechanics.
//
// All constraints and speed thresholds are prototype astronaut assumptions,
// not official NASA-approved limits.

import {
  getMeasuredElevation,
  getMeasuredSlopeDeg,
  MISSING_DATA_VALUE,
} from './jezeroMeasuredElevation';
import {
  CROP_HALF_WIDTH_METERS,
  CROP_HALF_HEIGHT_METERS,
  isWithinCropLocalMeters,
} from './jezeroHiRISE';
import {
  isNavigationPointCovered,
  isNavigationSegmentCovered,
} from './jezeroCoverage';

export interface RoutePoint {
  x: number; // local Easting (m) relative to crop center
  z: number; // local Southing (m) relative to crop center
  elevation: number; // MOLA datum (m)
  slopeDeg: number; // local slope angle (deg)
  distanceFromStart: number; // cumulative distance (m)
  segmentSlopeDeg: number;
}

export interface RoutePlanSummary {
  mapMode?: 'regional';
  id?: string;
  destinationName?: string;
  startName?: string;
  success: boolean;
  points: RoutePoint[];
  totalDistanceMeters: number; // 2D planimetric
  totalSurfaceDistanceMeters: number; // 3D terrain surface
  elevationGainMeters: number;
  elevationLossMeters: number;
  startElevationMeters: number;
  endElevationMeters: number;
  minElevationMeters: number;
  maxElevationMeters: number;
  averageSlopePercent: number;
  averageSlopeDeg: number;
  maxSlopeDeg: number;
  estimatedTimeMinutes: number;
  assumedSpeedMps: number;
  maxAllowableSlopeDeg: number;
  explanation: string;
  failureReason?: string;
  hasAlternative: boolean;
  alternativeRoute?: RoutePlanSummary;
  slopeProfile: {
    gentlePct: number; // < 5°
    moderatePct: number; // 5° - 12°
    steepPct: number; // > 12°
  };
}

export type WalkRenderRoute = Pick<RoutePlanSummary,'id'|'mapMode'|'totalDistanceMeters'> & {points:Array<{x:number;z:number;distanceFromStart:number;elevation?:number}>};

export interface PathExclusion {
  id?: string;
  name?: string;
  x: number;
  z: number;
  radius: number; // radius in meters
}

export interface RoutePlannerConfig {
  maxAllowableSlopeDeg: number; // default: 15° (configurable: 10° - 25°)
  preference: 'lower-slope' | 'direct';
  assumedBaseSpeedMps: number; // default: 1.1 m/s (~4.0 km/h on Mars)
  exclusions?: PathExclusion[];
}

export const DEFAULT_ROUTER_CONFIG: RoutePlannerConfig = {
  maxAllowableSlopeDeg: 15.0,
  preference: 'lower-slope',
  assumedBaseSpeedMps: 1.1, // Martian suited EVA walk assumption
};

// Internal graph grid resolution for routing across 2.58 km HiRISE crop
const PLANNER_GRID_STEP = 16.0; // 16 meter search step

interface NodeKey {
  gx: number;
  gz: number;
}

function toGridKey(gx: number, gz: number): string {
  return `${gx},${gz}`;
}

export interface SegmentValidationResult {
  valid: boolean;
  maxSlopeDeg: number;
  reason?: string;
}

/**
 * Validates a continuous path segment between two points against the measured elevation model.
 * Samples points densely along the segment (at most 4m intervals), verifying:
 * 1. All samples are within the valid HiRISE crop boundary.
 * 2. No sample hits missing-data values (MISSING_DATA_VALUE or < -10000).
 * 3. Measured slope at each sample is available (not null) and <= maxAllowableSlopeDeg.
 * 4. Step-to-step grade between consecutive samples does not exceed maxAllowableSlopeDeg.
 * 5. No sample falls within any active scenario exclusion (blocked zone).
 */
export function validateTraverseSegment(
  p1: { x: number; z: number },
  p2: { x: number; z: number },
  maxSlopeDeg: number,
  sampleSpacing = 4.0,
  exclusions?: PathExclusion[],
): SegmentValidationResult {
  const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
  if (!isNavigationSegmentCovered(p1, p2)) {
    return {
      valid: false,
      maxSlopeDeg: 0,
      reason: 'Segment crosses outside mapped terrain coverage',
    };
  }

  if (dist < 0.001) {
    if (exclusions && exclusions.length > 0) {
      for (const excl of exclusions) {
        if (Math.hypot(p1.x - excl.x, p1.z - excl.z) <= excl.radius) {
          return { valid: false, maxSlopeDeg: 0, reason: `Endpoint inside exclusion "${excl.name || 'hazard zone'}"` };
        }
      }
    }
    const s = getMeasuredSlopeDeg(p1.x, p1.z);
    if (s === null) return { valid: false, maxSlopeDeg: 0, reason: 'Endpoint has no elevation data' };
    return { valid: s <= maxSlopeDeg, maxSlopeDeg: s };
  }

  const numSteps = Math.max(2, Math.ceil(dist / sampleSpacing));
  let prevElev: number | null = null;
  let prevPt: { x: number; z: number } | null = null;
  let maxFoundSlope = 0;

  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    const x = p1.x + t * (p2.x - p1.x);
    const z = p1.z + t * (p2.z - p1.z);

    if (exclusions && exclusions.length > 0) {
      for (const excl of exclusions) {
        if (Math.hypot(x - excl.x, z - excl.z) <= excl.radius) {
          return {
            valid: false,
            maxSlopeDeg: maxFoundSlope,
            reason: `Segment crosses blocked zone "${excl.name || 'exclusion'}"`,
          };
        }
      }
    }

    if (!isWithinCropLocalMeters(x, z)) {
      return { valid: false, maxSlopeDeg: maxFoundSlope, reason: 'Segment crosses outside image footprint' };
    }

    const elev = getMeasuredElevation(x, z);
    if (elev === MISSING_DATA_VALUE || elev < -10000 || isNaN(elev)) {
      return { valid: false, maxSlopeDeg: maxFoundSlope, reason: 'Segment crosses missing elevation coverage' };
    }

    const localSlope = getMeasuredSlopeDeg(x, z);
    if (localSlope === null || isNaN(localSlope)) {
      return { valid: false, maxSlopeDeg: maxFoundSlope, reason: 'Segment crosses terrain with unavailable slope (missing data)' };
    }

    if (localSlope > maxFoundSlope) maxFoundSlope = localSlope;

    if (localSlope > maxSlopeDeg) {
      return {
        valid: false,
        maxSlopeDeg: localSlope,
        reason: `Segment slope (${localSlope.toFixed(1)}°) exceeds maximum incline limit (${maxSlopeDeg.toFixed(0)}°)`,
      };
    }

    if (prevPt !== null && prevElev !== null) {
      const stepDist = Math.hypot(x - prevPt.x, z - prevPt.z);
      const stepDz = Math.abs(elev - prevElev);
      const stepSlope = (Math.atan2(stepDz, Math.max(0.001, stepDist)) * 180) / Math.PI;
      if (stepSlope > maxFoundSlope) maxFoundSlope = stepSlope;
      if (stepSlope > maxSlopeDeg) {
        return {
          valid: false,
          maxSlopeDeg: stepSlope,
          reason: `Step grade (${stepSlope.toFixed(1)}°) exceeds maximum incline limit (${maxSlopeDeg.toFixed(0)}°)`,
        };
      }
    }

    prevElev = elev;
    prevPt = { x, z };
  }

  return { valid: true, maxSlopeDeg: maxFoundSlope };
}

/**
 * Calculates walking speed adjusted by slope using an adapted Tobler Hiking Function
 * parameterized for Martian 0.38g gravity and pressurized EVA spacesuit mobility.
 * Base speed: 1.1 m/s on flat regolith.
 */
export function calculateMartianWalkingSpeed(
  slopeAngleRad: number,
  baseSpeed = 1.1,
): number {
  const tanSlope = Math.tan(slopeAngleRad);
  const factor = Math.exp(-3.2 * Math.abs(tanSlope + 0.035));
  // Clamp between 0.25 m/s (steep uphill scramble) and 1.35 m/s (gentle decline)
  return Math.max(0.25, Math.min(1.35, baseSpeed * factor * 1.05));
}

/**
 * Plans a terrain-aware route between Start (sx, sz) and Destination (dx, dz)
 * using the bundled HiRISE DTM postings documented in jezeroMeasuredElevationData.ts.
 */
export function planTerrainRoute(
  start: { x: number; z: number },
  dest: { x: number; z: number },
  config: RoutePlannerConfig = DEFAULT_ROUTER_CONFIG,
): RoutePlanSummary {
  // Check boundary & coverage constraints
  if (!isWithinCropLocalMeters(start.x, start.z)) {
    return createFailedPlan(
      'Route unavailable — starting point lies outside the HiRISE image footprint.',
    );
  }
  if (!isWithinCropLocalMeters(dest.x, dest.z)) {
    return createFailedPlan(
      'Route unavailable — destination lies outside the HiRISE image footprint.',
    );
  }
  if (!isNavigationPointCovered(start.x, start.z)) {
    return createFailedPlan('Route unavailable — starting point is outside mapped terrain coverage.');
  }
  if (!isNavigationPointCovered(dest.x, dest.z)) {
    return createFailedPlan('Route unavailable — destination is outside mapped terrain coverage.');
  }

  const startElev = getMeasuredElevation(start.x, start.z);
  const destElev = getMeasuredElevation(dest.x, dest.z);

  if (startElev === MISSING_DATA_VALUE || startElev < -10000) {
    return createFailedPlan(
      'Route unavailable — starting point has no elevation coverage or missing data.',
    );
  }
  if (destElev === MISSING_DATA_VALUE || destElev < -10000) {
    return createFailedPlan(
      'Route unavailable — destination point has no elevation coverage or missing data.',
    );
  }

  // Validate start and dest local slope
  const startSlope = getMeasuredSlopeDeg(start.x, start.z);
  if (startSlope === null) {
    return createFailedPlan('Route unavailable — starting point has no elevation/slope data.');
  }
  if (startSlope > config.maxAllowableSlopeDeg) {
    return createFailedPlan(
      `Starting point slope (${startSlope.toFixed(1)}°) exceeds maximum incline limit (${config.maxAllowableSlopeDeg.toFixed(0)}°).`,
    );
  }

  const destSlope = getMeasuredSlopeDeg(dest.x, dest.z);
  if (destSlope === null) {
    return createFailedPlan('Route unavailable — destination point has no elevation/slope data.');
  }
  if (destSlope > config.maxAllowableSlopeDeg) {
    return createFailedPlan(
      `Destination slope (${destSlope.toFixed(1)}°) exceeds maximum incline limit (${config.maxAllowableSlopeDeg.toFixed(0)}°).`,
    );
  }

  if (config.exclusions && config.exclusions.length > 0) {
    for (const excl of config.exclusions) {
      if (Math.hypot(start.x - excl.x, start.z - excl.z) <= excl.radius) {
        return createFailedPlan(
          `Starting point is inside blocked zone "${excl.name || 'hazard area'}".`,
        );
      }
      if (Math.hypot(dest.x - excl.x, dest.z - excl.z) <= excl.radius) {
        return createFailedPlan(
          `Destination is inside blocked zone "${excl.name || 'hazard area'}".`,
        );
      }
    }
  }

  // Check if direct short segment is completely valid
  const directDist = Math.hypot(dest.x - start.x, dest.z - start.z);
  const directCheck = validateTraverseSegment(
    start,
    dest,
    config.maxAllowableSlopeDeg,
    4.0,
    config.exclusions,
  );

  if (directDist <= PLANNER_GRID_STEP && directCheck.valid) {
    return buildPlanFromPoints([start, dest], config, directCheck.maxSlopeDeg, false);
  }

  const halfW = CROP_HALF_WIDTH_METERS;
  const halfH = CROP_HALF_HEIGHT_METERS;

  const minGx = Math.floor(-halfW / PLANNER_GRID_STEP);
  const maxGx = Math.ceil(halfW / PLANNER_GRID_STEP);
  const minGz = Math.floor(-halfH / PLANNER_GRID_STEP);
  const maxGz = Math.ceil(halfH / PLANNER_GRID_STEP);

  const startGx = Math.round(start.x / PLANNER_GRID_STEP);
  const startGz = Math.round(start.z / PLANNER_GRID_STEP);
  const destGx = Math.round(dest.x / PLANNER_GRID_STEP);
  const destGz = Math.round(dest.z / PLANNER_GRID_STEP);

  // Validate connection from start to start grid node
  // If nearest grid node connection is blocked, test 8 surrounding nodes to find accessible entry
  let activeStartGx = startGx;
  let activeStartGz = startGz;
  const startConnCheck = validateTraverseSegment(
    start,
    { x: activeStartGx * PLANNER_GRID_STEP, z: activeStartGz * PLANNER_GRID_STEP },
    config.maxAllowableSlopeDeg,
    4.0,
    config.exclusions,
  );

  if (!startConnCheck.valid) {
    let foundEntry = false;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        const testGx = startGx + dx;
        const testGz = startGz + dz;
        const testPos = { x: testGx * PLANNER_GRID_STEP, z: testGz * PLANNER_GRID_STEP };
        if (isWithinCropLocalMeters(testPos.x, testPos.z)) {
          const testCheck = validateTraverseSegment(
            start,
            testPos,
            config.maxAllowableSlopeDeg,
            4.0,
            config.exclusions,
          );
          if (testCheck.valid) {
            activeStartGx = testGx;
            activeStartGz = testGz;
            foundEntry = true;
            break;
          }
        }
      }
      if (foundEntry) break;
    }
    if (!foundEntry) {
      return createFailedPlan(
        `Start point connection blocked: cannot navigate from start location (${startConnCheck.reason || 'exceeds slope limits'}).`,
      );
    }
  }

  // Validate connection from dest grid node to dest
  let activeDestGx = destGx;
  let activeDestGz = destGz;
  const destConnCheck = validateTraverseSegment(
    { x: activeDestGx * PLANNER_GRID_STEP, z: activeDestGz * PLANNER_GRID_STEP },
    dest,
    config.maxAllowableSlopeDeg,
    4.0,
    config.exclusions,
  );

  if (!destConnCheck.valid) {
    let foundExit = false;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        const testGx = destGx + dx;
        const testGz = destGz + dz;
        const testPos = { x: testGx * PLANNER_GRID_STEP, z: testGz * PLANNER_GRID_STEP };
        if (isWithinCropLocalMeters(testPos.x, testPos.z)) {
          const testCheck = validateTraverseSegment(
            testPos,
            dest,
            config.maxAllowableSlopeDeg,
            4.0,
            config.exclusions,
          );
          if (testCheck.valid) {
            activeDestGx = testGx;
            activeDestGz = testGz;
            foundExit = true;
            break;
          }
        }
      }
      if (foundExit) break;
    }
    if (!foundExit) {
      return createFailedPlan(
        `Destination connection blocked: cannot approach destination location (${destConnCheck.reason || 'exceeds slope limits'}).`,
      );
    }
  }

  // A* Search Data Structures
  const openSet: NodeKey[] = [{ gx: activeStartGx, gz: activeStartGz }];
  const cameFrom: Map<string, NodeKey> = new Map();
  const gScore: Map<string, number> = new Map();
  const fScore: Map<string, number> = new Map();

  const startKey = toGridKey(activeStartGx, activeStartGz);
  const destKey = toGridKey(activeDestGx, activeDestGz);

  gScore.set(startKey, 0);
  fScore.set(
    startKey,
    Math.hypot(
      (activeDestGx - activeStartGx) * PLANNER_GRID_STEP,
      (activeDestGz - activeStartGz) * PLANNER_GRID_STEP,
    ),
  );

  const neighbors = [
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: 0, dz: -1 },
    { dx: 1, dz: 1 },
    { dx: 1, dz: -1 },
    { dx: -1, dz: 1 },
    { dx: -1, dz: -1 },
  ];

  let iterations = 0;
  const maxIterations = 35000;
  let reached = false;

  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;

    let bestIdx = 0;
    let lowestF = Infinity;
    for (let i = 0; i < openSet.length; i++) {
      const k = toGridKey(openSet[i].gx, openSet[i].gz);
      const f = fScore.get(k) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        bestIdx = i;
      }
    }

    const current = openSet[bestIdx];
    const currentKey = toGridKey(current.gx, current.gz);

    if (currentKey === destKey) {
      reached = true;
      break;
    }

    openSet.splice(bestIdx, 1);

    const currentX = current.gx * PLANNER_GRID_STEP;
    const currentZ = current.gz * PLANNER_GRID_STEP;
    const currentElev = getMeasuredElevation(currentX, currentZ);

    if (
      currentElev === MISSING_DATA_VALUE ||
      currentElev < -10000 ||
      !isNavigationPointCovered(currentX, currentZ)
    ) continue;

    const currentG = gScore.get(currentKey) ?? Infinity;

    for (const n of neighbors) {
      const nGx = current.gx + n.dx;
      const nGz = current.gz + n.dz;

      if (nGx < minGx || nGx > maxGx || nGz < minGz || nGz > maxGz) continue;

      const neighborX = nGx * PLANNER_GRID_STEP;
      const neighborZ = nGz * PLANNER_GRID_STEP;

      if (!isWithinCropLocalMeters(neighborX, neighborZ)) continue;
      if (!isNavigationPointCovered(neighborX, neighborZ)) continue;

      // Check diagonal move orthogonal corner clearance (cannot cut through missing data or barrier)
      if (n.dx !== 0 && n.dz !== 0) {
        const c1Elev = getMeasuredElevation(neighborX, currentZ);
        const c2Elev = getMeasuredElevation(currentX, neighborZ);
        if (
          c1Elev === MISSING_DATA_VALUE ||
          c1Elev < -10000 ||
          c2Elev === MISSING_DATA_VALUE ||
          c2Elev < -10000 ||
          !isNavigationPointCovered(neighborX, currentZ) ||
          !isNavigationPointCovered(currentX, neighborZ)
        ) {
          continue; // Diagonal move cuts across missing data corner
        }
      }

      // Continuous segment validation between grid nodes across elevation model
      const segVal = validateTraverseSegment(
        { x: currentX, z: currentZ },
        { x: neighborX, z: neighborZ },
        config.maxAllowableSlopeDeg,
        4.0,
        config.exclusions,
      );
      if (!segVal.valid) {
        continue;
      }

      const dH = Math.hypot(n.dx * PLANNER_GRID_STEP, n.dz * PLANNER_GRID_STEP);
      const slopeAngleDeg = segVal.maxSlopeDeg;

      // Cost calculation with slope penalty
      let slopeCostMultiplier = 1.0;
      if (config.preference === 'lower-slope') {
        slopeCostMultiplier = 1.0 + Math.pow(slopeAngleDeg / 6.0, 2.4);
      } else {
        slopeCostMultiplier = 1.0 + slopeAngleDeg / 10.0;
      }

      const stepCost = dH * slopeCostMultiplier;
      const tentativeG = currentG + stepCost;

      const nKey = toGridKey(nGx, nGz);
      const existingG = gScore.get(nKey) ?? Infinity;

      if (tentativeG < existingG) {
        cameFrom.set(nKey, current);
        gScore.set(nKey, tentativeG);

        const h = Math.hypot(
          (activeDestGx - nGx) * PLANNER_GRID_STEP,
          (activeDestGz - nGz) * PLANNER_GRID_STEP,
        );
        fScore.set(nKey, tentativeG + h);

        if (!openSet.some((node) => node.gx === nGx && node.gz === nGz)) {
          openSet.push({ gx: nGx, gz: nGz });
        }
      }
    }
  }

  if (!reached) {
    return createFailedPlan(
      `No traverse satisfies the ${config.maxAllowableSlopeDeg.toFixed(0)}° slope constraint across measured terrain. Steep scarps, missing data, or hazard exclusions block all valid paths.`,
    );
  }

  // Reconstruct path
  const gridPath: NodeKey[] = [];
  let curr: NodeKey | undefined = { gx: activeDestGx, gz: activeDestGz };
  while (curr) {
    gridPath.unshift(curr);
    const k = toGridKey(curr.gx, curr.gz);
    curr = cameFrom.get(k);
  }

  // Combine exact start, intermediate grid nodes, and exact dest
  const rawPoints: { x: number; z: number }[] = [
    { x: start.x, z: start.z },
    ...gridPath.map((g) => ({
      x: g.gx * PLANNER_GRID_STEP,
      z: g.gz * PLANNER_GRID_STEP,
    })),
    { x: dest.x, z: dest.z },
  ];

  // Simplification: only shortcut if segment validation is completely valid
  const filtered: { x: number; z: number }[] = [rawPoints[0]];
  let lastKept = rawPoints[0];

  for (let i = 1; i < rawPoints.length - 1; i++) {
    const cur = rawPoints[i];
    const next = rawPoints[i + 1];

    // Check if we can safely skip cur
    const canShortcut =
      Math.hypot(next.x - lastKept.x, next.z - lastKept.z) <= 32.0 &&
      validateTraverseSegment(lastKept, next, config.maxAllowableSlopeDeg, 4.0, config.exclusions).valid;

    if (!canShortcut) {
      filtered.push(cur);
      lastKept = cur;
    }
  }
  filtered.push(rawPoints[rawPoints.length - 1]);

  // Requirement: Final validation of path passed to Walk
  for (let i = 0; i < filtered.length - 1; i++) {
    const finalSegCheck = validateTraverseSegment(
      filtered[i],
      filtered[i + 1],
      config.maxAllowableSlopeDeg,
      4.0,
      config.exclusions,
    );
    if (!finalSegCheck.valid) {
      return createFailedPlan(
        `Final path validation failed: segment ${i + 1} (${finalSegCheck.reason || 'exceeds slope limits'}).`,
      );
    }
  }

  return buildPlanFromPoints(filtered, config, directCheck.maxSlopeDeg, !directCheck.valid);
}

function buildPlanFromPoints(
  pathPoints: { x: number; z: number }[],
  config: RoutePlannerConfig,
  directMaxSlopeDeg: number,
  directWasInvalidOrSteep: boolean,
): RoutePlanSummary {
  const points: RoutePoint[] = [];
  let totalDist = 0;
  let totalSurfaceDist = 0;
  let elevationGain = 0;
  let elevationLoss = 0;
  let minElev = Infinity;
  let maxElev = -Infinity;
  let sumSlopeDeg = 0;
  let maxSlopeDeg = 0;
  let totalTimeSeconds = 0;

  let gentleMeters = 0;
  let moderateMeters = 0;
  let steepMeters = 0;

  const startElev = getMeasuredElevation(pathPoints[0].x, pathPoints[0].z);
  const destElev = getMeasuredElevation(
    pathPoints[pathPoints.length - 1].x,
    pathPoints[pathPoints.length - 1].z,
  );

  for (let i = 0; i < pathPoints.length; i++) {
    const p = pathPoints[i];
    const elev = getMeasuredElevation(p.x, p.z);
    minElev = Math.min(minElev, elev);
    maxElev = Math.max(maxElev, elev);

    let segDist = 0;
    let segSurfaceDist = 0;
    let segSlopeDeg = 0;

    if (i > 0) {
      const prev = points[i - 1];
      const dH = Math.hypot(p.x - prev.x, p.z - prev.z);
      const dZ = elev - prev.elevation;

      segDist = dH;
      segSurfaceDist = Math.hypot(dH, dZ);
      segSlopeDeg = (Math.atan2(Math.abs(dZ), Math.max(0.001, dH)) * 180.0) / Math.PI;

      totalDist += segDist;
      totalSurfaceDist += segSurfaceDist;

      if (dZ > 0) elevationGain += dZ;
      else elevationLoss += Math.abs(dZ);

      sumSlopeDeg += segSlopeDeg * dH;
      maxSlopeDeg = Math.max(maxSlopeDeg, segSlopeDeg);

      const speed = calculateMartianWalkingSpeed(
        (segSlopeDeg * Math.PI) / 180.0,
        config.assumedBaseSpeedMps,
      );
      totalTimeSeconds += segSurfaceDist / speed;

      if (segSlopeDeg < 5.0) gentleMeters += segDist;
      else if (segSlopeDeg <= 12.0) moderateMeters += segDist;
      else steepMeters += segDist;
    }

    points.push({
      x: p.x,
      z: p.z,
      elevation: elev,
      slopeDeg: segSlopeDeg,
      distanceFromStart: totalDist,
      segmentSlopeDeg: segSlopeDeg,
    });
  }

  const averageSlopeDeg = totalDist > 0 ? sumSlopeDeg / totalDist : 0;
  const averageSlopePercent = Math.tan((averageSlopeDeg * Math.PI) / 180.0) * 100.0;

  const gentlePct = totalDist > 0 ? Math.round((gentleMeters / totalDist) * 100) : 100;
  const moderatePct = totalDist > 0 ? Math.round((moderateMeters / totalDist) * 100) : 0;
  const steepPct = totalDist > 0 ? Math.round((steepMeters / totalDist) * 100) : 0;

  // Requirement: Use "Lower-slope route" only when the route comparison supports it
  let explanation = '';
  if (config.preference === 'lower-slope' && (directWasInvalidOrSteep || directMaxSlopeDeg >= maxSlopeDeg + 2.5)) {
    explanation = `Lower-slope route: avoids steep sections; caps maximum measured incline at ${maxSlopeDeg.toFixed(1)}°.`;
  } else if (maxSlopeDeg < 5.0) {
    explanation = `Direct gentle traverse across crater floor regolith · max incline ${maxSlopeDeg.toFixed(1)}°.`;
  } else {
    explanation = `Traverse navigates natural grade breaks · max incline ${maxSlopeDeg.toFixed(1)}° within prototype limits.`;
  }

  return {
    success: true,
    points,
    totalDistanceMeters: Math.round(totalDist),
    totalSurfaceDistanceMeters: Math.round(totalSurfaceDist),
    elevationGainMeters: Math.round(elevationGain * 10) / 10,
    elevationLossMeters: Math.round(elevationLoss * 10) / 10,
    startElevationMeters: Math.round(startElev * 10) / 10,
    endElevationMeters: Math.round(destElev * 10) / 10,
    minElevationMeters: Math.round(minElev * 10) / 10,
    maxElevationMeters: Math.round(maxElev * 10) / 10,
    averageSlopePercent: Math.round(averageSlopePercent * 10) / 10,
    averageSlopeDeg: Math.round(averageSlopeDeg * 10) / 10,
    maxSlopeDeg: Math.round(maxSlopeDeg * 10) / 10,
    estimatedTimeMinutes: totalDist === 0 ? 0 : Math.max(1, Math.round(totalTimeSeconds / 60)),
    assumedSpeedMps: config.assumedBaseSpeedMps,
    maxAllowableSlopeDeg: config.maxAllowableSlopeDeg,
    explanation,
    hasAlternative: false,
    slopeProfile: {
      gentlePct,
      moderatePct,
      steepPct,
    },
  };
}

function createFailedPlan(reason: string): RoutePlanSummary {
  return {
    success: false,
    points: [],
    totalDistanceMeters: 0,
    totalSurfaceDistanceMeters: 0,
    elevationGainMeters: 0,
    elevationLossMeters: 0,
    startElevationMeters: 0,
    endElevationMeters: 0,
    minElevationMeters: 0,
    maxElevationMeters: 0,
    averageSlopePercent: 0,
    averageSlopeDeg: 0,
    maxSlopeDeg: 0,
    estimatedTimeMinutes: 0,
    assumedSpeedMps: DEFAULT_ROUTER_CONFIG.assumedBaseSpeedMps,
    maxAllowableSlopeDeg: DEFAULT_ROUTER_CONFIG.maxAllowableSlopeDeg,
    explanation: 'Route calculation failed.',
    failureReason: reason,
    hasAlternative: false,
    slopeProfile: { gentlePct: 0, moderatePct: 0, steepPct: 0 },
  };
}
