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
}

export interface Reply {
  content: string | null;
  toolCalls: ToolCall[];
}

export const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

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
  const body: Record<string, unknown> = {
    model: MODEL,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.6,
    max_completion_tokens: opts.maxTokens ?? 2048,
  };
  // gpt-oss reasons before answering; those tokens count against the per-minute budget.
  if (MODEL.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
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
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
