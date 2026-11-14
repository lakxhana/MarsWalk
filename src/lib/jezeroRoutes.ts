import data from './jezeroNamedData.json';
import {lonLatToCropMeters} from './jezeroHiRISE';
import type {RoutePlanSummary} from './routePlanner';
export const JEZERO_SITES=data.sites;
export function namedRoute(startId:string,endId:string):RoutePlanSummary|null {
 const a=data.sites.find(s=>s.id===startId),b=data.sites.find(s=>s.id===endId);if(!a||!b||a.id===b.id)return null;
 let reverse=false,from=a,to=b;if(a.sol>b.sol){from=b;to=a;reverse=true;}
 const coords:number[][]=[from.coordinates];
 // Some NASA segments share a start RMC: later segments extend earlier partial drives.
 // Search the published graph rather than greedily taking the first dead-end segment.
 const find=(rmc:string,seen:Set<string>):typeof data.segments|null=>{
   if(rmc===to.rmc)return [];
   if(seen.has(rmc))return null;
   const visited=new Set(seen);visited.add(rmc);
   for(const segment of data.segments.filter(s=>s.from===rmc)){
     const rest=find(segment.to,visited);if(rest)return [segment,...rest];
   }
   return null;
 };
 const segments=find(from.rmc,new Set());if(!segments)return null;
 for(const segment of segments)coords.push(...segment.coordinates);
 coords.push(to.coordinates);if(reverse)coords.reverse();
 let distance=0;const points:RoutePlanSummary['points']=[];
 for(const c of coords){const p=lonLatToCropMeters(c[0],c[1]);const prev=points[points.length-1];const step=prev?Math.hypot(p.x-prev.x,p.z-prev.z):0;if(prev&&step<0.05)continue;distance+=step;points.push({...p,elevation:c[2],distanceFromStart:distance,segmentSlopeDeg:0,slopeDeg:0});}
 const elevations=points.map(p=>p.elevation);return {id:`nasa-${a.id}-${b.id}`,mapMode:'regional',destinationName:b.name,startName:a.name,success:true,points,totalDistanceMeters:distance,totalSurfaceDistanceMeters:distance,elevationGainMeters:0,elevationLossMeters:0,startElevationMeters:elevations[0],endElevationMeters:elevations[elevations.length-1],minElevationMeters:Math.min(...elevations),maxElevationMeters:Math.max(...elevations),averageSlopePercent:0,averageSlopeDeg:0,maxSlopeDeg:0,estimatedTimeMinutes:Math.ceil(distance/1.1/60),assumedSpeedMps:1.1,maxAllowableSlopeDeg:0,explanation:'NASA recorded rover traverse; crew movement is simulated. Human traversability and slope safety are not assessed.',hasAlternative:false,slopeProfile:{gentlePct:0,moderatePct:0,steepPct:0}};
}
export function sampleRoute(route:import('./routePlanner').WalkRenderRoute,distance:number) {
 const d=Math.max(0,Math.min(distance,route.totalDistanceMeters));let i=1;
 while(i<route.points.length-1&&route.points[i].distanceFromStart<d)i++;
 const a=route.points[i-1],b=route.points[i];const length=b.distanceFromStart-a.distanceFromStart;const t=length>0?(d-a.distanceFromStart)/length:0;
 return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),pitch:0,elevation:(a.elevation??NaN)+((b.elevation??NaN)-(a.elevation??NaN))*t,routeDist:d,nextWpIndex:i,routeId:route.id};
}
export function reverseRoute(route:RoutePlanSummary,distance=route.totalDistanceMeters):RoutePlanSummary {
 const p=sampleRoute(route,distance);const points=[{...p,distanceFromStart:0,segmentSlopeDeg:0,slopeDeg:0},...route.points.filter(q=>q.distanceFromStart<distance).reverse()];let total=0;
 const reversed=points.map((q,i)=>{if(i)total+=Math.hypot(q.x-points[i-1].x,q.z-points[i-1].z);return {...q,distanceFromStart:total};});
 return {...route,id:`return-${route.id}`,points:reversed,startName:route.destinationName,destinationName:route.startName,totalDistanceMeters:total,totalSurfaceDistanceMeters:total,estimatedTimeMinutes:Math.ceil(total/route.assumedSpeedMps/60)};
}
