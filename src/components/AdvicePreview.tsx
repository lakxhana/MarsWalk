import {adviceArrival,type AdviceContext} from '@/lib/adviceTiming';
import {formatSimLMST} from '@/lib/commManager';
export default function AdvicePreview({context,now,delay}:{context:AdviceContext|null;now:number;delay:number}){
 if(!context)return <p className="delivery-note">A crew report is needed to link advice to a plan.</p>;
 const timing=adviceArrival(context,now,delay);
 return <div className={`advice-preview ${timing.late?'attention':''}`} role="status"><strong>{timing.late?'May arrive after departure':'Advice arrival check'}</strong><p>{context.destinationName} · Plan {context.planVersion}</p><p>Arrives {formatSimLMST(timing.arrivesAt)}</p>{timing.departureAt!==undefined?<p>{context.expiryBasis==='stop-limit'?'Stop limit':'Estimated departure'} {formatSimLMST(timing.departureAt)}</p>:<p>Departure time unknown</p>}<details><summary>How calculated</summary><p>Arrival = send time + {delay} min signal delay.</p><p>{context.expiryBasis==='stop-limit'?'Advice window ends at the reported stop start plus its allowed duration.':'Departure estimate = report time + remaining travel + pending observation minutes.'}</p><p>Based on report {formatSimLMST(context.basedOnCapturedAt)}. Crew changes may make this advice outdated.</p></details></div>;
}
