import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { mockRespond } from "./mock";

const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const NVIDIA_API_KEY = (process.env.NVIDIA_API_KEY || "").trim();
const NVIDIA_BASE_URL =
  process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct";

// Provider selection: Anthropic (if key) > NVIDIA NIM (if key) > offline mock.
export const PROVIDER: "anthropic" | "nvidia" | "mock" = ANTHROPIC_API_KEY
  ? "anthropic"
  : NVIDIA_API_KEY
    ? "nvidia"
    : "mock";

export const MODEL =
  PROVIDER === "anthropic"
    ? CLAUDE_MODEL
    : PROVIDER === "nvidia"
      ? NVIDIA_MODEL
      : "mock";

let anthropicClient: Anthropic | null = null;
let nvidiaClient: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient)
    anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return anthropicClient;
}

function getNvidia(): OpenAI {
  if (!nvidiaClient)
    nvidiaClient = new OpenAI({
      apiKey: NVIDIA_API_KEY,
      baseURL: NVIDIA_BASE_URL,
      timeout: 120_000,
      maxRetries: 1,
    });
  return nvidiaClient;
}

/**
 * Call the active LLM provider. `memory` is appended to the system prompt for
 * context (matching the Python BaseAgent behaviour). Returns raw text.
 */
export async function callModel(
  agentName: string,
  systemPrompt: string,
  userMessage: string,
  memory: Record<string, string>,
): Promise<string> {
  const memoryContext =
    Object.keys(memory).length > 0
      ? `\n\nYour memory from previous tasks:\n${JSON.stringify(memory, null, 2)}`
      : "";
  const fullSystem = systemPrompt + memoryContext;

  if (PROVIDER === "mock") {
    return mockRespond(agentName, userMessage, memory);
  }

  if (PROVIDER === "anthropic") {
    const res = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: fullSystem,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = res.content[0];
    return block.type === "text" ? block.text : "";
  }

  // NVIDIA — OpenAI-compatible chat completions.
  const res = await getNvidia().chat.completions.create({
    model: MODEL,
    max_tokens: 1000,
    temperature: 0.2,
    messages: [
      { role: "system", content: fullSystem },
      { role: "user", content: userMessage },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}
