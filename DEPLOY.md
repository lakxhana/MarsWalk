# Shared deployment

**Recommended: Supabase Postgres + one Node 24 web service.** The backend connects to Postgres; browsers use the same authenticated `/api`. Earth/Mars updates poll every second. No browser database keys, Supabase client SDK or Realtime subscription is needed.

1. Create a fresh Supabase project. In **Connect → Session pooler**, copy the complete connection URI and substitute your database password. Use the provider's exact host/user, not a guessed URL. The session pooler works with an IPv4 Node host.
2. Deploy this folder as a Node web service (or Docker container). Build: `npm ci && npm run build`. Start: `node --experimental-sqlite server/index.mjs`. Use Node 24.
3. Set these **server secrets/settings** on the host:
   - `DATABASE_URL` = the connection URI
   - `HOST=0.0.0.0`; use the host's `PORT`
   - `PUBLIC_ORIGIN` = your exact HTTPS URL, no trailing slash
   - `BASIC_AUTH_USER=crew`; `BASIC_AUTH_PASSWORD` = your team's private password
4. The server creates the empty `marswalk` schema using `server/schema.sql`. It imports no previous missions. Do not expose this schema through Supabase's Data API. The server connection user needs schema/table creation rights for first startup.
5. Open the same HTTPS URL in two browsers; choose Earth team and Mars crew. Plan on Earth, review/start on Mars, monitor on Earth. `/api/health` reports `Postgres` after a successful connection.

TLS certificate verification is always enabled. If the project requires its own CA, download it from the provider, mount it on the server and set `DATABASE_CA_FILE`. Do not disable certificate checks. Do not put DATABASE_URL in a `VITE_` variable or a Git commit.

Keep one mission-controller browser open: it advances the simulation. A database lease prevents two clients from advancing it together. After disconnect/takeover an active walk resumes paused. This is a shared team workspace with one mission, not separate authenticated roles or a server-run unattended simulator.

## Local use
`npm start` installs, builds and starts the app at http://127.0.0.1:3000. Node 22.12+ is required; Node 24 is recommended. No environment settings are needed. The fresh database is `data/marswalk-v2.sqlite`; an older `marswalk.sqlite` is left untouched and is not auto-imported. The ZIP contains no personal database.

For local Postgres, put the settings in `.env`; npm start loads them. Prefer a fresh Supabase project for a clean start. Existing Postgres records are preserved on restart, not silently erased.

`docker compose up --build -d` uses SQLite in the persistent `mission-data` volume unless DATABASE_URL is configured. For SQLite hosting, use one service instance and a persistent disk; set MARSWALK_DB to its path. Static-only hosting cannot run this Node API. Supabase removes the need for a local persistent mission disk; attachments remain in database records (64 MB API request limit), suitable for a small team prototype.

## Sources and limits
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/platform/ssl-enforcement
- https://node-postgres.com/features/ssl
- https://node-postgres.com/features/transactions

Verified locally: two browser sessions share movement, tasks, notes and two-way messages; ending a walk archives it and closes Mission control. HTTP tests verify disk persistence after restart and reject follower overwrites. Postgres SQL/transactions use PGlite tests, not a hosted Supabase connection. This package has not been connected to your Supabase account or deployed publicly. Hosting/account setup is still required. Keep database backups through your provider; never commit a personal database.
