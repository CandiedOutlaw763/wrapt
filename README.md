# Wrapt — gifts wrapped with taste

Build a persona for someone you shop for. Wrapt's agent reads their taste through **Qloo's taste graph**, explores the strongest cross-domain signals, searches real Amazon listings, and hands back gifts with the *taste trail* behind each pick:

> Phoebe Bridgers → **Polaroid** (90% affinity) → Polaroid Now+ instant camera

Built for the [Qloo Agentic Hackathon](https://qloo-hackathon.devpost.com/).

## Why Qloo matters here

An LLM on its own guesses gifts from stereotypes ("she likes indie music → vinyl record"). Qloo knows what people with a given taste *actually* over-index on across domains: one artist alone surfaces Fender, Dr. Martens, Polaroid and Urban Outfitters with affinity scores. Wrapt makes that difference visible: every gift cites the Qloo entity that led to it, and **Compare** shows what the same model suggests without the taste graph.

## How it works: Qloo plus two agents

1. **Qloo maps the taste.** Loves are real Qloo entities (picked via `/search`). Hobbies are mapped to Qloo tags via `/v2/tags`, using word-overlap filtering because tag search is fuzzy. Parallel `/v2/insights` calls then sweep brands, books, artists, films, TV, games, podcasts, and local places when a city is given. Each call is seeded with the persona's entities, hobby tags, and age/gender demographic signals.
2. **Agent 1, the taste strategist** (Groq key 1) reads that profile and plans six gift ideas. At least four of them must come from a Qloo-recommended entity rather than from things the person already loves. It can call `explore_taste` for deeper Qloo lookups before calling `submit_plan`.
3. **Every idea is searched on Amazon in parallel** via SerpApi.
4. **Agent 2, the personal shopper** (Groq key 2) sees the plan and the listings, may run `search_amazon` again for misses, and calls `submit_gifts` with one listing per idea plus the final reason.
5. **Listings gendered for someone else are dropped** before the shopper sees them. With no gender given, only unisex or ungendered listings are kept, and the agents avoid sized clothing unless the notes give a size.
6. **Every listing is checked against its idea** in one small Groq call (a book about an album isn't the album; a sewing book called "Tunic" isn't the game). A rejected listing is swapped for the idea's next candidate, which is checked too, before falling back to an Amazon search link.
7. **Ideas the store can't supply get one replacement round.** If an idea ends without a valid listing (nothing in stock, everything over budget, or only the wrong product), the strategist hears why and what that Amazon store showed instead, then proposes up to three replacements. A replacement can't reuse the brand or artist that just missed. Replacements are searched and checked like the rest. This step only runs when something failed.
8. **The server assembles the gifts.** Taste trails (`from → via`, with Qloo affinity) come from the plan and are checked against the Qloo data. Each run reports how many gifts came through a Qloo connection to something the person never mentioned.

### Gifts to share

Add yourself as a persona ("This is me"), then pick **Gift for: Maya and you**. Wrapt calls Qloo's `/v2/insights/compare` with both people's loves to find the taste tags you have in common, seeds the graph sweep with both sets of loves plus those shared tags, and the strategist plans gifts you'd enjoy together. The results open with "Where your tastes meet".

Progress streams to the UI as NDJSON and drives the agent log. When Groq rate-limits a key, the agents fail over to the other key, and pause visibly if both are limited for a short time. Groq's free tier also gives each model a daily token budget, so when `gpt-oss-120b` is spent on both keys, calls move to `qwen/qwen3.8-27b`. The listing check runs on qwen first anyway: on our labelled idea/listing pairs it scored the same as gpt-oss-120b. If every model is out for the day, the run stops at once with a clear message instead of hanging. Qloo and SerpApi responses are cached (in memory, or in Upstash Redis if configured) to protect quotas.

## Demo results

`public/demo-runs/` holds one finished run per demo persona and store (amazon.com and amazon.in), so a first visit shows gifts instantly without spending Groq or SerpApi quota. They're labelled as sample runs. Regenerate them with the dev server running:

```bash
node scripts/bake-demo-runs.mjs http://localhost:3210            # all
node scripts/bake-demo-runs.mjs http://localhost:3210 demo-alex:US  # just one
```

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

| Variable | Required | Notes |
|---|---|---|
| `QLOO_API_KEY` | yes | Hackathon key; base URL `https://hackathon.api.qloo.com` |
| `GROQ_API_KEY` | yes | Runs the taste strategist. https://console.groq.com/keys |
| `GROQ_API_KEY_2` | recommended | Runs the personal shopper; each agent falls back to the other key |
| `GROQ_MODEL` | no | Defaults to `openai/gpt-oss-120b` |
| `GROQ_FALLBACK_MODELS` | no | Comma-separated models to use when the main one's daily budget is spent. Defaults to `qwen/qwen3.8-27b` |
| `SERPAPI_KEY` | recommended | Amazon listings; 250 free searches/month |
| `SERPAPI_KEY_2` | no | Takes over when the first key runs out |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | no | Persistent cache across serverless instances |
| `NEXT_PUBLIC_FIREBASE_*` | no | Sign-in and cloud sync (see below). Without them, data stays in the browser |

## Sign-in and saved data (Firebase)

Sign-in is optional. Signed-out visitors keep their people in the browser. Signing in with **Google**, **email and password**, or as a **guest** saves personas and their last five gift runs to Firestore under `users/{uid}`. On first sign-in, whatever is already in the browser is copied into the account. A guest can later add Google or an email to the same account without losing anything.

1. Create a project at https://console.firebase.google.com and add a **Web app**. Copy its config into the four `NEXT_PUBLIC_FIREBASE_*` variables.
2. **Authentication → Sign-in method**: enable Google, Email/Password and Anonymous.
3. **Firestore Database**: create a database, then paste [`firestore.rules`](firestore.rules) into the Rules tab and publish. It lets each user read and write only their own data.
4. **Authentication → Settings → Authorized domains**: add your deployed domain (localhost is there by default).

## Amazon stores

Wrapt shops in the visitor's own Amazon store: amazon.in for India, amazon.co.uk for the UK, and so on across 10 stores. The store is picked from the hosting platform's IP country header (`x-vercel-ip-country`), falling back to the browser's time zone and language, and can be changed on any persona page. Budgets, prices and links all use that store's currency and domain.

## Deploy

Import the repo into Vercel and add the env vars above. The `/api/gifts` route streams and sets `maxDuration = 120` so rate-limit pauses still fit.

## Qloo API notes we learned the hard way

- Video games are `urn:entity:videogame` in **both** search and insights. The developer guide's `video_game` returns 400.
- `signal.interests.entities` accepts comma-separated IDs; `signal.demographics.age` / `.gender` shift brand results noticeably.
- `/search` takes `types=urn:entity:...` to filter by type.
- `/v2/insights/compare` takes `a.signal.interests.entities` and `b.signal.interests.entities` and returns the shared tags with a score; region tags ("United States") come back too and say nothing about taste.
- `signal.location.query` (a city or country) shifts brand results only a little once interest and demographic signals are set. A persona with strong tastes gets nearly the same brands with or without it, so Wrapt handles store availability in the agent loop instead.

## Stack

Next.js 16 (App Router), Tailwind CSS 4, Fraunces + Schibsted Grotesk, Groq (OpenAI-compatible tool calling; `gpt-oss-120b` with a `qwen3.8-27b` fallback), Qloo Insights API, SerpApi, Firebase Auth and Firestore, Upstash Redis, Vercel. Personas and past runs live in the browser's localStorage, or in Firestore once you sign in.

## License

[MIT](LICENSE)
