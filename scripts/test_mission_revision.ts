import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {act,create} from 'react-test-renderer';
import * as THREE from 'three';
import {compareMission,type ComparisonInput} from '../src/lib/planComparison';
import {adviceFromReport,adviceArrival,assessAdvice,hasOperationalPlanChange} from '../src/lib/adviceTiming';
import {messagesForSide} from '../src/lib/missionMessages';
import {operationsReport,DEFAULT_OPERATIONS} from '../src/lib/crewOperations';
import {groundHeight,visibleGroundHeight,routeGuideGeometry,type RenderedGround} from '../src/lib/surfaceGuide';
import {namedRoute,JEZERO_SITES} from '../src/lib/jezeroRoutes';
import {westElevation} from '../src/lib/walkTerrain';
import {lonLatToCropMeters} from '../src/lib/jezeroHiRISE';
import imagery from '../src/lib/jezeroWestImagery.json';
import detail from '../src/lib/jezeroDetailImagery.json';
import type {MissionStatusSnapshot,CommMessage} from '../src/lib/storage';
import type {HealthReadings} from '../src/lib/healthMonitoring';
import PlanComparison from '../src/components/PlanComparison';
import HealthMonitor from '../src/components/HealthMonitor';
import CrewTelemetry from '../src/components/CrewTelemetry';
import MissionConversation from '../src/components/MissionConversation';
import EarthTeamMonitoring from '../src/components/EarthTeamMonitoring';
import NamedSitePlanner from '../src/components/NamedSitePlanner';
const tasks=[{id:'a',title:'Context photo',fraction:.2,minutes:4,priority:2,done:false},{id:'b',title:'Layer study',fraction:.6,minutes:6,priority:5,done:false},{id:'c',title:'Destination record',fraction:1,minutes:5,priority:3,done:false}];
const input:ComparisonInput={outwardMinutes:10,returnMinutes:10,budgetMinutes:43,oxygenMinutes:90,reserveMinutes:10,oxygenReserveMinutes:15,tasks};
const example=compareMission(input,5);assert.equal(example.capacityMinutes,8);assert.deepEqual(example.fixed.ids,['a']);assert.deepEqual(example.adaptive.ids,['b']);assert.equal(example.fixed.returnAtMinutes,29);assert.equal(example.adaptive.returnAtMinutes,31);assert.equal(example.adaptive.oxygenAtReturn,59);assert.equal(example.adaptive.missionMargin,2);
let comparisons=0;
for(let seed=1;seed<=120;seed++){
 const candidates=Array.from({length:8},(_,i)=>({id:`t${i}`,title:`Observation ${i}`,fraction:(i+1)/8,minutes:((seed*(i+7)*11)%80+1)/10,priority:(seed+i)%5+1,done:false}));
 const values={...input,tasks:candidates,budgetMinutes:25+seed%30,oxygenMinutes:30+seed%60};const extra=seed%7;
 const r=compareMission(values,extra,seed%2?.7:1);let best=0,bestSeconds=0;
 if(r.feasible)for(let mask=0;mask<256;mask++){let cost=0,score=0;for(let i=0;i<8;i++)if(mask&(1<<i)){cost+=Math.ceil(candidates[i].minutes*60-1e-7);score+=candidates[i].priority;}if(cost<=Math.round(r.capacityMinutes*60)&&(score>best||score===best&&cost<bestSeconds)){best=score;bestSeconds=cost;}}
 assert.equal(r.adaptive.score,best);assert.equal(Math.round(r.adaptive.observeMinutes*60),bestSeconds);
 if(r.feasible){assert.ok(r.fixed.missionMargin>=-1e-8&&r.fixed.oxygenMargin>=-1e-8);assert.ok(r.adaptive.missionMargin>=-1e-8&&r.adaptive.oxygenMargin>=-1e-8);assert.ok(r.adaptive.score>=r.fixed.score);}
 comparisons++;
}
assert.equal(compareMission({...input,budgetMinutes:15}).feasible,false);assert.equal(compareMission({...input,tasks:[{...tasks[0],minutes:NaN}]}).valid,false);
let applied:string[]=[];const ui=create(createElement(PlanComparison,{input,onApply:ids=>{applied=ids;}}));
act(()=>ui.root.findByProps({'aria-label':'Extra investigation'}).props.onChange({target:{value:'5'}}));
act(()=>ui.root.findAllByType('button').find(b=>b.children.join('')==='Apply suggested tasks')!.props.onClick());assert.deepEqual(applied,['b']);act(()=>ui.unmount());
const planner=create(createElement(NamedSitePlanner,{onStart:()=>{}}));act(()=>planner.root.findAllByType('button').find(b=>b.children.join('').startsWith('Compare plans'))!.props.onClick());assert.equal(planner.root.findAllByType(PlanComparison).length,1);act(()=>planner.unmount());
const health:HealthReadings={heartRate:{metric:'heartRate',value:88,capturedAt:100,source:'manual',low:null,high:null},respiratoryRate:{metric:'respiratoryRate',value:18,capturedAt:100,source:'manual',low:null,high:null}};
const op=operationsReport({...DEFAULT_OPERATIONS,missionStart:0,health,routeTasks:tasks,stops:[{id:'stop-a',started:100,ended:null,limitMinutes:5,destination:'Wildcat Ridge'}]},100);
const snapshot:MissionStatusSnapshot={missionId:'m',planVersion:2,planSummary:'Recorded traverse',destinationName:'Wildcat Ridge',capturedAtSimTime:100,position:{x:0,z:0},coordinateReference:'Fixture',missionElapsedSeconds:100,missionBudgetMinutes:60,reserveMinutes:10,returnEstimateMinutes:2,movementState:'Investigating',operations:op,comparison:input};
assert.equal(hasOperationalPlanChange(DEFAULT_OPERATIONS,{...DEFAULT_OPERATIONS,health}),false);assert.equal(hasOperationalPlanChange(DEFAULT_OPERATIONS,{...DEFAULT_OPERATIONS,oxygenMinutes:80}),true);assert.equal(hasOperationalPlanChange({...DEFAULT_OPERATIONS,routeTasks:tasks},{...DEFAULT_OPERATIONS,routeTasks:tasks.map(t=>({...t,done:true}))}),false);assert.equal(hasOperationalPlanChange({...DEFAULT_OPERATIONS,routeTasks:tasks},{...DEFAULT_OPERATIONS,routeTasks:tasks.map(t=>({...t,selected:false}))}),true);
const context=adviceFromReport(snapshot)!;assert.equal(context.validUntilSimTime,400);assert.equal(adviceArrival(context,200,5).arrivesAt,500);assert.equal(adviceArrival(context,200,5).late,true);assert.equal(adviceArrival(context,100,0).late,false);assert.equal(adviceArrival(context,400,0).late,true,'deadline boundary expires');
assert.equal(assessAdvice(context,snapshot,399).requiresReview,false);assert.ok(assessAdvice(context,{...snapshot,planVersion:3},399).reasons.includes('Plan changed'));assert.ok(assessAdvice(context,{...snapshot,operations:{...op,stop:{...op.stop!,ended:200}}},250).reasons.includes('Investigation stop ended'));assert.ok(assessAdvice(context,{...snapshot,missionId:'new'},250).requiresReview);
assert.equal(adviceArrival({...context,validUntilSimTime:undefined},100,5).marginSeconds,null);
const walking={...snapshot,movementState:'Walking' as const,operations:{...op,stop:null},planning:{arrivalMinutes:2,returnMinutes:1,paceMps:1,paceObserved:false,stopAllowanceMinutes:20,replyMinutes:10,reachableDistanceMeters:20}};
assert.equal(adviceFromReport(walking)!.validUntilSimTime,100+(2+15)*60);
const message:CommMessage={id:'advice',kind:'chat',direction:'downlink',questionText:'Study the veins',adviceContext:context,observationId:'',siteId:'',siteName:'',taskId:null,originalPlanVersion:2,originalPlanSummary:'',status:'in_transit',sentAtSimTime:200,deliveredAtSimTime:500};
const html=(now:number)=>renderToStaticMarkup(createElement(MissionConversation,{messages:[message],side:'mars',simTime:now,delay:5,paused:false,reload:async()=>{},currentStatus:{...snapshot,planVersion:3}}));assert.doesNotMatch(html(499),/Study the veins/);assert.match(html(500),/Review before acting/);assert.match(html(500),/Plan changed/);
const reply={...message,direction:'uplink' as const,kind:'question' as const,adviceContext:undefined,replyText:'Study the veins',replyAdviceContext:context,replyDeliveredAtSimTime:800};assert.equal(messagesForSide([reply],'mars',799)[0].replyAdviceContext,undefined);assert.equal(messagesForSide([reply],'mars',800)[0].replyAdviceContext?.planVersion,2);
const telemetry=renderToStaticMarkup(createElement(CrewTelemetry,{report:op,now:400}));assert.match(telemetry,/18/);assert.match(telemetry,/breaths\/min/);assert.match(telemetry,/5m 0s old/);assert.match(telemetry,/Delayed report/);assert.match(renderToStaticMarkup(createElement(CrewTelemetry,{now:400})),/No reading/);
let entered:HealthReadings={};const healthUI=create(createElement(HealthMonitor,{readings:{},now:123,onChange:h=>{entered=h;}}));
assert.equal(healthUI.root.findAllByType('button').some(b=>b.children.join('')==='Load sample readings'),false,'fixed sample button removed');
act(()=>healthUI.root.findAllByType('input')[0].props.onChange({target:{value:'88'}}));
act(()=>healthUI.root.findByType('form').props.onSubmit({preventDefault:()=>{}}));
assert.equal(entered.heartRate?.source,'manual');assert.equal(entered.heartRate?.value,88);act(()=>healthUI.unmount());
const packet={...message,direction:'uplink' as const,kind:'status_update' as const,id:'p',statusSnapshot:snapshot,adviceContext:undefined,sentAtSimTime:100,deliveredAtSimTime:400};
const earthProps={messages:[packet],simTime:399,statusUpdateIntervalSeconds:5,oneWayDelayMinutes:5,simulationPaused:false,missionActive:true,simulationSpeedMultiplier:1,missionName:'Test',missionId:'m',isLocalOnly:true,onChangeRole:()=>{},onToggleSimulation:()=>{},onSetOneWayDelayMinutes:()=>{},onSetSimulationSpeedMultiplier:()=>{},onAdvanceSimTime:()=>{},onReloadMessages:async()=>{}};
assert.doesNotMatch(renderToStaticMarkup(createElement(EarthTeamMonitoring,earthProps)),/18 breaths\/min/);
const earth=create(createElement(EarthTeamMonitoring,{...earthProps,simTime:400}));act(()=>earth.root.findAllByType('button').find(b=>b.children.join('')==='Compare plans')!.props.onClick());assert.deepEqual(earth.root.findByType(PlanComparison).props.input,input);assert.equal(earth.root.findByType(CrewTelemetry).props.report.health.respiratoryRate.value,18);act(()=>earth.unmount());
// Use actual Three.js triangle ray intersections as an independent ground-height oracle.
const grounds:RenderedGround[]=[],meshes:THREE.Mesh[]=[];
for(const tile of [imagery,detail]){
 const a=lonLatToCropMeters(tile.west,tile.north),b=lonLatToCropMeters(tile.east,tile.south),x=(a.x+b.x)/2,z=(a.z+b.z)/2,width=b.x-a.x,height=b.z-a.z;
 const geo=new THREE.PlaneGeometry(width,height,384,256);geo.rotateX(-Math.PI/2);const vertices=geo.attributes.position;const valid:boolean[]=[];
 for(let i=0;i<vertices.count;i++){const h=westElevation(vertices.getX(i)+x,vertices.getZ(i)+z);valid.push(h!==null);vertices.setY(i,(h??-2574.414)+2574.414+(tile===detail?.025:0));}
 const ids:number[]=[];const original=geo.index!;for(let i=0;i<original.count;i+=3){const v=[original.getX(i),original.getX(i+1),original.getX(i+2)];if(v.every(n=>valid[n]))ids.push(...v);}geo.setIndex(ids);
 grounds.push({x,z,width,height,cols:384,rows:256,heights:Float32Array.from({length:vertices.count},(_,i)=>vertices.getY(i)),valid});const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.position.set(x,0,z);mesh.updateMatrixWorld();meshes.push(mesh);
}
const route=namedRoute('skinner-ridge','wildcat-ridge')!,guide=routeGuideGeometry(route,grounds),ray=new THREE.Raycaster();let minClearance=Infinity,rayChecks=0;
for(let i=0;i<guide.positions.length;i+=6){const [x,y,z]=guide.positions.slice(i,i+3);ray.set(new THREE.Vector3(x,10000,z),new THREE.Vector3(0,-1,0));const hits=ray.intersectObjects(meshes);assert.ok(hits.length);const actual=hits[0].point.y;assert.ok(Math.abs(actual-visibleGroundHeight(grounds,x,z)!)<.002);assert.ok(y-actual>.17);rayChecks++;}
for(let i=0;i<guide.indices.length;i+=3){const ids=guide.indices.slice(i,i+3),q=ids.map(n=>guide.positions.slice(n*3,n*3+3));const x=q.reduce((s,p)=>s+p[0],0)/3,y=q.reduce((s,p)=>s+p[1],0)/3,z=q.reduce((s,p)=>s+p[2],0)/3;const ground=visibleGroundHeight(grounds,x,z);assert.ok(ground!==null);minClearance=Math.min(minClearance,y-ground!);assert.ok(y>ground!,'ribbon triangle stays above actual terrain');}
let routeTriangles=0,minimumAllRouteClearance=Infinity;
for(let a=0;a<JEZERO_SITES.length;a++)for(let b=a+1;b<JEZERO_SITES.length;b++){
 const route=namedRoute(JEZERO_SITES[a].id,JEZERO_SITES[b].id)!;
 const data=routeGuideGeometry(route,grounds);
 for(let i=0;i<data.indices.length;i+=3){const q=data.indices.slice(i,i+3).map(n=>data.positions.slice(n*3,n*3+3));const x=q.reduce((s,p)=>s+p[0],0)/3,y=q.reduce((s,p)=>s+p[1],0)/3,z=q.reduce((s,p)=>s+p[2],0)/3;const h=visibleGroundHeight(grounds,x,z);if(h===null)continue;minimumAllRouteClearance=Math.min(minimumAllRouteClearance,y-h);assert.ok(y>h,`${route.id}: guide clips terrain by ${h-y}m`);routeTriangles++;}
}
const gap:RenderedGround={x:0,z:0,width:2,height:2,cols:1,rows:1,heights:new Float32Array([0,0,0,0]),valid:[false,false,false,false]};assert.equal(groundHeight(gap,0,0),null);assert.equal(visibleGroundHeight(grounds,1e8,1e8),null);
meshes.forEach(m=>{m.geometry.dispose();(m.material as THREE.Material).dispose();});
writeFileSync('research-data/revision-validation.json',JSON.stringify({description:'Automated calculation and component checks. Not suited human performance or browser validation.',exhaustivePolicyComparisons:comparisons,illustrativeInput:input,extraInvestigationMinutes:5,illustrativeResult:example,routeRendering:{route:route.id,rayChecks,minimumTriangleClearanceMetres:minClearance,allNamedRouteTriangleSamples:routeTriangles,minimumAllRouteClearance},advice:{reportCapture:100,stopDeadline:400,sendTime:200,oneWayDelayMinutes:5,calculatedArrival:500,flaggedLate:true},passed:true},null,2)+'\n');
console.log(`PASS ${comparisons} independent policy comparisons; advice expiry/privacy; visible delayed breathing; manual readings; compare navigation; ${rayChecks} Three.js terrain ray checks`);
process.exit(0);
