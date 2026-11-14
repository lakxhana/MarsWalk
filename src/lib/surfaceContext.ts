import grid from './jezeroWestElevation.json';
import {westElevation} from './walkTerrain';
import {getMeasuredElevation,getMeasuredSlopeDeg,MISSING_DATA_VALUE,MEASURED_DTM_METADATA} from './jezeroMeasuredElevation';
import {lonLatToCropMeters} from './jezeroHiRISE';
export function gradientDegrees(e:number|null,w:number|null,n:number|null,s:number|null,dx:number,dz:number){
 if(e===null||w===null||n===null||s===null||![e,w,n,s,dx,dz].every(Number.isFinite)||dx<=0||dz<=0)return null;
 return Math.atan(Math.hypot((e-w)/(2*dx),(s-n)/(2*dz)))*180/Math.PI;
}
export function surfaceAt(x:number,z:number,regional:boolean){
 if(!regional){const elevation=getMeasuredElevation(x,z);return {elevation:elevation===MISSING_DATA_VALUE?null:elevation,slope:getMeasuredSlopeDeg(x,z),spacing:MEASURED_DTM_METADATA.gridSpacingMeters,source:MEASURED_DTM_METADATA.sourceUrl};}
 const a=lonLatToCropMeters(grid.west,grid.north),b=lonLatToCropMeters(grid.east,grid.south);
 const dx=(b.x-a.x)/grid.cols,dz=(b.z-a.z)/grid.rows;
 return {elevation:westElevation(x,z),slope:gradientDegrees(westElevation(x+dx,z),westElevation(x-dx,z),westElevation(x,z-dz),westElevation(x,z+dz),dx,dz),spacing:Math.max(dx,dz),source:grid.source};
}
export const SITE_SCIENCE:Record<string,{geology:string;activity:string;url:string}>={
 'Skinner Ridge':{geology:'Layered sandstone; coarser grains than Wildcat Ridge.',activity:'Perseverance abraded rock on sol 482 (29 June 2022).',url:'https://science.nasa.gov/resource/two-abrasion-patches-from-perseverance-at-jezero-delta/'},
 'Wildcat Ridge':{geology:'Fine-grained, sulfate-bearing mudstone.',activity:'Perseverance abraded rock on sol 504 (21 July 2022).',url:'https://science.nasa.gov/resource/two-abrasion-patches-from-perseverance-at-jezero-delta/'}
};
