import { fetchRetry } from "./http";

// Minimal client for Groq's OpenAI-compatible chat completions endpoint.
// Two keys are supported (GROQ_API_KEY, GROQ_API_KEY_2): each agent prefers its
// own "lane" so their per-key token budgets don't collide, and either lane fails
// over to the other key when rate limited.

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatOptions {
  messages: Message[];
  tools?: ToolDef[];
  toolChoice?: "auto" | "required" | "none";
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Preferred key index; other keys are fallbacks. */
  lane?: number;
  /** Models to try in order; defaults to MODELS. */
  models?: string[];
  /** A rate limit that clears within this many seconds is waited out rather than moving to the next model. */
  maxWait?: number;
}

export interface Reply {
  content: string | null;
  toolCalls: ToolCall[];
}

export const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// Groq's free tier gives every model its own daily token budget, so when the main model's is spent
// on every key, the next model in line takes over instead of the run failing.
export const MODELS = [MODEL, ...(process.env.GROQ_FALLBACK_MODELS ?? "qwen/qwen3.8-27b").split(",").map((m) => m.trim())].filter(
  (m, i, all) => m && all.indexOf(m) === i,
);

const KEYS = [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2].filter(Boolean) as string[];

export const hasGroqKey = () => KEYS.length > 0;

/** Every key is rate limited; the caller decides whether to wait. */
export class RateLimited extends Error {
  constructor(public retryAfter: number) {
    super(`Groq rate limit reached; retry in ${retryAfter}s`);
  }
}

function retryAfterSeconds(res: Response, text: string): number {
  const header = Number(res.headers.get("retry-after"));
  if (header > 0) return header;
  const m = text.match(/try again in (?:(\d+)m)?([\d.]+)s/);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : 10;
}

export async function chat(opts: ChatOptions): Promise<Reply> {
  if (!KEYS.length) throw new Error("GROQ_API_KEY is not set.");
  let soonest = Infinity;
  for (const model of opts.models ?? MODELS) {
    try {
      return await chatWith(model, opts);
    } catch (err) {
      if (!(err instanceof RateLimited)) throw err;
      // A short wait for a better model beats a weaker one; a daily limit moves on to the next model.
      if (err.retryAfter <= (opts.maxWait ?? 60)) throw err;
      soonest = Math.min(soonest, err.retryAfter);
      console.warn(`[groq] ${model} is rate limited for ${err.retryAfter}s on every key; trying the next model`);
    }
  }
  throw new RateLimited(Math.ceil(soonest));
}

async function chatWith(model: string, opts: ChatOptions): Promise<Reply> {
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.6,
    max_completion_tokens: opts.maxTokens ?? 2048,
  };
  // gpt-oss reasons before answering; those tokens count against the per-minute budget.
  if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
  if (opts.tools) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? "auto";
  }
  if (opts.json) body.response_format = { type: "json_object" };

  const lane = (opts.lane ?? 0) % KEYS.length;
  const order = KEYS.map((_, i) => KEYS[(lane + i) % KEYS.length]);
  let soonest = Infinity;

  for (const key of order) {
    // Groq occasionally rejects a malformed tool call (400 tool_use_failed) or blips with a 5xx.
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetchRetry("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[] };
        const msg = data.choices[0].message;
        return { content: msg.content, toolCalls: msg.tool_calls ?? [] };
      }
      const text = await res.text();
      if (res.status === 429) {
        soonest = Math.min(soonest, retryAfterSeconds(res, text));
        break; // try the next key
      }
      if (!(res.status >= 500 || text.includes("tool_use_failed")) || attempt === 2) {
        throw new Error(`Groq ${res.status}: ${text.slice(0, 300)}`);
      }
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw new RateLimited(Math.ceil(soonest));
}
