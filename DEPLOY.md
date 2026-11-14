# Deploy on Vercel + Supabase

This version includes the Vercel API. Upload the **whole project**, including `api/`, `server/` and `vercel.json`; uploading only `dist/` will not work.

1. In Supabase, open **Connect → Transaction pooler**. Copy the full string starting `postgresql://` (shared pooler, port **6543**). Replace `[YOUR-PASSWORD]` with your database password. Percent-encode special characters in the password portion. Never share this string or commit it.
2. In Vercel → project → **Settings → Environment Variables**, add these for **Production**:

   | Key | Value | Type |
   |---|---|---|
   | `DATABASE_URL` | Full Supabase connection string, password included | Secret |
   | `PUBLIC_ORIGIN` | `https://mars-walk-wine.vercel.app` (or your actual site URL) | Config |
   | `BASIC_AUTH_USER` | `crew` | Config |
   | `BASIC_AUTH_PASSWORD` | A separate private password for your team | Secret |

   `DATABASE_URL` is the **name**, not the value. No `VITE_` prefix. Preview deployments need their own environment variables; use a separate database if they should not share production missions.
3. Push this updated code to your existing GitHub repository. Keep your existing `.git` folder. Do not upload `.env`, `data/`, `node_modules/` or database files. Select **Vite**, Node **24.x**, build **npm run build**, output **dist**. The project root must contain `package.json` and `vercel.json`.
4. Deploy the updated commit. If you changed variables after a deployment, **Deployments → latest deployment → Redeploy**.
5. Open **/api/health** on your website. Success shows `ok: true`, `database: "Postgres"`, `version: "1.9.10"`. A 404 means the new API files have not been deployed. A setup error names the setting to fix.
6. Open the site, click **Sign in** and use the team username/password. Open the same URL in another browser and sign in there too. Earth plans → Mars reviews/starts → Earth monitors. Check a message and completed task on both sides, then reload to confirm persistence.

The first connection creates empty tables in the private `marswalk` schema. Existing Postgres records are preserved. The connection user needs permission to create that schema/tables; no SQL copy/paste is required. Do not expose `marswalk` through the Supabase Data API. No Supabase browser keys, SDK or Realtime setup is required; the app polls its API each second.

## If it still fails

| Result | Fix |
|---|---|
| `/api/health` returns 404 | Deploy the new code, not only environment variables. Check Vercel's root directory. |
| `DATABASE_URL` setup error | Paste the complete `postgresql://...` string with the password filled in. |
| Password rejected | Correct the database password in the URL, then redeploy. |
| Certificate error | Download the CA certificate from Supabase database settings. Add its full PEM text as `DATABASE_CA_CERT` in Vercel, then redeploy. Certificate verification stays enabled. |
| Other connection error | Check Vercel function logs, the exact pooler host/user, and whether the Supabase project is running. |
| Origin not allowed | Set `PUBLIC_ORIGIN` to your exact HTTPS website address and redeploy. |

## Limits

- Mission data is behind one shared team login. Earth/Mars are views, not separately authorized roles. The static interface and bundled science assets remain public.
- Keep one controller browser open; it advances the simulation. A Postgres lease allows only one controller. If it disconnects, takeover pauses an active walk for review.
- Vercel uploads are limited here to **4 MB of JSON per request**, including encoded photos/audio. Larger media needs object storage; it is not added in this deployment fix. Long record lists use streamed responses.
- API and SQL tests cover separate server instances, shared tasks/messages/notes, persistence and controller ownership. They use local PGlite, not your hosted Supabase account. Your live deployment still needs the setup and two-browser check above.

## Local or persistent Node hosting

`npm start` runs locally on Node 24 with an empty SQLite database at `data/marswalk-v2.sqlite`; older files are not imported or deleted. For local Postgres, copy `.env.example` to `.env` and fill in the settings.

A persistent Node host can still use **Session pooler**, `HOST=0.0.0.0`, its assigned `PORT`, and `node --experimental-sqlite server/index.mjs` after building. SQLite hosting needs a persistent disk and one server instance. Docker remains supported. Optional `DATABASE_CA_FILE` points to a mounted provider certificate.

Sources: [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [Vercel limits](https://vercel.com/docs/functions/limitations).
