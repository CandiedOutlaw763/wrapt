// Amazon storefronts Wrapt can shop in. Budgets are in each store's own currency,
// because SerpApi returns local prices and the budget filter compares against them.

export interface Market {
  code: string;
  name: string;
  domain: string;
  currency: string;
  locale: string;
  budgets: number[];
}

export const MARKETS: Market[] = [
  { code: "US", name: "United States", domain: "amazon.com", currency: "USD", locale: "en-US", budgets: [25, 50, 100, 200, 500] },
  { code: "IN", name: "India", domain: "amazon.in", currency: "INR", locale: "en-IN", budgets: [1000, 2500, 5000, 10000, 25000] },
  { code: "GB", name: "United Kingdom", domain: "amazon.co.uk", currency: "GBP", locale: "en-GB", budgets: [20, 40, 80, 150, 400] },
  { code: "CA", name: "Canada", domain: "amazon.ca", currency: "CAD", locale: "en-CA", budgets: [30, 70, 140, 280, 700] },
  { code: "AU", name: "Australia", domain: "amazon.com.au", currency: "AUD", locale: "en-AU", budgets: [40, 75, 150, 300, 750] },
  { code: "DE", name: "Germany", domain: "amazon.de", currency: "EUR", locale: "de-DE", budgets: [25, 50, 100, 200, 500] },
  { code: "FR", name: "France", domain: "amazon.fr", currency: "EUR", locale: "fr-FR", budgets: [25, 50, 100, 200, 500] },
  { code: "JP", name: "Japan", domain: "amazon.co.jp", currency: "JPY", locale: "ja-JP", budgets: [3000, 5000, 10000, 20000, 50000] },
  { code: "AE", name: "United Arab Emirates", domain: "amazon.ae", currency: "AED", locale: "en-AE", budgets: [100, 200, 400, 750, 2000] },
  { code: "SG", name: "Singapore", domain: "amazon.sg", currency: "SGD", locale: "en-SG", budgets: [30, 70, 140, 280, 700] },
];

export const DEFAULT_MARKET = MARKETS[0];

export function marketFor(code?: string | null): Market {
  return MARKETS.find((m) => m.code === code?.toUpperCase()) ?? DEFAULT_MARKET;
}

export function formatMoney(amount: number, market: Market): string {
  return new Intl.NumberFormat(market.locale, { style: "currency", currency: market.currency, maximumFractionDigits: 0 }).format(amount);
}

/** The middle budget preset, or the preset closest to a budget carried over from another store. */
export function defaultBudget(market: Market): number {
  return market.budgets[Math.floor(market.budgets.length / 2)];
}

// Time zones that pin down a store when the browser locale has no region (e.g. "en").
const ZONE_COUNTRY: [RegExp, string][] = [
  [/^Asia\/(Kolkata|Calcutta)$/, "IN"],
  [/^Europe\/London$/, "GB"],
  [/^Australia\//, "AU"],
  [/^Asia\/Tokyo$/, "JP"],
  [/^Asia\/Dubai$/, "AE"],
  [/^Asia\/Singapore$/, "SG"],
  [/^Europe\/Berlin$/, "DE"],
  [/^Europe\/Paris$/, "FR"],
  [/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina)$/, "CA"],
];

/** Best guess at the shopper's store from the browser alone (used when no IP country is available). */
export function guessMarketFromBrowser(): Market {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    for (const [re, code] of ZONE_COUNTRY) if (re.test(zone)) return marketFor(code);
    const region = navigator.language.split("-")[1];
    if (region && MARKETS.some((m) => m.code === region.toUpperCase())) return marketFor(region);
  } catch {}
  return DEFAULT_MARKET;
}
