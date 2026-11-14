import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const collections = new Set(['observations','messages','tasks']);
export function validateRecord(table, value) {
  if (!collections.has(table)) throw new Error('Unknown collection');
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id || value.id.length > 250) throw new Error('A valid record ID is required');
  if (table === 'observations' && (typeof value.note !== 'string' || typeof value.siteId !== 'string' || !value.location || typeof value.timestamp !== 'string')) throw new Error('Invalid observation');
  if (table === 'messages' && (!['uplink','downlink'].includes(value.direction) || typeof value.questionText !== 'string' || !Number.isFinite(value.sentAtSimTime) || !Number.isFinite(value.deliveredAtSimTime) || value.deliveredAtSimTime < value.sentAtSimTime)) throw new Error('Invalid message or delivery time');
  if (table === 'tasks' && (typeof value.title !== 'string' || !['pending','in_progress','blocked_on_advice','completed'].includes(value.status))) throw new Error('Invalid task');
}
export function openDatabase(filename) {
  if(filename !== ':memory:') mkdirSync(dirname(filename),{recursive:true});
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  for(const table of collections) db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  db.exec('CREATE TABLE IF NOT EXISTS mission (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY);');
  db.exec('CREATE TABLE IF NOT EXISTS metadata (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO metadata(id,value) VALUES(?,?)').run('database-id',randomUUID());
  db.exec('CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  const databaseId = db.prepare('SELECT value FROM metadata WHERE id=?').get('database-id').value;
  function tableName(table) {if(!collections.has(table))throw new Error('Unknown collection');return table;}
  function list(table) {return db.prepare(`SELECT payload FROM ${tableName(table)} ORDER BY rowid`).all().map(r=>JSON.parse(r.payload));}
  function put(table, value, insertOnly=false) {
    validateRecord(table,value);
    // An older periodic status write must not erase an Earth reply already saved.
    if(table === 'messages' && !insertOnly) {
      const previous = db.prepare('SELECT payload FROM messages WHERE id=?').get(value.id);
      if(previous) {
        const old = JSON.parse(previous.payload);
        if(old.replyText && !value.replyText) {
          value={...value};
          for(const key of ['replyText','replySentAtSimTime','replyDeliveredAtSimTime','replyPlanVersion','scienceTeamAuthor','planDifference','replyAdviceContext']) if(old[key] !== undefined)value[key]=old[key];
        }
      }
    }
    const sql=insertOnly ? `INSERT OR IGNORE INTO ${tableName(table)}(id,payload) VALUES (?,?)` : `INSERT INTO ${tableName(table)}(id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=CURRENT_TIMESTAMP`;
    db.prepare(sql).run(value.id,JSON.stringify(value));
  }
  function transaction(action) {db.exec('BEGIN IMMEDIATE');try{const result=action();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
  function importRecords(payload, migrationId) {
    for(const table of collections) {if(!Array.isArray(payload[table]))throw new Error(`Missing ${table} array`);for(const item of payload[table])validateRecord(table,item);}
    return transaction(()=>{
      if(migrationId && db.prepare('SELECT id FROM migrations WHERE id=?').get(migrationId))return {migrated:false};
      for(const table of collections)for(const item of payload[table])put(table,item,Boolean(migrationId));
      if(migrationId)db.prepare('INSERT INTO migrations(id) VALUES(?)').run(migrationId);
      return {migrated:true};
    });
  }
  return {
    databaseId,list,put,importRecords,
    enqueueCommand(value){if(!value||typeof value.id!=='string'||value.id.length>100||!['draft','sendPlan','accept','request','crew','investigate','walkMode','end','return','resumeSaved','mode','evidence','healthReplay'].includes(value.kind))throw new Error('Invalid command');db.prepare('INSERT OR IGNORE INTO commands(id,payload) VALUES(?,?)').run(value.id,JSON.stringify(value));},
    getCommands(){return db.prepare('SELECT payload FROM commands ORDER BY rowid LIMIT 100').all().map(r=>JSON.parse(r.payload));},
    commitSession(state,ack){transaction(()=>{this.saveMission(state);if(!Array.isArray(ack)||ack.some(id=>typeof id!=='string'))throw new Error('Invalid acknowledgement');for(const id of ack)db.prepare('DELETE FROM commands WHERE id=?').run(id);});},
    remove(table,ids) {if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))throw new Error('Invalid IDs');transaction(()=>{for(const id of ids)db.prepare(`DELETE FROM ${tableName(table)} WHERE id=?`).run(id);});},
    seed(tasks) {transaction(()=>{for(const task of tasks)put('tasks',task,true);});},
    getMission() {const row=db.prepare('SELECT payload FROM mission WHERE id=1').get();return row ? JSON.parse(row.payload) : null;},
    saveMission(value) {if(!value || !Number.isFinite(value.simTime) || !Number.isFinite(value.surfacePose?.x) || !Number.isFinite(value.surfacePose?.z))throw new Error('Invalid mission state');db.prepare('INSERT INTO mission(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(JSON.stringify(value));},
    close(){db.close();}
  };
}
