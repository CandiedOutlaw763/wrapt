import { cached } from "./cache";
import type { Product } from "./types";

const WEEK = 60 * 60 * 24 * 7;

function searchLink(query: string): Product {
  return {
    title: query,
    url: `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
    source: "search-link",
  };
}

interface SerpResult {
  asin?: string;
  title: string;
  link_clean?: string;
  link?: string;
  thumbnail?: string;
  price?: string;
  extracted_price?: number;
  rating?: number;
  reviews?: number;
  sponsored?: boolean;
}

async function serpapi(query: string): Promise<Product[]> {
  const qs = new URLSearchParams({ engine: "amazon", k: query, amazon_domain: "amazon.com", api_key: process.env.SERPAPI_KEY! });
  const res = await fetch(`https://serpapi.com/search.json?${qs}`);
  if (!res.ok) throw new Error(`SerpApi ${res.status}`);
  const data = (await res.json()) as { organic_results?: SerpResult[]; error?: string };
  if (data.error && !data.organic_results) throw new Error(`SerpApi: ${data.error}`);
  return (data.organic_results ?? [])
    .filter((r) => !r.sponsored && r.title)
    .map((r) => ({
      asin: r.asin,
      title: r.title,
      url: r.link_clean ?? (r.asin ? `https://www.amazon.com/dp/${r.asin}/` : r.link!),
      image: r.thumbnail,
      price: r.extracted_price,
      priceDisplay: r.price,
      rating: r.rating,
      reviews: r.reviews,
      source: "serpapi" as const,
    }));
}

const CANOPY_QUERY = `query Search($term: String!) {
  amazonProductSearchResults(input: { searchTerm: $term, domain: US }) {
    productResults { results { title url asin mainImageUrl rating ratingsTotal sponsored price { value display } } }
  }
}`;

interface CanopyResult {
  title: string;
  url: string;
  asin?: string;
  mainImageUrl?: string;
  rating?: number;
  ratingsTotal?: number;
  sponsored?: boolean;
  price?: { value: number; display: string };
}

async function canopy(query: string): Promise<Product[]> {
  const res = await fetch("https://graphql.canopyapi.co/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "API-KEY": process.env.CANOPY_API_KEY! },
    body: JSON.stringify({ query: CANOPY_QUERY, variables: { term: query } }),
  });
  if (!res.ok) throw new Error(`Canopy ${res.status}`);
  const data = (await res.json()) as {
    data?: { amazonProductSearchResults?: { productResults?: { results?: CanopyResult[] } } };
    errors?: { message: string }[];
  };
  if (data.errors?.length) throw new Error(`Canopy: ${data.errors[0].message}`);
  return (data.data?.amazonProductSearchResults?.productResults?.results ?? [])
    .filter((r) => !r.sponsored)
    .map((r) => ({
      asin: r.asin,
      title: r.title,
      url: r.url,
      image: r.mainImageUrl,
      price: r.price?.value,
      priceDisplay: r.price?.display,
      rating: r.rating,
      reviews: r.ratingsTotal,
      source: "canopy" as const,
    }));
}

/**
 * Real Amazon listings for a query: SerpApi, then Canopy, then a plain search
 * link so a gift is never left without somewhere to buy it.
 */
export async function searchProducts(query: string, maxPrice?: number, take = 5): Promise<Product[]> {
  const providers: [string, (q: string) => Promise<Product[]>][] = [];
  if (process.env.SERPAPI_KEY) providers.push(["serpapi", serpapi]);
  if (process.env.CANOPY_API_KEY) providers.push(["canopy", canopy]);

  for (const [name, provider] of providers) {
    try {
      const all = await cached(`products:${name}:${query.toLowerCase()}`, WEEK, () => provider(query));
      const inBudget = maxPrice ? all.filter((p) => p.price === undefined || p.price <= maxPrice) : all;
      const picks = (inBudget.length ? inBudget : all).slice(0, take);
      if (picks.length) return picks;
    } catch (err) {
      console.warn(`[products] ${name} failed for "${query}":`, (err as Error).message);
    }
  }
  return [searchLink(query)];
}
