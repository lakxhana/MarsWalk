import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { type WmtsLayer, tileUrl, matrixSize } from '@/lib/wmts';
import { JEZERO } from '@/lib/geo';
import {
  DEMO_USER_WAYPOINTS,
  type DemoUserWaypoint,
} from '@/lib/scienceStations';
import {
  type JourneyState,
  calculateDynamicGuidance,
  calculateOffRouteStatus,
} from '@/lib/navigation';
import { SurfacePose } from './MarsSurface';
import {
  Compass,
  Crosshair,
  Footprints,
  ZoomIn,
  ZoomOut,
  Navigation,
  AlertTriangle,
  Layers,
} from 'lucide-react';

interface MarsMapProps {
  layer: WmtsLayer;
  surfacePose: SurfacePose;
  journeyState: JourneyState;
  destinationId: number;
  onSelectDestination: (id: number) => void;
  onStartNavigation: () => void;
  onEnterSurface: () => void;
  onBackToGlobe: () => void;
}

// Custom equirectangular CRS for WMTS layer
const PIXELS_PER_DEGREE_BASE = 256 / 360;
function getMarsEquirectCRS(): L.CRS {
  const leaflet = (L as unknown as { default?: typeof L }).default || L;
  return leaflet.Util.extend({}, leaflet.CRS.Simple, {
    transformation: new leaflet.Transformation(1, 180, -1, 90),
    infinite: false,
    wrapLat: false as const,
    wrapLng: false as const,
    scale(zoom: number) {
      return Math.pow(2, zoom + 1) * PIXELS_PER_DEGREE_BASE;
    },
    zoom(scale: number) {
      return Math.log(scale / PIXELS_PER_DEGREE_BASE) / Math.LN2 - 1;
    },
  });
}

// Catmull-Rom / Spline point sampler in 2D
function sampleRouteSpline(waypoints: DemoUserWaypoint[], sampleCount = 180) {
  const pts = waypoints.map((w) => ({ x: w.x, z: w.z }));
  const samples: { x: number; z: number }[] = [];
  if (pts.length < 2) return pts;

  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const p = t * (pts.length - 1);
    const p0 = Math.floor(p);
    const p1 = Math.min(p0 + 1, pts.length - 1);
    const alpha = p - p0;

    // Linear piecewise or smooth blend
    const x = pts[p0].x * (1 - alpha) + pts[p1].x * alpha;
    const z = pts[p0].z * (1 - alpha) + pts[p1].z * alpha;
    samples.push({ x, z });
  }
  return samples;
}

export default function MarsMap({
  layer,
  surfacePose,
  journeyState,
  destinationId,
  onSelectDestination,
  onStartNavigation,
  onEnterSurface,
  onBackToGlobe,
}: MarsMapProps) {
  const [activeTab, setActiveTab] = useState<'simulation' | 'orbital'>('simulation');

  // SVG Pan & Zoom state for Local Simulation Map
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(2.8); // pixels per meter
  const [pan, setPan] = useState({ x: 0, y: 0 }); // offset in pixels
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // HiRISE Leaflet state
  const leafletContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const [orbitalStatus, setOrbitalStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Pre-sampled route spline for geometry calculations
  const routeSamples = useMemo(() => {
    return sampleRouteSpline(DEMO_USER_WAYPOINTS, 160);
  }, []);

  // Off-route status in simulation coordinates
  const offRouteStatus = useMemo(() => {
    return calculateOffRouteStatus(
      { x: surfacePose.x, z: surfacePose.z },
      surfacePose.yaw,
      routeSamples,
      6.0,
    );
  }, [surfacePose.x, surfacePose.z, surfacePose.yaw, routeSamples]);

  // Destination & Waypoint details
  const currentDestWp =
    DEMO_USER_WAYPOINTS.find((w) => w.id === destinationId) ||
    DEMO_USER_WAYPOINTS[1];

  const distToDest = Math.round(
    Math.hypot(surfacePose.x - currentDestWp.x, surfacePose.z - currentDestWp.z),
  );

  const guidance = useMemo(() => {
    return calculateDynamicGuidance(
      { x: surfacePose.x, z: surfacePose.z },
      surfacePose.yaw,
      { x: currentDestWp.x, z: currentDestWp.z },
      currentDestWp.name,
      distToDest,
    );
  }, [surfacePose.x, surfacePose.z, surfacePose.yaw, currentDestWp, distToDest]);

  // Recentre map onto explorer
  const handleRecentre = () => {
    setPan({
      x: -surfacePose.x * scale,
      y: -surfacePose.z * scale,
    });
  };

  // Center once on mount
  useEffect(() => {
    setPan({
      x: -surfacePose.x * scale,
      y: -surfacePose.z * scale,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize HiRISE Leaflet layer when switching to orbital context
  useEffect(() => {
    if (activeTab !== 'orbital') return;
    if (!leafletContainerRef.current || leafletMapRef.current) return;

    const leaflet = (L as unknown as { default?: typeof L }).default || L;
    const crs = getMarsEquirectCRS();

    const map = leaflet.map(leafletContainerRef.current, {
      center: [JEZERO.lat, JEZERO.lon],
      zoom: 15,
      minZoom: layer.minZoom,
      maxZoom: layer.maxZoom,
      crs: crs,
      zoomSnap: 1,
      zoomDelta: 1,
      attributionControl: false,
      zoomControl: true,
    });
    leafletMapRef.current = map;

    const cov = layer.bbox;
    const bounds = leaflet.latLngBounds([cov.south, cov.west], [cov.north, cov.east]);
    map.setMaxBounds(bounds);

    const WmtsTileLayer = L.TileLayer.extend({
      getTileUrl(coords: L.Coords) {
        const { cols, rows } = matrixSize(coords.z);
        if (coords.x < 0 || coords.x >= cols || coords.y < 0 || coords.y >= rows) {
          return L.Util.emptyImageUrl;
        }
        return tileUrl(layer, coords.z, coords.y, coords.x);
      },
    });

    const tl = new (WmtsTileLayer as unknown as new (
      url: string,
      opts: L.TileLayerOptions,
    ) => L.TileLayer)('', {
      tileSize: 256,
      minZoom: layer.minZoom,
      maxZoom: layer.maxZoom,
      noWrap: true,
      bounds,
      crossOrigin: true,
    });
    tl.addTo(map);

    const { cols, rows } = matrixSize(15);
    const col = Math.floor(((JEZERO.lon + 180) / 360) * cols);
    const row = Math.floor(((90 - JEZERO.lat) / 180) * rows);
    fetch(tileUrl(layer, 15, row, col), { mode: 'cors' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setOrbitalStatus('ready');
      })
      .catch(() => setOrbitalStatus('error'));

    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, [activeTab, layer]);

  // SVG Pan handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, select, a')) return;
    setIsPanning(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsPanning(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setScale((prev) => Math.max(1.2, Math.min(6.5, prev * factor)));
  };

  // Convert simulation meters (x, z) to SVG screen coordinates relative to center
  const toSvgX = (x: number) => pan.x + x * scale;
  const toSvgY = (z: number) => pan.y + z * scale;

  // Build route path SVG string
  const routeSvgPath = useMemo(() => {
    return routeSamples
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pan.x + pt.x * scale} ${pan.y + pt.z * scale}`)
      .join(' ');
  }, [routeSamples, pan.x, pan.y, scale]);

  // Heading cone geometry in screen pixels
  const headingCone = useMemo(() => {
    const px = pan.x + surfacePose.x * scale;
    const py = pan.y + surfacePose.z * scale;
    const fovHalf = (29 * Math.PI) / 180;
    const coneLen = 42; // pixels

    // In Three.js: yaw=0 points along -Z (North/Up). Screen Y is downwards (+Z).
    // So angle 0 points along screen -Y: angle = yaw - PI/2
    const baseAngle = surfacePose.yaw - Math.PI / 2;
    const a1 = baseAngle - fovHalf;
    const a2 = baseAngle + fovHalf;

    const x1 = px + Math.cos(a1) * coneLen;
    const y1 = py + Math.sin(a1) * coneLen;
    const x2 = px + Math.cos(a2) * coneLen;
    const y2 = py + Math.sin(a2) * coneLen;

    return `M ${px} ${py} L ${x1} ${y1} A ${coneLen} ${coneLen} 0 0 1 ${x2} ${y2} Z`;
  }, [surfacePose.x, surfacePose.z, surfacePose.yaw, pan.x, pan.y, scale]);

  return (
    <div className="absolute inset-0 z-30 bg-[#17130f] select-none overflow-hidden font-sans text-[#f3f1ee]">
      {/* 
        TOP MODE TOGGLE (Local Simulation Map vs Orbital Context)
      */}
      <div className="pointer-events-none absolute inset-x-0 top-16 z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center rounded-lg border border-white/10 bg-[#1b1714]/95 p-1 backdrop-blur-md shadow-xl">
          <button
            onClick={() => setActiveTab('simulation')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              activeTab === 'simulation'
                ? 'bg-amber-500 text-black shadow-sm'
                : 'text-neutral-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Local Simulation Map</span>
          </button>
          <button
            onClick={() => setActiveTab('orbital')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              activeTab === 'orbital'
                ? 'bg-amber-500 text-black shadow-sm'
                : 'text-neutral-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Orbital Context (HiRISE)</span>
          </button>
        </div>
      </div>

      {/* 
        VIEW 1: LOCAL SIMULATION NAVIGATION MAP
      */}
      {activeTab === 'simulation' && (
        <div
          ref={svgContainerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          className="absolute inset-0 cursor-grab active:cursor-grabbing overflow-hidden"
          style={{ touchAction: 'none' }}
        >
          {/* Simulation Coordinate Map SVG Canvas */}
          <svg
            className="w-full h-full"
            style={{
              transform: `translate(${svgContainerRef.current ? svgContainerRef.current.clientWidth / 2 : 0}px, ${
                svgContainerRef.current ? svgContainerRef.current.clientHeight / 2 : 0
              }px)`,
            }}
          >
            <defs>
              <pattern id="grid-pattern" width={20 * scale} height={20 * scale} patternUnits="userSpaceOnUse">
                <path
                  d={`M ${20 * scale} 0 L 0 0 0 ${20 * scale}`}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>

            {/* Background & 20m Grid */}
            <rect
              x="-2000"
              y="-2000"
              width="4000"
              height="4000"
              fill="#141519"
            />
            <rect
              x="-2000"
              y="-2000"
              width="4000"
              height="4000"
              fill="url(#grid-pattern)"
            />

            {/* Coordinate Axis Lines (Origin 0,0) */}
            <line
              x1={toSvgX(-130)}
              y1={toSvgY(0)}
              x2={toSvgX(130)}
              y2={toSvgY(0)}
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <line
              x1={toSvgX(0)}
              y1={toSvgY(-130)}
              x2={toSvgX(0)}
              y2={toSvgY(130)}
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />

            {/* Planned Route Line */}
            <path
              d={routeSvgPath}
              fill="none"
              stroke="#d99b45"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.85"
            />

            {/* Off-Route connection line if explorer is > 6m off route */}
            {offRouteStatus.isOffRoute && (
              <g>
                <line
                  x1={toSvgX(surfacePose.x)}
                  y1={toSvgY(surfacePose.z)}
                  x2={toSvgX(offRouteStatus.closestPoint.x)}
                  y2={toSvgY(offRouteStatus.closestPoint.z)}
                  stroke="#f59e0b"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
                <circle
                  cx={toSvgX(offRouteStatus.closestPoint.x)}
                  cy={toSvgY(offRouteStatus.closestPoint.z)}
                  r="3.5"
                  fill="#f59e0b"
                />
              </g>
            )}

            {/* Waypoints */}
            {DEMO_USER_WAYPOINTS.map((wp) => {
              const wx = toSvgX(wp.x);
              const wy = toSvgY(wp.z);
              const isSelectedDest = wp.id === destinationId;

              return (
                <g
                  key={wp.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDestination(wp.id);
                  }}
                  className="cursor-pointer group"
                >
                  {/* Destination selection halo */}
                  {isSelectedDest && (
                    <circle
                      cx={wx}
                      cy={wy}
                      r={14}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2"
                      className="animate-pulse"
                    />
                  )}

                  {/* Waypoint circle */}
                  <circle
                    cx={wx}
                    cy={wy}
                    r={isSelectedDest ? 7 : 5}
                    fill={isSelectedDest ? '#f59e0b' : '#94a3b8'}
                    stroke="#121316"
                    strokeWidth="1.5"
                  />

                  {/* Label */}
                  <text
                    x={wx}
                    y={wy + 15}
                    textAnchor="middle"
                    className={`font-sans text-[11px] font-medium transition ${
                      isSelectedDest ? 'fill-amber-400 font-bold' : 'fill-neutral-300 group-hover:fill-white'
                    }`}
                  >
                    {wp.name}
                  </text>
                  <text
                    x={wx}
                    y={wy + 25}
                    textAnchor="middle"
                    className="fill-neutral-500 font-mono text-[9px]"
                  >
                    {wp.label === 'Start' ? '(0, 0)' : `${Math.round(Math.hypot(wp.x, wp.z))}m`}
                  </text>
                </g>
              );
            })}

            {/* Explorer Position Marker with Vision Cone */}
            <g>
              {/* Vision Cone */}
              <path
                d={headingCone}
                fill="rgba(245, 158, 11, 0.22)"
                stroke="rgba(245, 158, 11, 0.45)"
                strokeWidth="1"
              />
              {/* Position dot */}
              <circle
                cx={toSvgX(surfacePose.x)}
                cy={toSvgY(surfacePose.z)}
                r="6.5"
                fill="#f59e0b"
                stroke="#ffffff"
                strokeWidth="1.8"
                className="shadow-lg"
              />
              <circle
                cx={toSvgX(surfacePose.x)}
                cy={toSvgY(surfacePose.z)}
                r="10"
                fill="none"
                stroke="rgba(245, 158, 11, 0.5)"
                strokeWidth="1.2"
              />
              <text
                x={toSvgX(surfacePose.x)}
                y={toSvgY(surfacePose.z) - 12}
                textAnchor="middle"
                className="fill-white font-sans text-[10px] font-semibold"
              >
                Explorer
              </text>
            </g>
          </svg>

          {/* Top-Right Map Controls (Recentre, Zoom) */}
          <div className="pointer-events-none absolute right-4 top-20 z-40 flex flex-col gap-2">
            <div className="pointer-events-auto flex flex-col rounded-lg border border-white/10 bg-[#1b1714]/90 p-1 backdrop-blur-md shadow-xl">
              <button
                onClick={handleRecentre}
                className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Recentre on Explorer"
              >
                <Crosshair className="h-4 w-4 text-amber-400" />
              </button>
              <div className="my-1 border-t border-white/10" />
              <button
                onClick={() => setScale((s) => Math.min(6.5, s * 1.25))}
                className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                onClick={() => setScale((s) => Math.max(1.2, s * 0.8))}
                className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Top-Left Coordinate & Legend HUD */}
          <div className="pointer-events-none absolute left-4 top-20 z-40">
            <div className="pointer-events-auto flex flex-col gap-1 rounded-lg border border-white/10 bg-[#1b1714]/90 p-2.5 backdrop-blur-md shadow-xl text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-neutral-200">
                <Navigation className="h-3.5 w-3.5 text-amber-400" />
                <span>Simulation Grid</span>
              </div>
              <div className="font-mono text-[11px] text-neutral-400">
                Position: X {surfacePose.x >= 0 ? `+${surfacePose.x.toFixed(1)}` : surfacePose.x.toFixed(1)} m · Z {surfacePose.z >= 0 ? `+${surfacePose.z.toFixed(1)}` : surfacePose.z.toFixed(1)} m
              </div>
              <div className="text-[10px] text-neutral-400 italic">
                Local 120m traverse coordinate frame
              </div>
            </div>
          </div>

          {/* Bottom Navigation Guidance Bar */}
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center px-4">
            <div className="pointer-events-auto w-full max-w-lg rounded-xl border border-white/10 bg-[#1b1714]/95 p-4 shadow-2xl backdrop-blur-xl flex flex-col gap-3">
              {/* State Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-amber-400">
                    {journeyState === 'plan' ? 'Plan Route' : journeyState === 'arrive' ? 'Arrival' : 'Navigation'}
                  </span>
                  <span className="text-white/20">|</span>
                  <span className="text-xs font-medium text-white truncate">
                    Destination: {currentDestWp.name}
                  </span>
                </div>
                <span className="text-xs font-mono text-neutral-400">
                  {distToDest} m remaining
                </span>
              </div>

              {/* Dynamic instruction or Off-route warning */}
              {offRouteStatus.isOffRoute ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>{offRouteStatus.rejoinInstruction}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-neutral-200">
                    {guidance.instruction}
                  </span>
                  <span className="text-neutral-400 shrink-0">
                    {guidance.subInstruction}
                  </span>
                </div>
              )}

              {/* Primary Navigation Actions */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
                <button
                  onClick={onBackToGlobe}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  Return to Globe
                </button>

                <div className="flex items-center gap-2">
                  {journeyState === 'plan' ? (
                    <button
                      onClick={onStartNavigation}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-bold text-black transition shadow-sm cursor-pointer"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      <span>Start Navigation</span>
                    </button>
                  ) : (
                    <button
                      onClick={onEnterSurface}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-bold text-black transition shadow-sm cursor-pointer"
                    >
                      <Footprints className="h-3.5 w-3.5" />
                      <span>Return to 3D Walk</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 
        VIEW 2: ORBITAL CONTEXT (NASA MRO HiRISE)
        Real calibrated satellite imagery cleanly segregated from synthetic coordinates
      */}
      {activeTab === 'orbital' && (
        <div className="absolute inset-0">
          <div ref={leafletContainerRef} className="absolute inset-0" />

          {/* Segregated Orbital Imagery Disclosure Banner */}
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[1000] flex justify-center px-4">
            <div className="pointer-events-auto max-w-lg rounded-xl border border-white/10 bg-[#1b1714]/95 p-4 text-xs backdrop-blur-xl shadow-2xl flex flex-col gap-2.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <Layers className="h-4 w-4 text-amber-400" />
                  <span>NASA MRO HiRISE Orbital Mosaic</span>
                </div>
                <span className="font-mono text-[11px] text-neutral-400">~25 cm/pixel</span>
              </div>
              <p className="text-neutral-300 leading-relaxed text-[11px]">
                Orbital imagery context from NASA/JPL/University of Arizona. Walk coordinates in this view are simulation-local and are not projected onto the imagery as measured locations.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5">
                <button
                  onClick={() => setActiveTab('simulation')}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  View Simulation Map
                </button>
                <button
                  onClick={onEnterSurface}
                  className="rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-black transition shadow-sm cursor-pointer"
                >
                  Enter 3D Walk
                </button>
              </div>
            </div>
          </div>

          {orbitalStatus === 'loading' && (
            <div className="absolute inset-0 z-[1100] flex flex-col items-center justify-center bg-black/85 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
              <div className="mt-4 text-xs text-white/70">Connecting to NASA Mars Trek HiRISE WMTS tiles…</div>
            </div>
          )}

          {orbitalStatus === 'error' && (
            <div className="absolute inset-0 z-[1100] flex flex-col items-center justify-center bg-black/90 px-6 text-center">
              <div className="max-w-md rounded-xl border border-red-500/30 bg-red-950/20 p-5 backdrop-blur-md">
                <div className="text-xs font-semibold uppercase tracking-wider text-red-400">
                  HiRISE Tile Service Unavailable
                </div>
                <p className="mt-2 text-xs text-white/70">
                  NASA Mars Trek WMTS tile server could not be reached. You can continue navigation using the local simulation map.
                </p>
                <button
                  onClick={() => setActiveTab('simulation')}
                  className="mt-4 rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-semibold text-black hover:bg-amber-400"
                >
                  Switch to Simulation Map
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
