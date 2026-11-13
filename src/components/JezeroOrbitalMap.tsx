import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { JEZERO_HIRISE_CROP } from '@/lib/jezeroHiRISE';
import {
  Plus,
  Minus,
  Crosshair,
  ArrowLeft,
  ExternalLink,
  RotateCcw,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface JezeroOrbitalMapProps {
  onBackToGlobe: () => void;
  // Optional override for asset testing (e.g. testing error state)
  assetUrlOverride?: string;
}

export default function JezeroOrbitalMap({
  onBackToGlobe,
  assetUrlOverride,
}: JezeroOrbitalMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Pan & Zoom state
  // scale = screen pixels per image pixel
  // 1 image pixel = 1.00966 meters
  const [scale, setScale] = useState(0.42);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const activeAssetUrl = assetUrlOverride || JEZERO_HIRISE_CROP.assetUrl;

  // Maximum useful zoom limit: At ~2.8x scale, each 1m source pixel is magnified to ~3 screen pixels
  const MAX_SCALE = 2.8;
  const MIN_SCALE = 0.15;
  const isMaxDetailReached = scale >= MAX_SCALE - 0.05;

  // Center image in viewport
  const handleRecentre = useCallback(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;
    const imgW = JEZERO_HIRISE_CROP.widthPixels * scale;
    const imgH = JEZERO_HIRISE_CROP.heightPixels * scale;
    setPan({
      x: (w - imgW) / 2,
      y: (h - imgH) / 2,
    });
  }, [scale]);

  // Load and verify local HiRISE asset
  useEffect(() => {
    setImageState('loading');
    setLoadError(null);

    const img = new Image();
    img.src = activeAssetUrl;

    img.onload = () => {
      imageRef.current = img;
      setImageState('ready');
    };

    img.onerror = () => {
      setImageState('error');
      setLoadError('Local HiRISE orthoimage could not be loaded.');
    };
  }, [activeAssetUrl, retryCount]);

  // Center on initial ready
  useEffect(() => {
    if (imageState === 'ready') {
      handleRecentre();
    }
  }, [imageState, handleRecentre]);

  // Pan handling (Pointer events)
  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // Zoom handling with wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));

    if (containerRef.current && newScale !== scale) {
      // Zoom toward cursor point
      const rect = containerRef.current.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const imgX = (cursorX - pan.x) / scale;
      const imgY = (cursorY - pan.y) / scale;

      setScale(newScale);
      setPan({
        x: cursorX - imgX * newScale,
        y: cursorY - imgY * newScale,
      });
    }
  };

  const handleZoomIn = () => {
    setScale((prev) => {
      const next = Math.min(MAX_SCALE, prev * 1.25);
      return next;
    });
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(MIN_SCALE, prev * 0.8);
      return next;
    });
  };

  // Dynamic Scale Bar Calculation from Displayed Image Scale
  // scale = screen pixels per 1.00966 meters
  // meters_per_screen_pixel = 1.00966 / scale
  const scaleBar = useMemo(() => {
    const metersPerPixel = JEZERO_HIRISE_CROP.pixelScaleMeters / scale;

    // We want a scale bar of roughly 80 to 180 screen pixels
    const targetMeters = 100 * metersPerPixel;
    const niceIncrements = [10, 20, 50, 100, 200, 500, 1000, 2000];

    // Find closest nice round number
    let chosenMeters = niceIncrements[0];
    for (const inc of niceIncrements) {
      if (Math.abs(inc - targetMeters) < Math.abs(chosenMeters - targetMeters)) {
        chosenMeters = inc;
      }
    }

    const barWidthPx = Math.round(chosenMeters / metersPerPixel);
    return {
      barWidthPx,
      label: chosenMeters >= 1000 ? `${chosenMeters / 1000} km` : `${chosenMeters} m`,
    };
  }, [scale]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#100d0b] select-none font-sans text-neutral-200">
      {/* 
        MAP CANVAS AREA: Fills the entire view
      */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className="absolute inset-0 cursor-grab active:cursor-grabbing overflow-hidden"
        style={{ touchAction: 'none' }}
      >
        {imageState === 'ready' && (
          <div
            className="absolute transition-transform duration-75 ease-out"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px)`,
              width: `${JEZERO_HIRISE_CROP.widthPixels * scale}px`,
              height: `${JEZERO_HIRISE_CROP.heightPixels * scale}px`,
            }}
          >
            {/* Real Grayscale HiRISE Map-Projected Orthoimage */}
            <img
              src={activeAssetUrl}
              alt="Jezero Crater HiRISE Orthoimage ESP_048908_1985_RED_C_01_ORTHO"
              draggable={false}
              className="w-full h-full object-contain pointer-events-none shadow-2xl select-none"
              style={{
                imageRendering: scale > 1.8 ? 'pixelated' : 'auto',
              }}
            />
          </div>
        )}

        {/* LOADING STATE */}
        {imageState === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#100d0b] text-neutral-400">
            <Loader2 className="h-6 w-6 animate-spin text-[#e8955f]" />
            <div className="text-xs font-mono">
              Loading local HiRISE observation {JEZERO_HIRISE_CROP.productId}...
            </div>
          </div>
        )}

        {/* ERROR STATE: "Local imagery unavailable" with Retry */}
        {imageState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-[#0e0f14] text-center">
            <div className="max-w-md rounded-2xl border border-red-500/20 bg-[#161214] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-center gap-2 text-red-400 font-semibold text-sm">
                <AlertTriangle className="h-5 w-5" />
                <span>Local imagery unavailable</span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {loadError || 'The verified HiRISE orthoimage product could not be loaded from the local asset store.'}
              </p>
              <div className="text-[11px] font-mono text-neutral-500 bg-black/40 p-2 rounded">
                Target product: {JEZERO_HIRISE_CROP.productId}
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setRetryCount((c) => c + 1)}
                  className="flex items-center gap-1.5 rounded-xl bg-[#d86a33] hover:bg-[#bd5726] px-4 py-2 text-xs font-semibold text-white transition cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Retry</span>
                </button>
                <button
                  onClick={onBackToGlobe}
                  className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-medium text-neutral-300 transition cursor-pointer"
                >
                  Return to Globe
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 
        QUIET TOP BAR: Region Name & Return to Globe
      */}
      <div className="pointer-events-none absolute left-4 sm:left-6 top-4 sm:top-6 z-30 flex items-center gap-3">
        <button
          onClick={onBackToGlobe}
          className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#1b1714]/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-md hover:bg-white/10 transition cursor-pointer"
          title="Return to Mars Globe"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Globe</span>
        </button>

        <div className="flex flex-col">
          <div className="text-sm font-bold text-white tracking-wide">
            Jezero Crater
          </div>
          <div className="text-[11px] text-neutral-400 font-mono">
            18.47° N, 77.51° E · {Math.round(JEZERO_HIRISE_CROP.widthMeters)} × {Math.round(JEZERO_HIRISE_CROP.heightMeters)} m
          </div>
        </div>
      </div>

      {/* 
        BOTTOM-LEFT: DYNAMIC SCALE BAR & SMALL SOURCE LINK
      */}
      <div className="pointer-events-none absolute left-4 sm:left-6 bottom-4 sm:bottom-6 z-30 flex flex-col gap-2">
        {/* Dynamic Scale Bar */}
        {imageState === 'ready' && (
          <div className="pointer-events-auto flex flex-col gap-1 rounded-lg border border-white/10 bg-[#1b1714]/85 px-3 py-1.5 backdrop-blur-md shadow-lg text-neutral-300">
            <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
              <span>0</span>
              <span className="font-semibold text-white">{scaleBar.label}</span>
            </div>
            {/* Visual Bar with End Caps */}
            <div
              className="h-1 bg-[#262019] relative flex justify-between"
              style={{ width: `${scaleBar.barWidthPx}px` }}
            >
              <div className="h-2 w-0.5 bg-[#262019] -mt-0.5" />
              <div className="h-2 w-0.5 bg-[#262019] -mt-0.5" />
            </div>
          </div>
        )}

        {/* Small Source Link */}
        <a
          href={JEZERO_HIRISE_CROP.dtmReferenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white transition"
          title="View official USGS/NASA HiRISE DTM record"
        >
          <span>HiRISE {JEZERO_HIRISE_CROP.productId}</span>
          <span className="text-neutral-500">·</span>
          <span>NASA/JPL/UArizona</span>
          <ExternalLink className="h-3 w-3 ml-0.5 text-neutral-400" />
        </a>
      </div>

      {/* 
        BOTTOM-RIGHT: ZOOM CONTROLS (+, -, RECENTRE)
      */}
      <div className="pointer-events-none absolute right-4 sm:right-6 bottom-4 sm:bottom-6 z-30 flex flex-col items-end gap-2">
        {/* Stop Zooming Detail Notice */}
        {isMaxDetailReached && (
          <div className="rounded-lg border border-white/10 bg-black/80 px-2.5 py-1 text-[11px] font-medium text-amber-300 backdrop-blur-sm shadow-md">
            Maximum available source detail (1.0 m/px)
          </div>
        )}

        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1b1714]/90 backdrop-blur-md shadow-xl text-white">
          <button
            onClick={handleZoomIn}
            disabled={isMaxDetailReached}
            className={`flex h-9 w-9 items-center justify-center transition ${
              isMaxDetailReached
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-white/10 cursor-pointer'
            }`}
            title="Zoom In"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="h-px w-full bg-white/10" />
          <button
            onClick={handleZoomOut}
            className="flex h-9 w-9 items-center justify-center hover:bg-white/10 transition cursor-pointer"
            title="Zoom Out"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={handleRecentre}
          className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#1b1714]/90 backdrop-blur-md px-3 py-2 text-xs font-semibold text-white shadow-xl hover:bg-white/10 transition cursor-pointer"
          title="Recentre on Jezero Crater"
        >
          <Crosshair className="h-3.5 w-3.5 text-neutral-400" />
          <span>Recentre</span>
        </button>
      </div>
    </div>
  );
}
