import {ArrowLeft,ExternalLink} from 'lucide-react';
import {DATA_MANIFEST} from '@/lib/dataManifest';
import {JEZERO_WEATHER,WEATHER_SOURCE} from '@/lib/weather';
import {SITE_SCIENCE} from '@/lib/surfaceContext';
const source=(id:string)=>DATA_MANIFEST.find(item=>item.id===id)!.officialSourceUrl;
const rows=[
 {name:'Globe',data:'NASA / USGS · Viking MDIM 2.1',use:'Global overview · displayed texture 4096 × 2048',limit:'Overview only; coarser than the 232 m source.',url:source('nasa-viking-mdim')},
 {name:'Map & 3D',data:'NASA Mars Trek · HiRISE mosaic',use:'Western Jezero · bundled regional and detail imagery',limit:'Orbital reconstruction, not ground-level photography.',url:source('jezero-imagery-active')},
 {name:'Elevation & slope',data:'HiRISE / USGS · western Jezero DTM',use:'385 × 257 grid · approximately 11–13 m spacing',limit:'Slope comes from neighbouring elevations; small obstacles are unresolved.',url:source('jezero-west-active')},
 {name:'Routes & history',data:'NASA / JPL · Perseverance traverse',use:'Named rover positions and recorded path segments',limit:'Crew travel is simulated; human traversability is not validated.',url:source('jezero-traverse-active')},
 {name:'Geology',data:'NASA · Skinner Ridge / Wildcat Ridge',use:'Nearest documented site, with distance',limit:'Site context, not classification of the ground underfoot.',url:SITE_SCIENCE['Wildcat Ridge'].url},
 {name:'Temperature & pressure',data:`MEDA · sol ${JEZERO_WEATHER.sol} · ${JEZERO_WEATHER.terrestrial_date}`,use:`Air ${JEZERO_WEATHER.min_temp} to ${JEZERO_WEATHER.max_temp} °C · ${JEZERO_WEATHER.pressure} Pa`,limit:'Archived daily summary at the rover; no live weather or spatial prediction.',url:WEATHER_SOURCE},
 {name:'Hazards',data:'Terrain slope + configured route limit',use:'Flags slopes above the selected limit, where elevation exists',limit:'No current dust, wind, radiation or small-rock detection.',url:source('jezero-west-active')},
 {name:'Observations',data:'Crew notes, photos and audio',use:'Stored with position, mission time and delivery time',limit:'User records; not automatically verified scientific findings.'},
 {name:'Time & oxygen',data:'MARSWalk planning model · NASA BVAD baseline',use:'Distance ÷ pace; stops + return + reserve. O₂ endurance decreases with elapsed time.',limit:'Pace and endurance are scenario inputs, not suit sensor readings.',url:source('astronaut-kinematics')},
 {name:'Health & suit',data:'Manual readings / generated demo / optional BIDMC replay',use:'Heart rate, breathing, blood oxygen and suit measurements',limit:'Demo values are synthetic. BIDMC is hospital data, not astronaut data.',url:'https://physionet.org/content/bidmc/1.0.0/'},
 {name:'3D suit',data:'DigitalSpace Corporation · NASA 3D Resources',use:'Educational reference model · notices included',limit:'Not a verified Mars spacesuit design.',url:'https://science.nasa.gov/3d-resources/astronaut/'},
 {name:'Legacy east crop',data:'HiRISE · separate from the western named routes',use:'2560² image at ~1.01 m/pixel · elevation at ~8.08 m spacing',limit:'JPEG-derived gap mask is approximate; source nulls may be lost.',url:source('hirise-dtm')},
];
export default function SourcesAndCoverageView({onBackToPlan}:{onBackToPlan?:()=>void}){
 return <div className="coverage-view"><div className="coverage-content">
  <header>{onBackToPlan&&<button aria-label="Back to plan" onClick={onBackToPlan}><ArrowLeft size={20}/></button>}<h1>Data & coverage</h1></header>
  <ul className="coverage-list">{rows.map(row=><li key={row.name}>
   <h2>{row.name}</h2><div><strong>{row.data}</strong><p>{row.use}</p><p className="coverage-limit">{row.limit}</p></div>
   {row.url&&<a href={row.url} target="_blank" rel="noreferrer" aria-label={`${row.name} source`}>Source <ExternalLink size={13}/></a>}
  </li>)}</ul>
  <footer>Equations, product IDs and processing steps: DATA-AND-CALCULATIONS.md · research-data/</footer>
 </div></div>;
}
