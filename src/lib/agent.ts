import { chat, RateLimited, type ChatOptions, type Message, type Reply, type ToolDef } from "./groq";
import { compareTaste, insights, searchTags } from "./qloo";
import { searchLink, searchProducts } from "./products";
import { formatMoney, marketFor, type Market } from "./markets";
import type { AgentEvent, AgentName, Gift, Occasion, Persona, Product, QlooEntity, TasteLink, TasteProfile } from "./types";

// Two agents share the work, each on its own Groq key (lane):
//   1. Taste strategist — reads the Qloo profile, explores, plans gift ideas.
//   2. Personal shopper — searches Amazon per idea, picks listings, writes the final why.

const GIFT_COUNT = 6;
const STRATEGIST_TURNS = 4;
const SHOPPER_TURNS = 4;
/** Ideas the strategist may replace when Amazon has no valid listing for them (one extra turn, ≤ this many searches). */
const MAX_REPLACEMENTS = 3;
/** Past this point in a run, skip replacements so the request stays inside the route's time limit. */
const REPLACE_DEADLINE_MS = 75_000;
const STRATEGIST_LANE = 0;
const SHOPPER_LANE = 1;

/** Domains swept up front; each becomes a shelf in the UI and context for the strategist. */
const DOMAINS: { type: string; key: string; label: string; take: number }[] = [
  { type: "urn:entity:brand", key: "brand", label: "brands", take: 12 },
  { type: "urn:entity:book", key: "book", label: "books", take: 6 },
  { type: "urn:entity:artist", key: "artist", label: "artists", take: 5 },
  { type: "urn:entity:movie", key: "movie", label: "films", take: 5 },
  { type: "urn:entity:tv_show", key: "tv_show", label: "shows", take: 4 },
  { type: "urn:entity:videogame", key: "videogame", label: "games", take: 4 },
  { type: "urn:entity:podcast", key: "podcast", label: "podcasts", take: 3 },
];

const EXPLORABLE = ["brand", "book", "artist", "movie", "tv_show", "videogame", "podcast", "place", "destination"];

const AGE_LABEL: Record<string, string> = {
  "24_and_younger": "24 or younger",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
};

interface Idea {
  idea: string;
  query: string;
  why: string;
  from: string;
  via?: string;
  replaces?: number;
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const EXPLORE_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "explore_taste",
    description:
      "Query Qloo's taste graph for more entities in one domain, seeded by some of the things the persona loves and/or an interest keyword. Use it when an idea needs more signal (e.g. brands for fans of one artist, or brands tied to a hobby).",
    parameters: {
      type: "object",
      properties: {
        domain: { type: "string", enum: EXPLORABLE },
        seeds: {
          type: "array",
          items: { type: "string" },
          description: "Names from LOVES to seed from. Empty = all.",
        },
        keyword: {
          type: "string",
          description: "Optional interest keyword, e.g. 'hiking'.",
        },
      },
      required: ["domain"],
    },
  },
};

const PLAN_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "submit_plan",
    description: `Hand ${GIFT_COUNT} gift ideas to the personal shopper.`,
    parameters: {
      type: "object",
      properties: {
        ideas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              idea: { type: "string", description: "The gift in a few words." },
              query: {
                type: "string",
                description: "Specific Amazon search, brand + product type, max 6 words.",
              },
              why: {
                type: "string",
                description: "1–2 sentences to the giver on what in the recipient's taste points here.",
              },
              from: {
                type: "string",
                description: "The loved thing or hobby this comes from, spelled as in the profile.",
              },
              via: {
                type: "string",
                description: "The Qloo entity that bridged to the gift, spelled as in the profile. Omit if the gift is directly about the loved thing.",
              },
              replaces: {
                type: "integer",
                description: "Only when asked to replace missed ideas: the number of the missed idea this one takes the place of.",
              },
            },
            required: ["idea", "query", "why", "from"],
          },
        },
      },
      required: ["ideas"],
    },
  },
};

const SEARCH_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "search_amazon",
    description: "Search Amazon again for ideas whose listings missed. Up to 3 specific queries.",
    parameters: {
      type: "object",
      properties: {
        queries: { type: "array", items: { type: "string" }, maxItems: 3 },
      },
      required: ["queries"],
    },
  },
};

const GIFTS_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "submit_gifts",
    description: "Submit one listing per idea.",
    parameters: {
      type: "object",
      properties: {
        picks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              idea: {
                type: "integer",
                description: "Idea number from the plan (1-based).",
              },
              product_ref: {
                type: "string",
                description: "Listing ref, e.g. p3.",
              },
              headline: {
                type: "string",
                description: "Max 8 words naming the chosen listing's actual product and brand, not the original idea.",
              },
              reasoning: {
                type: "string",
                description: "2 sentences to the giver: why this suits the recipient's taste, and what makes this particular listing a good pick.",
              },
            },
            required: ["idea", "product_ref", "headline", "reasoning"],
          },
        },
      },
      required: ["picks"],
    },
  },
};

// ── Prompts ──────────────────────────────────────────────────────────────────

const STRATEGIST_PROMPT = `You are the taste strategist on Wrapt, a two-agent gift team. You read a Qloo taste profile — what someone loves, plus the brands, books, artists, films, shows, games and podcasts that people with that taste over-index on (affinity 0–1) — and plan ${GIFT_COUNT} gift ideas for a personal shopper to buy on Amazon.

The point of Wrapt is discovery: gifts they don't already own, found through what people with their taste love. So:
- At least 4 ideas must come from the QLOO TASTE GRAPH lists: a product from a listed brand, a listed book, a record by a listed artist, etc. Set "via" to that entity, spelled exactly as listed.
- "from" is always one item from LOVES or HOBBIES (the one the idea connects to most), never the via entity.
- At most one idea may be merchandise of something they already love (their favourite artist's album, the book of their favourite show). They likely own it already.
- Spread ideas across domains, at most 2 per domain.
- Only propose products that really exist on Amazon: a book, a record, a brand's own product line, gear for a hobby. Skip brands that don't sell giftable products there (car makers, airlines, restaurants, stores) and never invent branded merch such as a podcast mug or a car brand's cooler.
- Fit the budget, occasion and relationship. No gift cards or generic filler.
- Match their gender for anything gendered. If gender is not given, pick gender-neutral gifts. Avoid sized clothing and shoes unless the notes give a size.
- Pick products sold in the store named under OCCASION; some brands aren't sold in every country.
- "query" must find a real product: brand + product type ("Polaroid Now+ instant camera"), not vague phrases.
- "why" talks to the giver about the recipient by name, in plain language, without numbers or the word Qloo.

Call explore_taste at most twice, only if an idea needs more signal. Then call submit_plan.`;

function shopperPrompt(name: string, budget: string, gender: Persona["gender"]) {
  const fit = gender === "female" || gender === "male" ? `made for a ${gender === "female" ? "woman" : "man"} or unisex` : "unisex (their gender isn't given)";
  return `You are the personal shopper on Wrapt, a two-agent gift team. The taste strategist planned gift ideas for ${name}, and Amazon has been searched for each. For every idea, pick the best listing:
- matches the idea and brand, at or under ${budget};
- anything gendered must be ${fit};
- the listing's product type must match the idea: a game idea needs the game itself, a record idea the record (not a songbook, poster or book about it);
- if the idea names a specific book, album or film, the listing must be that exact work, not a similarly titled one;
- if the idea names a brand, prefer a listing from that brand;
- new rather than renewed or used when possible, decent rating, a real gift rather than an accessory or part;
- if nothing fits an idea, call search_amazon with a better query (at most once).

Then call submit_gifts with one pick per idea. "reasoning" is 2 sentences to the giver: why this suits ${name}'s taste (build on the strategist's why), then one concrete detail of this listing (format, edition, material, what's included). Don't mention price, budget, ratings or that it's new. No jargon.`;
}

const CHECK_PROMPT = `You check gift picks before they're shown. For each numbered pair, answer false only when the Amazon listing is clearly not the product the idea describes:
- a different kind of product: a book, songbook or poster about an album instead of the record, merchandise or a book instead of a game;
- a different brand, title or artist than the one the idea names.
Listing titles are often terse or omit the brand or artist; that is fine. Another model, generation, size, color or edition of the named product (Now vs Now+, a different pack size) is also fine, Any English edition of a named book is fine, including film tie-in covers and blurbs that mention the movie, but a translated or foreign-language edition is not. When unsure, answer true.
Reply as JSON: {"checks": [{"reason": "a few words", "ok": true}, ...]} with one entry per pair, in order. Give the reason first.`;

// Brands Qloo matches on taste but that don't sell giftable things on Amazon (Land Rover, Instagram, airlines).
const NOT_GIFTABLE = /^(automotive|social networking service|airlines?|aviation|hospitality|restaurants?|food service|banking|insurance|telecommunications)$/i;
const giftable = (e: QlooEntity) => !e.industries?.length || (!NOT_GIFTABLE.test(e.industries[0]) && !e.industries.some((i) => /social networking/i.test(i)));

function fmtEntities(list: QlooEntity[] | undefined, withKeywords: boolean): string {
  if (!list?.length) return "(none)";
  return list.map((e) => `${e.name} ${e.affinity.toFixed(2)}${withKeywords && e.keywords?.length ? ` [${e.keywords.slice(0, 3).join(", ")}]` : ""}`).join("; ");
}

function personaFacts(p: Persona): string[] {
  return [
    `Name: ${p.name}`,
    `Relationship to giver: ${p.relationship}`,
    p.age && `Age: ${AGE_LABEL[p.age]}`,
    p.gender && p.gender !== "unspecified" && `Gender: ${p.gender}`,
    p.location && `Lives in: ${p.location}`,
    p.notes && `Giver's notes: ${p.notes}`,
  ].filter(Boolean) as string[];
}

function strategistBrief(p: Persona, o: Occasion, profile: TasteProfile, market: Market, giver?: Persona): string {
  const describe = (s: Persona["loves"][number]) => `${s.name} (${s.type.replace("urn:entity:", "")}${s.tags?.length ? `; ${s.tags.slice(0, 4).join(", ")}` : ""})`;
  const loves = profile.seeds.map(describe);
  const shared =
    giver && profile.shared
      ? [
          `SHARED GIFT: ${giver.name} (the giver) wants gifts the two of them can enjoy together: something to listen to, watch, read, play, cook or do side by side. Every idea must appeal to both people; "from" may be a love of either person.`,
          `GIVER'S LOVES: ${giver.loves.slice(0, 12).map(describe).join("; ")}`,
          `TASTE OVERLAP (Qloo compare): ${profile.shared.tags.join(", ")}`,
        ]
      : [];
  const lines = [
    ...personaFacts(p),
    ...shared,
    `OCCASION: ${o.event}. Budget: up to ${formatMoney(o.budget, market)}. Store: ${market.domain} (${market.name}).${o.note ? ` ${o.note}` : ""}`,
    `LOVES: ${loves.join("; ") || "(none)"}`,
    `HOBBIES: ${p.hobbies || "(none)"}`,
    `VIBE: ${profile.dna.map((d) => d.name).join(", ") || "(unknown)"}`,
    "QLOO TASTE GRAPH (name affinity [keywords]):",
  ];
  for (const d of [...DOMAINS, { key: "place", label: "local places" }]) {
    const list = d.key === "brand" ? profile.domains.brand?.filter(giftable) : profile.domains[d.key];
    if (list?.length) lines.push(`${d.label.toUpperCase()}: ${fmtEntities(list, d.key === "brand")}`);
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

/** Look up a name across everything the agents have seen, for trail images and affinities. */
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let waitSeq = 0;

/** Call Groq, surfacing rate-limit waits as visible steps instead of failing the run. */
async function* llm(agent: AgentName, opts: ChatOptions): AsyncGenerator<AgentEvent, Reply> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await chat(opts);
    } catch (err) {
      if (!(err instanceof RateLimited) || attempt >= 5) throw err;
      const seconds = Math.min(Math.max(err.retryAfter, 2), 30);
      const id = `wait-${waitSeq++}`;
      const label = "Pausing for Groq's rate limit";
      yield {
        type: "step",
        id,
        agent,
        label,
        detail: `Resuming in ${seconds}s`,
        status: "running",
      };
      await sleep(seconds * 1000);
      yield {
        type: "step",
        id,
        agent,
        label,
        detail: "Resumed",
        status: "done",
      };
    }
  }
}

const ABOUT_AN_ALBUM = /\(33 1\/3\)|33⅓/;
const USED = /\b(renewed|refurbished|pre-owned|preowned|used)\b/i;

// Listings explicitly made for one gender. "women's" must not count as "men's".
const WOMENS = /\b(women'?s|womens|women|woman|ladies|lady'?s|girls'?|female)\b/i;
const MENS = /\b(men'?s|mens|men|man'?s|boys'?|male|gentlemen'?s?)\b/i;

/** Drop listings gendered for someone else; with no gender given, keep only ungendered ones. */
function fitsGender(product: Product, gender: Persona["gender"]): boolean {
  if (product.source === "search-link") return true;
  const forWomen = WOMENS.test(product.title);
  const forMen = MENS.test(product.title);
  if (gender === "female") return !forMen || forWomen;
  if (gender === "male") return !forWomen || forMen;
  return !(forWomen !== forMen); // unisex listings mention both or neither
}

/** In-budget real listings for an idea, best first; the listing check decides which one is right. */
function candidates(results: Product[], budget: number): Product[] {
  return results.filter((p) => p.source !== "search-link" && (p.price === undefined || p.price <= budget));
}

export async function* runAgent(persona: Persona, occasion: Occasion, giver?: Persona): AsyncGenerator<AgentEvent> {
  const started = Date.now();
  const sharing = !!(occasion.shared && giver?.loves.length);
  // ── 1. Read the persona's taste ────────────────────────────────────────────
  yield {
    type: "step",
    id: "read",
    agent: "qloo",
    label: `Reading ${persona.name}'s taste`,
    detail: persona.loves.map((l) => l.name).join(", "),
    status: "running",
  };

  const hobbyTags = (await Promise.all(hobbyPhrases(persona.hobbies).map((h) => searchTags(h, 1).catch(() => [])))).flat();
  const seeds = persona.loves.slice(0, 12);
  const entityIds = seeds.map((s) => s.id);
  const tagIds = hobbyTags.map((t) => t.id);

  yield {
    type: "step",
    id: "read",
    agent: "qloo",
    label: `Reading ${persona.name}'s taste`,
    detail: hobbyTags.length ? `Hobbies matched to Qloo tags: ${hobbyTags.map((t) => t.name).join(", ")}` : `${seeds.length} loves`,
    status: "done",
  };

  // Shared gifts: find where the giver's taste meets the recipient's, then let both drive the sweep.
  const giverSeeds = sharing ? giver!.loves.slice(0, 12) : [];
  let sharedTags: { id: string; name: string }[] = [];
  if (sharing) {
    const label = `Comparing ${giver!.name}'s taste with ${persona.name}'s`;
    yield { type: "step", id: "compare", agent: "qloo", label, status: "running" };
    sharedTags = await compareTaste(
      giverSeeds.map((s) => s.id),
      entityIds,
    ).catch(() => []);
    yield {
      type: "step",
      id: "compare",
      agent: "qloo",
      label,
      detail: sharedTags.length ? `In common: ${sharedTags.slice(0, 6).map((t) => t.name).join(", ")}` : "No clear overlap; using both tastes together",
      status: "done",
    };
  }
  const signalIds = [...new Set([...entityIds, ...giverSeeds.map((s) => s.id)])];
  const sharedTagIds = sharedTags.slice(0, 6).map((t) => t.id);

  // ── 2. Sweep the taste graph across domains ───────────────────────────────
  const graphLabel = sharing ? "Mapping where your tastes meet in Qloo's graph" : "Mapping their taste across Qloo's graph";
  yield {
    type: "step",
    id: "graph",
    agent: "qloo",
    label: graphLabel,
    detail: "Brands, books, music, film, TV, games and podcasts",
    status: "running",
  };

  const demo = { age: persona.age, gender: persona.gender };
  const market = marketFor(occasion.market);
  /** Search the persona's store, dropping second-hand listings and ones gendered for someone else. */
  const shop = async (query: string): Promise<Product[]> => {
    const list = await searchProducts(query, { maxPrice: occasion.budget, domain: market.domain });
    // A gift should arrive new: drop renewed, refurbished and used listings when anything else exists,
    // and books from the "33 1/3" series, which search returns for album queries.
    const fresh = list.filter((p) => !USED.test(p.title) && !ABOUT_AN_ALBUM.test(p.title));
    const fitting = (fresh.length ? fresh : list).filter((p) => fitsGender(p, persona.gender));
    return fitting.length ? fitting : [searchLink(query, market.domain)];
  };
  const sweeps = DOMAINS.map((d) =>
    insights({
      filterType: d.type,
      entityIds: signalIds,
      tagIds: [...(d.key === "brand" ? tagIds : []), ...sharedTagIds],
      ...demo,
      take: d.take,
    })
      .then((list) => [d.key, list.filter((e) => !signalIds.includes(e.id))] as const)
      .catch((err) => {
        console.warn(`[agent] insights ${d.key} failed:`, (err as Error).message);
        return [d.key, []] as const;
      }),
  );
  if (persona.location) {
    sweeps.push(
      insights({
        filterType: "urn:entity:place",
        entityIds,
        location: persona.location,
        take: 4,
      })
        .then((list) => ["place", list] as const)
        .catch(() => ["place", []] as const),
    );
  }
  const domains = Object.fromEntries(await Promise.all(sweeps)) as TasteProfile["domains"];
  const profile: TasteProfile = {
    seeds,
    hobbyTags,
    dna: vibe(seeds),
    domains,
    ...(sharing && { shared: { giver: giver!.name, tags: sharedTags.slice(0, 8).map((t) => t.name) } }),
  };

  const total = Object.values(domains).reduce((n, l) => n + (l?.length ?? 0), 0);
  if (!total) {
    yield {
      type: "step",
      id: "graph",
      agent: "qloo",
      label: graphLabel,
      detail: "Qloo returned no matches",
      status: "error",
    };
    yield {
      type: "error",
      message: "Qloo found no taste matches for this persona. Add a few more things they love, then try again.",
    };
    return;
  }
  const topBrands = (domains.brand ?? []).slice(0, 3).map((b) => `${b.name} ${Math.round(b.affinity * 100)}%`);
  yield {
    type: "step",
    id: "graph",
    agent: "qloo",
    label: graphLabel,
    detail: `${total} matches. Top brands: ${topBrands.join(", ")}`,
    status: "done",
  };
  yield { type: "profile", profile };

  const explored: QlooEntity[][] = [];
  const pools = () => [...(Object.values(domains).filter(Boolean) as QlooEntity[][]), ...explored];
  let step = 0;

  // ── 3. Agent 1: taste strategist plans the ideas ──────────────────────────
  yield {
    type: "step",
    id: "plan",
    agent: "strategist",
    label: "Planning gift ideas from the taste graph",
    status: "running",
  };

  const strategist: Message[] = [
    { role: "system", content: STRATEGIST_PROMPT },
    { role: "user", content: strategistBrief(persona, occasion, profile, market, sharing ? giver : undefined) },
  ];
  let ideas: Idea[] = [];
  let explores = 0;
  let revisedForGender = false;
  // Ideas go through the same gender rule as listings ("men's climbing jacket" for Alex).
  const fits = (i: Idea) => fitsGender({ title: `${i.idea} ${i.query}`, url: "", source: "serpapi" }, persona.gender);

  try {
    for (let turn = 0; turn < STRATEGIST_TURNS && !ideas.length; turn++) {
      // Tools stay constant (Groq rejects calls to tools missing from the request); limits are enforced below.
      const reply = yield* llm("strategist", {
        lane: STRATEGIST_LANE,
        maxTokens: 1500,
        messages: strategist,
        tools: [EXPLORE_TOOL, PLAN_TOOL],
        toolChoice: "required",
      });
      strategist.push({
        role: "assistant",
        content: reply.content ?? "",
        tool_calls: reply.toolCalls,
      });

      for (const call of reply.toolCalls) {
        if (call.function.name === "explore_taste" && (explores >= 2 || turn >= STRATEGIST_TURNS - 2)) {
          strategist.push({
            role: "tool",
            tool_call_id: call.id,
            content: "Exploration limit reached. Call submit_plan now with what you have.",
          });
        } else if (call.function.name === "explore_taste") {
          explores++;
          const args = parseArgs<{
            domain: string;
            seeds?: string[];
            keyword?: string;
          }>(call.function.arguments);
          const domain = EXPLORABLE.includes(args?.domain ?? "") ? args!.domain : "brand";
          const picked = seeds.filter((s) => args?.seeds?.some((n) => n.toLowerCase() === s.name.toLowerCase()));
          const focus = picked.length ? picked : seeds;
          const id = `explore-${step++}`;
          const label = `Exploring ${domain.replace("_", " ")}s${args?.keyword ? ` for “${args.keyword}”` : ""} via ${focus
            .map((s) => s.name)
            .slice(0, 3)
            .join(", ")}`;
          yield {
            type: "step",
            id,
            agent: "strategist",
            label,
            status: "running",
          };

          let result = "No results.";
          try {
            const keywordTags = args?.keyword ? await searchTags(args.keyword, 1) : [];
            const list = await insights({
              filterType: `urn:entity:${domain}`,
              entityIds: focus.map((s) => s.id),
              tagIds: keywordTags.map((t) => t.id),
              location: domain === "place" ? persona.location : undefined,
              ...demo,
              take: 8,
            });
            explored.push(list);
            if (list.length) result = fmtEntities(list, true);
            yield {
              type: "step",
              id,
              agent: "strategist",
              label,
              detail:
                list
                  .slice(0, 4)
                  .map((e) => e.name)
                  .join(", ") || "Nothing new",
              status: "done",
            };
          } catch (err) {
            result = `Error: ${(err as Error).message}`;
            yield {
              type: "step",
              id,
              agent: "strategist",
              label,
              detail: "Qloo lookup failed",
              status: "error",
            };
          }
          strategist.push({
            role: "tool",
            tool_call_id: call.id,
            content: result,
          });
        } else if (call.function.name === "submit_plan") {
          const args = parseArgs<{ ideas: Idea[] }>(call.function.arguments);
          const planned = (args?.ideas ?? []).filter((i) => i.query?.trim() && i.why?.trim()).slice(0, GIFT_COUNT);
          const misfits = planned.map((i, n) => (fits(i) ? 0 : n + 1)).filter(Boolean);
          if (misfits.length && !revisedForGender) {
            revisedForGender = true;
            strategist.push({
              role: "tool",
              tool_call_id: call.id,
              content: `Idea ${misfits.join(", ")} ${misfits.length > 1 ? "are" : "is"} gendered for someone other than ${persona.name}${persona.gender === "female" || persona.gender === "male" ? ` (${persona.gender})` : " (gender not given, so keep everything gender-neutral)"}. Replace ${misfits.length > 1 ? "them" : "it"} and submit the full plan again.`,
            });
          } else {
            ideas = planned.filter(fits);
            if (!ideas.length)
              strategist.push({
                role: "tool",
                tool_call_id: call.id,
                content: "The plan was empty or missing queries. Submit it again.",
              });
          }
        } else {
          strategist.push({
            role: "tool",
            tool_call_id: call.id,
            content: `Unknown tool ${call.function.name}.`,
          });
        }
      }
    }
  } catch (err) {
    yield {
      type: "step",
      id: "plan",
      agent: "strategist",
      label: "Planning gift ideas from the taste graph",
      detail: "Stopped",
      status: "error",
    };
    yield {
      type: "error",
      message: `The taste strategist stopped: ${(err as Error).message}`,
    };
    return;
  }

  if (!ideas.length) {
    yield {
      type: "step",
      id: "plan",
      agent: "strategist",
      label: "Planning gift ideas from the taste graph",
      detail: "No plan",
      status: "error",
    };
    yield {
      type: "error",
      message: "The taste strategist didn't produce a plan. Run it again.",
    };
    return;
  }
  yield {
    type: "step",
    id: "plan",
    agent: "strategist",
    label: `Planned ${ideas.length} gift ideas`,
    detail: ideas.map((i) => i.idea).join(", "),
    status: "done",
  };

  // ── 4. Search Amazon for every idea in parallel ───────────────────────────
  yield {
    type: "step",
    id: "search",
    agent: "shopper",
    label: "Searching Amazon for each idea",
    detail: ideas.map((i) => `“${i.query}”`).join(", "),
    status: "running",
  };
  const results = await Promise.all(ideas.map((i) => shop(i.query)));
  const listings = results.flat().filter((p) => p.source !== "search-link").length;
  yield {
    type: "step",
    id: "search",
    agent: "shopper",
    label: "Searching Amazon for each idea",
    detail: `${listings} listings found`,
    status: "done",
  };

  const products = new Map<string, Product>();
  // The search each ref came from, so a rejected pick falls back to its own search's other listings.
  const origin = new Map<string, Product[]>();
  const register = (p: Product, list: Product[]) => {
    const ref = `p${products.size + 1}`;
    products.set(ref, p);
    origin.set(ref, list);
    return ref;
  };
  const listingLines = (list: Product[]) =>
    list
      .slice(0, 3)
      .map((p) => {
        const ref = register(p, list);
        return p.source === "search-link"
          ? `${ref}: (no listings; link to an Amazon search)`
          : `${ref}: ${p.title.slice(0, 70)} | ${p.priceDisplay ?? "price n/a"} | ${p.rating ?? "?"}★ (${p.reviews ?? 0})`;
      })
      .join("\n");

  const planText = ideas
    .map((idea, n) => `Idea ${n + 1}: ${idea.idea}\nWhy: ${idea.why}\nListings for “${idea.query}”:\n${listingLines(results[n])}`)
    .join("\n\n");

  // ── 5. Agent 2: personal shopper picks listings and writes the final why ──
  yield {
    type: "step",
    id: "pick",
    agent: "shopper",
    label: `Choosing the best listing for each idea`,
    status: "running",
  };

  const shopper: Message[] = [
    { role: "system", content: shopperPrompt(persona.name, formatMoney(occasion.budget, market), persona.gender) },
    {
      role: "user",
      content: `${personaFacts(persona).join("\n")}\nOccasion: ${occasion.event}\n\n${planText}`,
    },
  ];
  type Pick = {
    idea: number;
    product_ref: string;
    headline: string;
    reasoning: string;
  };
  let picks: Pick[] = [];
  let searched = false;

  try {
    for (let turn = 0; turn < SHOPPER_TURNS && !picks.length; turn++) {
      const reply = yield* llm("shopper", {
        lane: SHOPPER_LANE,
        maxTokens: 1200,
        messages: shopper,
        tools: [SEARCH_TOOL, GIFTS_TOOL],
        toolChoice: "required",
      });
      shopper.push({
        role: "assistant",
        content: reply.content ?? "",
        tool_calls: reply.toolCalls,
      });

      for (const call of reply.toolCalls) {
        if (call.function.name === "search_amazon" && searched) {
          shopper.push({
            role: "tool",
            tool_call_id: call.id,
            content: "Search limit reached. Call submit_gifts now; pick the closest listing for each idea.",
          });
        } else if (call.function.name === "search_amazon") {
          searched = true;
          const queries = (parseArgs<{ queries: string[] }>(call.function.arguments)?.queries ?? []).slice(0, 3);
          const id = `research-${step++}`;
          const label = `Searching again: ${queries.map((q) => `“${q}”`).join(", ")}`;
          yield {
            type: "step",
            id,
            agent: "shopper",
            label,
            status: "running",
          };
          const more = await Promise.all(queries.map((q) => shop(q)));
          yield {
            type: "step",
            id,
            agent: "shopper",
            label,
            detail: `${more.flat().filter((p) => p.source !== "search-link").length} listings`,
            status: "done",
          };
          shopper.push({
            role: "tool",
            tool_call_id: call.id,
            content: queries.map((q, i) => `Listings for “${q}”:\n${listingLines(more[i])}`).join("\n\n"),
          });
        } else if (call.function.name === "submit_gifts") {
          const found = (parseArgs<{ picks: Pick[] }>(call.function.arguments)?.picks ?? []).filter((p) => products.has(p.product_ref?.trim()));
          if (found.length) picks = found;
          else
            shopper.push({
              role: "tool",
              tool_call_id: call.id,
              content: "None of those product_refs exist. Use refs like p1, p2 from the listings and submit again.",
            });
        } else {
          shopper.push({
            role: "tool",
            tool_call_id: call.id,
            content: `Unknown tool ${call.function.name}.`,
          });
        }
      }
    }
  } catch (err) {
    // The plan and listings are already in hand, so fall back to them below rather than failing the run.
    console.warn("[agent] shopper failed, using plan fallback:", (err as Error).message);
  }

  // ── 6. Assemble gifts: shopper picks first, plan + top listing for any gaps ─
  const seedPool: QlooEntity[] = [...seeds, ...giverSeeds].map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    affinity: 1,
    image: s.image,
  }));
  const hobbies = hobbyPhrases(persona.hobbies);
  const trailFor = (idea: Idea): TasteLink[] => {
    const via = findEntity(idea.via, pools());
    const seed = findEntity(idea.from, [seedPool]);
    const hobby = hobbies.find((h) => h.toLowerCase() === idea.from?.toLowerCase().trim());
    // Only keep "from" when it really is one of their loves or hobbies.
    const from = seed?.name ?? hobby;
    if (!via) return [{ from: from ?? idea.from, image: seed?.image }];
    return [
      {
        from: from && from !== via.name ? from : undefined,
        via: via.name,
        affinity: via.affinity,
        image: via.image ?? seed?.image,
      },
    ];
  };

  // Each slot keeps its idea and every listing found for it, so later steps can swap the listing or the idea.
  type Slot = { gift: Gift; idea: Idea; pool: Product[]; tried: Set<string>; miss?: string };
  /** Why an idea has no usable listing, in words the strategist can act on. */
  const missReason = (pool: Product[]) =>
    pool.some((p) => p.source !== "search-link") ? `every listing was over ${formatMoney(occasion.budget, market)}` : "Amazon had no suitable listing";

  const slots: Slot[] = [];
  const usedProducts = new Set<string>();
  ideas.forEach((idea, n) => {
    const pick = picks.find((p) => Number(p.idea) === n + 1 && !usedProducts.has(p.product_ref.trim()));
    const ref = pick?.product_ref.trim();
    // A pick from the shopper's re-search brings that search's other listings along as fallbacks.
    const searched = ref ? origin.get(ref) : undefined;
    const pool = searched && searched !== results[n] ? [...searched, ...results[n]] : results[n];
    const product = ref ? products.get(ref)! : (candidates(pool, occasion.budget)[0] ?? searchLink(idea.query, market.domain));
    if (usedProducts.has(product.url)) return;
    if (ref) usedProducts.add(ref);
    usedProducts.add(product.url);
    slots.push({
      gift: {
        product,
        headline: pick?.headline?.trim() || idea.idea,
        reasoning: pick?.reasoning?.trim() || idea.why,
        trail: trailFor(idea),
      },
      idea,
      pool,
      tried: new Set([product.url]),
      miss: product.source === "search-link" ? missReason(pool) : undefined,
    });
  });

  yield {
    type: "step",
    id: "pick",
    agent: "shopper",
    label: `Chose ${slots.length} gifts for ${persona.name}`,
    detail: picks.length ? undefined : "Used the strategist's picks directly",
    status: "done",
  };

  // ── 7. Check every listing really is the product its idea describes ──────
  // The shopper sometimes settles for a near miss (a book about an album, a sewing book called
  // "Tunic" for the game). A small call checks each listing; a rejected one gets the idea's next
  // candidate (checked too), and only then falls back to an Amazon search for the idea.
  async function* verify(targets: Slot[], rejected: string[]): AsyncGenerator<AgentEvent> {
    let pending = targets.filter((s) => s.gift.product.source !== "search-link");
    for (let round = 0; round < 2 && pending.length; round++) {
      const reply = yield* llm("shopper", {
        lane: STRATEGIST_LANE,
        json: true,
        temperature: 0,
        maxTokens: 800,
        messages: [
          { role: "system", content: CHECK_PROMPT },
          { role: "user", content: pending.map((s, k) => `${k + 1}. Idea: ${s.idea.idea}\n   Listing: ${s.gift.product.title}`).join("\n") },
        ],
      });
      const checks = parseArgs<{ checks?: { ok?: boolean; reason?: string }[] }>(reply.content ?? "")?.checks ?? [];
      const taken = new Set([...slots, ...targets].map((s) => s.gift.product.url));
      const recheck: Slot[] = [];
      pending.forEach((s, k) => {
        if (checks[k]?.ok !== false) return;
        const reason = checks[k]?.reason?.trim();
        rejected.push(reason ? `${s.idea.idea}: ${reason}` : s.idea.idea);
        const next = round === 0 ? candidates(s.pool, occasion.budget).find((p) => !s.tried.has(p.url) && !taken.has(p.url)) : undefined;
        // The shopper's words described the rejected listing, so use the strategist's.
        s.gift = { ...s.gift, product: next ?? searchLink(s.idea.query, market.domain), headline: s.idea.idea, reasoning: s.idea.why };
        if (next) {
          s.tried.add(next.url);
          taken.add(next.url);
          recheck.push(s);
        } else s.miss = reason ? `its listings were the wrong product (${reason})` : "its listings were the wrong product";
      });
      pending = recheck;
    }
  }

  if (slots.some((s) => s.gift.product.source !== "search-link")) {
    yield { type: "step", id: "check", agent: "shopper", label: "Double-checking each listing against its idea", status: "running" };
    const rejected: string[] = [];
    try {
      yield* verify(slots, rejected);
    } catch (err) {
      console.warn("[agent] listing check skipped:", (err as Error).message);
    }
    yield {
      type: "step",
      id: "check",
      agent: "shopper",
      label: "Double-checked each listing against its idea",
      detail: rejected.length ? `Swapped out ${rejected.length} listing${rejected.length > 1 ? "s" : ""} that didn't match. ${rejected.slice(0, 3).join("; ")}` : "Every listing matches its idea",
      status: "done",
    };
  }

  // ── 8. Rethink ideas Amazon couldn't supply ───────────────────────────────
  // Only when something failed: the strategist hears why each idea missed and gets one more turn
  // to replace them. Replacements are searched (at most MAX_REPLACEMENTS) and checked like the rest.
  async function* replan(count: number): AsyncGenerator<AgentEvent, Idea[]> {
    // What the store did return for a missed idea shows what it stocks (generic look-alikes, other brands).
    const shown = (s: Slot) => {
      const titles = s.pool.filter((p) => p.source !== "search-link").slice(0, 3).map((p) => p.title.slice(0, 60));
      return titles.length ? `; Amazon showed: ${titles.join(" / ")}` : "";
    };
    const report = slots.map((s, i) => `${i + 1}. ${s.idea.idea}: ${s.gift.product.source === "search-link" ? `MISSED, ${s.miss ?? missReason(s.pool)}${shown(s)}` : "found"}`);
    const more = explored.flat();
    const messages: Message[] = [
      { role: "system", content: STRATEGIST_PROMPT },
      { role: "user", content: strategistBrief(persona, occasion, profile, market, sharing ? giver : undefined) },
      {
        role: "user",
        content: [
          `The shopper searched ${market.domain} for your plan:`,
          ...report,
          ...(more.length ? [`ALSO FROM YOUR EXPLORING: ${fmtEntities(more, true)}`] : []),
          "",
          `Plan ${count} new idea${count > 1 ? "s" : ""} to fill the missed places. Same rules, plus:`,
          "- different from every idea above, and not from the brand, artist or author of a missed idea (the store doesn't carry them);",
          "- an idea that missed on budget needs something clearly cheaper;",
          `- one Amazon had no listing for needs a product ${market.domain} surely stocks, such as a widely sold book or record, or a brand's main product line;`,
          "- one whose listings were the wrong product needs a more specific, real product name;",
          '- keep "via" on a QLOO TASTE GRAPH entity where you can;',
          '- set "replaces" to the number of the missed idea each new one takes the place of.',
          `Call submit_plan with only the ${count} new idea${count > 1 ? "s" : ""}.`,
        ].join("\n"),
      },
    ];
    const planned = new Set(ideas.map((i) => i.query.toLowerCase().trim()));
    // Another product from a brand the store just failed on misses too ("Ban.do planner" → "Ban.do Good Vibes planner").
    const brandOf = (query: string) => query.toLowerCase().trim().replace(/^(the|a|an)\s+/, "").split(/\s+/)[0];
    const missedBrands = new Set(slots.filter((s) => s.gift.product.source === "search-link").map((s) => brandOf(s.idea.query)));
    for (let turn = 0; turn < 2; turn++) {
      // On the shopper's key: the strategist's key has just run the listing check.
      const reply = yield* llm("strategist", {
        lane: SHOPPER_LANE,
        maxTokens: 1200,
        messages,
        tools: [EXPLORE_TOOL, PLAN_TOOL],
        toolChoice: "required",
      });
      messages.push({ role: "assistant", content: reply.content ?? "", tool_calls: reply.toolCalls });
      for (const call of reply.toolCalls) {
        if (call.function.name === "submit_plan") {
          const fresh = (parseArgs<{ ideas: Idea[] }>(call.function.arguments)?.ideas ?? []).filter(
            (i) => i.query?.trim() && i.why?.trim() && !planned.has(i.query.toLowerCase().trim()) && !missedBrands.has(brandOf(i.query)) && fits(i),
          );
          if (fresh.length) return fresh.slice(0, count);
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content:
            call.function.name === "submit_plan"
              ? "None of those were usable: each must be new, and not from the brand, artist or author of a missed idea. Submit again."
              : "No more exploring now. Call submit_plan with the new ideas.",
        });
      }
    }
    return [];
  }

  const open = slots.filter((s) => s.gift.product.source === "search-link");
  const need = Math.min(MAX_REPLACEMENTS, open.length + Math.max(0, GIFT_COUNT - slots.length));
  if (need && Date.now() - started < REPLACE_DEADLINE_MS) {
    const label = `Rethinking ${need} idea${need > 1 ? "s" : ""} Amazon couldn't supply`;
    yield { type: "step", id: "replace", agent: "strategist", label, detail: open.map((s) => s.idea.idea).join(", ") || undefined, status: "running" };
    let detail = "Nothing better on Amazon, so those stay as searches";
    try {
      const fresh = yield* replan(need);
      if (fresh.length) {
        const found = await Promise.all(fresh.map((i) => shop(i.query)));
        const taken = new Set(slots.map((s) => s.gift.product.url));
        const trials: Slot[] = [];
        fresh.forEach((idea, k) => {
          const product = candidates(found[k], occasion.budget).find((p) => !taken.has(p.url));
          if (!product) return;
          taken.add(product.url);
          trials.push({ gift: { product, headline: idea.idea, reasoning: idea.why, trail: trailFor(idea) }, idea, pool: found[k], tried: new Set([product.url]) });
        });
        yield* verify(trials, []);
        // A verified replacement takes the place of the idea it names, else the first search link, else an empty place.
        const winners = trials.filter((s) => s.gift.product.source !== "search-link");
        for (const w of winners) {
          const named = Number(w.idea.replaces) - 1;
          const i = slots[named]?.gift.product.source === "search-link" ? named : slots.findIndex((s) => s.gift.product.source === "search-link");
          if (i >= 0) slots[i] = w;
          else slots.push(w);
        }
        const missed = fresh.filter((i) => !winners.some((w) => w.idea === i)).map((i) => i.idea);
        detail = [winners.length && `Swapped in ${winners.map((s) => s.idea.idea).join(", ")}`, missed.length && `No match on Amazon for ${missed.join(", ")}`]
          .filter(Boolean)
          .join(". ");
      }
    } catch (err) {
      console.warn("[agent] replacement skipped:", (err as Error).message);
    }
    yield { type: "step", id: "replace", agent: "strategist", label, detail, status: "done" };
  }

  yield { type: "gifts", gifts: slots.map((s) => s.gift) };
  yield { type: "done" };
}
