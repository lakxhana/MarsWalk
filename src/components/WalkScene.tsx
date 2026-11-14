import {westElevation} from '@/lib/walkTerrain';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import type {WalkRenderRoute} from '@/lib/routePlanner';
import {sampleRoute} from '@/lib/jezeroRoutes';
import {routeGuideGeometry,visibleGroundHeight,type RenderedGround} from '@/lib/surfaceGuide';
import type {SurfacePose} from './MarsSurface';
import {lonLatToCropMeters,JEZERO_HIRISE_CROP} from '@/lib/jezeroHiRISE';
import {getRelativeElevation} from '@/lib/jezeroMeasuredElevation';
import imagery from '@/lib/jezeroWestImagery.json';
import detail from '@/lib/jezeroDetailImagery.json';

// Presentation only: movement and the mission clock remain owned by FieldWalk.
export default function WalkScene({route,pose,walking,visible,onMap}:{route:WalkRenderRoute;pose:SurfacePose;walking:boolean;visible:boolean;onMap:()=>void}){
 const mount=useRef<HTMLDivElement>(null),live=useRef({pose,walking,visible});live.current={pose,walking,visible};
 const [error,setError]=useState('');
 useEffect(()=>{
  const host=mount.current;if(!host)return;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});}catch{setError('3D unavailable on this device. Open the 2D map.');return;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
  const grounds:RenderedGround[]=[];
  const scene=new THREE.Scene();scene.background=new THREE.Color('#313732');
  scene.add(new THREE.AmbientLight(0xffffff,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const camera=new THREE.PerspectiveCamera(57,1,.1,10000),textures:THREE.Texture[]=[];let disposed=false;
  const height=(x:number,z:number)=>route.mapMode==='regional'?(westElevation(x,z)??-2574.414)+2574.414:getRelativeElevation(x,z);
  const addGround=(asset:string,x:number,z:number,w:number,h:number,offset=0)=>{
   const geo=new THREE.PlaneGeometry(w,h,384,256);geo.rotateX(-Math.PI/2);
   const a=geo.attributes.position;const valid:boolean[]=[];for(let i=0;i<a.count;i++){const px=a.getX(i)+x,pz=a.getZ(i)+z;valid.push(route.mapMode!=='regional'||westElevation(px,pz)!==null);a.setY(i,height(px,pz)+offset);}const indices:number[]=[];const original=geo.index!;for(let i=0;i<original.count;i+=3){const v=[original.getX(i),original.getX(i+1),original.getX(i+2)];if(v.every(n=>valid[n]))indices.push(...v);}geo.setIndex(indices);geo.computeVertexNormals();
   grounds.push({x,z,width:w,height:h,cols:384,rows:256,heights:Float32Array.from({length:a.count},(_,i)=>a.getY(i)),valid});
   const texture=new THREE.TextureLoader().load(asset,t=>{if(disposed){t.dispose();return;}t.colorSpace=THREE.SRGBColorSpace;},undefined,()=>{if(!disposed)setError('Imagery could not load. Open the 2D map or retry.');});textures.push(texture);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
   const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:texture,roughness:1,side:THREE.DoubleSide}));mesh.position.set(x,0,z);scene.add(mesh);
  };
  if(route.mapMode==='regional'){
   for(const tile of [imagery,detail]){const a=lonLatToCropMeters(tile.west,tile.north),b=lonLatToCropMeters(tile.east,tile.south);addGround(tile.asset,(a.x+b.x)/2,(a.z+b.z)/2,b.x-a.x,b.z-a.z,tile===detail?.025:0);}
  }else addGround(JEZERO_HIRISE_CROP.assetUrl,0,0,JEZERO_HIRISE_CROP.widthMeters,JEZERO_HIRISE_CROP.heightMeters);
  // Match guide vertices to the mesh actually rendered, rather than a different interpolation.
  for(const [width,lift,color,order] of [[.23,.16,0x122d30,1],[.14,.19,0x66e3cf,2]]){
   const data=routeGuideGeometry(route,grounds,width,lift),geo=new THREE.BufferGeometry();
   geo.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geo.setIndex(data.indices);
   const material=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,depthTest:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
   const mesh=new THREE.Mesh(geo,material);mesh.renderOrder=order;scene.add(mesh);
  }
  for(let d=4;d<route.totalDistanceMeters;d+=15){
   const p=sampleRoute(route,d),next=sampleRoute(route,Math.min(route.totalDistanceMeters,d+.5));
   const dx=next.x-p.x,dz=next.z-p.z,len=Math.hypot(dx,dz)||1;
   const tips=[{x:p.x+dx/len*.45,z:p.z+dz/len*.45},{x:p.x-dx/len*.3+dz/len*.3,z:p.z-dz/len*.3-dx/len*.3},{x:p.x-dx/len*.3-dz/len*.3,z:p.z-dz/len*.3+dx/len*.3}];
   const ys=tips.map(q=>visibleGroundHeight(grounds,q.x,q.z));if(ys.some(y=>y===null))continue;
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(tips.flatMap((q,i)=>[q.x,ys[i]!+.24,q.z]),3));
   const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xf7f5e9,side:THREE.DoubleSide,depthTest:true}));mesh.renderOrder=3;scene.add(mesh);
  }
  let orbit=0,drag:number|null=null;const down=(e:PointerEvent)=>{drag=e.clientX;host.setPointerCapture(e.pointerId);};const move=(e:PointerEvent)=>{if(drag===null)return;orbit-=(e.clientX-drag)*.006;drag=e.clientX;};const up=()=>{drag=null;};host.addEventListener('pointerdown',down);host.addEventListener('pointermove',move);host.addEventListener('pointerup',up);host.addEventListener('pointercancel',up);
  const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(host);resize();
  let frame=0,last=0;const smooth={...live.current.pose};
  const render=(now:number)=>{frame=requestAnimationFrame(render);const dt=Math.min(.1,(now-last)/1000);last=now;if(!live.current.visible)return;
   const p=live.current.pose;if(route.mapMode==='regional'&&westElevation(p.x,p.z)===null){setError('No measured elevation at this location. Use the 2D map.');return;}const blend=live.current.walking?1-Math.exp(-dt*9):1;
   smooth.x+=(p.x-smooth.x)*blend;smooth.z+=(p.z-smooth.z)*blend;
   const turn=Math.atan2(Math.sin(p.yaw-smooth.yaw),Math.cos(p.yaw-smooth.yaw));smooth.yaw+=turn*blend;
   const y=(visibleGroundHeight(grounds,smooth.x,smooth.z)??height(smooth.x,smooth.z))+1.7,angle=smooth.yaw+orbit;
   camera.position.set(smooth.x,y,smooth.z);camera.lookAt(smooth.x-Math.sin(angle)*15,y-1.2,smooth.z-Math.cos(angle)*15);renderer.render(scene,camera);
  };frame=requestAnimationFrame(render);
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();host.removeEventListener('pointerdown',down);host.removeEventListener('pointermove',move);host.removeEventListener('pointerup',up);host.removeEventListener('pointercancel',up);scene.traverse(obj=>{if(obj instanceof THREE.Mesh){obj.geometry.dispose();for(const m of Array.isArray(obj.material)?obj.material:[obj.material])m.dispose();}});textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();};
 },[route]);
 return <div className="walk-scene"><div ref={mount} className="walk-scene-canvas" aria-label="First-person Mars walk; drag to look around"/>{error&&<div className="walk-scene-error" role="alert">{error}<button onClick={onMap}>Open 2D map</button></div>}<small className="walk-scene-source">{route.mapMode==='regional'?'HiRISE · terrain reconstruction':'Measured terrain'}</small></div>;
}
