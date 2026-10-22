"use client";

import { Plus } from "lucide-react";
import { useApp } from "./App";
import { Cover } from "./ui";

export function Home() {
  const { personas, go } = useApp();

  return (
    <div className="pb-16">
      <section className="px-5 pb-10 pt-10 sm:px-8 sm:pt-14">
        <h1 className="font-display max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">Who&apos;s on your list?</h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-sub">
          Tell Wrapt what someone loves. It reads their taste through Qloo, then two agents plan and shop for gifts they&apos;d never have found themselves.
        </p>
        <button
          onClick={() => go({ name: "edit" })}
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-ribbon px-6 py-3 font-semibold text-ink transition-colors hover:bg-ribbon-deep"
        >
          <Plus className="size-5" /> Add someone
        </button>
      </section>

      <section className="px-5 sm:px-8">
        <h2 className="font-display mb-4 text-2xl font-semibold">Your people</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {personas.map((p) => (
            <button key={p.id} onClick={() => go({ name: "persona", id: p.id })} className="group text-left">
              <div className="aspect-square transition-transform duration-300 group-hover:-rotate-2 group-focus-visible:-rotate-2">
                <Cover persona={p} />
              </div>
              <p className="font-display mt-3 truncate text-lg font-semibold">{p.name}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-sub">
                {p.relationship}. Loves {p.loves.slice(0, 3).map((l) => l.name).join(", ") || "…"}
              </p>
            </button>
          ))}
          <button onClick={() => go({ name: "edit" })} className="group text-left">
            <div className="grid aspect-square place-items-center rounded-xl border border-dashed border-line text-sub transition-colors group-hover:border-sub group-hover:text-text">
              <Plus className="size-10" />
            </div>
            <p className="font-display mt-3 text-lg font-semibold">Add someone</p>
            <p className="mt-0.5 text-sm text-sub">A friend, a parent, a partner</p>
          </button>
        </div>
      </section>

      <section className="mt-14 px-5 sm:px-8">
        <h2 className="font-display mb-5 text-2xl font-semibold">How a gift gets picked</h2>
        <ol className="grid gap-x-10 gap-y-6 md:grid-cols-3">
          {[
            ["Qloo maps their taste", "The artists, shows and brands they love are matched against Qloo's taste graph of 250M+ entities, surfacing the brands, books and culture people like them gravitate to."],
            ["A strategist plans", "The first agent reads that map and plans six gift ideas, each tied to a specific Qloo signal."],
            ["A shopper buys", "The second agent searches Amazon for every idea, picks the best real listing, and explains why it fits."],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="font-display text-4xl font-semibold leading-none text-ribbon">{i + 1}</span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-sub">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
