import { spawn } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const folder=mkdtempSync(join(tmpdir(),'marswalk-http-'));
const port=31020+Math.floor(Math.random()*1000);
const child=spawn(process.execPath,['--experimental-sqlite','server/index.mjs'],{env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:"https://marswalk.example",MARSWALK_DB:join(folder,'test.sqlite')},stdio:['ignore','pipe','pipe']});
try{
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Server startup timeout')),10000);
    child.stdout.on('data',data=>{if(String(data).includes('SQLite connected')){clearTimeout(timeout);resolve();}});
    child.once('error',e=>{clearTimeout(timeout);reject(e);});
    child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Server exited: ${code}`));});
  });
  const base=`http://127.0.0.1:${port}`;
  const call=(path,method='GET',value)=>fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)});
  assert.equal((await (await call('/api/health')).json()).database,'SQLite');
  const msg={id:'api-smoke',direction:'downlink',questionText:'Earth guidance',sentAtSimTime:100,deliveredAtSimTime:400};
  assert.equal((await call('/api/messages','PUT',msg)).status,200);
  assert.equal((await (await call('/api/messages')).json()).find(m=>m.id==='api-smoke').questionText,'Earth guidance');
  assert.equal((await call('/api/mission','PUT',{simTime:100,surfacePose:{x:12,z:25}})).status,200);
  assert.equal((await (await call('/api/mission')).json()).surfacePose.x,12);
  assert.equal((await call('/api/messages','PUT',{id:'invalid'})).status,400);
  assert.equal((await fetch(base+'/api/messages',{method:'PUT',headers:{'Content-Type':'application/json',Origin:'https://example.org'},body:JSON.stringify(msg)})).status,403);
  assert.match(await (await fetch(base+'/')).text(),/MarsWalk/);
  const model=await fetch(base+'/assets/models/astronaut.glb');assert.equal(model.status,200);const binary=Buffer.from(await model.arrayBuffer());assert.equal(binary.readUInt32LE(0),0x46546c67,'server delivers GLB bytes rather than an HTML fallback');assert.equal(binary.readUInt32LE(8),binary.length);
  assert.equal((await call('/api/messages','DELETE',{ids:['api-smoke']})).status,200);
  assert.equal((await fetch(base+'/api/commands',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://marswalk.example'},body:JSON.stringify({id:'http-cmd',kind:'mode',payload:{delay:5,speed:1}})})).status,200);
  const poll=async(clientId,state,ack=[])=>await (await call('/api/session','POST',{clientId,state,ack})).json();
  assert.equal((await poll('earth-http')).controller,true);
  assert.equal((await poll('mars-http')).controller,false);
  const controlling=await poll('earth-http');assert.equal(controlling.commands[0].id,'http-cmd');
  await poll('earth-http',{simTime:101,surfacePose:{x:13,z:25}},['http-cmd']);
  assert.equal((await poll('mars-http')).mission.surfacePose.x,13);
  assert.equal((await poll('earth-http')).commands.length,0);
  console.log('PASS 16 running-server HTTP checks: SQLite health, messages, mission, validation, origin rejection, frontend and deletion');
} finally {
  child.kill('SIGTERM');
  if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve();},1500).unref();});
  rmSync(folder,{recursive:true,force:true});
}
