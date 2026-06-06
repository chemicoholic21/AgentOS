import { NextResponse, after } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { tick } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  const tasks = await sql`
    SELECT id, title, description, status, assigned_to, block_reason,
           block_question, output, created_at
    FROM tasks ORDER BY created_at ASC`;
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  await ensureSchema();
  const body = await req.json();
  const title = String(body.title || "").trim();
  const description = String(body.description || "");
  const assignedTo = String(body.assigned_to || "agent_outreach");
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const [task] = await sql<{ id: string }[]>`
    INSERT INTO tasks (title, description, status, assigned_to)
    VALUES (${title}, ${description}, 'BACKLOG', ${assignedTo})
    RETURNING id`;

  after(async () => {
    try {
      await tick();
    } catch {
      /* backstops handle failures */
    }
  });

  return NextResponse.json({ id: task.id, status: "created" });
}
