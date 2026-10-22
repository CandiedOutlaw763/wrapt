"use client";

/* eslint-disable @next/next/no-img-element -- remote Qloo/Amazon images */

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, ExternalLink, LoaderCircle, Pencil, Play, Scale, Sparkles, Star } from "lucide-react";
import { loadRuns, saveRun } from "@/lib/store";
import type { AgentEvent, BaselineIdea, Gift, GiftRun, Occasion, Persona, QlooEntity, TasteProfile } from "@/lib/types";
import { useApp } from "./App";
import { Cover, Equalizer, Pill, SeedThumb, ageLabel, hue, typeLabel } from "./ui";
import { Wrapped } from "./Wrapped";

const EVENTS = ["Birthday", "Anniversary", "Holidays", "Graduation", "Housewarming", "Thank you", "Just because"];
const BUDGETS = [25, 50, 100, 200, 500];
const EXPECTED_STEPS = 7;

type Step = Extract<AgentEvent, { type: "step" }>;

interface RunState {
  running: boolean;
  steps: Step[];
  thoughts: string[];
  profile?: TasteProfile;
  gifts?: Gift[];
  error?: string;
  occasion: Occasion;
}

export function PersonaView({ persona }: { persona: Persona }) {
  const { go, setNowPlaying } = useApp();
  const [occasion, setOccasion] = useState<Occasion>({ event: "Birthday", budget: 100 });
  const [run, setRun] = useState<RunState | null>(null);
  const [history, setHistory] = useState<GiftRun[]>([]);
  const [showWrapped, setShowWrapped] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const past = loadRuns(persona.id);
    // Hydrate from storage after mount (not readable during prerender).
    /* eslint-disable react-hooks/set-state-in-effect */
    setHistory(past);
    if (past[0]) {
      setRun({ running: false, steps: [], thoughts: [], profile: past[0].profile, gifts: past[0].gifts, occasion: past[0].occasion });
      setOccasion(past[0].occasion);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => abort.current?.abort();
  }, [persona.id]);

  async function start() {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const state: RunState = { running: true, steps: [], thoughts: [], occasion };
    const update = (patch: Partial<RunState>) => {
      Object.assign(state, patch);
      setRun({ ...state });
    };
    update({});
    setNowPlaying({ personaId: persona.id, label: "Warming up…", progress: 0.03 });

    try {
      const res = await fetch("/api/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, occasion }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as AgentEvent;
          if (e.type === "step") {
            const steps = state.steps.some((s) => s.id === e.id) ? state.steps.map((s) => (s.id === e.id ? e : s)) : [...state.steps, e];
            update({ steps });
            const done = steps.filter((s) => s.status !== "running").length;
            setNowPlaying({ personaId: persona.id, label: e.label, progress: Math.min(0.95, 0.05 + done / EXPECTED_STEPS) });
          } else if (e.type === "thought") update({ thoughts: [...state.thoughts, e.text] });
          else if (e.type === "profile") update({ profile: e.profile });
          else if (e.type === "gifts") {
            update({ gifts: e.gifts });
            const saved: GiftRun = { occasion, profile: state.profile!, gifts: e.gifts, createdAt: Date.now() };
            saveRun(persona.id, saved);
            setHistory((h) => [saved, ...h].slice(0, 5));
          } else if (e.type === "error") update({ error: e.message });
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") update({ error: (err as Error).message });
    } finally {
      if (!ctrl.signal.aborted) {
        update({ running: false });
        setNowPlaying(null);
      }
    }
  }

  const [, , header] = hue(persona);
  const meta = [persona.relationship, ageLabel(persona.age), persona.location, `${persona.loves.length} loves`].filter(Boolean).join(" • ");

  return (
    <div className="pb-16">
      <header className="flex flex-col gap-6 px-4 pb-6 pt-10 sm:flex-row sm:items-end sm:px-6" style={{ background: `linear-gradient(to bottom, ${header}, ${header}99 60%, #121212)` }}>
        <Cover persona={persona} size="lg" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Persona</p>
          <h1 className="mt-1 break-words text-5xl font-black leading-none tracking-tighter sm:text-7xl lg:text-8xl">{persona.name}</h1>
          {persona.notes && <p className="mt-4 line-clamp-2 text-sm text-white/70">{persona.notes}</p>}
          <p className="mt-3 text-sm font-medium">{meta}</p>
        </div>
      </header>

      <div className="bg-gradient-to-b from-black/20 to-transparent px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 py-5">
          <div className="flex items-center gap-4">
            <button
              onClick={start}
              disabled={run?.running}
              aria-label="Find gifts"
              className="grid size-14 shrink-0 place-items-center rounded-full bg-green text-black shadow-lg transition hover:scale-105 hover:bg-[#3be477] disabled:hover:scale-100"
            >
              {run?.running ? <LoaderCircle className="size-6 animate-spin" /> : <Play className="ml-1 size-6 fill-current" />}
            </button>
            <button onClick={() => go({ name: "edit", id: persona.id })} className="grid size-10 place-items-center rounded-full text-sub hover:text-white" aria-label="Edit persona">
              <Pencil className="size-5" />
            </button>
          </div>
          <div className="flex min-w-0 max-w-full flex-col gap-2">
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {EVENTS.map((e) => (
                <Pill key={e} active={occasion.event === e} onClick={() => setOccasion({ ...occasion, event: e })}>
                  {e}
                </Pill>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm text-sub">Up to</span>
              {BUDGETS.map((b) => (
                <Pill key={b} active={occasion.budget === b} onClick={() => setOccasion({ ...occasion, budget: b })}>
                  ${b}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        {!run && (
          <>
            <p className="text-sm text-sub">Pick the occasion and budget, then press play. Wrapt reads {persona.name}&apos;s taste through Qloo and shops for them.</p>
            <Loves persona={persona} />
          </>
        )}

        {run && (run.running || run.steps.length > 0) && <AgentLog run={run} />}

        {run?.error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg bg-[#3a1515] p-4 text-sm">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-[#ff8a8a]" />
            <div>
              <p className="font-bold">That run didn&apos;t finish</p>
              <p className="mt-1 text-white/80">{run.error}</p>
            </div>
          </div>
        )}

        {run?.gifts && run.gifts.length > 0 && (
          <>
            <div className="mb-3 mt-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Gifts for {persona.name}</h2>
                <p className="text-sm text-sub">
                  {run.occasion.event} · under ${run.occasion.budget}
                  {history.length > 1 && <HistoryPicker history={history} onPick={(h) => setRun({ running: false, steps: [], thoughts: [], profile: h.profile, gifts: h.gifts, occasion: h.occasion })} />}
                </p>
              </div>
              <div className="flex gap-2">
                {run.profile && (
                  <button onClick={() => setShowWrapped(true)} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-black transition hover:scale-[1.03]">
                    <Sparkles className="size-4" /> Play Gift Wrapped
                  </button>
                )}
              </div>
            </div>
            <GiftList gifts={run.gifts} />
            <Compare persona={persona} occasion={run.occasion} />
          </>
        )}

        {run?.profile && <TasteShelves profile={run.profile} />}
        {run && <Loves persona={persona} />}
      </div>

      {showWrapped && run?.profile && run.gifts && <Wrapped persona={persona} profile={run.profile} gifts={run.gifts} occasion={run.occasion} onClose={() => setShowWrapped(false)} />}
    </div>
  );
}

function HistoryPicker({ history, onPick }: { history: GiftRun[]; onPick: (h: GiftRun) => void }) {
  return (
    <select
      className="ml-3 rounded bg-hi px-2 py-0.5 text-xs text-white outline-none"
      onChange={(e) => onPick(history[Number(e.target.value)])}
      defaultValue={0}
      aria-label="Past runs"
    >
      {history.map((h, i) => (
        <option key={h.createdAt} value={i}>
          {h.occasion.event} ${h.occasion.budget} · {new Date(h.createdAt).toLocaleDateString()}
        </option>
      ))}
    </select>
  );
}

function AgentLog({ run }: { run: RunState }) {
  return (
    <section className="mb-8 rounded-lg bg-white/[.04] p-4" aria-live="polite">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-sub">
        {run.running && <Equalizer />} Agent log
      </h2>
      <ol className="flex flex-col gap-1">
        {run.steps.map((s) => (
          <li key={s.id} className="rise flex items-start gap-3 rounded-md px-2 py-1.5">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center">
              {s.status === "running" ? <LoaderCircle className="size-4 animate-spin text-green" /> : s.status === "done" ? <Check className="size-4 text-green" /> : <CircleAlert className="size-4 text-[#ff8a8a]" />}
            </span>
            <span className="min-w-0">
              <span className={`block text-sm ${s.status === "running" ? "text-white" : "text-white/85"}`}>{s.label}</span>
              {s.detail && <span className="block truncate text-xs text-sub">{s.detail}</span>}
            </span>
          </li>
        ))}
        {run.thoughts.slice(-1).map((t) => (
          <li key={t} className="px-2 py-1 text-sm italic text-sub">
            “{t.slice(0, 220)}”
          </li>
        ))}
      </ol>
    </section>
  );
}

function GiftList({ gifts }: { gifts: Gift[] }) {
  return (
    <div className="mb-8">
      <div className="hidden grid-cols-[2rem_minmax(0,1fr)_minmax(0,16rem)_6rem] gap-4 border-b border-line px-4 pb-2 text-sm text-sub lg:grid">
        <span className="text-right">#</span>
        <span>Gift</span>
        <span>Taste trail</span>
        <span className="text-right">Price</span>
      </div>
      <ol className="mt-2">
        {gifts.map((g, i) => (
          <li
            key={g.product.url + i}
            className="rise group grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-md px-2 py-3 transition-colors hover:bg-white/[.07] sm:px-4 lg:grid-cols-[2rem_minmax(0,1fr)_minmax(0,16rem)_6rem] lg:gap-4"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className="pt-3 text-right tabular-nums text-sub">{i + 1}</span>
            <div className="flex min-w-0 gap-3">
              <a href={g.product.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {g.product.image ? (
                  <img src={g.product.image} alt="" className="size-14 rounded bg-white object-contain p-1 sm:size-16" />
                ) : (
                  <span className="grid size-14 place-items-center rounded bg-hi sm:size-16">
                    <ExternalLink className="size-5 text-sub" />
                  </span>
                )}
              </a>
              <div className="min-w-0">
                <p className="font-bold leading-snug">{g.headline}</p>
                <a href={g.product.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 line-clamp-1 text-sm text-sub hover:text-white hover:underline">
                  {g.product.source === "search-link" ? `Search Amazon for “${g.product.title}”` : g.product.title}
                </a>
                <p className="mt-1.5 text-sm leading-relaxed text-white/80">{g.reasoning}</p>
              </div>
            </div>
            <div className="col-start-2 flex flex-wrap content-start gap-1.5 lg:col-start-auto lg:pt-1">
              {g.trail.slice(0, 3).map((t, j) => (
                <span key={j} className="flex max-w-full items-center gap-1.5 rounded-full bg-hi py-0.5 pl-0.5 pr-2.5 text-xs">
                  {t.image ? <img src={t.image} alt="" className="size-5 rounded-full object-cover" /> : <span className="size-5 rounded-full bg-elev" />}
                  <span className="truncate">
                    {t.from}
                    {t.via && t.via !== t.from && <span className="text-sub"> → {t.via}</span>}
                  </span>
                  {t.affinity ? <span className="font-bold text-green">{Math.round(t.affinity * 100)}%</span> : null}
                </span>
              ))}
            </div>
            <div className="col-start-2 flex items-center gap-3 lg:col-start-auto lg:flex-col lg:items-end lg:gap-1 lg:pt-1">
              <span className="font-bold tabular-nums">{g.product.priceDisplay ?? "—"}</span>
              {g.product.rating ? (
                <span className="flex items-center gap-1 text-xs text-sub">
                  <Star className="size-3 fill-current" /> {g.product.rating} {g.product.reviews ? `(${g.product.reviews.toLocaleString()})` : ""}
                </span>
              ) : null}
              <a href={g.product.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-sub hover:text-white">
                Amazon <ExternalLink className="size-3" />
              </a>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Compare({ persona, occasion }: { persona: Persona; occasion: Occasion }) {
  const [ideas, setIdeas] = useState<BaselineIdea[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/baseline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ persona, occasion }) });
      const data = (await res.json()) as { ideas: BaselineIdea[]; error?: string };
      if (data.error) throw new Error(data.error);
      setIdeas(data.ideas);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!ideas) {
    return (
      <div className="mb-10 flex flex-wrap items-center gap-3 rounded-lg bg-card p-4">
        <Scale className="size-5 text-sub" />
        <p className="flex-1 text-sm text-sub">What would the same AI suggest without Qloo&apos;s taste graph?</p>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 rounded-full border border-white/30 px-4 py-1.5 text-sm font-bold hover:border-white disabled:opacity-50">
          {loading && <LoaderCircle className="size-4 animate-spin" />} Compare
        </button>
        {error && <p className="w-full text-sm text-[#ff8a8a]">{error}</p>}
      </div>
    );
  }

  return (
    <section className="mb-10 rounded-lg bg-card p-5">
      <h3 className="font-bold">Without Qloo, the same model guessed:</h3>
      <p className="mb-4 text-sm text-sub">Same persona, same occasion, no taste graph — no brands, no cross-domain signal, no listings.</p>
      <ol className="grid gap-2 sm:grid-cols-2">
        {ideas.map((idea, i) => (
          <li key={i} className="rounded-md bg-white/[.04] p-3">
            <p className="text-sm font-bold">{idea.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-sub">{idea.reason}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const SHELVES: [string, string][] = [
  ["brand", "Brands they'd gravitate to"],
  ["book", "On their nightstand"],
  ["artist", "In their rotation"],
  ["movie", "Their kind of films"],
  ["tv_show", "Shows they'd binge"],
  ["videogame", "Games they'd sink into"],
  ["podcast", "In their earbuds"],
  ["place", "Their kind of places"],
];

function TasteShelves({ profile }: { profile: TasteProfile }) {
  return (
    <section className="mt-2">
      <h2 className="text-2xl font-bold tracking-tight">Their taste, decoded</h2>
      <p className="text-sm text-sub">What Qloo&apos;s taste graph says people who love the same things over-index on.</p>
      {profile.dna.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {profile.dna.map((d) => (
            <span key={d.name} className="rounded-full border border-white/15 px-3 py-1 text-sm">
              {d.name}
            </span>
          ))}
        </div>
      )}
      {SHELVES.map(([key, title]) => {
        const list = profile.domains[key];
        return list?.length ? <Shelf key={key} title={title} items={list} /> : null;
      })}
    </section>
  );
}

function Shelf({ title, items }: { title: string; items: QlooEntity[] }) {
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-lg font-bold">{title}</h3>
      <ul className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-1">
        {items.slice(0, 10).map((e) => (
          <li key={e.id} className="w-36 shrink-0 rounded-lg p-2 transition-colors hover:bg-card sm:w-44 sm:p-3">
            {e.image ? (
              <img src={e.image} alt="" className="aspect-square w-full rounded-md bg-hi object-cover shadow-lg" />
            ) : (
              <div className="grid aspect-square w-full place-items-center rounded-md bg-hi text-3xl font-black text-sub">{e.name.slice(0, 1)}</div>
            )}
            <p className="mt-2 truncate text-sm font-bold">{e.name}</p>
            <p className="text-xs text-sub">
              <span className="font-bold text-green">{Math.round(e.affinity * 100)}% match</span>
              {e.keywords?.[0] ? ` · ${e.keywords[0]}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Loves({ persona }: { persona: Persona }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-2xl font-bold tracking-tight">What {persona.name} loves</h2>
      <ul className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-1">
        {persona.loves.map((l) => (
          <li key={l.id} className="w-36 shrink-0 rounded-lg p-2 sm:w-44 sm:p-3">
            <SeedThumb seed={l} className="aspect-square w-full shadow-lg" />
            <p className="mt-2 truncate text-sm font-bold">{l.name}</p>
            <p className="text-xs text-sub">{typeLabel(l.type)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
