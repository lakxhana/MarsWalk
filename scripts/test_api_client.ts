import assert from 'node:assert/strict';
import {apiRequest,ApiRequestError} from '../src/lib/apiClient';
const original=globalThis.fetch;
async function check(status:number,body:string,message:RegExp,type='text/plain') {
  globalThis.fetch=async()=>new Response(body,{status,headers:{'content-type':type}});
  await assert.rejects(apiRequest('mission'),e=>e instanceof ApiRequestError&&message.test(e.message));
}
async function run() {
 try {
  await check(404,'NOT_FOUND',/API is missing/);
  await check(401,'Unauthorized',/Sign in/);
  await check(413,'FUNCTION_PAYLOAD_TOO_LARGE',/smaller photo/);
  await check(503,JSON.stringify({error:'Set DATABASE_URL'}),/Set DATABASE_URL/,'application/json');
  await check(200,'<!doctype html>',/page instead/,'text/html');
  globalThis.fetch=async()=>new Response('null',{headers:{'content-type':'application/json'}});
  assert.equal(await apiRequest('mission'),null,'an empty mission is valid');
  const originalTimer=globalThis.setTimeout;
  globalThis.setTimeout=((callback:()=>void)=>originalTimer(callback,1)) as typeof setTimeout;
  try {
    globalThis.fetch=async(_url,options)=>new Promise((_resolve,reject)=>{
      options?.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
    });
    await assert.rejects(apiRequest('messages','PUT',{id:'pending'}),e=>e instanceof ApiRequestError&&e.status===408);
  } finally {globalThis.setTimeout=originalTimer;}
  console.log('PASS API client: missing API, sign-in, upload size, setup errors, HTML fallback and empty mission');
 } finally {globalThis.fetch=original;}
}
void run();
