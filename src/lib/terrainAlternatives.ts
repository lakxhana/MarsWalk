import grid from './jezeroWestElevation.json';
import {lonLatToCropMeters,cropMetersToLonLat} from './jezeroHiRISE';
import {westElevation} from './walkTerrain';
import type {RoutePlanSummary} from './routePlanner';
type Point={x:number;z:number};
const origin=lonLatToCropMeters(grid.west,grid.north),corner=lonLatToCropMeters(grid.east,grid.south);
const dx=(corner.x-origin.x)/grid.cols,dz=(corner.z-origin.z)/grid.rows;
const point=(i:number)=>({x:origin.x+(i%grid.cols+.5)*dx,z:origin.z+(Math.floor(i/grid.cols)+.5)*dz});
function index(p:Point){const g=cropMetersToLonLat(p.x,p.z);if(g.lon<grid.west||g.lon>grid.east||g.lat<grid.south||g.lat>grid.north)return -1;return Math.min(grid.rows-1,Math.floor((g.lat-grid.north)/(grid.south-grid.north)*grid.rows))*grid.cols+Math.min(grid.cols-1,Math.floor((g.lon-grid.west)/(grid.east-grid.west)*grid.cols));}
/** Each edge is checked against available interpolated heights; unknown data is never flat ground. */
export function segmentSlope(a:Point,b:Point):number|null {
 const length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(length/4));let last=westElevation(a.x,a.z),max=0;if(last===null)return null;
 for(let n=1;n<=steps;n++){const h=westElevation(a.x+(b.x-a.x)*n/steps,a.z+(b.z-a.z)*n/steps);if(h===null)return null;if(length>0)max=Math.max(max,Math.atan(Math.abs(h-last)/(length/steps))*180/Math.PI);last=h;}return max;
}
export function terrainStats(route:RoutePlanSummary){let max=0,ascent=0,unknown=false;for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i],s=segmentSlope(a,b);if(s===null){unknown=true;continue;}max=Math.max(max,s);const h0=westElevation(a.x,a.z),h1=westElevation(b.x,b.z);if(h0!==null&&h1!==null)ascent+=Math.max(0,h1-h0);}return {maxSlope:unknown?null:max,ascent:unknown?null:ascent};}
class Heap {a:Array<[number,number]>=[];push(v:[number,number]){this.a.push(v);let i=this.a.length-1;while(i>0){const p=(i-1)>>1;if(this.a[p][0]<=v[0])break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}pop(){const first=this.a[0],last=this.a.pop()!;if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.a[c+1][0]<this.a[c][0])c++;if(this.a[c][0]>=last[0])break;this.a[i]=this.a[c];i=c;}this.a[i]=last;}return first;}}
/** Dijkstra over the bundled west DTM; cost = distance × (1 + 4 × grade). Not a metabolic model. */
export function gentlerRoute(base:RoutePlanSummary,limit=15):RoutePlanSummary|null{
 const start=base.points[0],end=base.points[base.points.length-1];const si=index(start),ei=index(end);if(si<0||ei<0||!Number.isFinite(limit)||limit<=0)return null;
 const count=grid.rows*grid.cols,dist=new Float64Array(count);dist.fill(Infinity);const parent=new Int32Array(count);parent.fill(-1);
 const heap=new Heap();dist[si]=0;heap.push([0,si]);
 const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
 while(heap.a.length){const [cost,i]=heap.pop();if(cost!==dist[i])continue;if(i===ei)break;const row=Math.floor(i/grid.cols),col=i%grid.cols,ha=grid.values[i];if(ha===null)continue;
 for(const [x,y]of dirs){const c=col+x,r=row+y;if(c<0||r<0||c>=grid.cols||r>=grid.rows)continue;const j=r*grid.cols+c,hb=grid.values[j];if(hb===null)continue;
 if(x&&y&&(grid.values[row*grid.cols+c]===null||grid.values[r*grid.cols+col]===null))continue;
 const length=Math.hypot(x*dx,y*dz),grade=Math.abs(hb-ha)/length;
 if(Math.atan(grade)*180/Math.PI>limit)continue;
 const next=cost+length*(1+4*grade);if(next>=dist[j])continue;
 // Check interpolation footprint before accepting this edge.
 const slope=segmentSlope(point(i),point(j));if(slope===null||slope>limit)continue;
 dist[j]=next;parent[j]=i;heap.push([next,j]);}}
 if(!Number.isFinite(dist[ei]))return null;
 const cells:number[]=[];for(let i=ei;i>=0;i=parent[i]){cells.push(i);if(i===si)break;}
 const raw=[start,...cells.reverse().map(point),end];let distance=0;const points:RoutePlanSummary['points']=[];
 for(const p of raw){const last=points[points.length-1],h=westElevation(p.x,p.z);if(h===null)return null;const length=last?Math.hypot(p.x-last.x,p.z-last.z):0;if(last&&length<.01)continue;const slope=last?segmentSlope(last,p):0;if(slope===null||slope>limit)return null;distance+=length;points.push({...p,elevation:h,distanceFromStart:distance,slopeDeg:slope,segmentSlopeDeg:slope});}
 if(points.length<2)return null;
 return {...base,id:`terrain-${base.id}`,points,totalDistanceMeters:distance,totalSurfaceDistanceMeters:distance,estimatedTimeMinutes:distance/base.assumedSpeedMps/60,explanation:`Modelled DTM route; slope-weighted cost, ${limit}° scenario limit. Not a recorded rover path or certified astronaut route.`,maxAllowableSlopeDeg:limit,maxSlopeDeg:Math.max(...points.map(p=>p.slopeDeg))};
}
