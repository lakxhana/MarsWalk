import {useMemo,useState,type RefObject} from 'react';
import {surfaceAt,SITE_SCIENCE} from '@/lib/surfaceContext';
import {JEZERO_SITES} from '@/lib/jezeroRoutes';
import {cropMetersToLonLat} from '@/lib/jezeroHiRISE';
import {JEZERO_WEATHER,weatherRange,WEATHER_SOURCE} from '@/lib/weather';
import type {RoutePlanSummary} from '@/lib/routePlanner';
import type {ObservationRecord} from '@/lib/storage';
const TABS=['Terrain','Geology','Observations','History','Environment','Hazards'] as const;
export default function SurfaceContext({route,pose,observations,now,expanded,onExpandedChange,containerRef}:{route:RoutePlanSummary;pose:{x:number;z:number};observations:ObservationRecord[];now:number;expanded?:boolean;onExpandedChange?:(open:boolean)=>void;containerRef?:RefObject<HTMLDetailsElement>}){
 const [tab,setTab]=useState<typeof TABS[number]>('Terrain');
 const terrain=useMemo(()=>surfaceAt(pose.x,pose.z,route.mapMode==='regional'),[pose.x,pose.z,route.mapMode]);
 const geo=cropMetersToLonLat(pose.x,pose.z),science=SITE_SCIENCE[route.destinationName??''];
 const site=JEZERO_SITES.find(s=>s.name===route.destinationName);
 const notes=observations.filter(o=>(o.createdAtSimTime??0)<=now&&o.location.x!==undefined&&o.location.z!==undefined).map(o=>({o,d:Math.hypot(o.location.x!-pose.x,o.location.z!-pose.z)})).sort((a,b)=>a.d-b.d).slice(0,5);
 return <details ref={containerRef} className="surface-context" open={expanded} onToggle={e=>onExpandedChange?.(e.currentTarget.open)}><summary>Terrain & science</summary>
 <div className="surface-tabs" aria-label="Surface information categories">{TABS.map(t=><button type="button" aria-pressed={tab===t} key={t} onClick={()=>setTab(t)}>{t}</button>)}</div>
 <section className="surface-information" aria-label={tab}>
 {tab==='Terrain'&&<><h3>Terrain & elevation</h3><p>{geo.lat.toFixed(5)}° N · {geo.lon.toFixed(5)}° E</p><dl><div><dt>Elevation</dt><dd>{terrain.elevation===null?'No coverage':`${terrain.elevation.toFixed(1)} m`}</dd></div><div><dt>Terrain slope</dt><dd>{terrain.slope===null?'No coverage':`${terrain.slope.toFixed(1)}°`}</dd></div></dl><small>HiRISE DTM · MOLA reference · ~{terrain.spacing.toFixed(1)} m sampling</small><a href={terrain.source} target="_blank" rel="noreferrer">Terrain source ↗</a></>}
 {tab==='Hazards'&&<><h3>Potential hazards</h3><p>{terrain.slope===null?'Terrain gradient unavailable.':route.maxAllowableSlopeDeg>0&&terrain.slope>route.maxAllowableSlopeDeg?`Above your ${route.maxAllowableSlopeDeg}° route limit.`:'Slope is a terrain estimate, not a safety clearance.'}</p><p>Small rocks, loose ground and current dust hazards are not resolved.</p><a href={terrain.source} target="_blank" rel="noreferrer">Terrain source ↗</a></>}
 {tab==='Geology'&&<><h3>Geology · {route.destinationName}</h3><p>{science?.geology??'No site-specific geology bundled for this destination.'}</p>{science&&<a href={science.url} target="_blank" rel="noreferrer">NASA interpretation ↗</a>}<small>Destination context; not a ground classification at your position.</small></>}
 {tab==='History'&&<><h3>Previous mission activity</h3><p>{science?.activity??'See the archived rover location below.'}</p>{site&&<p>{site.name} · rover location on sol {site.sol}</p>}<a href="https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json" target="_blank" rel="noreferrer">NASA rover locations ↗</a></>}
 {tab==='Observations'&&<><h3>Scientific observations</h3>{notes.length?notes.map(({o,d})=><article key={o.id}><strong>{o.siteName} · {Math.round(d)} m away</strong><p>{o.note||'Attachment recorded'}</p>{o.imageRef&&<a href={o.imageRef} target="_blank" rel="noreferrer">Photo ↗</a>}{o.audioRef&&<audio controls src={o.audioRef}/>}</article>):<p>No nearby crew records yet. Use Record to add a note, photo or audio.</p>}</>}
 {tab==='Environment'&&<><h3>Environment & temperature</h3><p>Air {weatherRange()}</p><small>MEDA sol {JEZERO_WEATHER.sol} · {JEZERO_WEATHER.terrestrial_date} · archived daily range</small><p>Pressure: {typeof JEZERO_WEATHER.pressure==='number'?`${JEZERO_WEATHER.pressure} Pa`:'not reported for this sol'}</p><p>No current wind or dust feed connected.</p><a href={WEATHER_SOURCE} target="_blank" rel="noreferrer">Weather source ↗</a></>}
 </section></details>;
}
