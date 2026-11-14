import {useEffect,useRef,useState,type ReactNode} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import type {SuitMetric} from '@/lib/suitMetrics';
export default function SuitModel({metric,animate,visible=true,fallback}:{metric:SuitMetric;animate:boolean;visible?:boolean;fallback?:ReactNode}){
 const host=useRef<HTMLDivElement>(null),live=useRef({metric,animate,visible});live.current={metric,animate,visible};const [error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 useEffect(()=>{
  const mount=host.current;if(!mount)return;let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{setError('3D unavailable · readings remain accessible below');return;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;mount.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,50);camera.position.set(0,.1,6.8);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=false;controls.enableZoom=false;controls.minPolarAngle=Math.PI*.25;controls.maxPolarAngle=Math.PI*.7;controls.target.set(0,0,0);
  scene.add(new THREE.HemisphereLight(0xfff5e8,0x473422,3));const key=new THREE.DirectionalLight(0xffe4c2,4);key.position.set(3,4,4);scene.add(key);const rim=new THREE.DirectionalLight(0x9cc8dd,2);rim.position.set(-3,1,-2);scene.add(rim);
  const group=new THREE.Group();scene.add(group);let disposed=false,model:THREE.Object3D|null=null;
  const free=(object:THREE.Object3D)=>object.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(m))if(v instanceof THREE.Texture)v.dispose();m.dispose();}}});
  new GLTFLoader().load('/assets/models/astronaut.glb',g=>{if(disposed){free(g.scene);return;}model=g.scene;const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const scale=3/Math.max(size.y,.01);model.scale.multiplyScalar(scale);model.position.sub(center.multiplyScalar(scale));group.add(model);setLoaded(true);},undefined,()=>{if(!disposed)setError('Suit model could not load · readings remain accessible');});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.43,.012,8,64),new THREE.MeshBasicMaterial({color:0xdf985d,transparent:true,opacity:.65,depthTest:false}));ring.position.set(0,.35,.65);ring.renderOrder=4;scene.add(ring);
  const base=new THREE.Mesh(new THREE.RingGeometry(.83,.85,80),new THREE.MeshBasicMaterial({color:0x88613e,side:THREE.DoubleSide}));base.rotation.x=-Math.PI/2;base.position.y=-1.55;scene.add(base);
  const resize=()=>{const w=mount.clientWidth,h=mount.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;const distance=Math.max(6.8,1.85/(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.min(camera.aspect,1)));camera.position.sub(controls.target).setLength(distance).add(controls.target);camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(mount);resize();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');let frame=0,last=0;
  const render=(now:number)=>{frame=requestAnimationFrame(render);if(!live.current.visible||document.hidden||now-last<33)return;last=now;controls.update();const k=live.current.metric;const target=k==='bloodOxygen'?.05:k==='tank'?-.2:k==='suitPressure'||k==='oxygenPartialPressure'||k==='co2PartialPressure'?1:.35;
   ring.position.y+=reduced.matches?target-ring.position.y:(target-ring.position.y)*.12;
   const pulse=!reduced.matches&&live.current.animate?1+.035*Math.sin(now/900):1;ring.scale.setScalar(pulse);ring.visible=Boolean(model);renderer.render(scene,camera);
  };frame=requestAnimationFrame(render);
  const lost=(event:Event)=>{event.preventDefault();setError('3D paused · reload to restore the model');};renderer.domElement.addEventListener('webglcontextlost',lost);
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('webglcontextlost',lost);free(scene);renderer.dispose();renderer.domElement.remove();};
 },[]);
 return <div className={`suit-model ${error&&fallback?'with-fallback':''}`}><div ref={host} className="suit-canvas" role="img" aria-label="Rotatable astronaut suit reference model"/>{error&&fallback&&<div className="suit-model-fallback">{fallback}</div>}{(!loaded||error)&&!(error&&fallback)&&<p className="suit-load" role="status">{error||'Loading suit…'}</p>}<span className="suit-visual-label">{error&&fallback?'2D fallback · 3D unavailable':'Reference suit · illustrative focus'}</span></div>;
}
