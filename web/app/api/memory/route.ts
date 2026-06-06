import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  const memory = await sql`
    SELECT id, agent_name, memory_key, memory_value, created_at
    FROM agent_memory ORDER BY agent_name ASC, memory_key ASC`;
  return NextResponse.json(memory);
}
