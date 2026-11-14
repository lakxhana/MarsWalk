import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { buildMarsTexture, MARS_PHOTOGRAPHIC_CREDIT } from '@/lib/marsTexture';
import { MARS_REGIONS, type MarsRegion, latLonToVector3 } from '@/lib/geo';
import { JEZERO_HIRISE_CROP } from '@/lib/jezeroHiRISE';
import {
  Search,
  Plus,
  Minus,
  ExternalLink,
  X,
  Loader2,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';

export interface GlobePose {
  rotX: number;
  rotY: number;
  distance: number;
}

interface MarsGlobeProps {
  onSelectRegion?: (region: MarsRegion) => void;
  onOpenRegionalMap: () => void;
  onExploreJezero?: () => void;
  onEnterWalk: () => void;
  selectedRegionId?: string;
  initialPose?: GlobePose;
  onSavePose?: (pose: GlobePose) => void;
}

const RADIUS = 2;

export default function MarsGlobe({
  onSelectRegion,
  onOpenRegionalMap,
  onExploreJezero,
  onEnterWalk,
  selectedRegionId = 'jezero',
  initialPose,
  onSavePose,
}: MarsGlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const globeMeshRef = useRef<THREE.Mesh | null>(null);
  const footprintGroupRef = useRef<THREE.Group | null>(null);
  const rafRef = useRef<number | null>(null);

  // Search and active region
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRegion, setActiveRegion] = useState<MarsRegion | null>(() => {
    return MARS_REGIONS.find((r) => r.id === selectedRegionId) || MARS_REGIONS[0];
  });

  // Texture loading state
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [textureAttempt, setTextureAttempt] = useState(0);

  // Transition state
  const [transitionState, setTransitionState] = useState<
    'idle' | 'preloading' | 'error'
  >('idle');
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const transitionAbortRef = useRef(false);

  // 2D label positions projected from 3D coordinates
  const [labelPositions, setLabelPositions] = useState<
    { id: string; name: string; x: number; y: number; visible: boolean }[]
  >([]);

  const [hovered, setHovered] = useState(false);

  // Orientation & Camera controls
  const controlsRef = useRef({
    rotX: initialPose?.rotX ?? 0.15,
    rotY: initialPose?.rotY ?? 0,
    targetRotX: initialPose?.rotX ?? 0.15,
    targetRotY: initialPose?.rotY ?? 0,
    distance: initialPose?.distance ?? 5.6,
    targetDistance: initialPose?.distance ?? 5.6,
    isInteracting: false,
  });

  // Keep track of last label update to avoid 60fps churn
  const lastUpdatePoseRef = useRef({
    rotX: -999,
    rotY: -999,
    distance: -999,
    width: 0,
    height: 0,
  });

  // Calculate target rotation to center a given region
  const calculateRegionRotations = useCallback((lat: number, lon: number) => {
    const rotY = Math.PI / 2 - ((lon + 180) * Math.PI) / 180;
    const rotX = -(lat * Math.PI) / 180;
    return { rotX, rotY };
  }, []);

  // Initialize orientation facing active region if no saved initialPose
  useEffect(() => {
    if (!initialPose && activeRegion) {
      const { rotX, rotY } = calculateRegionRotations(activeRegion.lat, activeRegion.lon);
      controlsRef.current.rotX = rotX * 0.7;
      controlsRef.current.targetRotX = rotX;
      controlsRef.current.rotY = rotY;
      controlsRef.current.targetRotY = rotY;
    }
  }, [activeRegion, calculateRegionRotations, initialPose]);

  // Filtered regions for search dropdown
  const filteredRegions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return MARS_REGIONS.filter(
      (r) => r.name.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  // Main Three.js Scene Setup
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#05060a');

    const width = mount.clientWidth || window.innerWidth || 800;
    const height = mount.clientHeight || window.innerHeight || 600;
    const aspect = height > 0 ? width / height : 1.33;

    const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    camera.position.set(0, 0, controlsRef.current.distance);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
    } catch (err) {
      console.error('[MarsGlobe] WebGLRenderer failed:', err);
      setLoadState('error');
      setLoadError('WebGL is unavailable in this environment.');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Restrained, balanced lighting that preserves visible surface detail
    // No blanket orange tint or artificial flare
    const sunLight = new THREE.DirectionalLight(0xfff1e0, 2.4);
    sunLight.position.set(6, 2.5, 5);
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x8fa6c8, 0.06);
    fillLight.position.set(-6, -2, -4);
    scene.add(fillLight);

    scene.add(new THREE.AmbientLight(0x2a2420, 0.22));

    // Starfield
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1400;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 40 + Math.random() * 25;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(p) * Math.cos(t);
      starPos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
      starPos[i * 3 + 2] = r * Math.cos(p);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.55 }),
    );
    scene.add(stars);

    // Globe Group
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    // Base Sphere Mesh (Placeholder neutral charcoal-regolith until photographic mosaic loads)
    const globeGeo = new THREE.SphereGeometry(RADIUS, 96, 64);
    const placeholderMat = new THREE.MeshStandardMaterial({
      color: 0x3d2c23,
      roughness: 0.95,
      metalness: 0.02,
    });
    const globeMesh = new THREE.Mesh(globeGeo, placeholderMat);
    globeGroup.add(globeMesh);
    globeMeshRef.current = globeMesh;

    // Restrained atmospheric limb
    const rimGeo = new THREE.SphereGeometry(RADIUS * 1.015, 64, 48);
    const rimMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { c: { value: new THREE.Color('#d9a27a') } },
      vertexShader: `
        varying vec3 vN;
        void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        varying vec3 vN; uniform vec3 c;
        void main(){ float i = pow(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 4.0); gl_FragColor = vec4(c, i * 0.7); }
      `,
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    scene.add(rimMesh);

    // Footprint Group for verified dataset boundaries
    const footprintGroup = new THREE.Group();
    globeGroup.add(footprintGroup);
    footprintGroupRef.current = footprintGroup;

    // Pointer Drag & Zoom Interaction
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      controlsRef.current.isInteracting = true;
      lastX = e.clientX;
      lastY = e.clientY;
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      controlsRef.current.targetRotY += dx * 0.005;
      controlsRef.current.targetRotX += dy * 0.005;
      // Clamp vertical tilt to prevent gimbal inversion
      controlsRef.current.targetRotX = Math.max(-1.35, Math.min(1.35, controlsRef.current.targetRotX));
    };

    const onUp = () => {
      dragging = false;
      controlsRef.current.isInteracting = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      controlsRef.current.targetDistance *= 1 + e.deltaY * 0.001;
      controlsRef.current.targetDistance = Math.max(2.7, Math.min(9.5, controlsRef.current.targetDistance));
    };

    renderer.domElement.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth || window.innerWidth || 800;
      const h = mount.clientHeight || window.innerHeight || 600;
      camera.aspect = h > 0 ? w / h : 1.33;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      // Force label position recalculation on resize
      lastUpdatePoseRef.current.width = 0;
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop: Eases rotation and only updates label projection when moving
    const tempVec = new THREE.Vector3();
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      const ctrl = controlsRef.current;
      ctrl.rotX += (ctrl.targetRotX - ctrl.rotX) * 0.08;
      ctrl.rotY += (ctrl.targetRotY - ctrl.rotY) * 0.08;
      ctrl.distance += (ctrl.targetDistance - ctrl.distance) * 0.08;

      globeGroup.rotation.x = ctrl.rotX;
      globeGroup.rotation.y = ctrl.rotY;
      camera.position.set(0, 0, ctrl.distance);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);

      // Save pose for restoration
      onSavePose?.({
        rotX: ctrl.rotX,
        rotY: ctrl.rotY,
        distance: ctrl.distance,
      });

      // Recalculate 2D labels only when camera or globe has actually changed
      const last = lastUpdatePoseRef.current;
      const curW = mount.clientWidth;
      const curH = mount.clientHeight;
      const hasMoved =
        Math.abs(ctrl.rotX - last.rotX) > 0.001 ||
        Math.abs(ctrl.rotY - last.rotY) > 0.001 ||
        Math.abs(ctrl.distance - last.distance) > 0.01 ||
        curW !== last.width ||
        curH !== last.height;

      if (hasMoved && curW > 0 && curH > 0) {
        last.rotX = ctrl.rotX;
        last.rotY = ctrl.rotY;
        last.distance = ctrl.distance;
        last.width = curW;
        last.height = curH;

        const labels: { id: string; name: string; x: number; y: number; visible: boolean }[] = [];
        const camPos = camera.position;

        for (const region of MARS_REGIONS) {
          const [lx, ly, lz] = latLonToVector3(region.lat, region.lon, RADIUS * 1.002);
          tempVec.set(lx, ly, lz);
          tempVec.applyEuler(globeGroup.rotation);

          // Backside culling: dot product between surface normal and vector to camera
          const toCam = camPos.clone().sub(tempVec).normalize();
          const normal = tempVec.clone().normalize();
          const dot = normal.dot(toCam);

          if (dot > 0.12) {
            tempVec.project(camera);
            const screenX = ((tempVec.x + 1) * curW) / 2;
            const screenY = ((-tempVec.y + 1) * curH) / 2;
            labels.push({
              id: region.id,
              name: region.name,
              x: screenX,
              y: screenY,
              visible: true,
            });
          }
        }
        setLabelPositions(labels);
      }
    };
    animate();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', handleResize);

      globeGeo.dispose();
      starGeo.dispose();
      rimGeo.dispose();
      rimMat.dispose();
      placeholderMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [onSavePose]);

  // Load and stitch authentic NASA Mars Trek photographic tiles directly as THREE.CanvasTexture
  useEffect(() => {
    let disposed = false;
    setLoadState('loading');
    setLoadProgress(0);
    setLoadError(null);

    buildMarsTexture((loaded, total) => {
      if (!disposed) {
        setLoadProgress(loaded / total);
      }
    })
      .then((res) => {
        if (disposed) return;
        const renderer = rendererRef.current;
        const globeMesh = globeMeshRef.current;
        if (!globeMesh || !renderer) return;

        // Directly construct CanvasTexture from the stitched canvas
        const tex = new THREE.CanvasTexture(res.canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        tex.needsUpdate = true;

        const surfaceMat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 1,
          metalness: 0,
        });

        globeMesh.material = surfaceMat;
        setLoadState('ready');
      })
      .catch((err: Error) => {
        if (!disposed) {
          console.error('[MarsGlobe] buildMarsTexture failed:', err);
          const globeMesh = globeMeshRef.current;
          if (globeMesh) {
            // Replace brown placeholder with explicit slate wireframe so untextured state is unambiguous
            globeMesh.material = new THREE.MeshBasicMaterial({
              color: 0x334155,
              wireframe: true,
            });
          }
          setLoadState('error');
          setLoadError(err.message || 'Mars imagery could not load.');
        }
      });

    return () => {
      disposed = true;
    };
  }, [textureAttempt]);


  // Update verified dataset coverage boundary (Instruction 3)
  // For Jezero: uses verified bounding box from JEZERO_HIRISE metadata.
  // For other features: does NOT draw false invented polygon.
  useEffect(() => {
    const footprintGroup = footprintGroupRef.current;
    if (!footprintGroup) return;

    while (footprintGroup.children.length > 0) {
      const obj = footprintGroup.children[0];
      footprintGroup.remove(obj);
    }

    if (!activeRegion) return;

    // Only render verified coverage boundary using actual crop bounds from JEZERO_HIRISE_CROP
    if (activeRegion.id === 'jezero') {
      const bbox = JEZERO_HIRISE_CROP.cropBounds;
      // 4 corners of verified MRO HiRISE observation crop
      const corners = [
        { lat: bbox.north, lon: bbox.west },
        { lat: bbox.north, lon: bbox.east },
        { lat: bbox.south, lon: bbox.east },
        { lat: bbox.south, lon: bbox.west },
        { lat: bbox.north, lon: bbox.west }, // close loop
      ];

      const points: THREE.Vector3[] = [];
      for (const pt of corners) {
        const [x, y, z] = latLonToVector3(pt.lat, pt.lon, RADIUS * 1.003);
        points.push(new THREE.Vector3(x, y, z));
      }

      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xc06a28,
        transparent: true,
        opacity: 0.95,
        linewidth: 2,
      });
      const footprintLine = new THREE.Line(lineGeo, lineMat);
      footprintGroup.add(footprintLine);
    }
  }, [activeRegion]);

  // Region selection
  const handleSelectRegion = (region: MarsRegion) => {
    setActiveRegion(region);
    onSelectRegion?.(region);
    setSearchQuery('');

    const { rotX, rotY } = calculateRegionRotations(region.lat, region.lon);
    controlsRef.current.targetRotX = rotX;
    controlsRef.current.targetRotY = rotY;
    controlsRef.current.targetDistance = Math.min(controlsRef.current.distance, 4.8);
  };

  // Zoom controls
  const handleZoomIn = () => {
    controlsRef.current.targetDistance = Math.max(2.7, controlsRef.current.targetDistance * 0.8);
  };

  const handleZoomOut = () => {
    controlsRef.current.targetDistance = Math.min(9.5, controlsRef.current.targetDistance * 1.25);
  };

  const handleResetNorth = () => {
    if (activeRegion) {
      const { rotX, rotY } = calculateRegionRotations(activeRegion.lat, activeRegion.lon);
      controlsRef.current.targetRotX = rotX;
      controlsRef.current.targetRotY = rotY;
    } else {
      controlsRef.current.targetRotX = 0;
    }
  };

  // Data-aware animated zoom transition into real HiRISE observation
  const handleStartTransition = (target: 'map' | 'walk' = 'map') => {
    setTransitionState('preloading');
    setTransitionError(null);
    transitionAbortRef.current = false;

    // Smooth camera ease towards target landmark
    if (activeRegion) {
      const { rotX, rotY } = calculateRegionRotations(activeRegion.lat, activeRegion.lon);
      controlsRef.current.targetRotX = rotX;
      controlsRef.current.targetRotY = rotY;
      controlsRef.current.targetDistance = 3.6;
    }

    // Preload verified local HiRISE orthoimage before completing view handoff
    const testUrl = JEZERO_HIRISE_CROP.assetUrl;
    const img = new Image();

    const timeoutId = setTimeout(() => {
      // If network takes too long, report error state
      if (!transitionAbortRef.current) {
        setTransitionState('error');
        setTransitionError('Local imagery could not load within timeout.');
      }
    }, 6000);

    img.onload = () => {
      clearTimeout(timeoutId);
      if (transitionAbortRef.current) return;
      setTransitionState('idle');
      if (onExploreJezero) {
        onExploreJezero();
      } else if (target === 'map') {
        onOpenRegionalMap();
      } else {
        onEnterWalk();
      }
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      if (transitionAbortRef.current) return;
      // If local asset fails to load, report failure and offer Retry / Cancel
      setTransitionState('error');
      setTransitionError('Local imagery unavailable');
    };

    img.src = testUrl;
  };

  const handleCancelTransition = () => {
    transitionAbortRef.current = true;
    setTransitionState('idle');
    setTransitionError(null);
    controlsRef.current.targetDistance = 5.6;
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05060a] select-none font-sans text-[#f3f1ee]">
      {/* 3D Canvas Mount */}
      <div
        ref={mountRef}
        className="absolute inset-0 touch-none"
        style={{ cursor: hovered ? 'grab' : 'default' }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      />

      {/* 2D Geographic Labels projected onto 3D Globe with backside culling */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {labelPositions.map((lbl) => {
          const isSelected = activeRegion?.id === lbl.id;
          return (
            <button
              key={lbl.id}
              onClick={() => {
                const reg = MARS_REGIONS.find((r) => r.id === lbl.id);
                if (reg) handleSelectRegion(reg);
              }}
              className="pointer-events-auto absolute flex items-center gap-1.5 transition -translate-x-2 -translate-y-2 group cursor-pointer focus:outline-none"
              style={{
                left: `${lbl.x}px`,
                top: `${lbl.y}px`,
              }}
            >
              {/* Ring / Dot Marker */}
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border transition ${
                  isSelected
                    ? 'border-[#d86a33] bg-[#d86a33]/30 shadow-[0_0_8px_rgba(192,106,40,0.8)]'
                    : 'border-white/70 bg-black/40 group-hover:border-[#d86a33] group-hover:bg-[#d86a33]/20'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isSelected ? 'bg-[#d86a33]' : 'bg-white/80 group-hover:bg-[#d86a33]'
                  }`}
                />
              </span>

              {/* Label Text */}
              <span
                className={`text-[11px] sm:text-xs font-medium tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition ${
                  isSelected
                    ? 'text-white font-semibold'
                    : 'text-neutral-300 group-hover:text-white'
                }`}
              >
                {lbl.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* TOP-LEFT: Explore Mars / Search Bar (Board 01) */}
      <div className="pointer-events-none absolute left-4 sm:left-6 top-4 sm:top-6 z-30 max-w-xs sm:max-w-sm">
        <div className="pointer-events-auto">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white mb-3">
            {activeRegion ? 'Select a region' : 'Explore Mars'}
          </h1>

          {/* Search Box */}
          <div className="relative">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-4 w-4 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Mars"
                className="w-full rounded-xl border border-white/10 bg-[#1b1714]/90 py-2.5 pl-10 pr-9 text-xs sm:text-sm text-white placeholder-neutral-400 backdrop-blur-md shadow-lg focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 rounded-full p-1 text-neutral-400 hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Suggestions */}
            {filteredRegions.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#1b1714]/95 backdrop-blur-xl shadow-2xl z-50">
                {filteredRegions.map((region) => (
                  <button
                    key={region.id}
                    onClick={() => handleSelectRegion(region)}
                    className="flex w-full items-start justify-between px-3.5 py-2.5 text-left text-xs transition hover:bg-white/10 cursor-pointer border-b border-white/5 last:border-b-0"
                  >
                    <div>
                      <div className="font-semibold text-white">{region.name}</div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">{region.subtitle}</div>
                    </div>
                    {region.hasWalkSimulation && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                        Simulation
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* DOCKED REGION CARD (Board 01 State 2) */}
        {activeRegion && (
          <div className="pointer-events-auto mt-4 w-72 sm:w-80 overflow-hidden rounded-2xl border border-[#3c342e] bg-[#181513] p-5 shadow-2xl text-[#f1e8db] transition-all duration-300">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-[#f1e8db]">
                  {activeRegion.name}
                </h2>
                <div className="text-xs text-[#b3a595] font-medium mt-0.5">
                  {activeRegion.subtitle}
                </div>
              </div>
              <button
                onClick={() => setActiveRegion(null)}
                className="rounded-lg p-1 text-[#8f8274] hover:bg-white/5 hover:text-[#f1e8db] transition"
                aria-label="Deselect region"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2.5 text-xs leading-relaxed text-[#d9ccba]">
              {activeRegion.description}
            </p>

            {/* Action Button: Single action Explore Jezero */}
            <div className="mt-4">
              {activeRegion.id === 'jezero' ? (
                <button
                  onClick={() => handleStartTransition('map')}
                  disabled={transitionState === 'preloading'}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#d86a33] py-3 text-xs font-semibold text-white transition hover:bg-[#bd5726] active:scale-[0.99] cursor-pointer shadow-md"
                >
                  <span>Explore Jezero</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <div className="rounded-lg bg-[#2b2520] p-2.5 text-center text-xs text-[#b3a595]">
                  No regional imagery available for this feature.
                </div>
              )}
            </div>

            {/* Verified coverage disclosure */}
            <div className="mt-3 text-[11px] text-[#b3a595] text-center border-t border-[#3c342e] pt-2">
              {activeRegion.id === 'jezero'
                ? 'Verified HiRISE observation ESP_048908_1985 (1.0 m/px)'
                : 'No regional dataset loaded for this feature'}
            </div>
          </div>
        )}
      </div>

      {/* TOP-CENTER: Data-Aware Transition Progress Card (Instruction 5) */}
      {transitionState !== 'idle' && (
        <div className="pointer-events-none absolute inset-x-0 top-6 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3.5 rounded-2xl border border-white/10 bg-[#1b1714]/95 px-5 py-3 text-white shadow-2xl backdrop-blur-xl">
            {transitionState === 'preloading' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[#e8955f]" />
                <div className="text-left text-xs">
                  <div className="font-semibold text-white">
                    Loading HiRISE orthoimage...
                  </div>
                  <div className="text-neutral-400">
                    Preloading ESP_048908_1985 (1.0 m/px)
                  </div>
                </div>
                <button
                  onClick={handleCancelTransition}
                  className="ml-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="text-left text-xs">
                  <div className="font-semibold text-white">
                    Local imagery unavailable
                  </div>
                  <div className="text-neutral-400">
                    {transitionError || 'Could not verify HiRISE local asset.'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 ml-2">
                  <button
                    onClick={() => handleStartTransition('map')}
                    className="rounded-lg bg-[#d86a33] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#bd5726] cursor-pointer"
                  >
                    Retry
                  </button>
                  <button
                    onClick={handleCancelTransition}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-300 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TOP-CENTER: Texture Loading / Error Banner (Instruction 1) */}
      {loadState === 'loading' && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-[#1b1714]/90 px-4 py-1.5 text-xs text-neutral-300 backdrop-blur-md shadow-lg">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
            <span>
              Loading Mars photographic mosaic... {Math.round(loadProgress * 100)}%
            </span>
          </div>
        </div>
      )}

      {loadState === 'error' && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-red-500/30 bg-[#1f1315]/95 px-4 py-2 text-xs text-red-200 backdrop-blur-md shadow-xl">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <div className="text-left">
              <span className="font-semibold text-white">
                Mars imagery could not load.
              </span>{' '}
              <span className="text-red-300/80">
                {loadError || 'Network error fetching Mars Trek tiles.'}
              </span>
            </div>
            <button
              onClick={() => {
                const globeMesh = globeMeshRef.current;
                if (globeMesh) {
                  globeMesh.material = new THREE.MeshStandardMaterial({
                    color: 0x2e241f,
                    roughness: 0.95,
                    metalness: 0.02,
                  });
                }
                setTextureAttempt((a) => a + 1);
              }}
              className="ml-2 flex items-center gap-1 rounded-lg bg-red-900/60 hover:bg-red-800/80 border border-red-500/40 px-2.5 py-1 text-xs font-semibold text-white cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM-LEFT: Gestures & Imagery Source Link (Board 01) */}
      <div className="pointer-events-none absolute left-4 sm:left-6 bottom-4 sm:bottom-6 z-20 flex flex-col gap-1 text-[11px] text-neutral-400">
        <div className="text-[10px] text-neutral-500 max-w-sm">
          {loadState === 'ready'
            ? MARS_PHOTOGRAPHIC_CREDIT
            : loadState === 'error'
              ? 'Mars imagery could not load — displaying untextured coordinate grid'
              : 'Untextured surface fallback — Mars photographic mosaic loading...'}
        </div>
        <a
          href="https://trek.nasa.gov/mars/"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto inline-flex items-center gap-1 text-neutral-400 hover:text-white transition mt-0.5"
        >
          <span>Imagery source</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* BOTTOM-RIGHT: Vertical Zoom Stack (+, -, N) (Board 01) */}
      <div className="pointer-events-none absolute right-4 sm:right-6 bottom-4 sm:bottom-6 z-30 flex flex-col items-center gap-1.5">
        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1b1714]/90 backdrop-blur-md shadow-xl text-white">
          <button
            onClick={handleZoomIn}
            className="flex h-9 w-9 items-center justify-center transition hover:bg-white/10 cursor-pointer"
            title="Zoom In"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="h-px w-full bg-white/10" />
          <button
            onClick={handleZoomOut}
            className="flex h-9 w-9 items-center justify-center transition hover:bg-white/10 cursor-pointer"
            title="Zoom Out"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="h-px w-full bg-white/10" />
          <button
            onClick={handleResetNorth}
            className="flex h-9 w-9 items-center justify-center font-bold text-xs text-amber-400 transition hover:bg-white/10 cursor-pointer"
            title="Reset North orientation"
            aria-label="Reset North"
          >
            N
          </button>
        </div>
      </div>
    </div>
  );
}
