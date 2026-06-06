import { NextResponse } from "next/server";
import { tick } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow long-running drains where the plan permits (Vercel caps per plan).
export const maxDuration = 300;

/**
 * Drains pending agent work. Invoked by:
 *  - Vercel Cron (see vercel.json) as the reliable backstop,
 *  - the frontend's 3s poll (so progress happens on any plan), and
 *  - after() hooks on each mutation.
 * Idempotent: tasks are claimed atomically, so concurrent callers are safe.
 */
export async function GET() {
  try {
    const processed = await tick();
    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
