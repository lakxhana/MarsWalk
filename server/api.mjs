import {timingSafeEqual} from 'node:crypto';
import {createSession} from './session.mjs';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function json(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
  const content = JSON.stringify(data);
  // Stream large record lists; Vercel limits non-streamed response bodies.
  if (Buffer.byteLength(content) > 4_000_000) {
    const bytes = Buffer.from(content);
    for (let i = 0; i < bytes.length; i += 65536) res.write(bytes.subarray(i, i + 65536));
    res.end();
  } else res.end(content);
}

export function authorized(req, env) {
  if (!env.BASIC_AUTH_PASSWORD) return true;
  const expected = Buffer.from('Basic ' + Buffer.from(`${env.BASIC_AUTH_USER || 'crew'}:${env.BASIC_AUTH_PASSWORD}`).toString('base64'));
  const actual = Buffer.from(req.headers.authorization || '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) throw new ApiError(413, 'Upload too large. Use a smaller photo or shorter recording.');
  let value;
  try { value = req.body; } catch { throw new ApiError(400, 'Invalid JSON body'); }
  if (value !== undefined) {
    const raw = Buffer.isBuffer(value) ? value.toString() : typeof value === 'string' ? value : JSON.stringify(value);
    if (Buffer.byteLength(raw) > limit) throw new ApiError(413, 'Upload too large. Use a smaller photo or shorter recording.');
    try { value = JSON.parse(raw); } catch { throw new ApiError(400, 'Invalid JSON body'); }
  } else {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk); size += bytes.length;
      if (size > limit) throw new ApiError(413, 'Upload too large. Use a smaller photo or shorter recording.');
      chunks.push(bytes);
    }
    try { value = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw new ApiError(400, 'Invalid JSON body'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'JSON object required');
  return value;
}

export function createApiHandler({getDatabase, databaseType, env = process.env, maxBodyBytes = 64 * 1024 * 1024, log = console.error}) {
  const sessions = new WeakMap();
  return async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const resource = path.match(/^\/api\/([a-z]+)\/?$/)?.[1];
      if (!resource) return json(res, 404, {error:'Unknown API route'});
      if (resource !== 'health' && !authorized(req, env)) {
        if (resource === 'login') res.setHeader('WWW-Authenticate', 'Basic realm="MARSWalk", charset="UTF-8"');
        return json(res, 401, {error:'Sign in with your team username and password.'});
      }
      if (resource === 'login' && req.method === 'GET') {
        res.writeHead(303, {'Location':'/', 'Cache-Control':'no-store'}); return res.end();
      }
      const methods = {health:['GET'], session:['POST'], commands:['POST'], mission:['GET','PUT'], import:['POST'], seed:['POST'], observations:['GET','PUT','DELETE'], messages:['GET','PUT','DELETE'], tasks:['GET','PUT','DELETE']};
      if (!methods[resource]) return json(res, 404, {error:'Unknown API route'});
      if (!methods[resource].includes(req.method)) return json(res, 405, {error:'Method not allowed'});
      if (!['GET','HEAD'].includes(req.method)) {
        const allowed = env.VERCEL ? [] : [`http://127.0.0.1:${env.PORT || 3000}`, `http://localhost:${env.PORT || 3000}`, 'http://127.0.0.1:5173', 'http://localhost:5173'];
        if (env.PUBLIC_ORIGIN) allowed.push(new URL(env.PUBLIC_ORIGIN).origin);
        if (env.VERCEL_URL) allowed.push(`https://${env.VERCEL_URL}`);
        if (req.headers.origin && !allowed.includes(req.headers.origin)) return json(res, 403, {error:'Origin not allowed'});
        if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) return json(res, 415, {error:'JSON body required'});
      }
      const db = await getDatabase();
      if (!sessions.has(db)) sessions.set(db, db.pollSession ? {poll:input=>db.pollSession(input), enqueue:async input=>{await db.enqueueCommand(input); return {ok:true};}} : createSession(db));
      const session = sessions.get(db);
      if (resource === 'health') return json(res, 200, {ok:true, database:databaseType, databaseId:db.databaseId, version:'1.9.10'});
      const data = req.method === 'GET' ? undefined : await readBody(req, maxBodyBytes);
      if (resource === 'session') return json(res, 200, await session.poll(data));
      if (resource === 'commands') return json(res, 200, await session.enqueue(data));
      if (resource === 'mission') {
        if (req.method === 'GET') return json(res, 200, await db.getMission());
        await db.saveMission(data); return json(res, 200, {ok:true});
      }
      if (resource === 'import') {
        if (data.migrationId !== undefined && (typeof data.migrationId !== 'string' || data.migrationId.length > 250)) throw new ApiError(400, 'Invalid migration ID');
        return json(res, 200, await db.importRecords(data, data.migrationId));
      }
      if (resource === 'seed') {
        if (!Array.isArray(data.tasks)) throw new ApiError(400, 'Tasks required');
        await db.seed(data.tasks); return json(res, 200, {ok:true});
      }
      if (req.method === 'GET') return json(res, 200, await db.list(resource));
      if (req.method === 'PUT') await db.put(resource, data);
      if (req.method === 'DELETE') await db.remove(resource, data.ids);
      return json(res, 200, {ok:true});
    } catch (error) {
      if (error instanceof ApiError) return json(res, error.status, {error:error.message});
      if (/^(Invalid |Unknown collection$|A valid record ID is required$|Missing (observations|messages|tasks) array$)/.test(error.message)) return json(res, 400, {error:error.message});
      // Log error codes only: connection strings and credentials must never be returned.
      log('MARSWalk database request failed', /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'DATABASE_ERROR');
      return json(res, 503, {error:'Database unavailable. Check the server connection settings and try again.'});
    }
  };
}
