import { NextResponse, after } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { tick } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  const apps = await sql`
    SELECT id, applicant_name, raw_text, status, score, agent_reasoning,
           human_note, created_at
    FROM applications ORDER BY created_at DESC`;
  return NextResponse.json(apps);
}

export async function POST(req: Request) {
  await ensureSchema();
  const body = await req.json();
  const name = String(body.applicant_name || "").trim();
  const text = String(body.raw_text || "").trim();
  if (!name || !text) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const [app] = await sql<{ id: string }[]>`
    INSERT INTO applications (applicant_name, raw_text, status)
    VALUES (${name}, ${text}, 'PENDING') RETURNING id`;

  // Screening task — description holds the application id.
  await sql`
    INSERT INTO tasks (title, description, status, assigned_to)
    VALUES (${`Screen: ${name}`}, ${app.id}, 'BACKLOG', 'agent_screening')`;

  // Kick the worker in the background; the response returns immediately.
  after(async () => {
    try {
      await tick();
    } catch {
      /* cron + frontend poll are backstops */
    }
  });

  return NextResponse.json({ id: app.id, status: "queued for screening" });
}
