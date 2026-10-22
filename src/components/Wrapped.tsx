"use client";

/* eslint-disable @next/next/no-img-element -- remote Qloo/Amazon images */

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Gift, Occasion, Persona, TasteProfile } from "@/lib/types";
import { Cover } from "./ui";

const SLIDE_MS = 5500;

interface Slide {
  bg: string;
  fg: string;
  body: React.ReactNode;
}

export function Wrapped({ persona, profile, gifts, occasion, onClose }: { persona: Persona; profile: TasteProfile; gifts: Gift[]; occasion: Occasion; onClose: () => void }) {
  const brands = (profile.domains.brand ?? []).slice(0, 5);
  const top = gifts[0];
  const seeds = profile.seeds.filter((s) => s.image).slice(0, 4);

  const slides: Slide[] = [
    {
      bg: "#2d46b9",
      fg: "#ffffff",
      body: (
        <>
          <div className="mx-auto w-40">
            <Cover persona={persona} size="md" className="aspect-square" />
          </div>
          <p className="mt-8 text-lg font-bold">Gift Wrapped</p>
          <h2 className="mt-2 text-5xl font-black leading-[0.95] tracking-tighter">{persona.name}&apos;s taste, decoded.</h2>
          <p className="mt-4 text-white/80">For their {occasion.event.toLowerCase()} · under ${occasion.budget}</p>
        </>
      ),
    },
    {
      bg: "#f037a5",
      fg: "#000000",
      body: (
        <>
          <p className="text-lg font-bold">It starts with what they love</p>
          <div className="mx-auto mt-8 grid w-56 grid-cols-2 gap-2">
            {seeds.map((s) => (
              <img key={s.id} src={s.image!} alt="" className="aspect-square w-full rounded-md object-cover shadow-xl" />
            ))}
          </div>
          <p className="mt-6 text-2xl font-black leading-tight tracking-tight">{profile.seeds.map((s) => s.name).join(" · ")}</p>
        </>
      ),
    },
    {
      bg: "#ff4632",
      fg: "#000000",
      body: (
        <>
          <p className="text-lg font-bold">Their vibe, according to Qloo</p>
          <ul className="mt-6 space-y-1">
            {(profile.dna.length ? profile.dna : [{ name: "One of a kind", count: 1 }]).slice(0, 5).map((d, i) => (
              <li key={d.name} className="text-4xl font-black tracking-tighter sm:text-5xl" style={{ opacity: 1 - i * 0.13 }}>
                {d.name}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      bg: "#1ed760",
      fg: "#000000",
      body: (
        <>
          <p className="text-lg font-bold">People with their taste over-index on</p>
          <ol className="mt-6 space-y-3 text-left">
            {brands.map((b, i) => (
              <li key={b.id} className="flex items-center gap-3">
                <span className="w-6 text-2xl font-black">{i + 1}</span>
                {b.image ? <img src={b.image} alt="" className="size-12 rounded bg-white object-cover" /> : <span className="size-12 rounded bg-black/20" />}
                <span className="min-w-0 flex-1 truncate text-xl font-bold">{b.name}</span>
                <span className="font-black">{Math.round(b.affinity * 100)}%</span>
              </li>
            ))}
          </ol>
        </>
      ),
    },
    ...(top
      ? [
          {
            bg: "#121212",
            fg: "#ffffff",
            body: (
              <>
                <p className="text-lg font-bold text-green">So we wrapped up…</p>
                {top.product.image && <img src={top.product.image} alt="" className="mx-auto mt-6 h-48 w-48 rounded-lg bg-white object-contain p-3" />}
                <h2 className="mt-6 text-3xl font-black leading-tight tracking-tight">{top.headline}</h2>
                <p className="mt-3 text-white/80">{top.reasoning}</p>
              </>
            ),
          },
        ]
      : []),
    {
      bg: "#c39887",
      fg: "#000000",
      body: (
        <>
          <p className="text-lg font-bold">{persona.name}&apos;s gift lineup</p>
          <ol className="mt-6 space-y-2 text-left">
            {gifts.map((g, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="w-5 font-black">{i + 1}</span>
                {g.product.image ? <img src={g.product.image} alt="" className="size-10 rounded bg-white object-contain p-0.5" /> : <span className="size-10 rounded bg-black/15" />}
                <span className="min-w-0 flex-1 truncate font-bold">{g.headline}</span>
                <span className="text-sm font-bold">{g.product.priceDisplay}</span>
              </li>
            ))}
          </ol>
          <button onClick={onClose} className="mt-8 rounded-full bg-black px-6 py-3 font-bold text-white">
            Back to gifts
          </button>
        </>
      ),
    },
  ];

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const last = slides.length - 1;
  const next = useCallback(() => setI((n) => Math.min(n + 1, last)), [last]);
  const prev = useCallback(() => setI((n) => Math.max(n - 1, 0)), []);

  useEffect(() => {
    if (paused || i === last) return;
    const t = setTimeout(next, SLIDE_MS);
    return () => clearTimeout(t);
  }, [i, paused, last, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  const slide = slides[i];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-0 sm:p-6" role="dialog" aria-modal aria-label={`${persona.name}'s Gift Wrapped`}>
      <div
        className="relative flex h-full w-full max-w-md flex-col overflow-hidden transition-colors duration-500 sm:h-[min(820px,92vh)] sm:rounded-2xl"
        style={{ background: slide.bg, color: slide.fg }}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        <div className="flex gap-1 p-3">
          {slides.map((_, n) => (
            <div key={n} className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: `${slide.fg}40` }}>
              <div
                key={`${n}-${i}`}
                className="h-full origin-left rounded-full"
                style={{
                  background: slide.fg,
                  transform: n < i ? "scaleX(1)" : "scaleX(0)",
                  animation: n === i && i !== last ? `story-progress ${SLIDE_MS}ms linear forwards` : n === i ? "none" : undefined,
                  ...(n === i && i === last ? { transform: "scaleX(1)" } : {}),
                  animationPlayState: paused ? "paused" : "running",
                }}
              />
            </div>
          ))}
        </div>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-6 z-10 grid size-9 place-items-center rounded-full" style={{ background: `${slide.fg}20` }}>
          <X className="size-5" />
        </button>

        <div key={i} className="rise relative z-[1] flex flex-1 flex-col justify-center overflow-y-auto px-8 pb-10 text-center">
          {slide.body}
        </div>

        {/* Tap zones */}
        <button aria-label="Previous" onClick={prev} className="absolute inset-y-16 left-0 w-1/4" />
        {i !== last && <button aria-label="Next" onClick={next} className="absolute inset-y-16 right-0 w-1/4" />}
      </div>
    </div>
  );
}
