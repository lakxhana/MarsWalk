import {JEZERO_SITES} from './jezeroRoutes';
import {lonLatToCropMeters} from './jezeroHiRISE';
import {SITE_SCIENCE,surfaceAt} from './surfaceContext';
import {JEZERO_WEATHER} from './weather';
import type {ObservationRecord} from './storage';

/** Geographic context only. Site geology is never presented as a surface classification. */
export function walkReadings(position:{x:number;z:number},regional:boolean,slopeLimit:number,observations:ObservationRecord[],now:number){
 const terrain=surfaceAt(position.x,position.z,regional);
 const nearest=JEZERO_SITES.map(site=>{const p=lonLatToCropMeters(site.coordinates[0],site.coordinates[1]);return {site,distance:Math.hypot(p.x-position.x,p.z-position.z)};}).sort((a,b)=>a.distance-b.distance)[0];
 const science=nearest?SITE_SCIENCE[nearest.site.name]:undefined;
 const records=observations.filter(o=>!o.imageIsArchival&&(o.createdAtSimTime??0)<=now&&Number.isFinite(o.location.x)&&Number.isFinite(o.location.z));
 const nearestRecord=records.reduce<number|null>((distance,o)=>{const d=Math.hypot(o.location.x!-position.x,o.location.z!-position.z);return distance===null?d:Math.min(d,distance);},null);
 return {terrain,nearest,science,recordCount:records.length,nearestRecord,
  hazard:terrain.slope===null?'No terrain coverage':slopeLimit>0&&terrain.slope>slopeLimit?'Slope limit exceeded':'Small hazards unresolved',
  slopeAlert:terrain.slope!==null&&slopeLimit>0&&terrain.slope>slopeLimit,
  temperature:`${JEZERO_WEATHER.min_temp} to ${JEZERO_WEATHER.max_temp} °C`,
  pressure:typeof JEZERO_WEATHER.pressure==='number'?`${JEZERO_WEATHER.pressure.toFixed(1)} Pa`:'No reading'};
}
