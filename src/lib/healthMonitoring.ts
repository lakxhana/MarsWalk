export const METRICS = {
 heartRate:{label:'Heart rate',unit:'bpm',min:0,max:300},
 bodyTemperature:{label:'Body temperature',unit:'°C',min:20,max:50},
 suitPressure:{label:'Suit pressure',unit:'kPa',min:0,max:150},
 oxygenPartialPressure:{label:'Suit O₂ partial pressure',unit:'kPa',min:0,max:150},
 co2PartialPressure:{label:'Suit CO₂ partial pressure',unit:'kPa',min:0,max:20},
 airTemperature:{label:'Outside air temperature',unit:'°C',min:-150,max:60},
} as const;
export type MetricId = keyof typeof METRICS;
export interface HealthReading {metric:MetricId;value:number;capturedAt:number;source:'manual';low:number|null;high:number|null;}
export type HealthReadings = Partial<Record<MetricId,HealthReading>>;
export function readingState(reading:HealthReading|undefined,now:number):'missing'|'stale'|'low'|'high'|'recorded' {
 if(!reading)return 'missing';if(now-reading.capturedAt>60)return 'stale';
 if(reading.low!==null&&reading.value<reading.low)return 'low';if(reading.high!==null&&reading.value>reading.high)return 'high';return 'recorded';
}
export function validateReading(metric:MetricId,value:number,low:number|null,high:number|null):boolean {
 const m=METRICS[metric];return Number.isFinite(value)&&value>=m.min&&value<=m.max&&(low===null||Number.isFinite(low))&&(high===null||Number.isFinite(high))&&(low===null||high===null||low<high);
}
// No default medical alarm limits: those require crew/suit-specific approved settings.
export function healthWarnings(readings:HealthReadings,now:number):string[] {
 return Object.values(readings).flatMap(r=>{const state=readingState(r,now);return state==='low'||state==='high'?[`${METRICS[r.metric].label}: above/below configured limit`.replace('above/below',state==='low'?'below':'above')]:[];});
}
