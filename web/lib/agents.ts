import { sql, ensureSchema } from "./db";
import { callModel } from "./llm";

// ---------------------------------------------------------------------------
// Shared helpers (memory, logging, task updates)
// ---------------------------------------------------------------------------

async function getMemory(agentName: string): Promise<Record<string, string>> {
  const rows = await sql<{ memory_key: string; memory_value: string }[]>`
    SELECT memory_key, memory_value FROM agent_memory
    WHERE agent_name = ${agentName}`;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.memory_key] = r.memory_value;
  return out;
}

async function saveMemory(agentName: string, key: string, value: string) {
  await sql`
    INSERT INTO agent_memory (agent_name, memory_key, memory_value)
    VALUES (${agentName}, ${key}, ${value})
    ON CONFLICT (agent_name, memory_key)
    DO UPDATE SET memory_value = EXCLUDED.memory_value`;
}

async function logActivity(
  taskId: string | null,
  agentName: string,
  action: string,
  detail = "",
) {
  await sql`
    INSERT INTO activity_logs (task_id, agent_name, action, detail)
    VALUES (${taskId}, ${agentName}, ${action}, ${detail})`;
}

async function updateTask(taskId: string, fields: Record<string, unknown>) {
  const cols = Object.keys(fields);
  if (cols.length === 0) return;
  // postgres.js dynamic SET helper: generates `"col" = $n, ...`.
  await sql`
    UPDATE tasks SET ${sql(fields, ...cols)}, updated_at = now()
    WHERE id = ${taskId}`;
}

function parseJson(raw: string): Record<string, unknown> {
  const clean = raw
    .trim()
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  return JSON.parse(clean);
}

// ---------------------------------------------------------------------------
// Screening Agent
// ---------------------------------------------------------------------------

const SCREENING = "Screening Agent";

const SCREENING_PROMPT = `You are screening candidates for a talent outreach pipeline aimed at early-career job seekers and people switching careers. The goal is to surface motivated, hands-on candidates worth connecting to opportunities.

ACCEPT if the candidate:
- Has been building things (projects, side projects, anything hands-on)
- Expresses strong motivation to learn and grow professionally
- Is genuinely early in their career or making a real career switch
- Wants to contribute, collaborate, or help others in their field

REJECT if the candidate:
- Primary motivation is founding their own startup (not seeking a role)
- Only wants to do their existing job a bit better (not actually job-seeking or switching)
- Has no expressed motivation or passion
- Has not built anything and shows no initiative

MAYBE if:
- Motivation is unclear but there are positive signals
- Mixed signals — some good, some bad

You have seen many applications. Save what you learn to memory.

Respond ONLY with valid JSON, no other text:
{
  "decision": "APPROVE" | "REJECT" | "MAYBE",
  "score": 1-10,
  "reasoning": "One clear sentence explaining the decision",
  "key_signals": ["signal 1", "signal 2"],
  "memory_updates": {
    "total_screened": "number",
    "common_rejection_reason": "most common reason so far"
  }
}`;

async function screenApplication(taskId: string, applicationId: string) {
  await logActivity(taskId, SCREENING, "STARTED", `Screening application ${applicationId}`);

  const apps = await sql<{ applicant_name: string; raw_text: string }[]>`
    SELECT applicant_name, raw_text FROM applications WHERE id = ${applicationId}`;
  if (apps.length === 0) {
    await updateTask(taskId, { status: "COMPLETED", output: "Application not found" });
    return;
  }
  const { applicant_name, raw_text } = apps[0];

  const memory = await getMemory(SCREENING);
  const result = await callModel(
    SCREENING,
    SCREENING_PROMPT,
    `Applicant: ${applicant_name}\n\nApplication:\n${raw_text}`,
    memory,
  );

  try {
    const data = parseJson(result);
    const decision = (data.decision as string) || "MAYBE";
    const score = (data.score as number) ?? 5;
    const reasoning = (data.reasoning as string) || "";
    const statusMap: Record<string, string> = {
      APPROVE: "APPROVED",
      REJECT: "REJECTED",
      MAYBE: "WAITING_APPROVAL",
    };
    const newStatus = statusMap[decision] || "WAITING_APPROVAL";

    await sql`
      UPDATE applications
      SET status = ${newStatus}, score = ${score}, agent_reasoning = ${reasoning}
      WHERE id = ${applicationId}`;

    const updates = (data.memory_updates as Record<string, unknown>) || {};
    for (const [k, v] of Object.entries(updates)) await saveMemory(SCREENING, k, String(v));

    const signals = (data.key_signals as string[]) || [];
    const output = `Decision: ${decision} (score: ${score}/10)\nReasoning: ${reasoning}\nKey signals: ${signals.join(", ")}`;
    await updateTask(taskId, { status: "COMPLETED", output });
    await logActivity(taskId, SCREENING, "COMPLETED", `${applicant_name}: ${decision} (${score}/10)`);
  } catch (e) {
    await updateTask(taskId, {
      status: "BLOCKED",
      block_reason: `Parse error: ${String(e)}`,
      block_question: "Please screen this application manually",
    });
  }
}

// ---------------------------------------------------------------------------
// Outreach Agent
// ---------------------------------------------------------------------------

const OUTREACH = "Outreach Agent";

async function runOutreach(taskId: string, title: string, description: string) {
  await logActivity(taskId, OUTREACH, "STARTED", "Generating outreach messages");

  const memory = await getMemory(OUTREACH);
  const provenTemplate =
    memory.proven_template ||
    "Hey {name}, if you are still in touch with early-career folks or people looking to switch careers, could you share this opportunity with them? {link}";

  const systemPrompt = `You are an outreach agent for a talent program that connects early-career job seekers and career switchers to opportunities.
Target: well-connected professionals — recruiters, hiring managers, university career staff, community organizers — who can amplify to their networks.
NOT direct candidates — connectors who know job seekers and junior talent.

Proven message template that worked:
${provenTemplate}

Generate 3 personalized outreach messages for different connector profiles.
Each message should feel personal, not templated.

Return ONLY valid JSON:
{
  "messages": [
    { "profile_type": "University career-services coordinator", "platform": "LinkedIn", "message": "Hey [Name], ...", "why_this_works": "One sentence" },
    { "profile_type": "Senior engineer / hiring manager", "platform": "LinkedIn", "message": "Hey [Name], ...", "why_this_works": "One sentence" },
    { "profile_type": "Community organizer / meetup host", "platform": "LinkedIn DM or WhatsApp", "message": "Hey [Name], ...", "why_this_works": "One sentence" }
  ],
  "memory_updates": { "proven_template": "best performing template from this batch" }
}`;

  const result = await callModel(OUTREACH, systemPrompt, description || title, memory);

  try {
    const data = parseJson(result);
    const updates = (data.memory_updates as Record<string, unknown>) || {};
    for (const [k, v] of Object.entries(updates)) await saveMemory(OUTREACH, k, String(v));

    const messages = (data.messages as Record<string, string>[]) || [];
    const output = messages
      .map((m) => `[${m.profile_type} — ${m.platform}]\n${m.message}\nWhy: ${m.why_this_works}\n`)
      .join("\n");

    await updateTask(taskId, { status: "WAITING_APPROVAL", output });
    await logActivity(taskId, OUTREACH, "WAITING_APPROVAL", "Outreach messages ready for review");
  } catch (e) {
    await updateTask(taskId, {
      status: "BLOCKED",
      block_reason: `Error: ${String(e)}`,
      block_question: "Please review manually",
    });
  }
}

// ---------------------------------------------------------------------------
// Channel Agent
// ---------------------------------------------------------------------------

const CHANNEL = "Channel Agent";
const BLOCKED_CHANNELS = [
  "ShareChat (geo-restricted)",
  "Xiaohongshu (requires Chinese account)",
  "Chinese job boards (no access)",
];

async function runChannel(taskId: string, title: string, description: string) {
  await logActivity(taskId, CHANNEL, "STARTED", "Identifying distribution channels");

  const memory = await getMemory(CHANNEL);
  const localContacts = memory.local_contacts || "none provided yet";

  if (
    !("china_contact" in memory) &&
    !("korea_contact" in memory) &&
    !("local_contacts" in memory)
  ) {
    await updateTask(taskId, {
      status: "BLOCKED",
      block_reason:
        "Cannot reach Chinese or Korean platforms from this region. Xiaohongshu, Chinese job boards, and Naver require local accounts.",
      block_question:
        "Do you have a local contact in China or South Korea who could post on local platforms? If yes, provide their name and what they can access.",
    });
    await logActivity(taskId, CHANNEL, "BLOCKED", "Waiting for local contact info for China/Korea");
    return;
  }

  const systemPrompt = `You are a distribution strategy agent for a talent outreach campaign.
You find the best platforms, job boards, and communities to reach early-career job seekers and career switchers.
Known blocked channels (geo-restricted): ${BLOCKED_CHANNELS.join(", ")}
Local contacts available: ${localContacts}

Identify the best channels to reach early-career job seekers and career switchers.
For each channel, specify what action is needed and who should do it.

Return ONLY valid JSON:
{
  "channels": [
    { "platform": "Platform name", "region": "Target region", "action": "What to do", "who": "human | agent | local_contact", "status": "ready | needs_local_contact | needs_account", "estimated_reach": "rough number" }
  ],
  "blocked_channels": [
    { "platform": "Platform", "reason": "Why blocked", "workaround": "Possible workaround" }
  ]
}`;

  const result = await callModel(CHANNEL, systemPrompt, description || title, memory);

  try {
    const data = parseJson(result);
    const channels = (data.channels as Record<string, string>[]) || [];
    const blocked = (data.blocked_channels as Record<string, string>[]) || [];

    let output = "Channels ready:\n";
    for (const c of channels) output += `• ${c.platform} (${c.region}) — ${c.action} [${c.who}]\n`;
    output += "\nBlocked channels:\n";
    for (const b of blocked) output += `• ${b.platform}: ${b.reason} → ${b.workaround}\n`;

    await updateTask(taskId, { status: "WAITING_APPROVAL", output });
    await logActivity(taskId, CHANNEL, "WAITING_APPROVAL", "Channel strategy ready for review");
  } catch (e) {
    await updateTask(taskId, {
      status: "BLOCKED",
      block_reason: `Error: ${String(e)}`,
      block_question: "Please review manually",
    });
  }
}

// ---------------------------------------------------------------------------
// Serverless "worker": atomic claim + process. Safe to call concurrently from
// after(), Vercel Cron, and the frontend poll — only one caller wins each task.
// ---------------------------------------------------------------------------

type ClaimableTask = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
};

async function processClaimed(task: ClaimableTask) {
  try {
    if (task.assigned_to === "agent_screening") {
      await screenApplication(task.id, task.description || "");
    } else if (task.assigned_to === "agent_outreach") {
      await runOutreach(task.id, task.title, task.description || "");
    } else if (task.assigned_to === "agent_channel") {
      await runChannel(task.id, task.title, task.description || "");
    } else {
      await updateTask(task.id, { status: "COMPLETED", output: "No agent for assignee" });
    }
  } catch (e) {
    // Never leave a task stuck IN_PROGRESS if a model call fails/times out.
    await updateTask(task.id, {
      status: "BLOCKED",
      block_reason: `Model call failed: ${String(e)}`,
      block_question: "Retry, or handle this one manually.",
    });
  }
}

async function handleApprovedChannelTasks() {
  const approved = await sql<{ id: string; human_response: string }[]>`
    SELECT id, human_response FROM tasks
    WHERE status = 'APPROVED' AND assigned_to = 'agent_channel'
      AND human_response IS NOT NULL`;
  for (const t of approved) {
    await saveMemory(CHANNEL, "local_contacts", t.human_response);
    await logActivity(t.id, CHANNEL, "RESUMED", `Human provided contacts: ${t.human_response}`);
    await updateTask(t.id, { status: "BACKLOG", human_response: null });
  }
}

/**
 * Drive any pending work to completion. Atomically claims each BACKLOG task
 * (BACKLOG -> IN_PROGRESS) so concurrent ticks never double-process.
 */
export async function tick(): Promise<number> {
  await ensureSchema();
  await handleApprovedChannelTasks();

  let processed = 0;
  // Claim and process one task at a time until the backlog is empty.
  // (Each tick invocation drains what it can within the function's lifetime.)
  for (;;) {
    const claimed = await sql<ClaimableTask[]>`
      UPDATE tasks SET status = 'IN_PROGRESS', updated_at = now()
      WHERE id = (
        SELECT id FROM tasks
        WHERE status = 'BACKLOG' AND assigned_to <> 'human'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, title, description, assigned_to`;
    if (claimed.length === 0) break;
    await processClaimed(claimed[0]);
    processed++;
  }
  return processed;
}
