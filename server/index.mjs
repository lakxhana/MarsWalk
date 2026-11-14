import {authorized, createApiHandler, json} from './api.mjs';
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
if(process.env.APP_ACCESS==='private'&&!process.env.BASIC_AUTH_PASSWORD)throw new Error('Private access requires BASIC_AUTH_PASSWORD. Use APP_ACCESS=public for the public website.');
const db=process.env.DATABASE_URL?await openPostgres({connectionString:process.env.DATABASE_URL,caFile:process.env.DATABASE_CA_FILE,ca:process.env.DATABASE_CA_CERT}):openDatabase(databaseFile);
const handleApi=createApiHandler({getDatabase:async()=>db,databaseType});
const port=Number(process.env.PORT || 3000);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/'))return await handleApi(req,res);
    if(!authorized(req,process.env)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="MARSWalk"'});return res.end('Sign in to the shared mission');}
    if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed'});
    const path=resolve(dist,'.'+decodeURIComponent(url.pathname));
    if(path!==dist && !path.startsWith(dist+sep))return json(res,403,{error:'Path not allowed'});
    let file=path;
    try {if(!(await stat(file)).isFile())file=resolve(dist,'index.html');}catch{if(extname(path))return json(res,404,{error:'Asset not found'});file=resolve(dist,'index.html');}
    const content=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
  }catch(e){console.error(e.message);json(res,400,{error:e.message || 'Request failed'});}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is busy. Stop the older MARSWalk server with Ctrl+C first.`:e.message);db.close();process.exitCode=1;});
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`MARSWalk 1.9.12 · ${databaseType} connected\nOpen http://127.0.0.1:${port}\nDatabase: ${databaseType==='SQLite'?databaseFile:'shared Postgres'}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await db.close();process.exit(0);}));
