import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import {createVercelHandler} from '../server/vercel.mjs';
import {json} from '../server/api.mjs';
import {openPostgres, postgresConfig} from '../server/postgres.mjs';
import deployedHandler from '../api/[resource].js';

assert.equal(typeof deployedHandler, 'function');
const largeRecord={note:'🪐'.repeat(1_100_000)},chunks=[];
json({writeHead:()=>{},write:chunk=>chunks.push(chunk),end:()=>{}},200,largeRecord);
assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()),largeRecord,'streamed responses preserve Unicode across chunks');
const env = {VERCEL:'1', APP_ACCESS:'private', DATABASE_URL:'postgresql://test:test@localhost/test', PUBLIC_ORIGIN:'https://marswalk.example', BASIC_AUTH_USER:'crew', BASIC_AUTH_PASSWORD:'test-team-password'};
const auth = 'Basic ' + Buffer.from('crew:test-team-password').toString('base64');
function request(handler, path, method='GET', body, headers={authorization:auth}) {
  const req = {url:`/api/${path}`, method, body, headers:{'content-type':'application/json', ...headers}};
  let status, output='', fields={};
  const res = {setHeader:(k,v)=>{fields[k]=v;}, writeHead:(s,h)=>{status=s;fields={...fields,...h};}, write:s=>{output+=s;}, end:s=>{output+=s??'';}};
  return handler(req,res).then(()=>({status,headers:fields,body:output?JSON.parse(output):null}));
}
for (const [overrides, message] of [[{DATABASE_URL:''},'DATABASE_URL'],[{DATABASE_URL:'DATABASE_URL'},'DATABASE_URL'],[{DATABASE_URL:'postgresql://u:[YOUR-PASSWORD]@h/d'},'DATABASE_URL'],[{BASIC_AUTH_PASSWORD:''},'BASIC_AUTH_PASSWORD'],[{PUBLIC_ORIGIN:''},'PUBLIC_ORIGIN']]) {
  const handler=createVercelHandler({env:{...env,...overrides}, connect:()=>{assert.fail('Invalid configuration must not connect');}});
  const r=await request(handler,'mission'); assert.equal(r.status,503); assert.match(r.body.error,new RegExp(message));
}
const engine = new PGlite();
let pending=Promise.resolve();
async function lock(){let release;const next=new Promise(r=>{release=r;});const previous=pending;pending=next;await previous;return release;}
const query=(sql,params)=>params===undefined&&sql.includes(';')?engine.exec(sql):engine.query(sql,params);
const pool={query:async(sql,p)=>{const release=await lock();try{return await query(sql,p);}finally{release();}},connect:async()=>{const release=await lock();return {query,release};},end:async()=>{}};
let time=10000,connections=0;
const connect=async()=>{connections++;return openPostgres({pool,now:()=>time});};
// Independent warm function instances, sharing Postgres, not process memory.
const earth=createVercelHandler({env,connect}), mars=createVercelHandler({env,connect});
try {
  const denied=await request(earth,'mission','GET',undefined,{});assert.equal(denied.status,401);assert.equal(connections,0);
  const challenge=await request(earth,'login','GET',undefined,{});assert.match(challenge.headers['WWW-Authenticate'],/Basic/);
  const login=await request(earth,'login');assert.equal(login.status,303);assert.equal(login.headers.Location,'/');
  assert.equal((await request(earth,'tasks','PUT',{id:'t',title:'Photo',status:'pending'},{authorization:auth,origin:'https://attacker.example'})).status,403);
  assert.equal((await request(earth,'unknown')).status,404);
  assert.equal((await request(earth,'mission','POST',{})).status,405);
  const health=await request(earth,'health','GET',undefined,{});assert.equal(health.body.database,'Postgres');assert.equal(health.status,200);
  assert.equal((await request(earth,'mission')).body,null,'fresh schema starts empty');
  const [a,b]=await Promise.all([request(earth,'session','POST',{clientId:'earth-client'}),request(mars,'session','POST',{clientId:'mars-client'})]);
  assert.equal(Number(a.body.controller)+Number(b.body.controller),1);
  assert.equal(a.body.controller,true);
  const state={simTime:100,surfacePose:{x:12,z:25},missionStartedAtSimTime:90};
  await request(earth,'session','POST',{clientId:'earth-client',state});
  await request(mars,'session','POST',{clientId:'mars-client',state:{...state,simTime:999}});
  assert.equal((await request(mars,'mission')).body.simTime,100);
  await request(mars,'commands','POST',{id:'c1',kind:'investigate',payload:{}});
  assert.equal((await request(earth,'session','POST',{clientId:'earth-client'})).body.commands.length,1);
  await request(earth,'session','POST',{clientId:'earth-client',state:{...state,simTime:101},ack:['c1']});
  assert.equal((await request(mars,'mission')).body.simTime,101);
  assert.equal((await request(earth,'session','POST',{clientId:'earth-client'})).body.commands.length,0);
  await request(earth,'tasks','PUT',{id:'t',title:'Photo',status:'completed'});
  assert.equal((await request(mars,'tasks')).body[0].status,'completed');
  for (const [from,to,direction] of [[earth,mars,'downlink'],[mars,earth,'uplink']]) {
    const message={id:direction,direction,questionText:'Message',sentAtSimTime:100,deliveredAtSimTime:400};
    assert.equal((await request(from,'messages','PUT',message)).status,200);
    assert.equal((await request(to,'messages')).body.find(m=>m.id===direction).deliveredAtSimTime,400);
  }
  const observation={id:'note',siteId:'jezero',note:'Rock layers',location:{x:12,z:25},timestamp:new Date().toISOString(),imageRef:'data:image/png;base64,YQ=='};
  assert.equal((await request(mars,'observations','PUT',observation)).status,200);
  assert.equal((await request(earth,'observations')).body[0].note,'Rock layers');
  assert.equal(connections,2,'warm requests reuse the connection pool');
  const restarted=createVercelHandler({env,connect});
  assert.equal((await request(restarted,'health')).body.databaseId,health.body.databaseId);
  time+=5001;
  const takeover=await request(restarted,'session','POST',{clientId:'new-controller'});
  assert.equal(takeover.body.mission.simTime,101);assert.equal(takeover.body.mission.restorePending,true);
  assert.equal((await request(restarted,'tasks')).body[0].status,'completed');
  // Public visitors use the same existing database, including mission history.
  // Old BASIC_AUTH_* settings alone must not reintroduce a login wall.
  const publicEnv={...env};delete publicEnv.APP_ACCESS;
  const publicEarth=createVercelHandler({env:publicEnv,connect});
  const publicMars=createVercelHandler({env:{...publicEnv,APP_ACCESS:'public',BASIC_AUTH_PASSWORD:''},connect});
  const saved=(await request(publicEarth,'mission','GET',undefined,{}));
  assert.equal(saved.status,200);assert.equal(saved.body.simTime,101);
  assert.equal(saved.headers['WWW-Authenticate'],undefined);
  assert.equal((await request(publicMars,'tasks','GET',undefined,{})).body[0].status,'completed');
  assert.equal((await request(publicMars,'observations','GET',undefined,{})).body[0].note,'Rock layers');
  assert.equal((await request(publicMars,'messages','GET',undefined,{})).body.length,2);
  const shared={...saved.body,crewOperations:{previousWalks:[{id:'past-walk',destination:'Wildcat Ridge',finding:'Rock layers'}]}};
  await request(restarted,'session','POST',{clientId:'new-controller',state:shared});
  assert.equal((await request(publicEarth,'mission','GET',undefined,{})).body.crewOperations.previousWalks[0].id,'past-walk');
  const publicTask={id:'judge-task',title:'Review photo',status:'completed'};
  assert.equal((await request(publicEarth,'tasks','PUT',publicTask,{origin:env.PUBLIC_ORIGIN})).status,200);
  assert.equal((await request(publicMars,'tasks','GET',undefined,{})).body.find(t=>t.id===publicTask.id).status,'completed');
  await request(publicEarth,'tasks','DELETE',{ids:[publicTask.id]},{});
  assert.equal((await request(publicEarth,'commands','POST',{id:'judge-command',kind:'mode',payload:{speed:1,delay:0}},{origin:env.PUBLIC_ORIGIN})).status,200);
  assert.equal((await request(publicMars,'session','POST',{clientId:'public-judge'},{})).body.controller,false,'public visitor cannot create a second clock');
  assert.equal((await request(publicEarth,'commands','POST',{id:'bad-origin',kind:'mode',payload:{}},{origin:'https://attacker.example'})).status,403);
  assert.equal((await request(publicMars,'health','GET',undefined,{})).body.databaseId,health.body.databaseId,'same database, no isolated demo schema');
  const clientVisible=JSON.stringify(saved);
  assert.ok(!clientVisible.includes(env.DATABASE_URL));assert.ok(!clientVisible.includes(env.BASIC_AUTH_PASSWORD));
  assert.equal((await request(earth,'tasks','PUT',null)).status,400);
  assert.equal((await request(earth,'tasks','PUT','{broken')).status,400);
  assert.equal((await request(earth,'observations','PUT',{...observation,note:'x'.repeat(4_000_000)})).status,413);
  // Actual Node streams work alongside Vercel's already parsed request.body.
  const server=createServer(earth);server.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    const base=`http://127.0.0.1:${server.address().port}/api`;
    const r=await fetch(`${base}/tasks`,{method:'PUT',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify({id:'stream',title:'Stream',status:'pending'})});
    assert.equal(r.status,200);
    assert.equal((await (await fetch(`${base}/tasks`,{headers:{authorization:auth}})).json()).length,2);
  } finally {await new Promise(resolve=>server.close(resolve));}
  let attempts=0;
  const retry=createVercelHandler({env,log:()=>{},connect:async()=>{if(++attempts===1)throw Object.assign(new Error('private-secret'),{code:'28P01'});return connect();}});
  const rejected=await request(retry,'health');assert.equal(rejected.status,503);assert.match(rejected.body.error,/password rejected/);assert.doesNotMatch(rejected.body.error,/private-secret/);
  assert.equal((await request(retry,'health')).status,200,'failed cold start can retry');
  const config=await postgresConfig(env.DATABASE_URL,undefined,{serverless:true});assert.equal(config.max,1);assert.equal(config.ssl.rejectUnauthorized,true);
  console.log('PASS Vercel API: public history/notes, login-free shared access, optional private access, both body formats, empty Postgres, two independent instances, shared progress/tasks/messages/notes, restart persistence, one controller, upload cap, retry and TLS');
} finally {await engine.close();}
