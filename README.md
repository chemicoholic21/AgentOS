# AgentOS — Candidate Screening & Outreach

A coordination layer where humans and agents collaboratively screen candidates,
manage outreach, and handle edge cases — with persistent memory, human approval
loops, and agent-to-agent handoffs.

A generic talent outreach tool for **early-career job seekers and career
switchers**: screen candidate applications against criteria, generate
personalized outreach to connectors (recruiters, hiring managers, career-services
staff, community organizers), and plan distribution channels — getting blocked on
geo-restrictions and asking a human for local contacts when needed.

The app lives in **[`web/`](web/)** — a single-platform **Next.js + TypeScript**
app (UI + API + agents in one codebase) that deploys to **Vercel** with no extra
infrastructure. See **[`web/README.md`](web/README.md)** for full deploy and local
dev instructions.

## Three Agents

| Agent | Role | Behaviour |
|-------|------|-----------|
| **Screening Agent** | Application Screener | Reads each candidate application, scores 1–10 against the hiring-readiness criteria, outputs `APPROVE` / `REJECT` / `MAYBE`. |
| **Outreach Agent** | Message Personalizer | Generates personalized outreach messages per connector profile, then waits for human approval. |
| **Channel Agent** | Distribution Strategy | Identifies platforms and job boards to post on, gets **BLOCKED** on geo-restrictions (China/Korea), and asks the human for a local contact. |

## Stack

- **Framework:** Next.js (App Router) + React + TypeScript + Tailwind CSS
- **Database:** PostgreSQL (Vercel Postgres / Neon in production)
- **Agents:** NVIDIA NIM (Llama / Nemotron) or Claude API — with an offline mock
- **Hosting:** Vercel (single platform)

## LLM providers

Agents pick a provider at startup (priority order):

1. **Anthropic / Claude** — set `ANTHROPIC_API_KEY` (model `CLAUDE_MODEL`,
   default `claude-sonnet-4-20250514`), via the `@anthropic-ai/sdk`.
2. **NVIDIA NIM** — set `NVIDIA_API_KEY` (model `NVIDIA_MODEL`, default
   `meta/llama-3.3-70b-instruct`). NVIDIA's endpoint
   (`https://integrate.api.nvidia.com/v1`) is **OpenAI-compatible** and hosts
   Llama / Nemotron models — **not** Claude — so it's used via the `openai` SDK.
3. **Offline MOCK mode** — if neither key is set, deterministic responses in
   `web/lib/mock.ts` produce the exact JSON each agent expects, so the full
   coordination loop (screening, blocking, human unblock, memory, approvals) is
   demoable without a key or network.

Set keys as Vercel **Environment Variables** (or `web/.env.local` for local dev).

## Quick start (local)

```bash
cd web
npm install
cp .env.example .env.local   # set DATABASE_URL (+ optional NVIDIA_API_KEY)
npm run dev                  # http://localhost:3000
```

Tables are created automatically on first request — no migration step.

## How it flows

1. **Submit a candidate application** (Applications tab) → an `agent_screening`
   task is queued.
2. The serverless **`tick()`** worker picks it up, the Screening Agent scores it,
   sets the application status, and writes to **agent memory**.
3. `MAYBE` results land in `WAITING_APPROVAL` for a human decision in the UI.
4. **Create a task** for the Outreach or Channel agent (Tasks tab / Kanban).
5. The **Channel Agent** blocks on geo-restrictions and asks for a local contact.
   Respond in the modal → the contact is saved to memory, the task resets, and
   the agent **retries** successfully.
6. Watch everything in the **Timeline** (activity log) and **Memory** tabs.

## Layout

```
web/
  app/
    page.tsx                 UI — Applications + Tasks (Kanban) + Timeline + Memory
    layout.tsx, globals.css
    api/                     route handlers
      applications/          GET list, POST submit, [id]/decide
      tasks/                 GET list, POST create, [id]/respond
      logs/  memory/         GET
      cron/tick/             serverless worker entrypoint
  lib/
    agents.ts                screening / outreach / channel + tick() processor
    llm.ts                   provider selection (Anthropic > NVIDIA > mock)
    mock.ts                  offline LLM stand-in
    db.ts                    postgres.js client + idempotent schema bootstrap
  vercel.json                cron config (/api/cron/tick every minute)
```

See **[`web/README.md`](web/README.md)** for how the polling worker is replaced by
serverless atomic-claim processing and how to deploy to Vercel.
