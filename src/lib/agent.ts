import { chat, type Message, type ToolDef } from "./groq";
import { insights, searchTags } from "./qloo";
import { searchProducts } from "./products";
import type { AgentEvent, Gift, Occasion, Persona, Product, QlooEntity, TasteLink, TasteProfile } from "./types";

const GIFT_COUNT = 6;
const MAX_TURNS = 10;

/** Domains swept up front; each becomes a shelf in the UI and context for the model. */
const DOMAINS: { type: string; key: string; label: string; take: number }[] = [
  { type: "urn:entity:brand", key: "brand", label: "brands", take: 15 },
  { type: "urn:entity:book", key: "book", label: "books", take: 8 },
  { type: "urn:entity:artist", key: "artist", label: "artists", take: 6 },
  { type: "urn:entity:movie", key: "movie", label: "films", take: 6 },
  { type: "urn:entity:tv_show", key: "tv_show", label: "shows", take: 5 },
  { type: "urn:entity:videogame", key: "videogame", label: "games", take: 5 },
  { type: "urn:entity:podcast", key: "podcast", label: "podcasts", take: 4 },
];

const EXPLORABLE = ["brand", "book", "artist", "movie", "tv_show", "videogame", "podcast", "place", "destination"];

const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "explore_taste",
      description:
        "Query Qloo's taste graph for more entities in one domain, seeded by a subset of what the persona loves and/or a hobby keyword. Use it to deepen a gift angle (e.g. brands for fans of one specific artist, or brands linked to a hobby).",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", enum: EXPLORABLE },
          seeds: { type: "array", items: { type: "string" }, description: "Names of loved things to seed from, exactly as listed under LOVES. Empty = all." },
          keyword: { type: "string", description: "Optional interest keyword mapped to a Qloo tag, e.g. 'hiking'." },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_amazon",
      description: "Search Amazon for real listings. Batch up to 4 specific queries (brand + product type) per call.",
      parameters: {
        type: "object",
        properties: {
          queries: { type: "array", items: { type: "string" }, maxItems: 4 },
        },
        required: ["queries"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_gifts",
      description: `Submit the final ${GIFT_COUNT} gifts. Each must reference a product ref returned by search_amazon.`,
      parameters: {
        type: "object",
        properties: {
          gifts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_ref: { type: "string", description: "e.g. p3" },
                headline: { type: "string", description: "Max 8 words." },
                reasoning: { type: "string", description: "1-2 warm, specific sentences tying the gift to their taste." },
                trail: {
                  type: "array",
                  description: "How the taste graph led here.",
                  items: {
                    type: "object",
                    properties: {
                      from: { type: "string", description: "A loved thing or hobby, as written in the profile." },
                      via: { type: "string", description: "The Qloo entity that bridged to this gift, as written in the profile or explore results." },
                    },
                    required: ["from"],
                  },
                },
              },
              required: ["product_ref", "headline", "reasoning", "trail"],
            },
          },
        },
        required: ["gifts"],
      },
    },
  },
];

const AGE_LABEL: Record<string, string> = {
  "24_and_younger": "24 or younger",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
};

function systemPrompt(): string {
  return `You are Wrapt, a gift concierge whose picks are grounded in Qloo's taste graph — real cross-domain affinity data about what people with a given taste love — not generic guesses.

You get a persona, an occasion and a Qloo taste profile: what they love, plus the brands, books, artists, films, shows, games and podcasts that people with that taste over-index on (affinity 0–1, higher = stronger).

Goal: ${GIFT_COUNT} gifts available on Amazon.

Process:
1. Study the profile and pick ${GIFT_COUNT} distinct gift angles that come from Qloo signals: a high-affinity brand's signature product, a book Qloo surfaced, a record or merch from a related artist, gear for a hobby in a brand that matches their aesthetic. Call explore_taste when an angle needs more signal.
2. Call search_amazon with specific queries ("Polaroid Now+ instant camera", not "camera"). Batch queries.
3. Choose the best real listing per angle: within budget, well reviewed, genuinely giftable. Search again if results miss.
4. Call submit_gifts.

Rules:
- Every gift traces to the taste graph: "from" = a loved thing or hobby, "via" = the Qloo entity that bridged to it, both spelled as they appear in the data.
- Spread across categories; at most 2 gifts from one domain. No generic filler (gift cards, plain mugs, novelty socks) unless tied to a signal.
- Price must be at or under the budget. Fit the occasion and the relationship.
- Reasoning speaks to the gift giver about the recipient by name, in plain language, without numbers or jargon.`;
}

function fmtEntities(list: QlooEntity[] | undefined, withKeywords: boolean): string {
  if (!list?.length) return "(none)";
  return list
    .map((e) => `${e.name} ${e.affinity.toFixed(2)}${withKeywords && e.keywords?.length ? ` [${e.keywords.slice(0, 4).join(", ")}]` : ""}`)
    .join("; ");
}

function personaBrief(p: Persona, o: Occasion, profile: TasteProfile): string {
  const facts = [
    `Name: ${p.name}`,
    `Relationship to giver: ${p.relationship}`,
    p.age && `Age: ${AGE_LABEL[p.age]}`,
    p.gender && p.gender !== "unspecified" && `Gender: ${p.gender}`,
    p.location && `Lives in: ${p.location}`,
    p.notes && `Giver's notes: ${p.notes}`,
  ].filter(Boolean);

  const loves = profile.seeds.map((s) => `${s.name} (${s.type.replace("urn:entity:", "")}${s.tags?.length ? `; ${s.tags.slice(0, 5).join(", ")}` : ""})`);
  const lines = [
    "PERSONA",
    ...facts,
    "",
    `OCCASION: ${o.event}. Budget: up to $${o.budget}.${o.note ? ` Note: ${o.note}` : ""}`,
    "",
    `LOVES: ${loves.join("; ") || "(none)"}`,
    `HOBBIES: ${p.hobbies || "(none)"}${profile.hobbyTags.length ? ` → Qloo tags: ${profile.hobbyTags.map((t) => t.name).join(", ")}` : ""}`,
    `VIBE: ${profile.dna.map((d) => d.name).join(", ") || "(unknown)"}`,
    "",
    "QLOO TASTE GRAPH (name affinity [keywords])",
  ];
  for (const d of [...DOMAINS, { key: "place", label: "local places" }]) {
    if (profile.domains[d.key]?.length) lines.push(`${d.label.toUpperCase()}: ${fmtEntities(profile.domains[d.key], d.key === "brand")}`);
  }
  return lines.join("\n");
}

function hobbyPhrases(hobbies?: string): string[] {
  return (hobbies ?? "")
    .split(/,|;|\band\b|\n/)
    .map((h) => h.trim())
    .filter((h) => h.length > 1)
    .slice(0, 4);
}

function vibe(seeds: Persona["loves"]): TasteProfile["dna"] {
  const counts = new Map<string, number>();
  for (const s of seeds) for (const t of new Set(s.tags ?? [])) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));
}

function parseArgs<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Look up a name across everything the agent has seen, for trail images and affinities. */
function findEntity(name: string | undefined, pools: QlooEntity[][]): QlooEntity | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase().trim();
  for (const pool of pools) {
    const hit = pool.find((e) => e.name.toLowerCase() === n);
    if (hit) return hit;
  }
  for (const pool of pools) {
    const hit = pool.find((e) => e.name.toLowerCase().includes(n) || n.includes(e.name.toLowerCase()));
    if (hit) return hit;
  }
}

export async function* runAgent(persona: Persona, occasion: Occasion): AsyncGenerator<AgentEvent> {
  // ── 1. Read the persona's taste ────────────────────────────────────────────
  yield { type: "step", id: "read", label: `Reading ${persona.name}'s taste`, detail: persona.loves.map((l) => l.name).join(", "), status: "running" };

  const hobbyTags = (
    await Promise.all(hobbyPhrases(persona.hobbies).map((h) => searchTags(h, 1).catch(() => [])))
  ).flat();
  const seeds = persona.loves.slice(0, 12);
  const entityIds = seeds.map((s) => s.id);
  const tagIds = hobbyTags.map((t) => t.id);

  yield {
    type: "step",
    id: "read",
    label: `Reading ${persona.name}'s taste`,
    detail: hobbyTags.length ? `Mapped hobbies to Qloo tags: ${hobbyTags.map((t) => t.name).join(", ")}` : `${seeds.length} loves`,
    status: "done",
  };

  // ── 2. Sweep the taste graph across domains ───────────────────────────────
  yield { type: "step", id: "graph", label: "Walking the Qloo taste graph", detail: "brands, books, music, film, TV, games, podcasts", status: "running" };

  const demo = { age: persona.age, gender: persona.gender };
  const sweeps = DOMAINS.map((d) =>
    insights({ filterType: d.type, entityIds, tagIds: d.key === "brand" ? tagIds : undefined, ...demo, take: d.take })
      .then((list) => [d.key, list.filter((e) => !entityIds.includes(e.id))] as const)
      .catch((err) => {
        console.warn(`[agent] insights ${d.key} failed:`, (err as Error).message);
        return [d.key, []] as const;
      }),
  );
  if (persona.location) {
    sweeps.push(
      insights({ filterType: "urn:entity:place", entityIds, location: persona.location, take: 6 })
        .then((list) => ["place", list] as const)
        .catch(() => ["place", []] as const),
    );
  }
  const domains = Object.fromEntries(await Promise.all(sweeps)) as TasteProfile["domains"];
  const profile: TasteProfile = { seeds, hobbyTags, dna: vibe(seeds), domains };

  const total = Object.values(domains).reduce((n, l) => n + (l?.length ?? 0), 0);
  if (!total) {
    yield { type: "step", id: "graph", label: "Walking the Qloo taste graph", detail: "Qloo returned no signal", status: "error" };
    yield { type: "error", message: "Qloo didn't return any taste signal for this persona. Try adding a few more loves." };
    return;
  }
  const topBrands = (domains.brand ?? []).slice(0, 3).map((b) => `${b.name} ${Math.round(b.affinity * 100)}%`);
  yield { type: "step", id: "graph", label: "Walking the Qloo taste graph", detail: `${total} affinities · top brands: ${topBrands.join(", ")}`, status: "done" };
  yield { type: "profile", profile };

  // ── 3. Agent loop: explore, search, choose ────────────────────────────────
  const products = new Map<string, Product>();
  const explored: QlooEntity[][] = [];
  const messages: Message[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: personaBrief(persona, occasion, profile) },
  ];

  let step = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const finalTurn = turn === MAX_TURNS - 1;
    let reply;
    try {
      reply = await chat({
        messages,
        tools: finalTurn ? TOOLS.filter((t) => t.function.name === "submit_gifts") : TOOLS,
        toolChoice: "required",
      });
    } catch (err) {
      yield { type: "error", message: `The agent hit an error: ${(err as Error).message}` };
      return;
    }

    if (reply.content?.trim()) yield { type: "thought", text: reply.content.trim() };
    messages.push({ role: "assistant", content: reply.content ?? "", tool_calls: reply.toolCalls });

    for (const call of reply.toolCalls) {
      const id = `tool-${step++}`;
      const name = call.function.name;

      if (name === "explore_taste") {
        const args = parseArgs<{ domain: string; seeds?: string[]; keyword?: string }>(call.function.arguments);
        const domain = EXPLORABLE.includes(args?.domain ?? "") ? args!.domain : "brand";
        const picked = seeds.filter((s) => args?.seeds?.some((n) => n.toLowerCase() === s.name.toLowerCase()));
        const focus = picked.length ? picked : seeds;
        const label = `Exploring ${domain.replace("_", " ")}s${args?.keyword ? ` for “${args.keyword}”` : ""} via ${focus.map((s) => s.name).slice(0, 3).join(", ")}`;
        yield { type: "step", id, label, status: "running" };

        let result = "No results.";
        try {
          const keywordTags = args?.keyword ? await searchTags(args.keyword, 1) : [];
          const list = await insights({
            filterType: `urn:entity:${domain}`,
            entityIds: focus.map((s) => s.id),
            tagIds: keywordTags.map((t) => t.id),
            location: domain === "place" ? persona.location : undefined,
            ...demo,
            take: 10,
          });
          explored.push(list);
          if (list.length) result = fmtEntities(list, true);
          yield { type: "step", id, label, detail: list.slice(0, 4).map((e) => e.name).join(", ") || "nothing new", status: "done" };
        } catch (err) {
          result = `Error: ${(err as Error).message}`;
          yield { type: "step", id, label, detail: "Qloo lookup failed", status: "error" };
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      } else if (name === "search_amazon") {
        const args = parseArgs<{ queries: string[] }>(call.function.arguments);
        const queries = (args?.queries ?? []).slice(0, 4);
        const label = `Searching Amazon: ${queries.map((q) => `“${q}”`).join(", ")}`;
        yield { type: "step", id, label, status: "running" };

        const results = await Promise.all(queries.map((q) => searchProducts(q, occasion.budget)));
        const blocks = queries.map((q, i) => {
          const lines = results[i].map((p) => {
            const ref = `p${products.size + 1}`;
            products.set(ref, p);
            if (p.source === "search-link") return `${ref}: (no listing data — link to Amazon search for "${q}")`;
            return `${ref}: ${p.title.slice(0, 110)} | ${p.priceDisplay ?? "price n/a"} | ${p.rating ?? "?"}★ (${p.reviews ?? 0})`;
          });
          return `Query "${q}":\n${lines.join("\n")}`;
        });
        const found = results.flat().filter((p) => p.source !== "search-link").length;
        yield { type: "step", id, label, detail: `${found} listings`, status: "done" };
        messages.push({ role: "tool", tool_call_id: call.id, content: blocks.join("\n\n") });
      } else if (name === "submit_gifts") {
        const args = parseArgs<{ gifts: { product_ref: string; headline: string; reasoning: string; trail?: { from: string; via?: string }[] }[] }>(
          call.function.arguments,
        );
        const pools = [...Object.values(domains).filter(Boolean) as QlooEntity[][], ...explored];
        const seedPool: QlooEntity[] = seeds.map((s) => ({ id: s.id, name: s.name, type: s.type, affinity: 1, image: s.image }));
        const seen = new Set<string>();
        const gifts: Gift[] = [];
        for (const g of args?.gifts ?? []) {
          const product = products.get(g.product_ref?.trim());
          if (!product || seen.has(g.product_ref)) continue;
          seen.add(g.product_ref);
          const trail: TasteLink[] = (g.trail ?? []).map((t) => {
            const via = findEntity(t.via, pools);
            const from = findEntity(t.from, [seedPool]);
            return { from: from?.name ?? t.from, via: via?.name ?? t.via, affinity: via?.affinity, image: via?.image ?? from?.image };
          });
          gifts.push({ product, headline: g.headline, reasoning: g.reasoning, trail });
        }

        if (!gifts.length) {
          messages.push({ role: "tool", tool_call_id: call.id, content: "None of those product_refs exist. Use refs like p1, p2 from search_amazon results and submit again." });
          continue;
        }
        yield { type: "step", id, label: `Wrapped ${gifts.length} gifts for ${persona.name}`, status: "done" };
        yield { type: "gifts", gifts };
        yield { type: "done" };
        return;
      } else {
        messages.push({ role: "tool", tool_call_id: call.id, content: `Unknown tool ${name}.` });
      }
    }
  }

  yield { type: "error", message: "The agent ran out of steps before choosing gifts. Try again." };
}
