import { runAgent } from "@/lib/agent";
import type { AgentEvent, Occasion, Persona } from "@/lib/types";

export const maxDuration = 60;

/** Streams the agent's progress as newline-delimited JSON events. */
export async function POST(req: Request) {
  const { persona, occasion } = (await req.json()) as { persona: Persona; occasion: Occasion };
  if (!persona?.loves?.length) return Response.json({ error: "Add at least one thing this person loves." }, { status: 400 });
  if (!process.env.GROQ_API_KEY) return Response.json({ error: "GROQ_API_KEY is not set on the server." }, { status: 500 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        for await (const event of runAgent(persona, occasion)) send(event);
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}
