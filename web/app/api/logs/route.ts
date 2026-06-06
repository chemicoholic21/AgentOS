import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  const logs = await sql`
    SELECT id, task_id, agent_name, action, detail, created_at
    FROM activity_logs ORDER BY created_at DESC LIMIT 200`;
  return NextResponse.json(logs);
}
