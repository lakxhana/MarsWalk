import {isGenerated} from '@/lib/healthDemo';
import {useId} from 'react';
import type {CrewMember} from '@/lib/crewOperations';
import {metricTitle,metricUnit,type SuitMetric} from '@/lib/suitMetrics';
const MARKERS=[
 {key:'bodyTemperature',x:252,y:54,labelY:0,side:'right'},
 {key:'heartRate',x:270,y:149,labelY:38,side:'right'},
 {key:'respiratoryRate',x:229,y:145,labelY:24,side:'left'},
 {key:'bloodOxygen',x:163,y:281,labelY:66,side:'left'},
] as const;
export default function BodyHealthMap({member,selected,onSelect}:{member?:CrewMember;selected:SuitMetric;onSelect:(metric:SuitMetric)=>void}){
 const id=useId().replace(/:/g,'');
 return <div className="body-health-map" aria-label="Body health markers">
  <svg viewBox="0 0 500 500" aria-hidden="true" className="body-diagram">
   <defs><linearGradient id={`${id}-body`} x1="0" x2="1"><stop stopColor="#303c44"/><stop offset=".35" stopColor="#9ba6ae"/><stop offset=".55" stopColor="#69767f"/><stop offset="1" stopColor="#26323b"/></linearGradient><radialGradient id={`${id}-halo`}><stop stopColor="#c58d55" stopOpacity=".12"/><stop offset="1" stopColor="#c58d55" stopOpacity="0"/></radialGradient></defs>
   <ellipse cx="250" cy="241" rx="145" ry="220" fill={`url(#${id}-halo)`}/><ellipse cx="250" cy="465" rx="98" ry="14" fill="none" stroke="#79583e" opacity=".55"/>
   <g fill={`url(#${id}-body)`} stroke="#9ca5a9" strokeWidth="1.4">
    <path d="M236 81L235 99C222 107 207 104 198 117C185 137 181 175 174 204L159 268C154 274 151 286 154 296L158 305L164 303L168 291L174 296L177 291L174 275L193 220L211 161L218 206C216 229 207 250 211 274L224 333L226 398L217 447L216 459C226 465 240 464 242 457L247 397L244 328L250 286L256 328L253 397L258 457C260 464 274 465 284 459L283 447L274 398L276 333L289 274C293 250 284 229 282 206L289 161L307 220L326 275L323 291L326 296L332 291L336 303L342 305L346 296C349 286 346 274 341 268L326 204C319 175 315 137 302 117C293 104 278 107 265 99L264 81Z"/>
    <path d="M232 33C241 23 260 23 269 34L274 54L270 74L263 87C257 94 243 94 237 87L230 74L226 54Z"/>
   </g>
   <g fill="#d8e1e7" fillOpacity=".11" stroke="#c3d0d8" strokeOpacity=".28" strokeWidth=".8">
    <path d="M235 104L247 126L218 133L207 121Z M265 104L253 126L282 133L293 121Z M215 138Q228 128 246 137L243 159Q228 170 216 153Z M285 138Q272 128 254 137L257 159Q272 170 284 153Z"/>
    <path d="M213 128Q204 143 199 176L188 201Q188 164 197 138Z M287 128Q296 143 301 176L312 201Q312 164 303 138Z M186 210L176 260L164 277L175 231Z M314 210L324 260L336 277L325 231Z"/>
    <path d="M219 275L241 283L238 333L228 360L223 325Z M281 275L259 283L262 333L272 360L277 325Z M229 370L239 369L238 408L228 438Z M271 370L261 369L262 408L272 438Z"/>
    {[173,191,209].map(y=><path key={y} d={`M233 ${y}Q239 ${y-4} 246 ${y}V${y+12}Q237 ${y+16} 232 ${y+9}Z M267 ${y}Q261 ${y-4} 254 ${y}V${y+12}Q263 ${y+16} 268 ${y+9}Z`}/>)}
   </g>
   <g fill="none" stroke="#bcc5c8" strokeOpacity=".4" strokeWidth="1.2"><path d="M250 99V230M216 117L244 124M284 117L256 124M220 210Q250 221 280 210M221 231Q250 247 279 231M219 259Q235 273 250 279Q266 273 281 259M229 289L236 350L235 432M271 289L264 350L265 432M205 130L188 204L165 277M295 130L312 204L335 277"/>{[137,149,161,173,185].map(y=><path key={y} d={`M246 ${y}Q231 ${y-6} 219 ${y+2}M254 ${y}Q269 ${y-6} 281 ${y+2}`}/>)}</g>
   <g className={selected==='respiratoryRate'?'body-organ selected':'body-organ'} fill="#b8cad8" fillOpacity=".22" stroke="#b8cad8" strokeWidth="1.5"><path d="M242 130C226 126 215 146 216 173Q227 187 240 172Z"/><path d="M258 130C274 126 285 146 284 173Q273 187 260 172Z"/><path d="M250 111V137M250 133L239 145M250 133L261 145" fill="none"/></g>
   <path className={selected==='heartRate'?'body-organ selected':'body-organ'} d="M259 144C254 133 242 139 247 152C251 163 263 169 267 174C274 163 280 155 276 147C272 140 263 140 259 144Z" fill="#c38968" fillOpacity=".8" stroke="#f3c391" strokeWidth="1.5"/>
   {MARKERS.map(m=><g key={m.key}><path d={`M${m.x} ${m.y}H${m.side==='left'?185:315}L${m.side==='left'?149:351} ${m.labelY*5+24}`} fill="none" stroke={selected===m.key?'#f3c391':'#83705d'} strokeWidth="1.3"/><g className="body-dot" onClick={()=>onSelect(m.key)}><circle cx={m.x} cy={m.y} r="23" fill="transparent"/><circle cx={m.x} cy={m.y} r={selected===m.key?13:9} fill="#17110e" stroke={selected===m.key?'#f3c391':'#c8b6a3'} strokeWidth="2"/><circle cx={m.x} cy={m.y} r="3.5" fill="#f8f0e7"/></g></g>)}
  </svg>
  {MARKERS.map(m=>{const reading=member?.health?.[m.key];return <button key={m.key} type="button" aria-label={`${metricTitle(m.key)}: ${reading?`${reading.value} ${metricUnit(m.key)}`:'No reading'}`} className={`body-marker-label ${m.side}`} style={{top:`${m.labelY}%`}} aria-pressed={selected===m.key} onClick={()=>onSelect(m.key)}><span>{metricTitle(m.key)}</span><strong>{reading?reading.value:'—'}</strong><em>{metricUnit(m.key)}</em><small>{isGenerated(reading?.record)?'Demo · generated':reading?.source==='replay'?'Reference replay':reading?.source==='manual'?'Manual':reading?'Sample':'No reading'}</small></button>;})}
  <span className="body-map-caption">Illustrative body map</span>
 </div>;
}
