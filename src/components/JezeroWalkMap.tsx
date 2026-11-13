import { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Minus, Plus, RotateCcw } from 'lucide-react';
import {
  CROP_HALF_HEIGHT_METERS,
  CROP_HALF_WIDTH_METERS,
  JEZERO_HIRISE_CROP,
} from '@/lib/jezeroHiRISE';
import { getImageNoDataCells } from '@/lib/jezeroCoverage';
import type { SurfacePose } from './MarsSurface';

interface JezeroWalkMapProps {
  position: SurfacePose;
  routePoints: Array<{ x: number; z: number }>;
  destination: { x: number; z: number };
  userWaypoint: { x: number; z: number } | null;
  routeDescription: string;
  onChooseWaypoint: (point: { x: number; z: number }) => void;
}

export default function JezeroWalkMap({
  position,
  routePoints,
  destination,
  userWaypoint,
  routeDescription,
  onChooseWaypoint,
}: JezeroWalkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ id: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const didDragRef = useRef(false);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(0.2);
  const [hasManualZoom, setHasManualZoom] = useState(false);
  const [center, setCenter] = useState(() => ({ x: position.x, z: position.z }));
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const coverageGaps = useMemo(() => getImageNoDataCells(), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: container.clientWidth, height: container.clientHeight });
    });
    observer.observe(container);
    setSize({ width: container.clientWidth, height: container.clientHeight });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (hasManualZoom) return;
    setScale(Math.max(0.12, Math.min(0.42, Math.min(size.width, size.height) * 0.8 / JEZERO_HIRISE_CROP.widthMeters)));
  }, [hasManualZoom, size.height, size.width]);

  const screenPoint = (x: number, z: number) => ({
    x: size.width / 2 + pan.x + (x - center.x) * scale,
    y: size.height / 2 + pan.y + (z - center.z) * scale,
  });

  const imageTopLeft = screenPoint(-CROP_HALF_WIDTH_METERS, -CROP_HALF_HEIGHT_METERS);
  const imageWidth = JEZERO_HIRISE_CROP.widthMeters * scale;
  const imageHeight = JEZERO_HIRISE_CROP.heightMeters * scale;
  const positionPoint = screenPoint(position.x, position.z);
  const destinationPoint = screenPoint(destination.x, destination.z);
  const userWaypointPoint = userWaypoint ? screenPoint(userWaypoint.x, userWaypoint.z) : null;
  const route = routePoints.map((point) => {
    const screen = screenPoint(point.x, point.z);
    return `${screen.x},${screen.y}`;
  }).join(' ');

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a')) return;
    pointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    didDragRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 5) didDragRef.current = true;
    if (didDragRef.current) setPan({ x: start.panX + dx, y: start.panY + dy });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    if (!start || start.id !== event.pointerId) return;
    pointerRef.current = null;
    if (!didDragRef.current && !((event.target as HTMLElement).closest('button, a'))) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      onChooseWaypoint({
        x: center.x + (event.clientX - rect.left - size.width / 2 - pan.x) / scale,
        z: center.z + (event.clientY - rect.top - size.height / 2 - pan.y) / scale,
      });
    }
  };

  const changeZoom = (factor: number) => {
    setHasManualZoom(true);
    setScale((current) => Math.max(0.12, Math.min(2.5, current * factor)));
  };

  const recenter = () => {
    setCenter({ x: position.x, z: position.z });
    setPan({ x: 0, y: 0 });
  };

  const scaleBarMeters = 100;
  const outerPath = `M0,0 H${size.width} V${size.height} H0 Z M${imageTopLeft.x},${imageTopLeft.y} H${imageTopLeft.x + imageWidth} V${imageTopLeft.y + imageHeight} H${imageTopLeft.x} Z`;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden bg-[var(--surface)]"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label="Local orbital imagery navigation map"
    >
      <svg className="absolute inset-0 h-full w-full" aria-label="Mapped terrain coverage and walk route">
        <defs>
          <pattern id="walk-coverage-nodata" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="#404641" fillOpacity="0.35" />
            <path d="M0 0V7" stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="2" />
          </pattern>
        </defs>
        <path d={outerPath} fill="#626862" fillOpacity="0.18" fillRule="evenodd" />
        <image
          href={JEZERO_HIRISE_CROP.assetUrl}
          x={imageTopLeft.x}
          y={imageTopLeft.y}
          width={imageWidth}
          height={imageHeight}
          preserveAspectRatio="none"
        />
        <rect
          x={imageTopLeft.x}
          y={imageTopLeft.y}
          width={imageWidth}
          height={imageHeight}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeDasharray="7 5"
        />
        {coverageGaps.map((cell, index) => {
          const point = screenPoint(cell.x, cell.z);
          return (
            <rect
              key={`${index}-${cell.x}-${cell.z}`}
              x={point.x}
              y={point.y}
              width={cell.size * scale}
              height={cell.size * scale}
              fill="url(#walk-coverage-nodata)"
            />
          );
        })}
        <polyline
          points={route}
          fill="none"
          stroke="#2B79A3"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={destinationPoint.x} cy={destinationPoint.y} r="7" fill="#FFFFFF" stroke="#202321" strokeWidth="2" />
        {userWaypointPoint && (
          <g>
            <circle cx={userWaypointPoint.x} cy={userWaypointPoint.y} r="8" fill="#FFFFFF" fillOpacity="0.35" stroke="#202321" strokeWidth="2" strokeDasharray="3 2" />
            <text
              x={userWaypointPoint.x + 10}
              y={userWaypointPoint.y - 8}
              fill="#FFFFFF"
              fontSize="13"
              fontWeight="700"
              paintOrder="stroke"
              stroke="#202321"
              strokeWidth="3"
            >
              User waypoint
            </text>
          </g>
        )}
        <g transform={`translate(${positionPoint.x} ${positionPoint.y}) rotate(${-position.yaw * 180 / Math.PI})`}>
          <path d="M0 -12 L8 9 L0 5 L-8 9 Z" fill="#FFFFFF" stroke="#202321" strokeWidth="2" />
        </g>
        <text
          x={imageTopLeft.x + 10}
          y={imageTopLeft.y + 22}
          fill="#FFFFFF"
          fontSize="14"
          fontWeight="700"
          paintOrder="stroke"
          stroke="#202321"
          strokeWidth="3"
        >
          Mapped terrain coverage
        </text>
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
        <div className="rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[14px] font-semibold text-[var(--text-primary)]">
          Orbital imagery · simulated position
        </div>
        <span className="rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text-secondary)]">
          {routeDescription}
        </span>
        <details className="pointer-events-auto rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text-secondary)]">
          <summary className="cursor-pointer">Coverage details</summary>
          <p className="mt-1 max-w-xs leading-5">
            Striped gaps are inferred from exact-zero pixels in the bundled JPEG; source nulls may not all survive JPEG compression.
          </p>
        </details>
      </div>

      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--panel)] text-[var(--text-primary)]">
        <button type="button" aria-label="Zoom in" onClick={() => changeZoom(1.25)} className="flex h-10 w-10 items-center justify-center hover:bg-[var(--surface)] focus-visible:outline">
          <Plus aria-hidden="true" className="h-4 w-4" />
        </button>
        <div className="h-px bg-[var(--border)]" />
        <button type="button" aria-label="Zoom out" onClick={() => changeZoom(0.8)} className="flex h-10 w-10 items-center justify-center hover:bg-[var(--surface)] focus-visible:outline">
          <Minus aria-hidden="true" className="h-4 w-4" />
        </button>
        <div className="h-px bg-[var(--border)]" />
        <button type="button" aria-label="Center on explorer" onClick={recenter} className="flex h-10 w-10 items-center justify-center hover:bg-[var(--surface)] focus-visible:outline">
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-20 right-3 flex flex-col items-end gap-2 sm:bottom-24">
        <span className="rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[13px] text-[var(--text-primary)]">
          North <Compass aria-hidden="true" className="inline h-4 w-4" /> ↑
        </span>
        <span className="rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[13px] text-[var(--text-primary)]">
          {scaleBarMeters} m
          <span className="ml-2 inline-block h-1 border-x border-b border-[var(--text-primary)] align-middle" style={{ width: `${scaleBarMeters * scale}px` }} />
        </span>
        <a
          href={JEZERO_HIRISE_CROP.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto max-w-[min(60vw,30rem)] truncate rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[13px] text-[var(--text-secondary)] underline"
        >
          HiRISE {JEZERO_HIRISE_CROP.productId} · NASA/JPL/University of Arizona
        </a>
      </div>
    </div>
  );
}
