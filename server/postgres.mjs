import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {validateRecord} from './database.mjs';
const collections=['observations','messages','tasks'];
const kinds=['draft','sendPlan','accept','request','crew','investigate','walkMode','end','return','resumeSaved','mode','evidence','healthReplay'];
const replyKeys=['replyText','replySentAtSimTime','replyDeliveredAtSimTime','replyPlanVersion','scienceTeamAuthor','planDifference','replyAdviceContext'];
function validateMission(v){if(!v||!Number.isFinite(v.simTime)||!Number.isFinite(v.surfacePose?.x)||!Number.isFinite(v.surfacePose?.z))throw new Error('Invalid mission state');}
function validateCollection(c){if(!collections.includes(c))throw new Error('Unknown collection');}
export async function postgresConfig(connectionString,caFile){
 const url=new URL(connectionString);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('DATABASE_URL must be a Postgres URL');
 // Prevent URL options silently replacing strict certificate verification.
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert','ssl'])url.searchParams.delete(key);
 return {connectionString:url.toString(),max:5,connectionTimeoutMillis:15000,ssl:{rejectUnauthorized:true,...(caFile?{ca:await readFile(caFile,'utf8')}:{})}};
}
export async function openPostgres({connectionString,caFile,pool:injectedPool,now}={}){
 const pool=injectedPool??new Pool(await postgresConfig(connectionString,caFile));
 const schema=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
 await pool.query(schema);
 await pool.query('INSERT INTO marswalk.metadata(id,value) VALUES($1,$2) ON CONFLICT DO NOTHING',['database-id',randomUUID()]);
 const databaseId=(await pool.query('SELECT value FROM marswalk.metadata WHERE id=$1',['database-id'])).rows[0].value;
 async function transaction(fn){const client=await pool.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
 async function saveMission(client,value){validateMission(value);await client.query('INSERT INTO marswalk.mission(id,payload) VALUES(1,$1::jsonb) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload',[JSON.stringify(value)]);}
 async function mission(client=pool){return (await client.query('SELECT payload FROM marswalk.mission WHERE id=1')).rows[0]?.payload??null;}
 async function put(client,collection,value,insertOnly=false){
  validateRecord(collection,value);
  // A transaction-scoped key lock also covers concurrent first inserts.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${collection}:${value.id}`]);
  if(collection==='messages'&&!insertOnly){const old=(await client.query('SELECT payload FROM marswalk.records WHERE collection=$1 AND id=$2',[collection,value.id])).rows[0]?.payload;if(old?.replyText&&!value.replyText){value={...value};for(const key of replyKeys)if(old[key]!==undefined)value[key]=old[key];}}
  await client.query(`INSERT INTO marswalk.records(collection,id,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(collection,id) ${insertOnly?'DO NOTHING':'DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()'}`,[collection,value.id,JSON.stringify(value)]);
 }
 return {
  databaseId,
  list:async collection=>{validateCollection(collection);return (await pool.query('SELECT payload FROM marswalk.records WHERE collection=$1 ORDER BY sequence',[collection])).rows.map(r=>r.payload);},
  put:(collection,value)=>transaction(c=>put(c,collection,value)),
  remove:async(collection,ids)=>{validateCollection(collection);if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))throw new Error('Invalid IDs');await pool.query('DELETE FROM marswalk.records WHERE collection=$1 AND id=ANY($2::text[])',[collection,ids]);},
  seed:tasks=>transaction(async c=>{for(const t of tasks)await put(c,'tasks',t,true);}),
  importRecords:async(payload,migrationId)=>{
   for(const collection of collections){if(!Array.isArray(payload[collection]))throw new Error(`Missing ${collection} array`);for(const value of payload[collection])validateRecord(collection,value);}
   return transaction(async c=>{if(migrationId){await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`migration:${migrationId}`]);if((await c.query('SELECT id FROM marswalk.migrations WHERE id=$1',[migrationId])).rows.length)return {migrated:false};}for(const collection of collections)for(const value of payload[collection])await put(c,collection,value,Boolean(migrationId));if(migrationId)await c.query('INSERT INTO marswalk.migrations(id) VALUES($1)',[migrationId]);return {migrated:true};});
  },
  getMission:()=>mission(),saveMission:value=>transaction(c=>saveMission(c,value)),
  enqueueCommand:async value=>{if(!value||typeof value.id!=='string'||!value.id||value.id.length>100||!kinds.includes(value.kind))throw new Error('Invalid command');await pool.query('INSERT INTO marswalk.commands(id,payload) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',[value.id,JSON.stringify(value)]);},
  pollSession:({clientId,state,ack=[]})=>{
   if(typeof clientId!=='string'||clientId.length<8||clientId.length>100)throw new Error('Invalid client');
   return transaction(async c=>{
    const lease=(await c.query('SELECT owner,expires FROM marswalk.session_lease WHERE id=1 FOR UPDATE')).rows[0];
    const time=now?now():Number((await c.query('SELECT (EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint AS ms')).rows[0].ms);
    const claimed=!lease.owner||time>=Number(lease.expires),owner=claimed?clientId:lease.owner;
    if(claimed){const saved=await mission(c);if(saved?.missionStartedAtSimTime!=null)await saveMission(c,{...saved,simulationPaused:true,restorePending:true});}
    if(owner===clientId){await c.query('UPDATE marswalk.session_lease SET owner=$1,expires=$2 WHERE id=1',[owner,time+5000]);if(state&&!claimed){if(!Array.isArray(ack)||ack.some(id=>typeof id!=='string'))throw new Error('Invalid acknowledgement');await saveMission(c,state);await c.query('DELETE FROM marswalk.commands WHERE id=ANY($1::text[])',[ack]);}}
    return {controller:owner===clientId,claimed,mission:await mission(c),commands:owner===clientId?(await c.query('SELECT payload FROM marswalk.commands ORDER BY sequence LIMIT 100')).rows.map(r=>r.payload):[]};
   });
  },
  close:()=>pool.end(),
 };
}
