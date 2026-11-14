import assert from 'node:assert/strict';
import {createElement} from 'react';
import {act,create} from 'react-test-renderer';
import {renderToStaticMarkup} from 'react-dom/server';
import MissionLog from '../src/components/MissionLog';
import BodyHealthMap from '../src/components/BodyHealthMap';
import SurfaceContext from '../src/components/SurfaceContext';
import NamedSitePlanner from '../src/components/NamedSitePlanner';
import MissionReview from '../src/components/MissionReview';
import {filterMissionLog} from '../src/lib/missionLog';
import {DEFAULT_OPERATIONS,type MissionLogEntry} from '../src/lib/crewOperations';
import {namedRoute} from '../src/lib/jezeroRoutes';
const route=namedRoute('skinner-ridge','wildcat-ridge')!;
const task={id:'task',title:'Record visible layers',minutes:4,priority:5,fraction:1,done:true};
const entries:MissionLogEntry[]=[
 {id:'a',name:'Alex',destination:'Wildcat Ridge',started:0,ended:100,receivedAt:400,stops:[],finding:'Fine layers',records:2,tasks:[task,{...task,id:'skip',selected:false,done:false}]},
 {id:'b',name:'Sam',destination:'Skinner Ridge',started:500,ended:600,receivedAt:900,stops:[],finding:'Coarse grains',records:0,tasks:[{...task,done:false}]},
 {id:'c',name:'Undelivered crew',destination:'Undelivered site',started:1000,ended:1100,receivedAt:1400,stops:[],finding:'Not delivered',records:1,tasks:[task]},
];
const filters={query:'',destination:'',crew:'',tasks:'all',sort:'newest'};
const ids=(list:MissionLogEntry[])=>list.map(e=>e.id);
assert.deepEqual(ids(filterMissionLog(entries,900,true,filters)),['b','a']);
assert.deepEqual(ids(filterMissionLog(entries,900,true,{...filters,sort:'oldest'})),['a','b']);
assert.deepEqual(ids(filterMissionLog(entries,900,true,{...filters,tasks:'complete'})),['a'],'skipped tasks do not mark a completed plan unfinished');
assert.deepEqual(ids(filterMissionLog(entries,900,true,{...filters,tasks:'unfinished'})),['b']);
assert.deepEqual(ids(filterMissionLog(entries,900,true,{...filters,tasks:'records'})),['a']);
assert.deepEqual(ids(filterMissionLog(entries,900,true,{...filters,query:' FINE ',crew:'Alex',destination:'Wildcat Ridge'})),['a']);
assert.deepEqual(ids(filterMissionLog(entries,399,true,filters)),[],'archive respects delivery boundary');
assert.deepEqual(ids(filterMissionLog(entries,1400,true,filters)),['c','b','a']);
const log=create(createElement(MissionLog,{entries,now:900,earth:true}));
assert.doesNotMatch(JSON.stringify(log.toJSON()),/Undelivered/,'filter choices do not disclose undelivered missions');
act(()=>log.root.findByType('input').props.onChange({target:{value:'does not exist'}}));
assert.match(JSON.stringify(log.toJSON()),/No missions match/);
act(()=>log.root.findAllByType('button').find(b=>b.children.join('')==='Clear filters')!.props.onClick());
assert.equal(log.root.findAllByType('article').length,2);act(()=>log.unmount());

const selected:string[]=[];
const body=create(createElement(BodyHealthMap,{member:{id:'lead',name:'Alex',tankId:'A',oxygenMinutes:90,oxygenReserveMinutes:15,health:{heartRate:{metric:'heartRate',value:88,source:'manual',capturedAt:100,low:null,high:null}}},selected:'heartRate',onSelect:key=>selected.push(key)}));
assert.equal(body.root.findAllByType('button').length,4);
act(()=>body.root.findAllByProps({className:'body-dot'})[2].props.onClick());
act(()=>body.root.findAllByType('button')[3].props.onClick());
assert.deepEqual(selected,['respiratoryRate','bloodOxygen'],'both body dots and labels select metrics');
assert.match(JSON.stringify(body.toJSON()),/88 bpm/);assert.match(JSON.stringify(body.toJSON()),/No reading/);
assert.equal(body.root.findAllByType('button').filter(b=>b.props['aria-pressed']).length,1);act(()=>body.unmount());

const surface=create(createElement(SurfaceContext,{route,pose:route.points[0],observations:[],now:100,expanded:true}));
for(const [tab,heading] of [['Terrain','Terrain & elevation'],['Geology','Geology'],['Observations','Scientific observations'],['History','Previous mission activity'],['Environment','Environment & temperature'],['Hazards','Potential hazards']]){
 act(()=>surface.root.findAllByType('button').find(b=>b.children.join('')===tab)!.props.onClick());
 assert.ok(surface.root.findByType('h3').children.join('').startsWith(heading));
 assert.equal(surface.root.findAllByProps({className:'surface-information'}).length,1,'one detail category at a time');
}
act(()=>surface.unmount());

let sent=0;
const plan=create(createElement(NamedSitePlanner,{readOnly:true,lockedRoute:route,crew:{...DEFAULT_OPERATIONS,routeTasks:[task]},onStart:()=>sent++}));
assert.equal(plan.root.findByProps({className:'planner-fields'}).props.disabled,true);
act(()=>plan.root.findAllByType('form')[0].props.onSubmit({preventDefault(){}}));assert.equal(sent,0,'locked plan cannot send a second mission');
assert.ok(plan.root.findAllByType('button').some(b=>b.children.join('')==='Compare plans'),'comparison still available');act(()=>plan.unmount());
const proposal={id:'ready',route,crew:{...DEFAULT_OPERATIONS,routeTasks:[task]},budget:60,reserve:10,sentAt:0,arrivesAt:100,status:'pending' as const};
const props={proposal,now:100,active:false,onAccept:()=>{},onRequest:()=>{},onReturn:()=>{},onOpenEarth:()=>{}};
const review=renderToStaticMarkup(createElement(MissionReview,props));
assert.match(review,/Your tasks/);assert.match(review,/Start walk →/);assert.ok(review.indexOf('Start walk →')>review.indexOf('review-actions'));
const waiting=renderToStaticMarkup(createElement(MissionReview,{...props,now:99}));
assert.doesNotMatch(waiting,/Record visible layers/);assert.match(waiting,/Start walk · waiting for plan/);
console.log('PASS interface recovery: delivered archive filters/reset, body dots/labels, six surface categories, sent-plan protection and explicit Start footer');
