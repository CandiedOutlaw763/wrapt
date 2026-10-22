// Runs the real agent once for each demo persona and saves the result to
// public/demo-runs/<personaId>-<market>.json, so first-time visitors (and judges)
// see finished gifts instantly without spending Groq or SerpApi quota.
//
// Usage: start the dev server, then `node scripts/bake-demo-runs.mjs [baseUrl]`.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3210";
// Optional "personaId:MARKET" filters, e.g. `demo-alex:US`, to re-bake only some runs.
const ONLY = process.argv.slice(3);

// Pull DEMO_PERSONAS straight out of the store so the baked runs always match the app's data.
const src = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
const block = src.slice(src.indexOf("const img = "));
const DEMO_PERSONAS = new Function(
  block
    .replace(/export const DEMO_PERSONAS: Persona\[\] =/, "const DEMO_PERSONAS =")
    .replace("const img = (id: string) =>", "const img = (id) =>") + "\nreturn DEMO_PERSONAS;",
)();

const OCCASIONS = { "demo-maya": "Birthday", "demo-dad": "Holidays", "demo-alex": "Anniversary" };
const MARKETS = [
  { code: "US", budget: 100 },
  { code: "IN", budget: 5000 },
];

mkdirSync(new URL("../public/demo-runs/", import.meta.url), { recursive: true });

for (const persona of DEMO_PERSONAS) {
  for (const m of MARKETS) {
    if (ONLY.length && !ONLY.includes(`${persona.id}:${m.code}`)) continue;
    const occasion = { event: OCCASIONS[persona.id] ?? "Birthday", budget: m.budget, market: m.code };
    process.stdout.write(`${persona.name} @ ${m.code}… `);
    const res = await fetch(`${BASE}/api/gifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona, occasion }),
    });
    let profile, gifts, error;
    for (const line of (await res.text()).split("\n")) {
      if (!line.trim()) continue;
      const e = JSON.parse(line);
      if (e.type === "profile") profile = e.profile;
      if (e.type === "gifts") gifts = e.gifts;
      if (e.type === "error") error = e.message;
    }
    if (!profile || !gifts?.length) {
      console.log(`skipped (${error ?? "no gifts"})`);
      continue;
    }
    const run = { occasion, profile, gifts, createdAt: Date.now() };
    writeFileSync(new URL(`../public/demo-runs/${persona.id}-${m.code}.json`, import.meta.url), JSON.stringify(run));
    const listings = gifts.filter((g) => g.product.source !== "search-link").length;
    console.log(`${gifts.length} gifts (${listings} with listings)`);
  }
}
