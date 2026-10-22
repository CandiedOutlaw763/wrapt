# Wrapt — gifts that get them

Build a persona for someone you shop for. Wrapt's agent reads their taste through **Qloo's taste graph**, explores the strongest cross-domain signals, searches real Amazon listings, and hands back gifts with the *taste trail* behind each pick:

> Phoebe Bridgers → **Polaroid** (90% affinity) → Polaroid Now+ instant camera

Built for the [Qloo Agentic Hackathon](https://qloo-hackathon.devpost.com/).

## Why Qloo matters here

An LLM on its own guesses gifts from stereotypes ("she likes indie music → vinyl record"). Qloo knows what people with a given taste *actually* over-index on across domains: one artist alone surfaces Fender, Dr. Martens, Polaroid and Urban Outfitters with affinity scores. Wrapt makes that difference visible: every gift cites the Qloo entity that led to it, and **Compare** shows what the same model suggests without the taste graph.

## How the agent works

1. **Read the persona**: loves are real Qloo entities (picked via `/search`). Hobbies are mapped to Qloo tags via `/v2/tags`, using word-overlap filtering because tag search is fuzzy.
2. **Sweep the taste graph**: parallel `/v2/insights` calls across brands, books, artists, films, TV, games, podcasts, and local places when a city is given. Each call is seeded with the persona's entities, hobby tags, and age/gender demographic signals.
3. **Agent loop** (Groq, tool calling, up to 10 turns):
   - `explore_taste`: more Qloo insights for one domain, seeded by a subset of loves or a keyword
   - `search_amazon`: real listings via SerpApi, falling back to Canopy API, then to a plain Amazon search link
   - `submit_gifts`: final picks; each must reference a real listing and name its `from → via` taste trail
4. Progress streams to the UI as NDJSON. It drives the agent log and the "now playing" bar.

All Qloo, product and LLM calls run server-side. Qloo and product responses are cached (in memory, or in Upstash Redis if configured) to protect quotas.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

| Variable | Required | Notes |
|---|---|---|
| `QLOO_API_KEY` | yes | Hackathon key; base URL `https://hackathon.api.qloo.com` |
| `GROQ_API_KEY` | yes | https://console.groq.com/keys |
| `GROQ_MODEL` | no | Defaults to `openai/gpt-oss-120b` |
| `SERPAPI_KEY` | recommended | 250 free searches/month |
| `CANOPY_API_KEY` | no | Fallback product search, 100 free calls/month |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | no | Persistent cache across serverless instances |

## Deploy

Import the repo into Vercel and add the env vars above. The `/api/gifts` route streams and sets `maxDuration = 60`.

## Qloo API notes we learned the hard way

- Video games are `urn:entity:videogame` in **both** search and insights. The developer guide's `video_game` returns 400.
- `signal.interests.entities` accepts comma-separated IDs; `signal.demographics.age` / `.gender` shift brand results noticeably.
- `/search` takes `types=urn:entity:...` to filter by type.

## Stack

Next.js 16 (App Router), Tailwind CSS 4, Groq (OpenAI-compatible tool calling), Qloo Insights API, SerpApi / Canopy. Personas and past runs are stored in the browser's localStorage.

## License

[MIT](LICENSE)
