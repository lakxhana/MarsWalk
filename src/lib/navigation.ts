export type JourneyState = 'plan' | 'navigate' | 'arrive';

export interface RoutePoint2D {
  x: number;
  z: number;
}

export interface OffRouteStatus {
  isOffRoute: boolean;
  distance: number; // in meters (rounded)
  closestPoint: RoutePoint2D;
  rejoinInstruction: string;
  turnDirection: 'straight' | 'bear-left' | 'turn-left' | 'bear-right' | 'turn-right' | 'turn-around';
}

export interface DirectionGuidance {
  instruction: string;
  subInstruction: string;
  bearingDeg: number;
  relativeDeg: number;
  turnDirection: 'straight' | 'bear-left' | 'turn-left' | 'bear-right' | 'turn-right' | 'turn-around';
}

/**
 * Normalizes an angle in radians to [-PI, +PI]
 */
export function normalizeAngle(angleRad: number): number {
  let a = angleRad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Calculates dynamic directional guidance from player position & camera yaw to a target point.
 * In Three.js:
 * Camera forward vector is (-sin(yaw), -cos(yaw)).
 * Target direction vector is (targetX - px, targetZ - pz).
 */
export function calculateDynamicGuidance(
  playerPos: RoutePoint2D,
  playerYaw: number,
  targetPos: RoutePoint2D,
  targetName: string,
  distToTarget: number,
): DirectionGuidance {
  const dx = targetPos.x - playerPos.x;
  const dz = targetPos.z - playerPos.z;

  // Bearing of target relative to Mars North (or -Z axis)
  const targetBearing = Math.atan2(-dx, -dz);
  const relativeAngle = normalizeAngle(targetBearing - playerYaw);
  const relativeDeg = Math.round(relativeAngle * (180 / Math.PI));
  const bearingDeg = Math.round(targetBearing * (180 / Math.PI));

  let instruction = '';
  let subInstruction = `${distToTarget} m away`;
  let turnDirection: DirectionGuidance['turnDirection'] = 'straight';

  if (distToTarget <= 4.0) {
    instruction = `Arrival zone · ${targetName}`;
    subInstruction = `Within inspection radius (${distToTarget} m)`;
    turnDirection = 'straight';
  } else if (Math.abs(relativeDeg) <= 18) {
    instruction = `Continue straight toward ${targetName}`;
    turnDirection = 'straight';
  } else if (relativeDeg > 18 && relativeDeg <= 50) {
    instruction = `Bear right toward ${targetName}`;
    turnDirection = 'bear-right';
  } else if (relativeDeg > 50 && relativeDeg <= 120) {
    instruction = `Turn right toward ${targetName}`;
    turnDirection = 'turn-right';
  } else if (relativeDeg < -18 && relativeDeg >= -50) {
    instruction = `Bear left toward ${targetName}`;
    turnDirection = 'bear-left';
  } else if (relativeDeg < -50 && relativeDeg >= -120) {
    instruction = `Turn left toward ${targetName}`;
    turnDirection = 'turn-left';
  } else {
    instruction = `Heading away · Turn around toward ${targetName}`;
    turnDirection = 'turn-around';
  }

  return {
    instruction,
    subInstruction,
    bearingDeg,
    relativeDeg,
    turnDirection,
  };
}

/**
 * Checks whether the explorer has departed from the route path (> 6.0 meters from nearest spline point)
 * and calculates dynamic bearing & guidance to rejoin the route.
 */
export function calculateOffRouteStatus(
  playerPos: RoutePoint2D,
  playerYaw: number,
  splineSamples: RoutePoint2D[],
  threshold = 6.0,
): OffRouteStatus {
  if (!splineSamples || splineSamples.length === 0) {
    return {
      isOffRoute: false,
      distance: 0,
      closestPoint: playerPos,
      rejoinInstruction: 'On route',
      turnDirection: 'straight',
    };
  }

  let minDistSq = Infinity;
  let closest = splineSamples[0];

  for (let i = 0; i < splineSamples.length; i++) {
    const pt = splineSamples[i];
    const dx = playerPos.x - pt.x;
    const dz = playerPos.z - pt.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq) {
      minDistSq = dSq;
      closest = pt;
    }
  }

  const dist = Math.sqrt(minDistSq);
  const roundedDist = Math.round(dist);
  const isOffRoute = dist > threshold;

  if (!isOffRoute) {
    return {
      isOffRoute: false,
      distance: roundedDist,
      closestPoint: closest,
      rejoinInstruction: 'On route',
      turnDirection: 'straight',
    };
  }

  // Calculate direction from player to closest route point
  const rdx = closest.x - playerPos.x;
  const rdz = closest.z - playerPos.z;
  const targetBearing = Math.atan2(-rdx, -rdz);
  const relativeAngle = normalizeAngle(targetBearing - playerYaw);
  const relativeDeg = Math.round(relativeAngle * (180 / Math.PI));

  let rejoinInstruction = '';
  let turnDirection: OffRouteStatus['turnDirection'] = 'straight';

  if (Math.abs(relativeDeg) <= 20) {
    rejoinInstruction = `Continue ahead to rejoin route (${roundedDist} m)`;
    turnDirection = 'straight';
  } else if (relativeDeg > 20 && relativeDeg <= 60) {
    rejoinInstruction = `Bear right to rejoin route (${roundedDist} m)`;
    turnDirection = 'bear-right';
  } else if (relativeDeg > 60 && relativeDeg <= 125) {
    rejoinInstruction = `Turn right to rejoin route (${roundedDist} m)`;
    turnDirection = 'turn-right';
  } else if (relativeDeg < -20 && relativeDeg >= -60) {
    rejoinInstruction = `Bear left to rejoin route (${roundedDist} m)`;
    turnDirection = 'bear-left';
  } else if (relativeDeg < -60 && relativeDeg >= -125) {
    rejoinInstruction = `Turn left to rejoin route (${roundedDist} m)`;
    turnDirection = 'turn-left';
  } else {
    rejoinInstruction = `Heading away · Turn around to rejoin route (${roundedDist} m)`;
    turnDirection = 'turn-around';
  }

  return {
    isOffRoute: true,
    distance: roundedDist,
    closestPoint: closest,
    rejoinInstruction,
    turnDirection,
  };
}
