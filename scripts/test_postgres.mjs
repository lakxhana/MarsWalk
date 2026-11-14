import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {openPostgres,postgresConfig} from '../server/postgres.mjs';
const engine=new PGlite();
// PGlite runs real Postgres SQL on a single connection. Serialize transactions
// in this test pool; production pg.Pool supplies independent locked connections.
let pending=Promise.resolve();
async function lock(){let release;const next=new Promise(r=>{release=r;});const previous=pending;pending=next;await previous;return release;}
const pool={query:async(sql,params)=>{const release=await lock();try{return params===undefined&&sql.includes(';')?{rows:await engine.exec(sql)}:await engine.query(sql,params);}finally{release();}},connect:async()=>{const release=await lock();return {query:(sql,p)=>p===undefined&&sql.includes(';')?engine.exec(sql):engine.query(sql,p),release};},end:async()=>{}};
let now=10000;
const a=await openPostgres({pool,now:()=>now}),b=await openPostgres({pool,now:()=>now});
assert.equal(a.databaseId,b.databaseId);assert.equal(await a.getMission(),null);
for(const c of ['observations','messages','tasks'])assert.deepEqual(await a.list(c),[]);
const state={simTime:123,surfacePose:{x:1,z:2},missionStartedAtSimTime:100};
const [x,y]=await Promise.all([a.pollSession({clientId:'earth-client'}),b.pollSession({clientId:'mars-client'})]);assert.equal(Number(x.controller)+Number(y.controller),1,'only one clock owner');
await a.pollSession({clientId:'earth-client',state});await b.pollSession({clientId:'mars-client',state:{...state,simTime:999}});assert.equal((await b.getMission()).simTime,123,'follower cannot replace shared state');
await b.enqueueCommand({id:'c1',kind:'mode',payload:{speed:5,delay:0}});
await assert.rejects(a.pollSession({clientId:'earth-client',state:{...state,simTime:NaN},ack:['c1']}),/Invalid mission/);
assert.equal((await a.pollSession({clientId:'earth-client'})).commands.length,1,'failed snapshot cannot lose a command');
await a.pollSession({clientId:'earth-client',state:{...state,simTime:124},ack:['c1']});assert.equal((await a.pollSession({clientId:'earth-client'})).commands.length,0);
now+=5001;const takeover=await b.pollSession({clientId:'mars-client',state:{...state,simTime:999}});assert.equal(takeover.claimed,true);assert.equal(takeover.mission.simTime,124);assert.equal(takeover.mission.restorePending,true);assert.equal(takeover.mission.simulationPaused,true);
const message={id:'m1',direction:'uplink',questionText:'Sample here?',sentAtSimTime:10,deliveredAtSimTime:310};
await a.put('messages',message);await b.put('messages',{...message,replyText:'Proceed',replyDeliveredAtSimTime:620});await a.put('messages',message);assert.equal((await a.list('messages'))[0].replyText,'Proceed');
const record={id:'t1',title:'Photo',status:'pending'};
await a.put('tasks',record);await b.put('tasks',{...record,status:'completed'});assert.equal((await a.list('tasks'))[0].status,'completed');
await assert.rejects(a.importRecords({tasks:[{id:'invalid'}],messages:[],observations:[]}),/Invalid task/);assert.equal((await a.list('tasks')).length,1);
const imported={tasks:[{id:'t2',title:'Scan',status:'pending'}],messages:[],observations:[]};assert.equal((await a.importRecords(imported,'explicit')).migrated,true);assert.equal((await b.importRecords(imported,'explicit')).migrated,false);
await a.remove('tasks',['t1','t2']);assert.deepEqual(await b.list('tasks'),[]);
const config=await postgresConfig('postgres://u:p@example.test/db?sslmode=require');assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(new URL(config.connectionString).searchParams.has('sslmode'),false);
await engine.close();console.log('PASS Postgres SQL: empty schema, shared records, exclusive clock lease, pause on takeover, atomic state/ack, reply preservation, import validation, TLS configuration');
