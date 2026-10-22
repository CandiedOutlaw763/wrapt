"use client";

/* eslint-disable @next/next/no-img-element -- remote Qloo/Amazon images, sizes vary */

import { useId } from "react";
import type { Persona, TasteSeed } from "@/lib/types";

/** Wrapping papers, one per persona: [paper, ribbon, page header]. */
export const HUES: [string, string, string][] = [
  ["#b8325a", "#f4b740", "#5e1a33"],
  ["#2a3a7a", "#f2c6d8", "#1b2550"],
  ["#2f6b4f", "#f4b740", "#173a2b"],
  ["#d9622b", "#fff1d6", "#6b2c12"],
  ["#7b5ea7", "#f4b740", "#3d2c58"],
  ["#237a86", "#ffd5a8", "#123f46"],
  ["#c98b1e", "#3b1f4a", "#5e400c"],
  ["#c46a86", "#fff1d6", "#5f2b3d"],
];

export const hue = (p: Pick<Persona, "hue">) => HUES[p.hue % HUES.length];

const TYPE_LABEL: Record<string, string> = {
  "urn:entity:artist": "Artist",
  "urn:entity:book": "Book",
  "urn:entity:brand": "Brand",
  "urn:entity:movie": "Film",
  "urn:entity:person": "Person",
  "urn:entity:podcast": "Podcast",
  "urn:entity:tv_show": "TV",
  "urn:entity:videogame": "Game",
  "urn:entity:place": "Place",
  "urn:entity:destination": "Destination",
  "urn:entity:author": "Author",
  "urn:entity:album": "Album",
};

export const typeLabel = (t: string) => TYPE_LABEL[t] ?? t.replace("urn:entity:", "");

export const AGE_OPTIONS: { value: NonNullable<Persona["age"]>; label: string }[] = [
  { value: "24_and_younger", label: "Under 25" },
  { value: "25_to_29", label: "25–29" },
  { value: "30_to_34", label: "30–34" },
  { value: "35_to_44", label: "35–44" },
  { value: "45_to_54", label: "45–54" },
  { value: "55_and_older", label: "55+" },
];

export const ageLabel = (a?: Persona["age"]) => AGE_OPTIONS.find((o) => o.value === a)?.label;

const SIZES = {
  sm: "size-11 rounded-md",
  md: "size-full rounded-xl",
  lg: "size-40 sm:size-52 rounded-2xl",
};

/** A persona's cover: their initial on a wrapped box, in their own paper and ribbon. */
export function Cover({ persona, size = "md", className = "" }: { persona: Pick<Persona, "name" | "hue">; size?: keyof typeof SIZES; className?: string }) {
  const [paper, ribbon] = hue(persona);
  const pattern = useId();
  return (
    <svg viewBox="0 0 100 100" className={`${SIZES[size]} shrink-0 overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,.45)] ${className}`} role="img" aria-label={`${persona.name || "New persona"} cover`}>
      <defs>
        <pattern id={pattern} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="2" cy="2" r="1.1" fill="#fff" opacity="0.13" />
        </pattern>
      </defs>
      <rect width="100" height="100" fill={paper} />
      <rect width="100" height="100" fill={`url(#${pattern})`} />
      <rect x="60" width="10" height="100" fill={ribbon} />
      <rect y="60" width="100" height="10" fill={ribbon} />
      <g fill={ribbon} stroke="#000" strokeOpacity="0.18" strokeWidth="0.8">
        <ellipse cx="57" cy="58" rx="11" ry="6" transform="rotate(-32 57 58)" />
        <ellipse cx="73" cy="58" rx="11" ry="6" transform="rotate(32 73 58)" />
        <circle cx="65" cy="63" r="4.2" />
      </g>
      <text x="11" y="48" fill="#fff" fillOpacity="0.92" fontSize="42" fontWeight="600" style={{ fontFamily: "var(--font-fraunces)", fontVariationSettings: '"SOFT" 100' }}>
        {(persona.name || "?").slice(0, 1).toUpperCase()}
      </text>
    </svg>
  );
}

export function SeedThumb({ seed, className = "" }: { seed: Pick<TasteSeed, "image" | "name" | "type">; className?: string }) {
  const round = seed.type === "urn:entity:artist" || seed.type === "urn:entity:person";
  return seed.image ? (
    <img src={seed.image} alt="" className={`object-cover ${round ? "rounded-full" : "rounded-lg"} ${className}`} />
  ) : (
    <div className={`font-display grid place-items-center bg-hi text-sub ${round ? "rounded-full" : "rounded-lg"} ${className}`}>{seed.name.slice(0, 1)}</div>
  );
}

export function Pill({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active ? "border-ribbon bg-ribbon/15 font-semibold text-ribbon" : "border-line text-text hover:border-sub"
      }`}
    >
      {children}
    </button>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display flex items-center gap-2 text-2xl font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect x="3" y="11" width="26" height="18" rx="3" fill="var(--color-ribbon)" />
        <rect x="14" y="11" width="4" height="18" fill="#120c16" opacity="0.35" />
        <g fill="none" stroke="var(--color-ribbon)" strokeWidth="2.4" strokeLinecap="round">
          <path d="M16 10c-3-6-9-6-9-2s6 2 9 2z" />
          <path d="M16 10c3-6 9-6 9-2s-6 2-9 2z" />
        </g>
      </svg>
      Wrapt
    </span>
  );
}

export function PulseDot() {
  return <span className="pulse-dot" aria-hidden />;
}
