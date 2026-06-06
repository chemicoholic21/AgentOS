import { NextResponse, after } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { tick } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureSchema();
  const { id } = await params;
  const body = await req.json();
  const response = String(body.response || "");
  const action = String(body.action || "");

  const rows = await sql<{ id: string }[]>`SELECT id FROM tasks WHERE id = ${id}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "approve") {
    await sql`UPDATE tasks SET status = 'APPROVED', human_response = ${response}, updated_at = now() WHERE id = ${id}`;
  } else if (action === "reject") {
    await sql`UPDATE tasks SET status = 'COMPLETED', output = ${`Rejected: ${response}`}, updated_at = now() WHERE id = ${id}`;
  } else if (action === "respond") {
    await sql`UPDATE tasks SET status = 'APPROVED', human_response = ${response}, updated_at = now() WHERE id = ${id}`;
  }

  await sql`
    INSERT INTO activity_logs (task_id, agent_name, action, detail)
    VALUES (${id}, 'human', ${action.toUpperCase()}, ${response})`;

  // A human response may unblock a channel task — let the worker pick it up.
  after(async () => {
    try {
      await tick();
    } catch {
      /* backstops handle failures */
    }
  });

  return NextResponse.json({ status: "updated" });
}
