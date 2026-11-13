import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  JEZERO_HIRISE_CROP,
  CROP_HALF_WIDTH_METERS,
  CROP_HALF_HEIGHT_METERS,
  cropMetersToLonLat,
} from '@/lib/jezeroHiRISE';
import {
  getMeasuredElevation,
  getMeasuredSlopeDeg,
  getMeasuredGridData,
  MEASURED_DTM_METADATA,
  MISSING_DATA_VALUE,
} from '@/lib/jezeroMeasuredElevation';
import {
  getImageNoDataCells,
  isNavigationPointCovered,
} from '@/lib/jezeroCoverage';
import {
  MEDA_HISTORICAL_SOLS,
  type MedaSolRecord,
  type MedaHourlyObservation,
} from '@/lib/medaData';
import { SurfacePose } from './MarsSurface';
import { planTerrainRoute, type RoutePlanSummary } from '@/lib/routePlanner';
import {
  planEVAMission,
  type EVAPlanSummary,
} from '@/lib/evaPlanner';
import {
  Plus,
  Minus,
  Crosshair,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Sliders,
  ArrowLeft,
  Navigation as NavigationIcon,
  RotateCcw,
  Clock,
} from 'lucide-react';

interface MarsPlanProps {
  surfacePose?: SurfacePose;
  destinationId?: number;
  onSelectDestination?: (id: number) => void;
  onStartNavigation?: (route?: RoutePlanSummary, evaPlan?: EVAPlanSummary) => void;
  onEnterWalk?: () => void;
  onBackToGlobe?: () => void;
  onSetPlannedRoute?: (route: RoutePlanSummary | null) => void;
  activeEVAPlan?: EVAPlanSummary | null;
  onSetEVAPlan?: (eva: EVAPlanSummary | null) => void;
}

/**
 * Draws the high-contrast terrain limits hazard mask onto a canvas element.
 * Distinguishes "Above incline limit" (amber angled stripes) from "No elevation data" (slate crosshatch).
 */
function renderHazardCanvas(canvas: HTMLCanvasElement, maxSlopeDeg: number) {
  const grid = getMeasuredGridData();
  const width = 321;
  const height = 321;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  const SPACING = MEASURED_DTM_METADATA.gridSpacingMeters;

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const idx = (r * width + c) * 4;
      const elev = grid[r * width + c];

      if (elev < -10000 || isNaN(elev)) {
        // No elevation data: slate gray pattern with crosshatch pixels
        const isPattern = (r + c) % 4 === 0 || (r - c) % 4 === 0;
        data[idx] = 113; // R
        data[idx + 1] = 113; // G
        data[idx + 2] = 122; // B
        data[idx + 3] = isPattern ? 180 : 80; // Alpha
      } else {
        const cL = Math.max(0, c - 1);
        const cR = Math.min(width - 1, c + 1);
        const rU = Math.max(0, r - 1);
        const rD = Math.min(height - 1, r + 1);
        const hL = grid[r * width + cL];
        const hR = grid[r * width + cR];
        const hU = grid[rU * width + c];
        const hD = grid[rD * width + c];

        if (hL < -10000 || hR < -10000 || hU < -10000 || hD < -10000) {
          // Boundary of missing coverage
          data[idx] = 113;
          data[idx + 1] = 113;
          data[idx + 2] = 122;
          data[idx + 3] = 120;
        } else {
          const dzdx = (hR - hL) / ((cR - cL) * SPACING);
          const dzdz = (hD - hU) / ((rD - rU) * SPACING);
          const slopeDeg = (Math.atan(Math.hypot(dzdx, dzdz)) * 180) / Math.PI;

          if (slopeDeg > maxSlopeDeg) {
            // Above incline limit: warm amber 45° angled stripe pattern
            const stripe = (r + c) % 6 < 3;
            data[idx] = 217; // R
            data[idx + 1] = 119; // G
            data[idx + 2] = 6; // B
            data[idx + 3] = stripe ? 190 : 80; // Alpha
          } else {
            // Normal passable regolith: transparent
            data[idx + 3] = 0;
          }
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

export default function MarsPlan({
  onStartNavigation,
  onBackToGlobe,
  onSetPlannedRoute,
  onSetEVAPlan,
}: MarsPlanProps) {
  // Shared bundled HiRISE asset state
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [simulateFailure, setSimulateFailure] = useState(false);

  // Terrain Limits Hazard Layer State (optional toggle)
  const [showTerrainLimits, setShowTerrainLimits] = useState<boolean>(false);
  const [isLayersExpanded, setIsLayersExpanded] = useState(false);
  const hazardCanvasRef = useRef<HTMLCanvasElement>(null);

  // Planning Mode: 'eva' (Plan my EVA - round-trip excursion) or 'point-to-point'
  const [plannerMode, setPlannerMode] = useState<'eva' | 'point-to-point'>('eva');

  // Active Click Mode: whether map clicks set Destination, Start, or Base point
  const [clickTargetMode, setClickTargetMode] = useState<'destination' | 'start' | 'base'>('destination');
  const [isPlanningPanelOpen, setIsPlanningPanelOpen] = useState(true);

  // Custom clicked positions
  const [customStart, setCustomStart] = useState<{ x: number; z: number }>({ x: -150, z: 200 });
  const [customDest, setCustomDest] = useState<{ x: number; z: number }>({ x: 300, z: -250 });
  const [customBase, setCustomBase] = useState<{ x: number; z: number }>({ x: -150, z: 200 });

  // EVA Mission Budget Parameters (editable under Mission settings)
  const [evaTotalMinutes, setEvaTotalMinutes] = useState<number>(60);
  const [evaObsMinutes, setEvaObsMinutes] = useState<number>(15);
  const [evaReserveMinutes, setEvaReserveMinutes] = useState<number>(15);
  const [evaSpeedMps, setEvaSpeedMps] = useState<number>(1.1);

  // These are planning coordinates, not named or verified surface landmarks.
  const PRESETS = useMemo(
    () => [
      { id: 'planning-point-1', name: 'Planning point 1', x: -150, z: 200 },
      { id: 'planning-point-2', name: 'Planning point 2', x: 300, z: -250 },
      { id: 'planning-point-3', name: 'Planning point 3', x: 0, z: 0 },
      { id: 'planning-point-4', name: 'Planning point 4', x: 20, z: 35 },
      { id: 'planning-point-5', name: 'Planning point 5', x: 727, z: 525 },
      { id: 'planning-point-6', name: 'Planning point 6', x: -888, z: -687 },
      { id: 'custom-pin', name: 'User waypoint', x: customDest.x, z: customDest.z },
    ],
    [customDest],
  );

  const [selectedStartId, setSelectedStartId] = useState<string>('');
  const [selectedBaseId, setSelectedBaseId] = useState<string>('');
  const [selectedDestId, setSelectedDestId] = useState<string>('');
  const hasChosenEndpoints = Boolean(
    (plannerMode === 'eva' ? selectedBaseId : selectedStartId) && selectedDestId,
  );
  const [maxSlopeDeg] = useState<number>(15.0);
  const [coverageMessage, setCoverageMessage] = useState<string | null>(null);
  const coverageGaps = useMemo(() => getImageNoDataCells(), []);

  const activeStart = useMemo(() => {
    if (selectedStartId === 'custom-start') {
      const geo = cropMetersToLonLat(customStart.x, customStart.z);
      return {
        id: 'custom-start',
        name: `Custom Start (${geo.lat.toFixed(4)}°N, ${geo.lon.toFixed(4)}°E)`,
        x: customStart.x,
        z: customStart.z,
      };
    }
    return PRESETS.find((p) => p.id === selectedStartId) || PRESETS[0];
  }, [selectedStartId, PRESETS, customStart]);

  const activeBase = useMemo(() => {
    if (selectedBaseId === 'custom-base') {
      const geo = cropMetersToLonLat(customBase.x, customBase.z);
      return {
        id: 'custom-base',
        name: `Custom Base (${geo.lat.toFixed(4)}°N, ${geo.lon.toFixed(4)}°E)`,
        x: customBase.x,
        z: customBase.z,
      };
    }
    return PRESETS.find((p) => p.id === selectedBaseId) || PRESETS[0];
  }, [selectedBaseId, PRESETS, customBase]);

  const activeDest = useMemo(() => {
    if (selectedDestId === 'custom-pin') {
      const geo = cropMetersToLonLat(customDest.x, customDest.z);
      return {
        id: 'custom-pin',
        name: `Custom Target (${geo.lat.toFixed(4)}°N, ${geo.lon.toFixed(4)}°E)`,
        x: customDest.x,
        z: customDest.z,
      };
    }
    return PRESETS.find((p) => p.id === selectedDestId) || PRESETS[1];
  }, [selectedDestId, PRESETS, customDest]);

  // Compute single terrain route using actual measured HiRISE DTM heights
  const calculatedRoute = useMemo<RoutePlanSummary>(() => {
    const res = planTerrainRoute(
      { x: activeStart.x, z: activeStart.z },
      { x: activeDest.x, z: activeDest.z },
      { maxAllowableSlopeDeg: maxSlopeDeg, preference: 'lower-slope', assumedBaseSpeedMps: evaSpeedMps },
    );
    if (res.success) {
      res.id = `route-${activeStart.id}-${activeDest.id}`;
      res.startName = activeStart.name;
      res.destinationName = activeDest.name;
    }
    return res;
  }, [activeStart, activeDest, maxSlopeDeg, evaSpeedMps]);

  // Compute closed-loop round-trip EVA Mission using independent outward & return legs
  const calculatedEVAPlan = useMemo<EVAPlanSummary>(() => {
    return planEVAMission({
      baseLocation: activeBase,
      destination: activeDest,
      totalDurationMinutes: evaTotalMinutes,
      observationMinutes: evaObsMinutes,
      reserveMinutes: evaReserveMinutes,
      assumedBaseSpeedMps: evaSpeedMps,
      maxAllowableSlopeDeg: maxSlopeDeg,
      preference: 'lower-slope',
    });
  }, [
    activeBase,
    activeDest,
    evaTotalMinutes,
    evaObsMinutes,
    evaReserveMinutes,
    evaSpeedMps,
    maxSlopeDeg,
  ]);

  const handleStartWalk = () => {
    if (calculatedRoute && calculatedRoute.success) {
      onSetPlannedRoute?.(calculatedRoute);
      onStartNavigation?.(calculatedRoute);
    }
  };

  const handleStartEVAWalk = () => {
    if (calculatedEVAPlan && calculatedEVAPlan.success && calculatedEVAPlan.withinBudget) {
      onSetEVAPlan?.(calculatedEVAPlan);
      onSetPlannedRoute?.(calculatedEVAPlan.outwardRoute);
      onStartNavigation?.(calculatedEVAPlan.outwardRoute, calculatedEVAPlan);
    }
  };

  const handlePreviewWalk = () => {
    if (plannerMode === 'eva') handleStartEVAWalk();
    else handleStartWalk();
  };

  const selectedRouteAvailable =
    plannerMode === 'eva'
      ? calculatedEVAPlan.success && calculatedEVAPlan.withinBudget
      : calculatedRoute.success;
  const selectedRouteDistance =
    plannerMode === 'eva' && calculatedEVAPlan.success
      ? calculatedEVAPlan.outwardRoute.totalDistanceMeters + calculatedEVAPlan.returnRoute.totalDistanceMeters
      : calculatedRoute.success
        ? calculatedRoute.totalDistanceMeters
        : null;
  const selectedRouteTime =
    plannerMode === 'eva' && calculatedEVAPlan.success
      ? calculatedEVAPlan.totalRequiredMinutes
      : calculatedRoute.success
        ? calculatedRoute.estimatedTimeMinutes
        : null;
  const selectedRouteFailure =
    plannerMode === 'eva'
      ? calculatedEVAPlan.success
        ? calculatedEVAPlan.withinBudget ? null : calculatedEVAPlan.statusMessage
        : calculatedEVAPlan.statusMessage
      : calculatedRoute.success
        ? null
        : calculatedRoute.failureReason || 'No route is available for these locations.';

  // Render hazard canvas when ready or slope threshold changes
  useEffect(() => {
    if (hazardCanvasRef.current && imageState === 'ready') {
      renderHazardCanvas(hazardCanvasRef.current, maxSlopeDeg);
    }
  }, [imageState, maxSlopeDeg]);

  // Collapsible sections - kept collapsed by default
  const [isMedaExpanded, setIsMedaExpanded] = useState<boolean>(false);
  const [isSourcesExpanded, setIsSourcesExpanded] = useState<boolean>(false);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState<boolean>(false);

  // Pan & Zoom state
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.38); // pixels per meter across ~2585 m
  const [pan, setPan] = useState({ x: 0, y: 0 }); // offset in pixels
  const [isDragging, setIsDragging] = useState(false);
  const activePointerIdRef = useRef<number | null>(null);
  const suppressNextClickRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const hasDraggedRef = useRef(false);
  const [containerSize, setContainerSize] = useState({ width: 1000, height: 800 });

  // Hovered coordinates & elevation readout
  const [hoverInfo, setHoverInfo] = useState<{
    lon: number;
    lat: number;
    x: number;
    z: number;
    elevation: number;
    slope: number | null;
    isInside: boolean;
  } | null>(null);

  // MEDA Historical Observation State
  const [selectedSol, setSelectedSol] = useState<number>(518);
  const [selectedHourIndex] = useState<number>(6); // ~14:00 LMST peak

  const activeMedaSol: MedaSolRecord = useMemo(() => {
    return (
      MEDA_HISTORICAL_SOLS.find((s) => s.sol === selectedSol) ||
      MEDA_HISTORICAL_SOLS[1]
    );
  }, [selectedSol]);

  const activeMedaObs: MedaHourlyObservation = useMemo(() => {
    const obsList = activeMedaSol.hourlyObservations;
    if (selectedHourIndex >= 0 && selectedHourIndex < obsList.length) {
      return obsList[selectedHourIndex];
    }
    return obsList[Math.floor(obsList.length / 2)];
  }, [activeMedaSol, selectedHourIndex]);

  // Sync container size on mount and resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    const observer=new ResizeObserver(updateSize);
    if(containerRef.current)observer.observe(containerRef.current);
    return () => {observer.disconnect();window.removeEventListener('resize', updateSize);};
  }, []);

  // Center image in viewport on mount or ready
  const handleRecentre = useCallback(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;
    setPan({
      x: w / 2,
      y: h / 2,
    });
  }, []);

  useEffect(() => {
    handleRecentre();
  }, [handleRecentre]);

  // Preload and verify bundled HiRISE asset
  useEffect(() => {
    if (simulateFailure) {
      setImageState('error');
      return;
    }

    setImageState('loading');
    const img = new Image();
    img.src = JEZERO_HIRISE_CROP.assetUrl;
    img.onload = () => {
      setImageState('ready');
    };
    img.onerror = () => {
      setImageState('error');
    };
  }, [retryCount, simulateFailure]);

  // Coordinate conversion: local meters to screen pixels
  const toScreenX = useCallback((x: number) => pan.x + x * scale, [pan.x, scale]);
  const toScreenY = useCallback((z: number) => pan.y + z * scale, [pan.y, scale]);

  // Convert screen coordinates back to local meters
  const toLocalCoords = useCallback(
    (screenX: number, screenY: number) => {
      const x = (screenX - pan.x) / scale;
      const z = (screenY - pan.y) / scale;
      return { x, z };
    },
    [pan.x, pan.y, scale]
  );

  // Pointer Drag & Pan Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, select, input, [role="button"], a, label')) return;
    activePointerIdRef.current = e.pointerId;
    suppressNextClickRef.current = false;
    hasDraggedRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const local = toLocalCoords(screenX, screenY);
      const isInside = isNavigationPointCovered(local.x, local.z);
      const geo = cropMetersToLonLat(local.x, local.z);
      const elev = isInside ? getMeasuredElevation(local.x, local.z) : MISSING_DATA_VALUE;
      const slope = isInside ? getMeasuredSlopeDeg(local.x, local.z) : null;

      setHoverInfo({
        lon: geo.lon,
        lat: geo.lat,
        x: local.x,
        z: local.z,
        elevation: elev,
        slope,
        isInside,
      });
    }

    if (activePointerIdRef.current !== e.pointerId || (e.buttons & 1) !== 1) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (Math.hypot(dx, dy) > 5) {
      hasDraggedRef.current = true;
      suppressNextClickRef.current = true;
      setIsDragging(true);
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    activePointerIdRef.current = null;
    setIsDragging(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      activePointerIdRef.current = null;
    }
  };

  // Map Click to place custom Start or Destination point
  const handleMapClick = (e: React.MouseEvent) => {
    if (suppressNextClickRef.current || hasDraggedRef.current) {
      suppressNextClickRef.current = false;
      hasDraggedRef.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest('button, select, input, a, label')) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const local = toLocalCoords(screenX, screenY);

    const roundedX = Math.round(local.x * 10) / 10;
    const roundedZ = Math.round(local.z * 10) / 10;
    if (!isNavigationPointCovered(roundedX, roundedZ)) {
      setCoverageMessage('Choose a point inside mapped terrain coverage.');
      return;
    }
    setCoverageMessage(null);

    if (clickTargetMode === 'base') {
      setCustomBase({ x: roundedX, z: roundedZ });
      setSelectedBaseId('custom-base');
    } else if (clickTargetMode === 'start') {
      setCustomStart({ x: roundedX, z: roundedZ });
      setSelectedStartId('custom-start');
    } else {
      setCustomDest({ x: roundedX, z: roundedZ });
      setSelectedDestId('custom-pin');
    }
  };

  // Cursor-Anchored Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 0.87;

    setScale((prevScale) => {
      const nextScale = Math.max(0.15, Math.min(3.5, prevScale * factor));
      if (nextScale === prevScale) return prevScale;

      setPan((prevPan) => ({
        x: cursorX - (cursorX - prevPan.x) * (nextScale / prevScale),
        y: cursorY - (cursorY - prevPan.y) * (nextScale / prevScale),
      }));

      return nextScale;
    });
  };

  // Button Zoom centered on container
  const handleZoomStep = (inOrOut: 'in' | 'out') => {
    const rect = containerRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.width / 2 : (containerSize.width || 800) / 2;
    const centerY = rect ? rect.height / 2 : (containerSize.height || 600) / 2;
    const factor = inOrOut === 'in' ? 1.25 : 0.8;

    setScale((prevScale) => {
      const nextScale = Math.max(0.15, Math.min(3.5, prevScale * factor));
      if (nextScale === prevScale) return prevScale;

      setPan((prevPan) => ({
        x: centerX - (centerX - prevPan.x) * (nextScale / prevScale),
        y: centerY - (centerY - prevPan.y) * (nextScale / prevScale),
      }));

      return nextScale;
    });
  };

  // Screen layout for the bundled HiRISE image element
  const imageLeft = pan.x - CROP_HALF_WIDTH_METERS * scale;
  const imageTop = pan.y - CROP_HALF_HEIGHT_METERS * scale;
  const imageWidthPx = JEZERO_HIRISE_CROP.widthMeters * scale;
  const imageHeightPx = JEZERO_HIRISE_CROP.heightMeters * scale;

  // Dynamic Scale Bar
  const scaleBarMeters = useMemo(() => {
    const targetPx = 110;
    const rawMeters = targetPx / scale;
    if (rawMeters >= 800) return 1000;
    if (rawMeters >= 400) return 500;
    if (rawMeters >= 200) return 250;
    if (rawMeters >= 80) return 100;
    return 50;
  }, [scale]);

  const scaleBarPx = scaleBarMeters * scale;

  const handleRetryImagery = () => {
    setSimulateFailure(false);
    setRetryCount((c) => c + 1);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--surface)] font-sans text-[var(--text-primary)] antialiased lg:flex-row">
      <aside className="flex max-h-[55%] w-full shrink-0 flex-col overflow-hidden border-b border-[var(--border)] bg-[var(--panel)] lg:h-full lg:max-h-none lg:w-[340px] lg:border-b-0 lg:border-r">
        <div className="hidden min-h-14 shrink-0 items-center border-b border-[var(--border)] px-5 lg:flex">
          <h1 className="text-[16px] font-semibold tracking-tight">Plan your walk</h1>
        </div>
        <div className="flex min-h-12 items-center justify-between border-b border-[var(--border)] px-4 lg:hidden">
          <span className="text-[14px] font-semibold">Plan your walk</span>
          <button
            type="button"
            aria-expanded={isPlanningPanelOpen}
            aria-controls="planning-panel-content"
            onClick={() => setIsPlanningPanelOpen((open) => !open)}
            className="min-h-10 rounded px-2 text-[14px] font-medium text-[var(--text-primary)] focus-visible:outline"
          >
            {isPlanningPanelOpen ? 'Hide planning' : 'Show planning'}
          </button>
        </div>
        <div
          id="planning-panel-content"
          className={`${isPlanningPanelOpen ? 'flex' : 'hidden'} min-h-0 flex-col gap-5 overflow-y-auto p-4 lg:flex lg:flex-1 lg:p-5`}
        >
          <section aria-labelledby="starting-point-heading" className="space-y-2">
            <h1 id="starting-point-heading" className="text-[16px] font-semibold">1. Starting point</h1>
            <div className="flex gap-2">
              <select
                aria-label="Starting point"
                value={plannerMode === 'eva' ? selectedBaseId : selectedStartId}
                onChange={(event) => {
                  if (plannerMode === 'eva') setSelectedBaseId(event.target.value);
                  else setSelectedStartId(event.target.value);
                }}
                className="min-h-11 min-w-0 flex-1 rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-3 text-[14px] text-[var(--text-primary)]"
              >
                <option value="">Choose a starting point</option>
                {PRESETS.map((preset) => (
                  <option
                    key={preset.id}
                    value={preset.id}
                    disabled={!isNavigationPointCovered(preset.x, preset.z)}
                  >
                    {preset.name}{isNavigationPointCovered(preset.x, preset.z) ? '' : ' · outside mapped coverage'}
                  </option>
                ))}
                {plannerMode === 'eva' && selectedBaseId === 'custom-base' && (
                  <option value="custom-base">Custom base location</option>
                )}
                {plannerMode === 'point-to-point' && selectedStartId === 'custom-start' && (
                  <option value="custom-start">Custom start point</option>
                )}
              </select>
              <button
                type="button"
                aria-pressed={clickTargetMode === (plannerMode === 'eva' ? 'base' : 'start')}
                onClick={() => setClickTargetMode(plannerMode === 'eva' ? 'base' : 'start')}
                className={`min-h-11 shrink-0 rounded-[6px] border px-3 text-[13px] font-medium focus-visible:outline ${
                  clickTargetMode === (plannerMode === 'eva' ? 'base' : 'start')
                    ? 'border-[var(--text-primary)] bg-[var(--surface)]'
                    : 'border-[var(--border)] bg-[var(--panel)]'
                }`}
              >
                Set on map
              </button>
            </div>
          </section>

          <section aria-labelledby="destination-heading" className="space-y-2">
            <h2 id="destination-heading" className="text-[16px] font-semibold">2. Destination</h2>
            <div className="flex gap-2">
              <select
                aria-label="Destination"
                value={selectedDestId}
                onChange={(event) => {
                  setSelectedDestId(event.target.value);
                }}
                className="min-h-11 min-w-0 flex-1 rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-3 text-[14px] text-[var(--text-primary)]"
              >
                <option value="">Choose a destination</option>
                {PRESETS.map((preset) => (
                  <option
                    key={preset.id}
                    value={preset.id}
                    disabled={!isNavigationPointCovered(preset.x, preset.z)}
                  >
                    {preset.name}{isNavigationPointCovered(preset.x, preset.z) ? '' : ' · outside mapped coverage'}
                  </option>
                ))}
                {selectedDestId === 'custom-pin' && (
                  <option value="custom-pin">Custom map pin</option>
                )}
              </select>
              <button
                type="button"
                aria-pressed={clickTargetMode === 'destination'}
                onClick={() => setClickTargetMode('destination')}
                className={`min-h-11 shrink-0 rounded-[6px] border px-3 text-[13px] font-medium focus-visible:outline ${
                  clickTargetMode === 'destination'
                    ? 'border-[var(--text-primary)] bg-[var(--surface)]'
                    : 'border-[var(--border)] bg-[var(--panel)]'
                }`}
              >
                Set on map
              </button>
            </div>
          </section>

          <section aria-labelledby="route-summary-heading" className="space-y-3">
            <h2 id="route-summary-heading" className="text-[16px] font-semibold">3. Route summary</h2>
            <p className="text-[13px] leading-5 text-[var(--text-secondary)]">
              Mapped terrain coverage · unsupported map cells cannot be selected.
            </p>
            {coverageMessage && (
              <p role="alert" className="border-l-2 border-[var(--status-warning)] pl-3 text-[14px] leading-5">
                {coverageMessage}
              </p>
            )}
            {!hasChosenEndpoints ? (
              <p className="text-[16px] text-[var(--text-secondary)]">
                Choose a starting point and destination.
              </p>
            ) : (
              <>
                {selectedRouteDistance !== null && selectedRouteTime !== null && (
                  <dl className="grid grid-cols-2 gap-3 border-y border-[var(--border)] py-3 text-[14px]">
                    <div>
                      <dt className="text-[13px] text-[var(--text-secondary)]">Distance</dt>
                      <dd className="mt-1 font-semibold tabular-nums">{selectedRouteDistance} m</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-[var(--text-secondary)]">Estimated time</dt>
                      <dd className="mt-1 font-semibold tabular-nums">{selectedRouteTime.toFixed(0)} min</dd>
                    </div>
                  </dl>
                )}
                {selectedRouteFailure && (
                  <p role="status" className="border-l-2 border-[var(--status-error)] pl-3 text-[14px] leading-5 text-[var(--status-error)]">
                    {selectedRouteFailure}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handlePreviewWalk}
                  disabled={!selectedRouteAvailable}
                  className="min-h-11 w-full rounded-[6px] bg-[var(--button-primary)] px-4 text-[15px] font-semibold text-[var(--button-primary-text)] focus-visible:outline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Preview walk
                </button>
              </>
            )}
          </section>

          <details className="border-t border-[var(--border)] pt-3">
            <summary className="cursor-pointer py-1 text-[14px] font-semibold focus-visible:outline">
              Route settings
            </summary>
            <div className="space-y-4 py-3 text-[14px]">
              <label className="block space-y-1">
                <span>Trip type</span>
                <select
                  aria-label="Trip type"
                  value={plannerMode}
                  onChange={(event) => setPlannerMode(event.target.value === 'eva' ? 'eva' : 'point-to-point')}
                  className="min-h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-3 text-[14px]"
                >
                  <option value="eva">Round trip EVA</option>
                  <option value="point-to-point">Point to point</option>
                </select>
              </label>
              {plannerMode === 'eva' && (
                <>
                  <label className="flex items-center justify-between gap-3">
                    <span>Mission window</span>
                    <input
                      type="number"
                      min={20}
                      max={180}
                      step={5}
                      value={evaTotalMinutes}
                      onChange={(event) => setEvaTotalMinutes(Math.max(10, Number(event.target.value)))}
                      className="min-h-10 w-24 rounded-[6px] border border-[var(--border)] px-2 text-right text-[14px]"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    <span>Observation time</span>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      step={5}
                      value={evaObsMinutes}
                      onChange={(event) => setEvaObsMinutes(Math.max(0, Number(event.target.value)))}
                      className="min-h-10 w-24 rounded-[6px] border border-[var(--border)] px-2 text-right text-[14px]"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    <span>Time reserve</span>
                    <input
                      type="number"
                      min={5}
                      max={60}
                      step={5}
                      value={evaReserveMinutes}
                      onChange={(event) => setEvaReserveMinutes(Math.max(5, Number(event.target.value)))}
                      className="min-h-10 w-24 rounded-[6px] border border-[var(--border)] px-2 text-right text-[14px]"
                    />
                  </label>
                </>
              )}
              <label className="flex items-center justify-between gap-3">
                <span>Walking speed</span>
                <input
                  type="number"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={evaSpeedMps}
                  onChange={(event) => setEvaSpeedMps(Math.max(0.5, Number(event.target.value)))}
                  className="min-h-10 w-24 rounded-[6px] border border-[var(--border)] px-2 text-right text-[14px]"
                />
              </label>
              <p className="text-[13px] leading-5 text-[var(--text-secondary)]">
                Maximum incline: {maxSlopeDeg.toFixed(0)}°. Time estimates use modelled slope-adjusted walking speed.
              </p>
              <button
                type="button"
                onClick={() => setSimulateFailure((previous) => !previous)}
                className="min-h-10 rounded-[6px] border border-[var(--border)] px-3 text-left text-[13px] focus-visible:outline"
              >
                {simulateFailure ? 'Clear imagery failure test' : 'Test imagery failure'}
              </button>
              <details>
                <summary className="cursor-pointer py-1 text-[13px] focus-visible:outline">
                  Temperature reference · Sol {selectedSol}
                </summary>
                <div className="space-y-3 py-2 text-[13px] text-[var(--text-secondary)]">
                  <label className="flex items-center justify-between gap-2">
                    Reference sol
                    <select
                      aria-label="Reference sol"
                      value={selectedSol}
                      onChange={(event) => setSelectedSol(Number(event.target.value))}
                      className="min-h-9 rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-2 text-[13px]"
                    >
                      {MEDA_HISTORICAL_SOLS.map((sol) => (
                        <option key={sol.sol} value={sol.sol}>Sol {sol.sol}</option>
                      ))}
                    </select>
                  </label>
                  <p>Air: {activeMedaObs.airTempC !== null ? `${activeMedaObs.airTempC} °C` : 'Not available'}</p>
                  <p>Ground: {activeMedaObs.groundTempC !== null ? `${activeMedaObs.groundTempC} °C` : 'Not available'}</p>
                  <p>Time: {activeMedaObs.lmstString} LMST</p>
                  <a
                    href="https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center text-[13px] underline"
                  >
                    MEDA source
                  </a>
                </div>
              </details>
            </div>
          </details>
        </div>
      </aside>
      {/* 
        SURFACE 1 (DESKTOP): Flat, warm-white sidebar about 300 px wide
        Design requirements:
        - Destination name as heading
        - Start and destination in one compact panel
        - Distance, estimated walking time, steepest section using actual calculated values
        - One prominent "Start walk" button
        - Route settings with "Maximum incline: 15°" and "Prototype planning limit"
        - Collapsible Rover observations with Sol, temps in °C, LMST time, and PDS source
      */}
      <aside className="hidden">
        {/* Navigation Back to Globe */}
        <div className="space-y-3">
          {onBackToGlobe && (
            <button
              onClick={onBackToGlobe}
              className="inline-flex items-center gap-1.5 text-xs text-[#b3a595] hover:text-[#f1e8db] cursor-pointer font-medium transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Globe</span>
            </button>
          )}

          {/* Mode Tabs: Plan my EVA vs Point-to-Point */}
          <div className="grid grid-cols-2 p-0.5 rounded-lg bg-[#2b2520] border border-[#3c342e] text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setPlannerMode('eva')}
              className={`py-1.5 px-2 rounded-md transition cursor-pointer flex items-center justify-center gap-1.5 ${
                plannerMode === 'eva'
                  ? 'bg-[#262019] text-[#e8955f] shadow-xs'
                  : 'text-[#b3a595] hover:text-[#f1e8db]'
              }`}
            >
              <RotateCcw className="h-3 w-3" />
              <span>Plan my EVA</span>
            </button>
            <button
              type="button"
              onClick={() => setPlannerMode('point-to-point')}
              className={`py-1.5 px-2 rounded-md transition cursor-pointer flex items-center justify-center gap-1.5 ${
                plannerMode === 'point-to-point'
                  ? 'bg-[#262019] text-[#e8955f] shadow-xs'
                  : 'text-[#b3a595] hover:text-[#f1e8db]'
              }`}
            >
              <NavigationIcon className="h-3 w-3" />
              <span>Point to Point</span>
            </button>
          </div>

          {/* Heading */}
          {plannerMode === 'eva' ? (
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-semibold text-[#e8955f] uppercase tracking-wider">
                  EVA Mission Excursion
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#27391f] text-[#a9d494]">
                  Round Trip
                </span>
              </div>
              <h1 className="text-lg font-bold tracking-tight text-[#f1e8db] truncate leading-tight">
                {activeDest.name}
              </h1>
              <p className="text-xs text-[#b3a595] mt-0.5">
                Base: {activeBase.name}
              </p>
            </div>
          ) : (
            <div>
              <div className="text-[10px] font-semibold text-[#b3a595] uppercase tracking-wider mb-0.5">
                Destination
              </div>
              <h1 className="text-lg font-bold tracking-tight text-[#f1e8db] truncate leading-tight">
                {activeDest.name}
              </h1>
              <p className="text-xs text-[#b3a595] mt-0.5">
                From {activeStart.name}
              </p>
            </div>
          )}
        </div>

        {/* ----------------- EVA MODE CONTENT ----------------- */}
        {plannerMode === 'eva' ? (
          <div className="space-y-3">
            {/* Base & Destination selection */}
            <div className="space-y-2 rounded-lg border border-[#3c342e] bg-[#262019] p-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-[#b3a595]">Base Camp (Valid terrain)</label>
                  <button
                    type="button"
                    onClick={() => setClickTargetMode('base')}
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded cursor-pointer transition ${
                      clickTargetMode === 'base'
                        ? 'bg-[#d86a33] text-white'
                        : 'text-[#b3a595] hover:bg-[#2b2520]'
                    }`}
                    title="Click on map to position base camp"
                  >
                    {clickTargetMode === 'base' ? 'Click map: active' : 'Click to set'}
                  </button>
                </div>
                <select
                  value={selectedBaseId}
                  onChange={(e) => setSelectedBaseId(e.target.value)}
                  className="w-full rounded border border-[#3c342e] bg-[#262019] px-2 py-1.5 text-xs text-[#f1e8db] focus:border-[#d86a33] focus:outline-none"
                >
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id} disabled={!isNavigationPointCovered(p.x, p.z)}>
                      {p.name}{isNavigationPointCovered(p.x, p.z) ? '' : ' · outside mapped coverage'}
                    </option>
                  ))}
                  {selectedBaseId === 'custom-base' && (
                    <option value="custom-base">Custom Base Location</option>
                  )}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-[#b3a595]">Exploration Target</label>
                  <button
                    type="button"
                    onClick={() => setClickTargetMode('destination')}
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded cursor-pointer transition ${
                      clickTargetMode === 'destination'
                        ? 'bg-[#d86a33] text-white'
                        : 'text-[#b3a595] hover:bg-[#2b2520]'
                    }`}
                    title="Click on map to position destination"
                  >
                    {clickTargetMode === 'destination' ? 'Click map: active' : 'Click to set'}
                  </button>
                </div>
                <select
                  value={selectedDestId}
                  onChange={(e) => setSelectedDestId(e.target.value)}
                  className="w-full rounded border border-[#3c342e] bg-[#262019] px-2 py-1.5 text-xs text-[#f1e8db] focus:border-[#d86a33] focus:outline-none"
                >
                  {PRESETS.map((d) => (
                    <option key={d.id} value={d.id} disabled={!isNavigationPointCovered(d.x, d.z)}>
                      {d.name}{isNavigationPointCovered(d.x, d.z) ? '' : ' · outside mapped coverage'}
                    </option>
                  ))}
                  {selectedDestId === 'custom-pin' && (
                    <option value="custom-pin">Custom Target Pin</option>
                  )}
                </select>
              </div>

              {/* Mission Duration & Observation Duration Inputs */}
              <div className="pt-2 border-t border-[#3c342e] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-[#cdbfae]">Total mission window:</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={20}
                      max={180}
                      step={5}
                      value={evaTotalMinutes}
                      onChange={(e) => setEvaTotalMinutes(Math.max(10, Number(e.target.value)))}
                      className="w-16 rounded border border-[#3c342e] px-1.5 py-0.5 text-right font-mono text-xs font-semibold text-[#f1e8db]"
                    />
                    <span className="text-[10px] text-[#b3a595]">min</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-[#cdbfae]">Observation duration:</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={90}
                      step={5}
                      value={evaObsMinutes}
                      onChange={(e) => setEvaObsMinutes(Math.max(0, Number(e.target.value)))}
                      className="w-16 rounded border border-[#3c342e] px-1.5 py-0.5 text-right font-mono text-xs font-semibold text-[#f1e8db]"
                    />
                    <span className="text-[10px] text-[#b3a595]">min</span>
                  </div>
                </div>
              </div>
            </div>

            {/* EVA ROUND-TRIP BUDGET SUMMARY CARD */}
            {calculatedEVAPlan.success ? (
              <div className="space-y-2.5">
                <div
                  className={`rounded-lg border p-3 text-xs space-y-2 ${
                    calculatedEVAPlan.withinBudget
                      ? 'bg-[#1f2d1d] border-[#3f5e36] text-[#a9d494]'
                      : 'bg-[#33261a] border-[#6b4a22] text-[#f0b36a]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Round-Trip Budget</span>
                    </span>
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        calculatedEVAPlan.withinBudget
                          ? 'bg-[#27391f] text-[#a9d494]'
                          : 'bg-amber-100 text-[#f0b36a]'
                      }`}
                    >
                      {calculatedEVAPlan.withinBudget
                        ? `+${calculatedEVAPlan.marginMinutes.toFixed(0)}m margin`
                        : `-${calculatedEVAPlan.shortfallMinutes.toFixed(0)}m shortfall`}
                    </span>
                  </div>

                  {/* Compact breakdown required by specification: Outward walk · Observation · Return walk · Reserve */}
                  <div className="rounded bg-black/25 p-2 border border-white/10 text-[11px] font-mono leading-relaxed text-[#f1e8db]">
                    <div className="text-[10px] font-sans font-medium text-[#b3a595] uppercase tracking-wider mb-1">
                      Time Breakdown (Modelled)
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <span className="font-semibold">{calculatedEVAPlan.outwardTimeMinutes.toFixed(0)}m outward</span>
                      <span className="text-[#8f8274]">·</span>
                      <span className="font-semibold">{calculatedEVAPlan.observationMinutes.toFixed(0)}m observation</span>
                      <span className="text-[#8f8274]">·</span>
                      <span className="font-semibold">{calculatedEVAPlan.returnTimeMinutes.toFixed(0)}m return</span>
                      <span className="text-[#8f8274]">·</span>
                      <span className="font-semibold text-[#e8955f]">{calculatedEVAPlan.reserveMinutes.toFixed(0)}m reserve</span>
                    </div>
                  </div>

                  {/* Explanation & Shortfall message */}
                  <p className="text-[11px] leading-snug">
                    {calculatedEVAPlan.statusMessage}
                  </p>

                  <div className="text-[10px] text-[#b3a595] flex items-center justify-between pt-1 border-t border-black/5 font-mono">
                    <span>Total Required: {calculatedEVAPlan.totalRequiredMinutes.toFixed(0)}m</span>
                    <span>Budget: {calculatedEVAPlan.totalDurationMinutes}m</span>
                  </div>
                </div>

                {/* Primary Action Button */}
                {calculatedEVAPlan.withinBudget ? (
                  <button
                    type="button"
                    onClick={handleStartEVAWalk}
                    className="w-full py-2.5 px-4 rounded-lg bg-[#d86a33] text-white text-xs font-semibold shadow-sm hover:bg-[#bd5726] transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Start EVA excursion</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="w-full py-2.5 px-4 rounded-lg bg-[#352e28] text-neutral-500 text-xs font-medium cursor-not-allowed flex items-center justify-center gap-1.5"
                    title="Exceeds mission budget. Adjust destination or reduce observation duration."
                  >
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                    <span>Exceeds mission budget</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-lg bg-[#2e1a18] border border-[#6b2f2a] p-3 text-xs space-y-1.5 text-rose-800">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>Traverse unavailable</span>
                </div>
                <p className="text-[11px] leading-snug">{calculatedEVAPlan.statusMessage}</p>
                <button
                  type="button"
                  disabled
                  className="w-full mt-2 py-2 px-3 rounded-lg bg-[#352e28] text-neutral-400 text-xs font-medium cursor-not-allowed"
                >
                  Start EVA (unavailable)
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ----------------- POINT-TO-POINT MODE CONTENT ----------------- */
          <div className="space-y-3">
            <div className="space-y-2 rounded-lg border border-[#3c342e] bg-[#262019] p-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-[#b3a595]">Starting Point</label>
                  <button
                    type="button"
                    onClick={() => setClickTargetMode('start')}
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded cursor-pointer transition ${
                      clickTargetMode === 'start'
                        ? 'bg-[#d86a33] text-white'
                        : 'text-[#b3a595] hover:bg-[#2b2520]'
                    }`}
                  >
                    {clickTargetMode === 'start' ? 'Click map: active' : 'Click to set'}
                  </button>
                </div>
                <select
                  value={selectedStartId}
                  onChange={(e) => setSelectedStartId(e.target.value)}
                  className="w-full rounded border border-[#3c342e] bg-[#262019] px-2 py-1.5 text-xs text-[#f1e8db] focus:border-[#d86a33] focus:outline-none"
                >
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id} disabled={!isNavigationPointCovered(p.x, p.z)}>
                      {p.name}{isNavigationPointCovered(p.x, p.z) ? '' : ' · outside mapped coverage'}
                    </option>
                  ))}
                  {selectedStartId === 'custom-start' && (
                    <option value="custom-start">Custom Start Point</option>
                  )}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-[#b3a595]">Traverse Destination</label>
                  <button
                    type="button"
                    onClick={() => setClickTargetMode('destination')}
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded cursor-pointer transition ${
                      clickTargetMode === 'destination'
                        ? 'bg-[#d86a33] text-white'
                        : 'text-[#b3a595] hover:bg-[#2b2520]'
                    }`}
                  >
                    {clickTargetMode === 'destination' ? 'Click map: active' : 'Click to set'}
                  </button>
                </div>
                <select
                  value={selectedDestId}
                  onChange={(e) => setSelectedDestId(e.target.value)}
                  className="w-full rounded border border-[#3c342e] bg-[#262019] px-2 py-1.5 text-xs text-[#f1e8db] focus:border-[#d86a33] focus:outline-none"
                >
                  {PRESETS.map((d) => (
                    <option key={d.id} value={d.id} disabled={!isNavigationPointCovered(d.x, d.z)}>
                      {d.name}{isNavigationPointCovered(d.x, d.z) ? '' : ' · outside mapped coverage'}
                    </option>
                  ))}
                  {selectedDestId === 'custom-pin' && (
                    <option value="custom-pin">Custom Map Pin</option>
                  )}
                </select>
              </div>
            </div>

            {/* Calculated Route Summary Card */}
            {calculatedRoute.success ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-[#1f2d1d] border border-[#3f5e36] p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#a9d494]">Selected Route</span>
                    <span className="font-mono text-[10px] text-[#a9d494] bg-emerald-100/70 px-1.5 py-0.5 rounded">
                      HiRISE DTM
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 pt-1 border-t border-emerald-200/60 text-center">
                    <div>
                      <div className="text-[10px] text-[#a9d494]">Distance</div>
                      <div className="text-sm font-bold text-[#a9d494] font-mono">
                        {calculatedRoute.totalDistanceMeters} m
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#a9d494]">Est. Time</div>
                      <div className="text-sm font-bold text-[#a9d494] font-mono">
                        {calculatedRoute.estimatedTimeMinutes} min
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#a9d494]">Steepest</div>
                      <div className="text-sm font-bold text-[#a9d494] font-mono">
                        {calculatedRoute.maxSlopeDeg.toFixed(1)}°
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-[#a9d494] pt-1 leading-snug">
                    {calculatedRoute.explanation}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleStartWalk}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#d86a33] text-white text-xs font-semibold shadow-sm hover:bg-[#bd5726] transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <NavigationIcon className="h-3.5 w-3.5" />
                  <span>Start walk</span>
                </button>
              </div>
            ) : (
              <div className="rounded-lg bg-[#2e1a18] border border-[#6b2f2a] p-3 text-xs space-y-1.5 text-rose-800">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>No route within incline limit</span>
                </div>
                <p className="text-[11px] leading-snug">
                  {calculatedRoute.failureReason || 'Exceeds slope limits or falls outside measured terrain.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Collapsible: Mission settings (editable reserve & speed assumptions) */}
        <div className="text-xs border-t border-[#3c342e] pt-3">
          <button
            type="button"
            onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
            className="flex w-full items-center justify-between py-1 text-[#f1e8db] font-medium hover:text-[#e8955f] transition cursor-pointer"
          >
            <span>Mission settings & details</span>
            {isSettingsExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-[#b3a595]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[#b3a595]" />
            )}
          </button>

          {isSettingsExpanded && (
            <div className="pt-2 space-y-2 text-[11px] text-[#cdbfae] bg-[#262019] p-2.5 rounded border border-[#3c342e]">
              {/* Editable Time Reserve */}
              <div className="flex justify-between items-center">
                <span>Time reserve:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={5}
                    max={60}
                    step={5}
                    value={evaReserveMinutes}
                    onChange={(e) => setEvaReserveMinutes(Math.max(5, Number(e.target.value)))}
                    className="w-14 rounded border border-[#3c342e] px-1 py-0.5 text-right font-mono text-xs font-semibold text-[#f1e8db]"
                  />
                  <span className="text-[10px] text-[#b3a595]">min</span>
                </div>
              </div>

              {/* Editable Base Walking Speed */}
              <div className="flex justify-between items-center">
                <span>Walking base speed:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={evaSpeedMps}
                    onChange={(e) => setEvaSpeedMps(Math.max(0.5, Number(e.target.value)))}
                    className="w-14 rounded border border-[#3c342e] px-1 py-0.5 text-right font-mono text-xs font-semibold text-[#f1e8db]"
                  />
                  <span className="text-[10px] text-[#b3a595]">m/s</span>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span>Maximum incline:</span>
                <span className="font-semibold text-[#f1e8db]">
                  {maxSlopeDeg.toFixed(0)}° <span className="text-[10px] font-normal text-[#b3a595]">(Prototype limit)</span>
                </span>
              </div>

              <div className="text-[10px] text-[#b3a595] pt-1 border-t border-[#3c342e] leading-relaxed">
                All time estimates are modelled using Martian slope-adjusted mechanics. Evaluates outward and return legs independently.
              </div>

              {/* Terrain Limits Layer Toggle in Settings */}
              <div className="flex justify-between items-center pt-1.5 border-t border-[#3c342e]">
                <span>Terrain limits layer:</span>
                <button
                  type="button"
                  onClick={() => setShowTerrainLimits(!showTerrainLimits)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded cursor-pointer transition ${
                    showTerrainLimits
                      ? 'bg-[#d86a33] text-white'
                      : 'bg-[#2b2520] text-[#b3a595] hover:bg-[#352e28]'
                  }`}
                >
                  {showTerrainLimits ? 'Active' : 'Off'}
                </button>
              </div>
            </div>
          )}
        </div>

        <hr className="border-t border-[#3c342e]" />

        {/* Collapsible: Rover observations (Collapsed by default) */}
        <div className="text-xs">
          <button
            type="button"
            onClick={() => setIsMedaExpanded(!isMedaExpanded)}
            className="flex w-full items-center justify-between py-1 text-[#f1e8db] font-medium hover:text-[#e8955f] transition cursor-pointer"
          >
            <span>Temperature reference · Sol {selectedSol}</span>
            {isMedaExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-[#b3a595]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[#b3a595]" />
            )}
          </button>

          {isMedaExpanded && (
            <div className="pt-2 space-y-2.5 text-xs text-[#cdbfae]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#b3a595]">Unverified fixture · readings hidden</span>
                <div className="flex items-center gap-1">
                  {MEDA_HISTORICAL_SOLS.map((s) => (
                    <button
                      key={s.sol}
                      type="button"
                      onClick={() => setSelectedSol(s.sol)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                        selectedSol === s.sol
                          ? 'bg-[#d86a33] text-white'
                          : 'bg-[#2b2520] text-[#b3a595] hover:bg-[#352e28]'
                      }`}
                    >
                      Sol {s.sol}
                    </button>
                  ))}
                </div>
              </div>

              {/* Air and Ground Temperatures */}
              <div className="grid grid-cols-2 gap-2 bg-[#272019] p-2 rounded border border-[#3c342e]">
                <div>
                  <div className="text-[10px] text-[#b3a595]">Air temperature</div>
                  <div className="text-sm font-bold text-[#f1e8db] font-mono tabular-nums">
                    {activeMedaObs.airTempC !== null ? `${activeMedaObs.airTempC} °C` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#b3a595]">Ground temperature</div>
                  <div className="text-sm font-bold text-[#f1e8db] font-mono tabular-nums">
                    {activeMedaObs.groundTempC !== null ? `${activeMedaObs.groundTempC} °C` : 'N/A'}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-[#b3a595]">
                <span>Time: {activeMedaObs.lmstString} LMST</span>
                <a
                  href="https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[#e8955f] hover:underline"
                >
                  <span>PDS Source</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Collapsible: Sources & Georeferencing */}
        <div className="text-xs">
          <button
            type="button"
            onClick={() => setIsSourcesExpanded(!isSourcesExpanded)}
            className="flex w-full items-center justify-between py-1 text-[#b3a595] hover:text-[#f1e8db] transition cursor-pointer"
          >
            <span>Sources & Georeferencing</span>
            {isSourcesExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-[#b3a595]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[#b3a595]" />
            )}
          </button>

          {isSourcesExpanded && (
            <div className="pt-2 space-y-2 text-[11px] text-[#b3a595] leading-relaxed">
              <div>
                <strong className="text-[#f1e8db]">HiRISE Orthoimage:</strong> {JEZERO_HIRISE_CROP.productId}
              </div>
              <div>
                <strong className="text-[#f1e8db]">HiRISE Stereo DTM:</strong> {MEASURED_DTM_METADATA.productId}
              </div>
              <div>
                <strong className="text-[#f1e8db]">Actual Resolution:</strong> {JEZERO_HIRISE_CROP.pixelScaleMeters.toFixed(2)} m/pixel
              </div>
              <div>
                <strong className="text-[#f1e8db]">DTM Grid Posting:</strong> {MEASURED_DTM_METADATA.gridSpacingMeters.toFixed(2)} m
              </div>
              <div>
                <strong className="text-[#f1e8db]">Vertical Datum:</strong> Mars MOLA Reference Areoid
              </div>
            </div>
          )}
        </div>

        {/* Failure test diagnostic */}
        <div className="text-xs pt-1">
          <button
            type="button"
            onClick={() => setSimulateFailure((prev) => !prev)}
            className="w-full text-left py-1.5 px-2 rounded bg-[#2b2520] hover:bg-[#352e28] text-[11px] font-medium text-[#b3a595] hover:text-[#f1e8db] transition cursor-pointer"
          >
            {simulateFailure ? 'Clear failure test' : 'Test failed image load'}
          </button>
        </div>
      </aside>

      {/* 
        SURFACE 2: Full-height map canvas
        Displays the bundled Jezero HiRISE crop with georeferenced route and endpoints.
      */}
      <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--surface)]">
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={handleMapClick}
          onWheel={handleWheel}
          className={`absolute inset-0 overflow-hidden ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{ touchAction: 'none' }}
        >
          {/* Georeferenced HiRISE Orthoimage */}
          {imageState === 'ready' && (
            <div
              className="absolute pointer-events-none select-none"
              style={{
                left: `${imageLeft}px`,
                top: `${imageTop}px`,
                width: `${imageWidthPx}px`,
                height: `${imageHeightPx}px`,
              }}
            >
              <img
                src={JEZERO_HIRISE_CROP.assetUrl}
                alt="Jezero HiRISE Orthoimage ESP_048908_1985_RED_C_01_ORTHO"
                draggable={false}
                className="w-full h-full object-contain pointer-events-none"
                style={{
                  imageRendering: scale > 1.8 ? 'pixelated' : 'auto',
                }}
              />
            </div>
          )}

          {/* OPTIONAL TERRAIN LIMITS LAYER: Rendered above imagery, beneath route polyline */}
          <canvas
            ref={hazardCanvasRef}
            className="absolute pointer-events-none select-none transition-opacity duration-300"
            style={{
              left: `${imageLeft}px`,
              top: `${imageTop}px`,
              width: `${imageWidthPx}px`,
              height: `${imageHeightPx}px`,
              opacity: showTerrainLimits ? 0.75 : 0,
              imageRendering: 'pixelated',
            }}
          />

          {/* SVG Overlay: Crop boundary & Route preview */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <pattern id="jezero-image-nodata" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" fill="#404641" fillOpacity="0.35" />
                <path d="M0 0V7" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="2" />
              </pattern>
            </defs>
            <path
              d={`M0,0 H${containerSize.width} V${containerSize.height} H0 Z M${imageLeft},${imageTop} H${imageLeft + imageWidthPx} V${imageTop + imageHeightPx} H${imageLeft} Z`}
              fill="#626862"
              fillOpacity="0.16"
              fillRule="evenodd"
            />
            {/* Crop Boundary */}
            <rect
              x={imageLeft}
              y={imageTop}
              width={imageWidthPx}
              height={imageHeightPx}
              fill="none"
              stroke="#faf8f5"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.45"
            />
            {coverageGaps.map((cell, index) => (
              <rect
                key={`${index}-${cell.x}-${cell.z}`}
                x={toScreenX(cell.x)}
                y={toScreenY(cell.z)}
                width={cell.size * scale}
                height={cell.size * scale}
                fill="url(#jezero-image-nodata)"
              />
            ))}
            <text
              x={imageLeft + 8}
              y={imageTop + 18}
              fill="#FFFFFF"
              fontSize="13"
              fontWeight="600"
              paintOrder="stroke"
              stroke="#202321"
              strokeWidth="3"
            >
              Mapped terrain coverage
            </text>

            {/* ROUTE PREVIEWS - Rendered above imagery and hazard layer */}
            {hasChosenEndpoints && (plannerMode === 'eva' ? (
              <g>
                {/* Outward Route (Solid Teal) */}
                {calculatedEVAPlan.outwardRoute?.points && calculatedEVAPlan.outwardRoute.points.length >= 2 && (
                  <g>
                    <polyline
                      points={calculatedEVAPlan.outwardRoute.points
                        .map((p) => `${toScreenX(p.x)},${toScreenY(p.z)}`)
                        .join(' ')}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={7}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <polyline
                      points={calculatedEVAPlan.outwardRoute.points
                        .map((p) => `${toScreenX(p.x)},${toScreenY(p.z)}`)
                        .join(' ')}
                      fill="none"
                      stroke="var(--route-outbound)"
                      strokeWidth={4.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {calculatedEVAPlan.outwardRoute.points.slice(1, -1).map((p, idx) => (
                      <circle
                        key={`out-${idx}`}
                        cx={toScreenX(p.x)}
                        cy={toScreenY(p.z)}
                        r={3}
                        fill="#ffffff"
                        stroke="var(--route-outbound)"
                        strokeWidth={1.5}
                      />
                    ))}
                  </g>
                )}

                {/* Return Route (Dashed Sky Blue) */}
                {calculatedEVAPlan.returnRoute?.points && calculatedEVAPlan.returnRoute.points.length >= 2 && (
                  <g>
                    <polyline
                      points={calculatedEVAPlan.returnRoute.points
                        .map((p) => `${toScreenX(p.x)},${toScreenY(p.z)}`)
                        .join(' ')}
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth={5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.85"
                    />
                    <polyline
                      points={calculatedEVAPlan.returnRoute.points
                        .map((p) => `${toScreenX(p.x)},${toScreenY(p.z)}`)
                        .join(' ')}
                      fill="none"
                      stroke="var(--route-return)"
                      strokeWidth={3.5}
                      strokeDasharray="8 5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {calculatedEVAPlan.returnRoute.points.slice(1, -1).map((p, idx) => (
                      <circle
                        key={`ret-${idx}`}
                        cx={toScreenX(p.x)}
                        cy={toScreenY(p.z)}
                        r={2.5}
                        fill="#ffffff"
                        stroke="var(--route-return)"
                        strokeWidth={1.5}
                      />
                    ))}
                  </g>
                )}
              </g>
            ) : (
              calculatedRoute.points && calculatedRoute.points.length >= 2 && (
                <g>
                  <polyline
                    points={calculatedRoute.points
                      .map((p) => `${toScreenX(p.x)},${toScreenY(p.z)}`)
                      .join(' ')}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={calculatedRoute.points
                      .map((p) => `${toScreenX(p.x)},${toScreenY(p.z)}`)
                      .join(' ')}
                    fill="none"
                    stroke="var(--route-outbound)"
                    strokeWidth={4.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {calculatedRoute.points.slice(1, -1).map((p, idx) => (
                    <circle
                      key={idx}
                      cx={toScreenX(p.x)}
                      cy={toScreenY(p.z)}
                      r={3.5}
                      fill="#ffffff"
                      stroke="var(--route-outbound)"
                      strokeWidth={1.5}
                    />
                  ))}
                </g>
              )
            ))}
          </svg>

          {/* BASE OR START MARKER */}
          {hasChosenEndpoints && (plannerMode === 'eva' ? (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 flex items-center gap-1.5"
              style={{
                left: `${toScreenX(activeBase.x)}px`,
                top: `${toScreenY(activeBase.z)}px`,
              }}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[var(--text-primary)]">
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--panel)]" />
              </div>
              <div className="whitespace-nowrap rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[13px] font-semibold text-[var(--text-primary)]">
                <span>Base · {activeBase.name}</span>
              </div>
            </div>
          ) : (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 flex items-center gap-1.5"
              style={{
                left: `${toScreenX(activeStart.x)}px`,
                top: `${toScreenY(activeStart.z)}px`,
              }}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[var(--text-primary)]">
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--panel)]" />
              </div>
              <div className="whitespace-nowrap rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[13px] font-semibold text-[var(--text-primary)]">
                <span>Start · {activeStart.name}</span>
              </div>
            </div>
          ))}

          {/* DESTINATION MARKER */}
          {hasChosenEndpoints && <div
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 flex items-center gap-1.5"
            style={{
              left: `${toScreenX(activeDest.x)}px`,
              top: `${toScreenY(activeDest.z)}px`,
            }}
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[var(--route-outbound)]">
              <div className="h-2 w-2 rounded-full bg-[var(--panel)]" />
            </div>
            <div className="whitespace-nowrap rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[13px] font-semibold text-[var(--text-primary)]">
              <span>{plannerMode === 'eva' ? 'Target' : 'Dest'} · {activeDest.name}</span>
            </div>
          </div>}
        </div>

        <div className="absolute right-4 top-4 z-20 flex flex-col items-end gap-2 pointer-events-auto">
          <button
            type="button"
            aria-expanded={isLayersExpanded}
            aria-controls="map-layers-panel"
            onClick={() => setIsLayersExpanded((expanded) => !expanded)}
            className="inline-flex min-h-10 items-center gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-3 text-[14px] font-medium text-[var(--text-primary)] focus-visible:outline"
          >
            <Sliders aria-hidden="true" className="h-4 w-4" />
            Layers
          </button>
          {isLayersExpanded && (
            <div id="map-layers-panel" className="w-60 border border-[var(--border)] bg-[var(--panel)] p-3 text-[13px] text-[var(--text-primary)]">
              <label className="flex min-h-10 items-center gap-2">
                <input
                  type="checkbox"
                  checked={showTerrainLimits}
                  onChange={() => setShowTerrainLimits((visible) => !visible)}
                  className="h-4 w-4 accent-[var(--button-primary)]"
                />
                <span>Terrain limits</span>
              </label>
              {showTerrainLimits && (
                <div className="space-y-2 border-t border-[var(--border)] pt-2">
                  <p className="flex items-center gap-2">
                    <span className="h-3 w-5 shrink-0 border border-amber-700 bg-amber-200" />
                    Above incline limit (&gt;{maxSlopeDeg.toFixed(0)}°)
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="h-3 w-5 shrink-0 border border-gray-500 bg-gray-300" />
                    No elevation data
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* TOP-LEFT: Terrain limits layer toggle control & 2-item legend */}
        <div className="hidden">
          <button
            type="button"
            onClick={() => setShowTerrainLimits((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-xs transition cursor-pointer backdrop-blur-md ${
              showTerrainLimits
                ? 'bg-[#d86a33] text-white border-white/20'
                : 'bg-[#201b18]/95 text-[#f1e8db] border-[#3c342e] hover:bg-[#2b2520]'
            }`}
            title="Toggle terrain limits hazard overlay"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Terrain limits</span>
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                showTerrainLimits ? 'bg-amber-400' : 'bg-neutral-300'
              }`}
            />
          </button>

          {/* TWO-ITEM QUIET LEGEND */}
          {showTerrainLimits && (
            <div className="flex flex-col gap-2 rounded-lg border border-[#3c342e] bg-[#201b18]/95 p-2.5 text-xs shadow-md backdrop-blur-md">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#b3a595]">
                Terrain Limits Legend
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#f1e8db]">
                <div
                  className="h-3.5 w-6 rounded border border-amber-600/70 shrink-0"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, #d97706 0, #d97706 3px, #fbbf24 3px, #fbbf24 6px)',
                  }}
                />
                <span className="font-medium whitespace-nowrap">
                  Above incline limit (&gt;{maxSlopeDeg.toFixed(0)}°)
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#f1e8db]">
                <div
                  className="h-3.5 w-6 rounded border border-neutral-600/70 shrink-0"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, #52525b 0, #52525b 2px, transparent 2px, transparent 4px), repeating-linear-gradient(-45deg, #52525b 0, #52525b 2px, #a1a1aa 2px, #a1a1aa 4px)',
                  }}
                />
                <span className="font-medium whitespace-nowrap">No elevation data</span>
              </div>
              <div className="text-[10px] text-[#b3a595] pt-1.5 border-t border-[#3c342e] leading-snug">
                These are prototype routing constraints, not a guarantee of astronaut safety.
              </div>
            </div>
          )}
        </div>

        {/* TOP-RIGHT: Imagery Error & Retry Control */}
        {imageState === 'error' && (
          <div role="status" className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--status-error)]">
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="font-medium">Imagery unavailable</span>
            <button
              type="button"
              onClick={handleRetryImagery}
              className="inline-flex min-h-9 items-center gap-1 font-semibold underline focus-visible:outline"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* BOTTOM-LEFT: Source Attribution, Actual Resolution & Hover Elevation Readout */}
        <div className="absolute bottom-4 left-4 z-20 flex max-w-[calc(100%-5rem)] flex-wrap items-center gap-3 pointer-events-auto">
          <a
            href={JEZERO_HIRISE_CROP.dtmReferenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 max-w-full flex-wrap items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[13px] text-[var(--text-primary)]"
            title="Official USGS/NASA HiRISE Observation Record"
          >
            <span>HiRISE {JEZERO_HIRISE_CROP.productId}</span>
            <span className="text-[var(--text-secondary)]">·</span>
            <span className="font-mono">1.01 m/px</span>
            <span className="text-[var(--text-secondary)]">·</span>
            <span>NASA/JPL/UArizona</span>
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
          </a>

          {/* Hover Coordinate & Elevation Inspector */}
          {hoverInfo && (
            <div className="hidden">
              <span>{hoverInfo.lat.toFixed(4)}° N, {hoverInfo.lon.toFixed(4)}° E</span>
              {hoverInfo.isInside && hoverInfo.elevation !== MISSING_DATA_VALUE && hoverInfo.elevation > -10000 ? (
                <span className="text-emerald-400 font-sans text-[10px]">
                  · Elev: {hoverInfo.elevation.toFixed(1)} m · {hoverInfo.slope !== null ? `${hoverInfo.slope.toFixed(1)}°` : 'Slope n/a'}
                </span>
              ) : (
                <span className="text-amber-300 font-sans text-[10px]">· No elevation data</span>
              )}
            </div>
          )}
        </div>

        {/* BOTTOM-RIGHT: Scale Bar, Zoom & Recenter Controls */}
        <div className="absolute right-4 sm:right-6 bottom-4 sm:bottom-6 z-20 flex flex-col items-end gap-2 pointer-events-auto">
          {/* Dynamic Scale Bar */}
          <div className="flex flex-col items-end rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[13px] text-[var(--text-primary)] font-mono">
            <span className="pr-0.5">{scaleBarMeters} m</span>
            <div
              className="h-1 border-x border-b border-[var(--text-primary)]"
              style={{ width: `${scaleBarPx}px` }}
            />
          </div>

          {/* Zoom In / Zoom Out */}
          <div className="flex flex-col overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--panel)] text-[var(--text-primary)]">
            <button
              onClick={() => handleZoomStep('in')}
              className="flex h-10 w-10 items-center justify-center hover:bg-[var(--surface)] focus-visible:outline"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
            </button>
            <div className="h-px w-full bg-[var(--border)]" />
            <button
              onClick={() => handleZoomStep('out')}
              className="flex h-10 w-10 items-center justify-center hover:bg-[var(--surface)] focus-visible:outline"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <Minus aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          {/* Recenter */}
          <button
            onClick={handleRecentre}
            className="hidden"
            title="Recenter Map View"
            aria-label="Recenter map view"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* MOBILE BOTTOM SHEET */}
        <div className="hidden">
          <div className="flex items-center justify-between">
            <div className="truncate pr-2">
              <div className="text-[10px] font-semibold text-[#b3a595] uppercase">
                {plannerMode === 'eva' ? 'EVA Destination' : 'Destination'}
              </div>
              <div className="text-sm font-bold text-[#f1e8db] truncate">{activeDest.name}</div>
            </div>
            {plannerMode === 'eva' ? (
              calculatedEVAPlan.success && calculatedEVAPlan.withinBudget ? (
                <button
                  type="button"
                  onClick={handleStartEVAWalk}
                  className="py-1.5 px-3 rounded-lg bg-[#d86a33] text-white text-xs font-semibold shadow-xs hover:bg-[#bd5726] transition cursor-pointer shrink-0"
                >
                  Start EVA
                </button>
              ) : (
                <span className="text-[10px] text-[#f0b36a] bg-[#33261a] px-2 py-1 rounded border border-[#6b4a22]">
                  {calculatedEVAPlan.success ? 'Over budget' : 'No route'}
                </span>
              )
            ) : (
              calculatedRoute.success && (
                <button
                  type="button"
                  onClick={handleStartWalk}
                  className="py-1.5 px-3 rounded-lg bg-[#d86a33] text-white text-xs font-semibold shadow-xs hover:bg-[#bd5726] transition cursor-pointer shrink-0"
                >
                  Start walk
                </button>
              )
            )}
          </div>
          {plannerMode === 'eva' ? (
            calculatedEVAPlan.success && (
              <div className="text-[10px] font-mono text-[#a9d494] bg-[#1f2d1d] p-1.5 rounded border border-[#3f5e36] leading-snug">
                {calculatedEVAPlan.breakdownText}
              </div>
            )
          ) : (
            calculatedRoute.success && (
              <div className="flex items-center justify-between text-[11px] font-mono text-[#a9d494] bg-[#1f2d1d] p-1.5 rounded border border-[#3f5e36]">
                <span>{calculatedRoute.totalDistanceMeters} m</span>
                <span>{calculatedRoute.estimatedTimeMinutes} min</span>
                <span>Max {calculatedRoute.maxSlopeDeg.toFixed(1)}°</span>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}
