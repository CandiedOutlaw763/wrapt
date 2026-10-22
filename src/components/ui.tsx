"use client";

/* eslint-disable @next/next/no-img-element -- remote Qloo/Amazon images, sizes vary */

import type { Persona, TasteSeed } from "@/lib/types";

/** Cover gradients, one per persona hue. [cover top, cover bottom, page header]. */
export const HUES: [string, string, string][] = [
  ["#e8115b", "#7a0a30", "#8c1d40"],
  ["#1e3264", "#0d1730", "#2b4380"],
  ["#148a08", "#0a4504", "#1c6b14"],
  ["#e1300a", "#6e1805", "#a3290f"],
  ["#8d67ab", "#3e2b4d", "#5f4775"],
  ["#509bf5", "#1d4c85", "#2f6db0"],
  ["#ba5d07", "#5a2d03", "#8a4a0d"],
  ["#27856a", "#103b2f", "#1f6352"],
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

/** Playlist-style cover: a 2×2 mosaic of what they love, or a gradient monogram. */
export function Cover({ persona, size = "md", className = "" }: { persona: Persona; size?: "sm" | "md" | "lg"; className?: string }) {
  const [from, to] = hue(persona);
  const pics = persona.loves.map((l) => l.image).filter(Boolean) as string[];
  const dims = size === "sm" ? "size-12 rounded" : size === "lg" ? "size-36 sm:size-52 rounded-md" : "size-full rounded-md";
  const letter = size === "sm" ? "text-xl" : size === "lg" ? "text-7xl sm:text-8xl" : "text-5xl";

  if (pics.length >= 4) {
    return (
      <div className={`${dims} grid grid-cols-2 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,.5)] ${className}`}>
        {pics.slice(0, 4).map((src, i) => (
          <img key={i} src={src} alt="" className="size-full object-cover" />
        ))}
      </div>
    );
  }
  return (
    <div
      className={`${dims} relative grid place-items-center overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,.5)] ${className}`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <span className={`${letter} font-black tracking-tighter text-white/90`}>{persona.name.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}

export function SeedThumb({ seed, className = "" }: { seed: Pick<TasteSeed, "image" | "name" | "type">; className?: string }) {
  const round = seed.type === "urn:entity:artist" || seed.type === "urn:entity:person";
  return seed.image ? (
    <img src={seed.image} alt="" className={`object-cover ${round ? "rounded-full" : "rounded"} ${className}`} />
  ) : (
    <div className={`grid place-items-center bg-hi text-sub font-bold ${round ? "rounded-full" : "rounded"} ${className}`}>{seed.name.slice(0, 1)}</div>
  );
}

export function Pill({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-white text-black" : "bg-white/[.07] text-white hover:bg-white/[.12]"
      }`}
    >
      {children}
    </button>
  );
}

export function Equalizer() {
  return (
    <span className="eq inline-flex items-end" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}
