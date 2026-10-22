"use client";

import { Play, Plus } from "lucide-react";
import { useApp } from "./App";
import { Cover } from "./ui";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Up late gifting?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Home() {
  const { personas, go } = useApp();

  return (
    <div className="pb-10">
      <div className="bg-gradient-to-b from-[#2b4380] to-base px-4 pb-6 pt-8 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">{greeting()}</h1>
        <p className="mt-1 text-sub">Who are we finding a gift for?</p>

        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {personas.slice(0, 6).map((p) => (
            <button
              key={p.id}
              onClick={() => go({ name: "persona", id: p.id })}
              className="group flex h-16 items-center gap-3 overflow-hidden rounded bg-white/[.07] pr-3 text-left transition-colors hover:bg-white/[.16]"
            >
              <div className="size-16 shrink-0">
                <Cover persona={p} className="!rounded-none" />
              </div>
              <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-green text-black opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                <Play className="ml-0.5 size-5 fill-current" />
              </span>
            </button>
          ))}
        </div>
      </div>

      <section className="px-4 sm:px-6">
        <h2 className="mb-3 mt-4 text-2xl font-bold tracking-tight">Your people</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {personas.map((p) => (
            <button
              key={p.id}
              onClick={() => go({ name: "persona", id: p.id })}
              className="group rounded-lg bg-transparent p-3 text-left transition-colors hover:bg-card"
            >
              <div className="relative aspect-square">
                <Cover persona={p} />
                <span className="absolute bottom-2 right-2 grid size-12 translate-y-2 place-items-center rounded-full bg-green text-black opacity-0 shadow-xl transition-all group-hover:translate-y-0 group-hover:opacity-100">
                  <Play className="ml-0.5 size-5 fill-current" />
                </span>
              </div>
              <p className="mt-3 truncate font-bold">{p.name}</p>
              <p className="mt-1 line-clamp-2 text-sm text-sub">
                {p.relationship} · Loves {p.loves.slice(0, 3).map((l) => l.name).join(", ") || "…"}
              </p>
            </button>
          ))}
          <button onClick={() => go({ name: "edit" })} className="group rounded-lg p-3 text-left transition-colors hover:bg-card">
            <div className="grid aspect-square place-items-center rounded-md border border-dashed border-white/20 text-sub transition-colors group-hover:border-white/50 group-hover:text-white">
              <Plus className="size-10" />
            </div>
            <p className="mt-3 font-bold">New persona</p>
            <p className="mt-1 text-sm text-sub">Add someone you shop for</p>
          </button>
        </div>
      </section>

      <section className="mt-10 px-4 sm:px-6">
        <h2 className="mb-3 text-2xl font-bold tracking-tight">How Wrapt picks</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {[
            ["Tell us who they are", "The artists, shows, books and brands they love, plus hobbies and the occasion."],
            ["Qloo reads their taste", "Qloo's taste graph maps those loves across 250M+ entities to the brands, books and culture people like them over-index on."],
            ["The agent shops", "It explores the strongest signals, searches real Amazon listings, and shows the taste trail behind every pick."],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-lg bg-card p-5">
              <span className="text-sm font-bold text-green">0{i + 1}</span>
              <h3 className="mt-2 font-bold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-sub">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
