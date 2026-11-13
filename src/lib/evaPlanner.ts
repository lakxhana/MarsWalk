// EVA Mission & Time Budget Planner for MARSWalk
// Supports closed-loop round-trip excursion planning: Base -> Destination -> Return to Base
//
// All time estimates are modelled using Martian-gravity-adjusted hiking mechanics
// across the measured HiRISE DTM. Both outward and return legs are independently evaluated
// because Martian slope-adjusted walking speed is asymmetric.
//
// Total Budget = Outward walk + Observation duration + Return walk + Reserve

import {
  planTerrainRoute,
  RoutePlanSummary,
  PathExclusion,
  RoutePlannerConfig,
} from './routePlanner';

export interface EVAMissionConfig {
  baseLocation: {
    id: string;
    name: string;
    x: number;
    z: number;
  };
  destination: {
    id: string;
    name: string;
    x: number;
    z: number;
  };
  totalDurationMinutes: number; // e.g., 60 min total mission window
  observationMinutes: number; // e.g., 15 min at destination
  reserveMinutes: number; // e.g., 15 min contingency reserve
  assumedBaseSpeedMps: number; // default: 1.1 m/s
  maxAllowableSlopeDeg: number; // default: 15°
  preference?: 'lower-slope' | 'direct';
  exclusions?: PathExclusion[];
}

export interface EVAPlanSummary {
  success: boolean;
  withinBudget: boolean;
  baseLocation: {
    id: string;
    name: string;
    x: number;
    z: number;
  };
  destination: {
    id: string;
    name: string;
    x: number;
    z: number;
  };
  totalDurationMinutes: number;
  observationMinutes: number;
  reserveMinutes: number;
  outwardRoute: RoutePlanSummary;
  returnRoute: RoutePlanSummary;
  outwardTimeMinutes: number;
  returnTimeMinutes: number;
  totalRequiredMinutes: number;
  marginMinutes: number; // positive if under budget
  shortfallMinutes: number; // positive if over budget
  breakdownText: string;
  statusMessage: string;
  exclusions: PathExclusion[];
}

export const DEFAULT_EVA_CONFIG: EVAMissionConfig = {
  baseLocation: {
    id: 'base_landing',
    name: 'Octavia E. Butler Landing (Base)',
    x: -350,
    z: 280,
  },
  destination: {
    id: 'dest_fan_front',
    name: 'Delta Scarp Station',
    x: 400,
    z: -320,
  },
  totalDurationMinutes: 60,
  observationMinutes: 15,
  reserveMinutes: 15,
  assumedBaseSpeedMps: 1.1,
  maxAllowableSlopeDeg: 15,
  preference: 'lower-slope',
  exclusions: [],
};

export function planEVAMission(config: EVAMissionConfig): EVAPlanSummary {
  const routerConfig: RoutePlannerConfig = {
    maxAllowableSlopeDeg: config.maxAllowableSlopeDeg,
    preference: config.preference || 'lower-slope',
    assumedBaseSpeedMps: config.assumedBaseSpeedMps,
    exclusions: config.exclusions,
  };

  // 1. Calculate Outward Route (Base -> Destination)
  const outwardRoute = planTerrainRoute(
    { x: config.baseLocation.x, z: config.baseLocation.z },
    { x: config.destination.x, z: config.destination.z },
    routerConfig,
  );
  outwardRoute.startName = config.baseLocation.name;
  outwardRoute.destinationName = config.destination.name;

  // 2. Calculate Return Route (Destination -> Base) independently
  // Notice: Asymmetric terrain slope speeds mean return duration != outward duration!
  const returnRoute = planTerrainRoute(
    { x: config.destination.x, z: config.destination.z },
    { x: config.baseLocation.x, z: config.baseLocation.z },
    routerConfig,
  );
  returnRoute.startName = config.destination.name;
  returnRoute.destinationName = config.baseLocation.name;

  if (!outwardRoute.success || !returnRoute.success) {
    const failureMsg = !outwardRoute.success
      ? `Outward path blocked: ${outwardRoute.failureReason || outwardRoute.explanation}`
      : `Return path blocked: ${returnRoute.failureReason || returnRoute.explanation}`;

    return {
      success: false,
      withinBudget: false,
      baseLocation: config.baseLocation,
      destination: config.destination,
      totalDurationMinutes: config.totalDurationMinutes,
      observationMinutes: config.observationMinutes,
      reserveMinutes: config.reserveMinutes,
      outwardRoute,
      returnRoute,
      outwardTimeMinutes: outwardRoute.estimatedTimeMinutes,
      returnTimeMinutes: returnRoute.estimatedTimeMinutes,
      totalRequiredMinutes: 0,
      marginMinutes: 0,
      shortfallMinutes: 0,
      breakdownText: 'Traversal impossible under slope or hazard constraints',
      statusMessage: failureMsg,
      exclusions: config.exclusions || [],
    };
  }

  // Time budget calculation
  const tOut = outwardRoute.estimatedTimeMinutes;
  const tObs = config.observationMinutes;
  const tRet = returnRoute.estimatedTimeMinutes;
  const tRes = config.reserveMinutes;
  const tTotal = config.totalDurationMinutes;

  const totalRequired = tOut + tObs + tRet + tRes;
  const margin = tTotal - totalRequired;
  const withinBudget = margin >= 0;
  const shortfall = withinBudget ? 0 : Math.abs(margin);

  const breakdownText = `${tOut.toFixed(0)}m outward · ${tObs.toFixed(0)}m observation · ${tRet.toFixed(0)}m return · ${tRes.toFixed(0)}m reserve`;

  let statusMessage = '';
  if (withinBudget) {
    statusMessage = `Mission fits within ${tTotal}m budget with ${margin.toFixed(0)}m spare margin.`;
  } else {
    statusMessage = `Exceeds budget by ${shortfall.toFixed(0)}m. Reduce observation duration or select a closer destination. Reserve (${tRes}m) is preserved.`;
  }

  return {
    success: true,
    withinBudget,
    baseLocation: config.baseLocation,
    destination: config.destination,
    totalDurationMinutes: tTotal,
    observationMinutes: tObs,
    reserveMinutes: tRes,
    outwardRoute,
    returnRoute,
    outwardTimeMinutes: tOut,
    returnTimeMinutes: tRet,
    totalRequiredMinutes: totalRequired,
    marginMinutes: margin,
    shortfallMinutes: shortfall,
    breakdownText,
    statusMessage,
    exclusions: config.exclusions || [],
  };
}

/**
 * Re-plans the return leg to base from the walker's current position.
 * Used during dynamic replanning or when a hazard scenario blocks the return.
 */
export function replanEVAReturn(
  currentPos: { x: number; z: number },
  baseLocation: { x: number; z: number; name?: string },
  config: EVAMissionConfig,
  exclusions?: PathExclusion[],
): RoutePlanSummary {
  const routerConfig: RoutePlannerConfig = {
    maxAllowableSlopeDeg: config.maxAllowableSlopeDeg,
    preference: config.preference || 'lower-slope',
    assumedBaseSpeedMps: config.assumedBaseSpeedMps,
    exclusions: exclusions ?? config.exclusions,
  };

  const plan = planTerrainRoute(currentPos, baseLocation, routerConfig);
  plan.startName = 'Current Position';
  plan.destinationName = baseLocation.name || 'Base';
  return plan;
}
