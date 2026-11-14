-- Private application schema. No sample missions, crew, tasks or readings.
CREATE SCHEMA IF NOT EXISTS marswalk;
CREATE TABLE IF NOT EXISTS marswalk.metadata (id TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS marswalk.mission (id INTEGER PRIMARY KEY CHECK (id=1), payload JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS marswalk.records (collection TEXT NOT NULL CHECK (collection IN ('observations','messages','tasks')), id TEXT NOT NULL, payload JSONB NOT NULL, sequence BIGSERIAL NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(collection,id));
CREATE TABLE IF NOT EXISTS marswalk.commands (id TEXT PRIMARY KEY, payload JSONB NOT NULL, sequence BIGSERIAL NOT NULL);
CREATE TABLE IF NOT EXISTS marswalk.migrations (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS marswalk.session_lease (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT, expires BIGINT NOT NULL DEFAULT 0);
INSERT INTO marswalk.session_lease(id) VALUES(1) ON CONFLICT DO NOTHING;
