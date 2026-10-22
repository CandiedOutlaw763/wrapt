# Wrapt — gifts that get them

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
5. **The server assembles the gifts.** Taste trails (`from → via`, with Qloo affinity) come from the plan and are checked against the Qloo data. If the shopper fails, each idea falls back to its best *matching* listing, or to an Amazon search link.

Progress streams to the UI as NDJSON and drives the agent log. When Groq rate-limits a key, the agents fail over to the other key, and pause visibly if both are limited. Qloo and SerpApi responses are cached (in memory, or in Upstash Redis if configured) to protect quotas.

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
| `SERPAPI_KEY` | recommended | Amazon listings; 250 free searches/month |
| `SERPAPI_KEY_2` | no | Takes over when the first key runs out |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | no | Persistent cache across serverless instances |

## Deploy

Import the repo into Vercel and add the env vars above. The `/api/gifts` route streams and sets `maxDuration = 120` so rate-limit pauses still fit.

## Qloo API notes we learned the hard way

- Video games are `urn:entity:videogame` in **both** search and insights. The developer guide's `video_game` returns 400.
- `signal.interests.entities` accepts comma-separated IDs; `signal.demographics.age` / `.gender` shift brand results noticeably.
- `/search` takes `types=urn:entity:...` to filter by type.

## Stack

Next.js 16 (App Router), Tailwind CSS 4, Fraunces + Schibsted Grotesk, Groq (OpenAI-compatible tool calling), Qloo Insights API, SerpApi. Personas and past runs are stored in the browser's localStorage.

## License

[MIT](LICENSE)
