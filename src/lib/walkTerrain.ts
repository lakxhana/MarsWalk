import grid from './jezeroWestElevation.json';
import {cropMetersToLonLat} from './jezeroHiRISE';
export function westElevation(x:number,z:number):number|null {
 const {lon,lat}=cropMetersToLonLat(x,z);
 if(lon<grid.west||lon>grid.east||lat<grid.south||lat>grid.north)return null;
 // The imported raster values are cell-centred, not samples at the outer bounds.
 const c=Math.max(0,Math.min(grid.cols-1,(lon-grid.west)/(grid.east-grid.west)*grid.cols-.5));
 const r=Math.max(0,Math.min(grid.rows-1,(grid.north-lat)/(grid.north-grid.south)*grid.rows-.5));
 const c0=Math.floor(c),r0=Math.floor(r),c1=Math.min(c0+1,grid.cols-1),r1=Math.min(r0+1,grid.rows-1);
 const a=grid.values[r0*grid.cols+c0],b=grid.values[r0*grid.cols+c1],d=grid.values[r1*grid.cols+c0],e=grid.values[r1*grid.cols+c1];
 if(a===null||b===null||d===null||e===null)return null;
 const top=a+(b-a)*(c-c0),bottom=d+(e-d)*(c-c0);return top+(bottom-top)*(r-r0);
}
