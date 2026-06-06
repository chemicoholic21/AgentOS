import postgres from "postgres";

// Single shared connection. On Vercel serverless we keep the pool tiny; a
// Neon/Vercel-Postgres pooled connection string handles the fan-out.
const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
  schemaReady?: Promise<void>;
};

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://daytona:daytona@localhost:5432/agentos";

export const sql =
  globalForDb.sql ??
  postgres(DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
    // Neon/Vercel Postgres requires TLS; local dev does not. Enable when the
    // host looks remote.
    ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : "require",
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

// Lazily ensure the schema exists (idempotent). Cached so it runs once per
// warm instance.
export function ensureSchema(): Promise<void> {
  if (!globalForDb.schemaReady) {
    globalForDb.schemaReady = (async () => {
      // `.simple()` uses the simple query protocol so the whole multi-statement
      // DDL batch actually runs (the default extended protocol allows only one
      // statement per query).
      await sql
        .unsafe(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        CREATE TABLE IF NOT EXISTS applications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          applicant_name TEXT NOT NULL,
          raw_text TEXT NOT NULL,
          status TEXT DEFAULT 'PENDING',
          score INTEGER,
          agent_reasoning TEXT,
          human_note TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'BACKLOG',
          assigned_to TEXT NOT NULL,
          parent_task_id UUID REFERENCES tasks(id),
          block_reason TEXT,
          block_question TEXT,
          human_response TEXT,
          output TEXT,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS activity_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id UUID REFERENCES tasks(id),
          agent_name TEXT,
          action TEXT NOT NULL,
          detail TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS agent_memory (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          agent_name TEXT NOT NULL,
          memory_key TEXT NOT NULL,
          memory_value TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now(),
          UNIQUE(agent_name, memory_key)
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_apps_status ON applications(status);
        CREATE INDEX IF NOT EXISTS idx_logs_task ON activity_logs(task_id);

        -- Ensure DB-side UUID defaults exist even if a table was created
        -- elsewhere without them (idempotent).
        ALTER TABLE applications  ALTER COLUMN id SET DEFAULT gen_random_uuid();
        ALTER TABLE tasks         ALTER COLUMN id SET DEFAULT gen_random_uuid();
        ALTER TABLE activity_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
        ALTER TABLE agent_memory  ALTER COLUMN id SET DEFAULT gen_random_uuid();
      `)
        .simple();
    })();
  }
  return globalForDb.schemaReady;
}
