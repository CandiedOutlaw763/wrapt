import { chat } from "@/lib/groq";
import type { BaselineIdea, Occasion, Persona } from "@/lib/types";
import { formatMoney, marketFor } from "@/lib/markets";

/**
 * The control group: the same model with the same persona, but no taste graph.
 * Shown beside Wrapt's picks so the difference Qloo makes is visible.
 */
export async function POST(req: Request) {
  const { persona, occasion } = (await req.json()) as { persona: Persona; occasion: Occasion };
  try {
    const { content } = await chat({
      json: true,
      lane: 1,
      temperature: 0.7,
      messages: [
        { role: "system", content: 'Suggest gifts. Reply as JSON: {"ideas":[{"title":"...","reason":"..."}]} with exactly 6 ideas.' },
        {
          role: "user",
          content: `Gift ideas for ${persona.name} (${persona.relationship}). They like: ${persona.loves.map((l) => l.name).join(", ")}. Hobbies: ${persona.hobbies || "n/a"}. Occasion: ${occasion.event}. Budget: ${formatMoney(occasion.budget, marketFor(occasion.market))}.`,
        },
      ],
    });
    const ideas = (JSON.parse(content ?? "{}") as { ideas?: BaselineIdea[] }).ideas ?? [];
    return Response.json({ ideas: ideas.slice(0, 6) });
  } catch (err) {
    return Response.json({ ideas: [], error: (err as Error).message }, { status: 502 });
  }
}
