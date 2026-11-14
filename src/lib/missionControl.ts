import type {WalkRenderRoute} from './routePlanner';

// Reconstruct display geometry from a received packet only. This never plans a route.
export function receivedWalkRoute(points:Array<{x:number;z:number}>,id:string,mapMode?:'regional'):WalkRenderRoute|null {
 if(points.length<2||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.z)))return null;
 let distance=0;
 const sampled=points.map((p,i)=>{if(i)distance+=Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z);return {...p,distanceFromStart:distance};});
 if(distance<=0)return null;
 return {id,mapMode,totalDistanceMeters:distance,points:sampled};
}
