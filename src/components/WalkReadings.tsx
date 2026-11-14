import {useMemo} from 'react';
import {walkReadings} from '@/lib/walkReadings';
import {JEZERO_WEATHER} from '@/lib/weather';
import type {ObservationRecord} from '@/lib/storage';

const distanceLabel=(metres:number)=>metres>=1000?`${(metres/1000).toFixed(1)} km`:`${Math.round(metres)} m`;
export default function WalkReadings({position,regional,slopeLimit,observations,now}:{position:{x:number;z:number};regional:boolean;slopeLimit:number;observations:ObservationRecord[];now:number}){
 const {x,z}=position;
 const r=useMemo(()=>walkReadings({x,z},regional,slopeLimit,observations,now),[x,z,regional,slopeLimit,observations,now]);
 return <section className="walk-readings" aria-label="Terrain and science readings">
  <div className="walk-readings-group">
   <span className="readings-caption">At your position</span>
   <dl>
    <div><dt>Terrain</dt><dd>{r.terrain.slope===null?'No coverage':`${r.terrain.slope.toFixed(1)}° slope`}</dd></div>
    <div><dt>Elevation</dt><dd>{r.terrain.elevation===null?'No coverage':`${Math.round(r.terrain.elevation)} m`}</dd></div>
    <div className={r.slopeAlert?'readings-alert':''}><dt>Hazards</dt><dd>{r.hazard}</dd></div>
   </dl>
  </div>
  <div className="walk-readings-group">
   <span className="readings-caption">{r.nearest?`${r.nearest.site.name} · ${distanceLabel(r.nearest.distance)} away`:'Site context unavailable'}</span>
   <dl>
    <div><dt>Geology</dt><dd>{r.science?.shortGeology??'Not mapped'}</dd></div>
    <div><dt>History</dt><dd>{r.science?.shortActivity??(r.nearest?`Rover · sol ${r.nearest.site.sol}`:'No record')}</dd></div>
    <div><dt>Observations</dt><dd>{r.recordCount} saved{r.nearestRecord!==null&&<small>Nearest {distanceLabel(r.nearestRecord)}</small>}</dd></div>
   </dl>
  </div>
  <div className="walk-readings-group">
   <span className="readings-caption">MEDA · archived sol {JEZERO_WEATHER.sol}</span>
   <dl>
    <div><dt>Temperature</dt><dd>{r.temperature}</dd></div>
    <div><dt>Pressure</dt><dd>{r.pressure}</dd></div>
   </dl>
  </div>
 </section>;
}
