// Minimal client for Groq's OpenAI-compatible chat completions endpoint.

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

interface ChatOptions {
  messages: Message[];
  tools?: ToolDef[];
  toolChoice?: "auto" | "required" | "none";
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export async function chat(opts: ChatOptions): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.6,
    max_completion_tokens: opts.maxTokens ?? 4096,
  };
  if (opts.tools) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? "auto";
  }
  if (opts.json) body.response_format = { type: "json_object" };

  // Groq occasionally rejects a malformed tool call (400 tool_use_failed); one retry usually clears it.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = (await res.json()) as { choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[] };
      const msg = data.choices[0].message;
      return { content: msg.content, toolCalls: msg.tool_calls ?? [] };
    }
    const text = await res.text();
    const retryable = res.status === 429 || res.status >= 500 || text.includes("tool_use_failed");
    if (!retryable || attempt >= 2) throw new Error(`Groq ${res.status}: ${text.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
}
