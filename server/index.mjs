import {timingSafeEqual} from 'node:crypto';
import {createSession} from './session.mjs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.mjs';
import {openPostgres} from './postgres.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const dist=resolve(root,'dist');
const databaseFile=process.env.MARSWALK_DB || resolve(root,'data/marswalk-v2.sqlite');
const databaseType=process.env.DATABASE_URL?'Postgres':'SQLite';
const db=process.env.DATABASE_URL?await openPostgres({connectionString:process.env.DATABASE_URL,caFile:process.env.DATABASE_CA_FILE}):openDatabase(databaseFile);
const session=db.pollSession?{poll:input=>db.pollSession(input),enqueue:async input=>{await db.enqueueCommand(input);return {ok:true};}}:createSession(db);
const port=Number(process.env.PORT || 3000);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream','.webp':'image/webp','.woff2':'font/woff2'};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>64*1024*1024)throw new Error('Upload exceeds 64 MB');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString() || '{}');}
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(process.env.BASIC_AUTH_PASSWORD&&url.pathname!=='/api/health'){
      const expected=Buffer.from('Basic '+Buffer.from(`${process.env.BASIC_AUTH_USER||'crew'}:${process.env.BASIC_AUTH_PASSWORD}`).toString('base64'));
      const actual=Buffer.from(req.headers.authorization||'');
      if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="MARSWalk"'});return res.end('Sign in to the shared mission');}
    }
    if(url.pathname.startsWith('/api/')){
      // Same-origin API for both local and deployed clients.
      if(!['GET','HEAD'].includes(req.method)) {
        if(req.headers.origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5173','http://localhost:5173',...(process.env.PUBLIC_ORIGIN?[process.env.PUBLIC_ORIGIN]:[])].includes(req.headers.origin))return json(res,403,{error:'Origin not allowed'});
        if(!req.headers['content-type']?.includes('application/json'))return json(res,415,{error:'JSON body required'});
      }
      const segments=url.pathname.split('/').filter(Boolean);const resource=segments[1];
      if(req.method==='GET' && resource==='health')return json(res,200,{ok:true,database:databaseType,databaseId:db.databaseId,version:'1.9.9'});
      if(resource==='session'&&req.method==='POST')return json(res,200,await session.poll(await body(req)));
      if(resource==='commands'&&req.method==='POST')return json(res,200,await session.enqueue(await body(req)));
      if(resource==='mission') {
        if(req.method==='GET')return json(res,200,await db.getMission());
        if(req.method==='PUT'){await db.saveMission(await body(req));return json(res,200,{ok:true});}
      }
      if(resource==='import' && req.method==='POST') {const data=await body(req);if(data.migrationId !== undefined && (typeof data.migrationId !== 'string'||data.migrationId.length>250))throw new Error('Invalid migration ID');return json(res,200,await db.importRecords(data,data.migrationId));}
      if(resource==='seed' && req.method==='POST'){const data=await body(req);if(!Array.isArray(data.tasks))throw new Error('Tasks required');await db.seed(data.tasks);return json(res,200,{ok:true});}
      if(['observations','messages','tasks'].includes(resource)){
        if(req.method==='GET')return json(res,200,await db.list(resource));
        if(req.method==='PUT'){await db.put(resource,await body(req));return json(res,200,{ok:true});}
        if(req.method==='DELETE'){const data=await body(req);await db.remove(resource,data.ids);return json(res,200,{ok:true});}
      }
      return json(res,404,{error:'Unknown API route'});
    }
    if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed'});
    const path=resolve(dist,'.'+decodeURIComponent(url.pathname));
    if(path!==dist && !path.startsWith(dist+sep))return json(res,403,{error:'Path not allowed'});
    let file=path;
    try {if(!(await stat(file)).isFile())file=resolve(dist,'index.html');}catch{if(extname(path))return json(res,404,{error:'Asset not found'});file=resolve(dist,'index.html');}
    const content=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
  }catch(e){console.error(e.message);json(res,400,{error:e.message || 'Request failed'});}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is busy. Stop the older MARSWalk server with Ctrl+C first.`:e.message);db.close();process.exitCode=1;});
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`MARSWalk 1.9.9 · ${databaseType} connected\nOpen http://127.0.0.1:${port}\nDatabase: ${databaseType==='SQLite'?databaseFile:'shared Postgres'}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await db.close();process.exit(0);}));
