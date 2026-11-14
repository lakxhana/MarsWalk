import type {WalkRenderRoute} from './routePlanner';
export interface RenderedGround {x:number;z:number;width:number;height:number;cols:number;rows:number;heights:Float32Array;valid:boolean[]}
/** Interpolate the actual PlaneGeometry triangles, including each imagery layer's offset. */
export function groundHeight(g:RenderedGround,x:number,z:number):number|null {
 const u=(x-g.x+g.width/2)/g.width*g.cols,v=(z-g.z+g.height/2)/g.height*g.rows;
 if(u<0||v<0||u>g.cols||v>g.rows)return null;
 const c=Math.min(g.cols-1,Math.floor(u)),r=Math.min(g.rows-1,Math.floor(v)),s=u-c,t=v-r;
 const a=r*(g.cols+1)+c,b=a+1,d=a+g.cols+1,e=d+1;
 const ids=s+t<=1?[a,b,d]:[e,b,d];if(ids.some(i=>!g.valid[i]))return null;
 return s+t<=1?g.heights[a]+s*(g.heights[b]-g.heights[a])+t*(g.heights[d]-g.heights[a]):g.heights[e]+(1-s)*(g.heights[d]-g.heights[e])+(1-t)*(g.heights[b]-g.heights[e]);
}
export function visibleGroundHeight(grounds:RenderedGround[],x:number,z:number){const values=grounds.map(g=>groundHeight(g,x,z)).filter((n):n is number=>n!==null);return values.length?Math.max(...values):null;}
export function routeGuideGeometry(route:WalkRenderRoute,grounds:RenderedGround[],halfWidth=.14,lift=.18){
 const positions:number[]=[],indices:number[]=[],points:Array<{x:number;z:number}>=[];
 const step=Math.max(.5,route.totalDistanceMeters/20000);
 for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i];const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/step));for(let j=0;j<n;j++)points.push({x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n});}
 points.push(route.points[route.points.length-1]);
 const valid:boolean[]=[];
 points.forEach((p,i)=>{const next=points[Math.min(i+1,points.length-1)],prev=points[Math.max(0,i-1)];const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1;let ok=true;
  for(const side of [-1,1]){const x=p.x+dz/len*halfWidth*side,z=p.z-dx/len*halfWidth*side,y=visibleGroundHeight(grounds,x,z);if(y===null)ok=false;positions.push(x,(y??0)+lift,z);}valid.push(ok);
 });
 // Subsegments through a data gap are omitted, never drawn across unknown ground.
 for(let i=0;i<points.length-1;i++){if(!valid[i]||!valid[i+1]||visibleGroundHeight(grounds,(points[i].x+points[i+1].x)/2,(points[i].z+points[i+1].z)/2)===null)continue;const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
 return {positions,indices,points};
}
