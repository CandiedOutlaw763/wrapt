import type { NextRequest } from "next/server";
import { searchEntities } from "@/lib/qloo";

const TYPES = new Set([
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:brand",
  "urn:entity:movie",
  "urn:entity:person",
  "urn:entity:podcast",
  "urn:entity:tv_show",
  "urn:entity:videogame",
  "urn:entity:place",
  "urn:entity:destination",
]);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const type = req.nextUrl.searchParams.get("type") ?? undefined;
  if (!q || q.length < 2) return Response.json({ results: [] });
  try {
    const results = await searchEntities(q, type && TYPES.has(type) ? type : undefined);
    return Response.json({ results });
  } catch (err) {
    return Response.json({ results: [], error: (err as Error).message }, { status: 502 });
  }
}
