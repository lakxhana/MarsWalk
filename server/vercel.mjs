import {ApiError, createApiHandler, json} from './api.mjs';
import {openPostgres} from './postgres.mjs';

export function createVercelHandler({env = process.env, connect = openPostgres, log = console.error} = {}) {
  let databasePromise;
  const handler = createApiHandler({env, databaseType:'Postgres', maxBodyBytes:4_000_000, log, getDatabase:() => {
    // Each warm function reuses one pool. Mission ownership is held in Postgres.
    if (!databasePromise) databasePromise = Promise.resolve().then(() => connect({connectionString:env.DATABASE_URL, caFile:env.DATABASE_CA_FILE, ca:env.DATABASE_CA_CERT, serverless:true})).catch(error => {
      databasePromise = undefined;
      if (error.code === '28P01') throw new ApiError(503, 'Database password rejected. Update DATABASE_URL in Vercel and redeploy.');
      if (['SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(error.code)) throw new ApiError(503, 'Database certificate could not be verified. Add the Supabase CA certificate as DATABASE_CA_CERT and redeploy.');
      throw error;
    });
    return databasePromise;
  }});
  return async (req, res) => {
    if (!env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(env.DATABASE_URL) || env.DATABASE_URL.includes('[YOUR-PASSWORD]')) return json(res, 503, {error:'Set DATABASE_URL to the full Supabase connection string, including your database password, then redeploy.'});
    if (env.APP_ACCESS === 'private' && !env.BASIC_AUTH_PASSWORD) return json(res, 503, {error:'Private access requires BASIC_AUTH_PASSWORD. Set it in Vercel or use APP_ACCESS=public, then redeploy.'});
    try {
      if (!env.PUBLIC_ORIGIN || new URL(env.PUBLIC_ORIGIN).protocol !== 'https:') throw new Error();
    } catch { return json(res, 503, {error:'Set PUBLIC_ORIGIN to your HTTPS website address, then redeploy.'}); }
    return handler(req, res);
  };
}
