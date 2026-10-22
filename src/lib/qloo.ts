import { cached } from "./cache";
import type { AgeRange, Gender, QlooEntity, TasteSeed } from "./types";

const BASE = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";
const DAY = 60 * 60 * 24;

async function qloo<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const url = `${BASE}${path}?${qs}`;
  return cached(`qloo:${url}`, DAY, async () => {
    const res = await fetch(url, { headers: { "X-Api-Key": process.env.QLOO_API_KEY ?? "" } });
    if (!res.ok) throw new Error(`Qloo ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  });
}

interface RawTag {
  name: string;
  tag_id?: string;
  id?: string;
  type?: string;
}

interface RawEntity {
  entity_id: string;
  name: string;
  types?: string[];
  subtype?: string;
  query?: { affinity?: number };
  popularity?: number;
  tags?: RawTag[];
  properties?: {
    image?: { url?: string };
    short_description?: string;
    description?: string;
    keywords?: string[];
    lifestyle?: string[];
    industries?: string[];
  };
}

// Tags that describe identity trivia rather than taste ("People From Castlebar").
const NOISY_TAG = /people|alumni|scholars|companies|establishments|listed on|based in|births|deaths|suicide|21st-century|20th-century|^\d/i;

export function tasteTags(tags: RawTag[] = []): string[] {
  return [...new Set(tags.map((t) => t.name).filter((n) => !NOISY_TAG.test(n)))];
}

/** Entity type-ahead for the persona builder. */
export async function searchEntities(query: string, type?: string, take = 8): Promise<TasteSeed[]> {
  const data = await qloo<{ results?: RawEntity[] }>("/search", { query, types: type, take });
  return (data.results ?? []).map((e) => ({
    id: e.entity_id,
    name: e.name,
    type: (e.types?.[0] ?? "urn:entity:brand") as TasteSeed["type"],
    image: e.properties?.image?.url ?? null,
    tags: tasteTags(e.tags).slice(0, 10),
  }));
}

type RawTagResult = RawTag & { parents?: { type: string }[] };

// Tag search is fuzzy ("film photography" → "Film Director", "grilling" → menu items),
// so only keep tags whose words all appear in the interest, and prefer taste-level tag types.
const TAG_TYPE_RANK = ["urn:tag:keyword:qloo", "urn:tag:genre:media", "urn:tag:subgenre:qloo", "urn:tag:genre:music"];
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);

function usableTags(query: string, tags: RawTagResult[]): RawTagResult[] {
  const q = new Set(words(query));
  const head = words(query).at(-1); // "film photography" is about photography
  const rank = (t: RawTagResult) => {
    const i = TAG_TYPE_RANK.indexOf(t.type ?? "");
    return (head && words(t.name).includes(head) ? 0 : 10) + (i === -1 ? TAG_TYPE_RANK.length : i);
  };
  return tags
    .filter((t) => !t.type?.includes("occupation") && !(t.parents?.length && t.parents.every((p) => p.type === "urn:entity:place")))
    .filter((t) => words(t.name).every((w) => q.has(w)))
    .sort((a, b) => rank(a) - rank(b));
}

/** Map a free-text interest ("film photography") to Qloo tag ids. */
export async function searchTags(query: string, take = 3): Promise<{ id: string; name: string }[]> {
  const lookup = async (term: string) =>
    usableTags(query, (await qloo<{ results?: { tags?: RawTagResult[] } }>("/v2/tags", { "filter.query": term, take: 10 })).results?.tags ?? []);

  let tags = await lookup(query);
  const last = words(query).at(-1);
  if (!tags.length && last && last !== query.toLowerCase()) tags = await lookup(last);
  return tags
    .map((t) => ({ id: t.id ?? t.tag_id ?? "", name: t.name }))
    .filter((t) => t.id)
    .slice(0, take);
}

export interface InsightQuery {
  filterType: string;
  entityIds?: string[];
  tagIds?: string[];
  age?: AgeRange;
  gender?: Gender;
  location?: string;
  take?: number;
}

/** Cross-domain recommendations from the taste graph. */
export async function insights(q: InsightQuery): Promise<QlooEntity[]> {
  if (!q.entityIds?.length && !q.tagIds?.length) return [];
  const data = await qloo<{ results?: { entities?: RawEntity[] } }>("/v2/insights", {
    "filter.type": q.filterType,
    "signal.interests.entities": q.entityIds?.join(","),
    "signal.interests.tags": q.tagIds?.join(","),
    "signal.demographics.age": q.age,
    "signal.demographics.gender": q.gender && q.gender !== "unspecified" ? q.gender : undefined,
    "filter.location.query": q.location,
    take: q.take ?? 10,
  });
  return (data.results?.entities ?? []).map((e) => ({
    id: e.entity_id,
    name: e.name,
    type: e.subtype ?? q.filterType,
    affinity: e.query?.affinity ?? 0,
    image: e.properties?.image?.url ?? null,
    keywords: (e.properties?.keywords ?? tasteTags(e.tags)).slice(0, 6),
    description: (e.properties?.short_description ?? e.properties?.description)?.slice(0, 160),
    industries: e.properties?.industries ?? undefined,
  }));
}
