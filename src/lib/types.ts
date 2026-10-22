// Shared shapes passed between the persona UI, the agent route and the stream.

export type EntityType =
  | "urn:entity:artist"
  | "urn:entity:book"
  | "urn:entity:brand"
  | "urn:entity:destination"
  | "urn:entity:movie"
  | "urn:entity:person"
  | "urn:entity:place"
  | "urn:entity:podcast"
  | "urn:entity:tv_show"
  | "urn:entity:videogame"
  | "urn:entity:author"
  | "urn:entity:album";

/** A Qloo entity the persona loves (picked via search). */
export interface TasteSeed {
  id: string;
  name: string;
  type: EntityType;
  image?: string | null;
  tags?: string[];
}

export type AgeRange =
  | "24_and_younger"
  | "25_to_29"
  | "30_to_34"
  | "35_to_44"
  | "45_to_54"
  | "55_and_older";

export type Gender = "female" | "male" | "unspecified";

export interface Persona {
  id: string;
  name: string;
  relationship: string;
  age?: AgeRange;
  gender?: Gender;
  location?: string;
  loves: TasteSeed[];
  hobbies?: string;
  notes?: string;
  /** Index into the cover palette. */
  hue: number;
  createdAt: number;
}

export interface Occasion {
  event: string;
  budget: number;
  note?: string;
}

/** An entity Qloo returned from an insights call. */
export interface QlooEntity {
  id: string;
  name: string;
  type: string;
  affinity: number;
  image?: string | null;
  keywords?: string[];
  description?: string;
  /** Brands only, e.g. ["Automotive", "Luxury Goods"]. */
  industries?: string[];
}

export interface TasteProfile {
  seeds: TasteSeed[];
  hobbyTags: { id: string; name: string }[];
  /** Most common descriptive tags across the seeds — the persona's "vibe". */
  dna: { name: string; count: number }[];
  domains: Partial<Record<string, QlooEntity[]>>;
}

export interface Product {
  asin?: string;
  title: string;
  url: string;
  image?: string;
  price?: number;
  priceDisplay?: string;
  rating?: number;
  reviews?: number;
  source: "serpapi" | "search-link";
}

export interface TasteLink {
  /** What the persona loves (a seed or hobby), when the agent named one correctly. */
  from?: string;
  /** The Qloo entity that bridged to the gift, if any. */
  via?: string;
  affinity?: number;
  image?: string | null;
}

export interface Gift {
  product: Product;
  headline: string;
  reasoning: string;
  trail: TasteLink[];
}

export interface BaselineIdea {
  title: string;
  reason: string;
}

export interface GiftRun {
  occasion: Occasion;
  profile: TasteProfile;
  gifts: Gift[];
  createdAt: number;
}

/** Who did the work: the Qloo sweep, or one of the two agents. */
export type AgentName = "qloo" | "strategist" | "shopper";

export type AgentEvent =
  | { type: "step"; id: string; agent: AgentName; label: string; detail?: string; status: "running" | "done" | "error" }
  | { type: "profile"; profile: TasteProfile }
  | { type: "thought"; text: string }
  | { type: "gifts"; gifts: Gift[] }
  | { type: "error"; message: string }
  | { type: "done" };
