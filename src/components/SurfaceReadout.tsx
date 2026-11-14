import {useMemo} from 'react';
import {surfaceAt} from '@/lib/surfaceContext';
import {weatherRange,JEZERO_WEATHER,WEATHER_SOURCE} from '@/lib/weather';

export default function SurfaceReadout({position,regional=false,slopeLimit,reported=false}:{position?:{x:number;z:number}|null;regional?:boolean;slopeLimit?:number;reported?:boolean}){
 const x=position?.x,z=position?.z;
 const terrain=useMemo(()=>x===undefined||z===undefined?null:surfaceAt(x,z,regional),[x,z,regional]);
 const slope=terrain?.slope;
 const over=slope!=null&&slopeLimit!=null&&slopeLimit>0&&slope>slopeLimit;
 return <details className="surface-readout sidebar-section" aria-label="Surface conditions"><summary>Surface conditions</summary><header><small>{!position?'Waiting for position':reported?'At reported position':'At crew position'}</small></header>
  <dl className="instrument-rows">
   <div><dt>Temperature</dt><dd>{weatherRange()}<small>Archived air range</small></dd></div>
   <div><dt>Elevation</dt><dd>{terrain?.elevation==null?'—':`${terrain.elevation.toFixed(0)} m`}</dd></div>
   <div><dt>Slope</dt><dd>{slope==null?'—':`${slope.toFixed(1)}°`}</dd></div>
   <div className={over?'attention':''}><dt>Terrain alert</dt><dd>{over?'Above set slope limit':slope==null?'No terrain coverage':'Small hazards unresolved'}</dd></div>
   <div><dt>Wind / dust</dt><dd>No current feed</dd></div>
  </dl>
  <details className="source-disclosure"><summary>Data sources</summary><p>MEDA sol {JEZERO_WEATHER.sol} · {JEZERO_WEATHER.terrestrial_date}. Historical daily range, not live local weather.</p><a href={WEATHER_SOURCE} target="_blank" rel="noreferrer">Temperature ↗</a>{terrain&&<><p>HiRISE DTM · ~{terrain.spacing.toFixed(1)} m grid. Rocks and loose ground are not resolved.</p><a href={terrain.source} target="_blank" rel="noreferrer">Terrain ↗</a></>}</details>
 </details>;
}
