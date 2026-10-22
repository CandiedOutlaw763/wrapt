import { cached } from "./cache";
import { fetchRetry } from "./http";
import type { Product } from "./types";

const WEEK = 60 * 60 * 24 * 7;

// SERPAPI_KEY first; SERPAPI_KEY_2 takes over when the first is out of searches or failing.
const KEYS = [process.env.SERPAPI_KEY, process.env.SERPAPI_KEY_2].filter(Boolean) as string[];

export function searchLink(query: string, domain = "amazon.com"): Product {
  return {
    title: query,
    url: `https://www.${domain}/s?k=${encodeURIComponent(query)}`,
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

async function serpapi(query: string, key: string, domain: string): Promise<Product[]> {
  const qs = new URLSearchParams({ engine: "amazon", k: query, amazon_domain: domain, api_key: key });
  const res = await fetchRetry(`https://serpapi.com/search.json?${qs}`);
  const data = (await res.json().catch(() => ({}))) as { organic_results?: SerpResult[]; error?: string };
  // SerpApi reports quota and key problems in `error`; an empty search is not an error.
  if (!res.ok || (data.error && !/hasn't returned any results/i.test(data.error))) {
    throw new Error(`SerpApi ${res.status}: ${data.error ?? "request failed"}`);
  }
  return (data.organic_results ?? [])
    .filter((r) => !r.sponsored && r.title && (r.asin || r.link_clean || r.link))
    .map((r) => ({
      asin: r.asin,
      title: r.title,
      url: r.asin ? `https://www.${domain}/dp/${r.asin}` : (r.link_clean ?? r.link!),
      image: r.thumbnail,
      // $0.00 is a Kindle Unlimited / subscription price, not what the gift costs.
      price: r.extracted_price || undefined,
      priceDisplay: r.extracted_price ? r.price : undefined,
      rating: r.rating,
      reviews: r.reviews,
      source: "serpapi" as const,
    }));
}

/** Try each SerpApi key in turn; results are cached so repeat queries cost nothing. */
async function search(query: string, domain: string): Promise<Product[]> {
  let lastError: Error | null = null;
  for (const key of KEYS) {
    try {
      return await serpapi(query, key, domain);
    } catch (err) {
      lastError = err as Error;
      console.warn(`[products] ${lastError.message} — trying next key`);
    }
  }
  throw lastError ?? new Error("No SerpApi key configured");
}

/**
 * Real Amazon listings for a query, falling back to a plain Amazon search link
 * so a gift is never left without somewhere to buy it.
 */
export async function searchProducts(query: string, opts: { maxPrice?: number; domain?: string; take?: number } = {}): Promise<Product[]> {
  const { maxPrice, domain = "amazon.com", take = 4 } = opts;
  if (KEYS.length) {
    try {
      const all = await cached(`products:serpapi:${domain}:${query.toLowerCase()}`, WEEK, () => search(query, domain));
      const inBudget = maxPrice ? all.filter((p) => p.price === undefined || p.price <= maxPrice) : all;
      const picks = (inBudget.length ? inBudget : all).slice(0, take);
      if (picks.length) return picks;
    } catch (err) {
      console.warn(`[products] all keys failed for "${query}":`, (err as Error).message);
    }
  }
  return [searchLink(query, domain)];
}
