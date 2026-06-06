-- AgentOS schema (also auto-created by SQLAlchemy on startup).

-- Applications
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_name TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED | MAYBE | WAITING_APPROVAL
    score INTEGER,
    agent_reasoning TEXT,
    human_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tasks (coordination layer)
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'BACKLOG', -- BACKLOG | IN_PROGRESS | BLOCKED | WAITING_APPROVAL | APPROVED | COMPLETED
    assigned_to TEXT NOT NULL,
    parent_task_id UUID REFERENCES tasks(id),
    block_reason TEXT,
    block_question TEXT,
    human_response TEXT,
    output TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Activity log
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id),
    agent_name TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Agent memory
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
