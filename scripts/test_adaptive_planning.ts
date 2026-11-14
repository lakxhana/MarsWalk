import assert from 'node:assert/strict';
import {createElement} from 'react';
import {act,create} from 'react-test-renderer';
import {optimiseTasks,scenarioPlans,investigationOptions,returnDistance,reachableDistance,estimatePace} from '../src/lib/adaptivePlanning';
import {gentlerRoute,terrainStats,segmentSlope} from '../src/lib/terrainAlternatives';
import {namedRoute,reverseRoute} from '../src/lib/jezeroRoutes';
import {DEFAULT_OPERATIONS,operationsReport} from '../src/lib/crewOperations';
import {preflight} from '../src/lib/preflight';
import type {RouteTask} from '../src/lib/fieldworkPlan';
import InvestigationAdvisor from '../src/components/InvestigationAdvisor';
import PlanningOptions from '../src/components/PlanningOptions';
import {getDeliveredUplinkMessages} from '../src/lib/earthMonitoring';
import type {CommMessage} from '../src/lib/storage';
import {writeFileSync} from 'node:fs';
let cases=0;
for(let seed=1;seed<=80;seed++){
 const tasks:RouteTask[]=Array.from({length:8},(_,i)=>({id:`t${i}`,title:`Task ${i}`,minutes:((seed*(i+3)*13)%60+1)/10,priority:(seed+i)%5+1,fraction:(i+1)/8,done:false}));
 const cap=(seed%20)+.3;let best=-1,bestSeconds=Infinity;
 for(let mask=0;mask<256;mask++){let sec=0,score=0;for(let i=0;i<8;i++)if(mask&(1<<i)){sec+=Math.ceil(tasks[i].minutes*60-1e-7);score+=tasks[i].priority!;}if(sec<=Math.floor(cap*60+1e-7)&&(score>best||score===best&&sec<bestSeconds)){best=score;bestSeconds=sec;}}
 const actual=optimiseTasks(tasks,cap);assert.equal(actual.score,best);assert.equal(Math.round(actual.minutes*60),bestSeconds);cases++;
}
const tasks:RouteTask[]=[{id:'a',title:'Context',minutes:4,priority:2,fraction:.3,done:false},{id:'b',title:'Layers',minutes:6,priority:5,fraction:.6,done:false},{id:'c',title:'Destination',minutes:5,priority:4,fraction:1,done:false}];
assert.deepEqual(optimiseTasks(tasks,11).ids,['b','c']);assert.deepEqual(optimiseTasks(tasks,0).ids,[]);assert.deepEqual(optimiseTasks(tasks,NaN).ids,[]);
const route={...namedRoute('skinner-ridge','wildcat-ridge')!,totalDistanceMeters:660,assumedSpeedMps:1.1};
assert.equal(returnDistance(route,330),330);assert.equal(returnDistance({...route,id:'return-demo'},330),330);assert.equal(returnDistance({...route,id:'return-demo'},660),0);
assert.equal(reachableDistance(route,0,1.1,30,120,10,15),660);assert.equal(reachableDistance(route,330,1.1,12,120,10,15),null);
assert.equal(estimatePace([{metres:20,seconds:20},{metres:0,seconds:50}],1.1),1);assert.equal(estimatePace([{metres:3,seconds:3}],1.1),1.1);
const scenario=scenarioPlans(route,tasks,40,10,120,15);assert.ok(scenario[0].capacity<scenario[1].capacity);assert.ok(scenario.every(s=>s.chosen.minutes<=s.capacity));
let selected:RouteTask[]=[];
const planner=create(createElement(PlanningOptions,{route,base:route,tasks:tasks.map(t=>({...t,done:true})),budget:40,reserve:10,endurance:120,oxygenReserve:15,onTasks:t=>{selected=t;},onRoute:()=>{}}));
act(()=>planner.root.findAllByType('button').find(b=>b.children.join('')==='Use suggested tasks')!.props.onClick());
assert.ok(selected.every(t=>!t.done),'a new preflight resets previous completion');
assert.ok(selected.filter(t=>t.selected).reduce((sum,t)=>sum+t.minutes,0)<=10,'previously done tasks cannot bypass new budget');
act(()=>planner.unmount());
const action=investigationOptions(tasks,12,5);assert.equal(action.feasible,true);assert.equal(action.keepAll,false);assert.deepEqual(action.chosen.ids,['b']);assert.equal(investigationOptions(tasks,2,5).feasible,false);
assert.equal(preflight(route,{...DEFAULT_OPERATIONS,routeTasks:tasks.map(t=>({...t,selected:t.id==='b'}))},60,10).observe,6);
let updated=DEFAULT_OPERATIONS;const crew={...DEFAULT_OPERATIONS,missionStart:0,routeTasks:tasks,stops:[{id:'s',started:0,ended:null,limitMinutes:5,destination:'Test'}]};
const ui=create(createElement(InvestigationAdvisor,{crew,now:120,capacity:12,delay:5,onCrew:c=>{updated=c;},returned:false}));
act(()=>ui.root.findByType('select').props.onChange({target:{value:'5'}}));
act(()=>ui.root.findByType('button').props.onClick());assert.equal(updated.decisions?.length,1);assert.equal(updated.stops[0].limitMinutes,7);assert.deepEqual(updated.routeTasks?.filter(t=>t.selected).map(t=>t.id),['b']);
const report=operationsReport(updated,120);assert.equal(report.decisions?.[0].extraMinutes,5);
const packet={direction:'uplink',deliveredAtSimTime:420,statusSnapshot:{operations:report}} as CommMessage;
assert.equal(getDeliveredUplinkMessages([packet],419).length,0);assert.equal(getDeliveredUplinkMessages([packet],420)[0].statusSnapshot?.operations?.decisions?.length,1);act(()=>ui.unmount());
const original=namedRoute('skinner-ridge','wildcat-ridge')!;assert.equal(gentlerRoute(original,15),null,'Default route has terrain above 15 degrees; do not invent a passing path');const alt=gentlerRoute(original,20);assert.ok(alt);assert.deepEqual([alt.points[0].x,alt.points[0].z],[original.points[0].x,original.points[0].z]);assert.deepEqual([alt.points[alt.points.length-1].x,alt.points[alt.points.length-1].z],[original.points[original.points.length-1].x,original.points[original.points.length-1].z]);
assert.ok(terrainStats(alt).maxSlope!<=20);for(let i=1;i<alt.points.length;i++){assert.ok(segmentSlope(alt.points[i-1],alt.points[i])!==null);assert.ok(alt.points[i].distanceFromStart>alt.points[i-1].distanceFromStart);}
assert.equal(gentlerRoute({...original,points:[{...original.points[0],x:1e9},original.points[1]]}),null);
const reversed=reverseRoute(original);assert.equal(returnDistance(reversed,reversed.totalDistanceMeters),0);
writeFileSync('research-data/planner-validation.json',JSON.stringify({description:'Reproducible algorithm checks and illustrative scenario comparison. Not human/Mars validation.',exhaustiveComparisonCases:cases,passed:true,fixture:{distanceMetres:660,speedMps:1.1,budgetMinutes:40,reserveMinutes:10,oxygenEnduranceMinutes:120,oxygenReserveMinutes:15,tasks},scenarios:scenario,terrain:{recordedMetres:original.totalDistanceMeters,modelledMetres:alt.totalDistanceMeters,maxSlope:terrainStats(alt).maxSlope}},null,2)+'\n');
console.log(`PASS ${cases} exhaustive optimiser comparisons, return/pace/coverage, investigation application, delayed Earth decisions and sourced terrain route`);process.exit(0);
