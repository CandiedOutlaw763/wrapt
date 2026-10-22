"use client";

/* eslint-disable @next/next/no-img-element -- remote Qloo/Amazon images */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, ExternalLink, Gift as GiftIcon, LoaderCircle, Pencil, RotateCcw, Scale, Sparkles, Star, Trash2 } from "lucide-react";
import { MARKETS, defaultBudget, formatMoney, marketFor } from "@/lib/markets";
import type { AgentEvent, AgentName, BaselineIdea, Gift, GiftRun, Occasion, Persona, QlooEntity, TasteProfile } from "@/lib/types";
import { useApp } from "./App";
import { Cover, Pill, SeedThumb, ageLabel, hue, typeLabel } from "./ui";
import { TasteStory } from "./TasteStory";

const EVENTS = ["Birthday", "Anniversary", "Holidays", "Graduation", "Housewarming", "Thank you", "Just because"];
const EXPECTED_STEPS = 6;

type Step = Extract<AgentEvent, { type: "step" }>;

interface RunState {
  running: boolean;
  steps: Step[];
  profile?: TasteProfile;
  gifts?: Gift[];
  error?: string;
  occasion: Occasion;
  /** A pre-made run shipped with the demo personas, not one this visitor ran. */
  sample?: boolean;
}

const AGENT_LABEL: Record<AgentName, { name: string; className: string }> = {
  qloo: { name: "Qloo", className: "text-sub" },
  strategist: { name: "Strategist", className: "text-lilac" },
  shopper: { name: "Shopper", className: "text-ribbon" },
};

export function PersonaView({ persona }: { persona: Persona }) {
  const { go, setNowPlaying, store, market, setMarket, confirmRemove, self } = useApp();
  const [choice, setChoice] = useState<{ event: string; budget?: number; shared?: boolean }>({ event: "Birthday" });
  // Budgets are per store currency, so a budget picked in another store falls back to this store's default.
  const occasion: Occasion = {
    event: choice.event,
    budget: choice.budget !== undefined && market.budgets.includes(choice.budget) ? choice.budget : defaultBudget(market),
    market: market.code,
    shared: !!(choice.shared && self && !persona.isSelf),
  };
  const [run, setRun] = useState<RunState | null>(null);
  const [history, setHistory] = useState<GiftRun[]>([]);
  const [showStory, setShowStory] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let live = true;
    store
      .loadRuns(persona.id)
      .then((past) => {
        if (!live) return;
        setHistory(past);
        if (past[0]) {
          setRun((current) => current ?? { running: false, steps: [], profile: past[0].profile, gifts: past[0].gifts, occasion: past[0].occasion });
          setChoice({ event: past[0].occasion.event, budget: past[0].occasion.budget, shared: past[0].occasion.shared });
          return;
        }
        // Demo personas ship with a finished run per store, so the first look is instant.
        if (!persona.id.startsWith("demo-")) return;
        return fetch(`/demo-runs/${persona.id}-${market.code}.json`)
          .then((r) => (r.ok ? (r.json() as Promise<GiftRun>) : null))
          .then((sample) => {
            if (!live || !sample) return;
            setRun((current) => current ?? { running: false, steps: [], profile: sample.profile, gifts: sample.gifts, occasion: sample.occasion, sample: true });
            setChoice({ event: sample.occasion.event, budget: sample.occasion.budget });
          });
      })
      .catch((err) => console.error("[runs]", err));
    return () => {
      live = false;
      abort.current?.abort();
    };
  }, [persona.id, store, market.code]);

  async function start() {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const state: RunState = { running: true, steps: [], occasion };
    const update = (patch: Partial<RunState>) => {
      Object.assign(state, patch);
      setRun({ ...state });
    };
    update({});
    setNowPlaying({ personaId: persona.id, label: "Starting…", progress: 0.03 });

    try {
      const res = await fetch("/api/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, occasion, giver: occasion.shared ? self : undefined }),
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
            const done = steps.filter((s) => s.status !== "running" && !s.id.startsWith("wait")).length;
            setNowPlaying({ personaId: persona.id, label: e.label, progress: Math.min(0.95, 0.05 + done / EXPECTED_STEPS) });
          } else if (e.type === "profile") update({ profile: e.profile });
          else if (e.type === "gifts") {
            update({ gifts: e.gifts });
            const saved: GiftRun = { occasion, profile: state.profile!, gifts: e.gifts, createdAt: Date.now() };
            store.saveRun(persona.id, saved).catch((err) => console.error("[runs] save failed", err));
            setHistory((h) => [saved, ...h].slice(0, 5));
          } else if (e.type === "error") update({ error: e.message });
        }
      }
      if (!state.gifts && !state.error) update({ error: "The connection closed before gifts arrived." });
    } catch (err) {
      if ((err as Error).name !== "AbortError") update({ error: (err as Error).message });
    } finally {
      if (!ctrl.signal.aborted) {
        update({ running: false });
        setNowPlaying(null);
      }
    }
  }

  const header = hue(persona)[2];
  const facts = [ageLabel(persona.age), persona.location, `${persona.loves.length} loves`].filter(Boolean);
  const hasGifts = !!run?.gifts?.length;

  return (
    <div className="pb-28">
      <header className="flex flex-col gap-6 px-5 pb-8 pt-10 sm:flex-row sm:items-end sm:px-8" style={{ background: `linear-gradient(to bottom, ${header}, ${header}66 65%, transparent)` }}>
        <Cover persona={persona} size="lg" />
        <div className="min-w-0">
          <span className="inline-block rounded-full bg-text/10 px-3 py-1 text-sm font-semibold">{persona.relationship}</span>
          <h1 className="font-display mt-3 break-words text-6xl font-semibold leading-[0.95] tracking-tight sm:text-8xl">{persona.name}</h1>
          {persona.notes && <p className="mt-4 max-w-xl text-text/80">{persona.notes}</p>}
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-sub">
            {facts.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </p>
        </div>
      </header>

      <div className="px-5 sm:px-8">
        <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full min-w-0 flex-col gap-3 lg:w-auto">
            {!persona.isSelf && (
              <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                <span className="shrink-0 text-sm text-sub sm:w-16">Gift for</span>
                <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
                  <Pill active={!occasion.shared} onClick={() => setChoice({ ...choice, shared: false })}>
                    Just {persona.name}
                  </Pill>
                  <Pill active={occasion.shared} onClick={() => (self ? setChoice({ ...choice, shared: true }) : go({ name: "edit", self: true }))}>
                    {self ? `${persona.name} and you` : "Something to share"}
                  </Pill>
                  {!self && <span className="text-xs text-sub">Add your own taste to find gifts you can enjoy together</span>}
                </div>
              </div>
            )}
            <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="shrink-0 text-sm text-sub sm:w-16">Occasion</span>
              <div className="no-scrollbar flex w-full min-w-0 gap-2 overflow-x-auto sm:w-auto sm:flex-wrap sm:overflow-visible">
                {EVENTS.map((e) => (
                  <Pill key={e} active={occasion.event === e} onClick={() => setChoice({ ...choice, event: e })}>
                    {e}
                  </Pill>
                ))}
              </div>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="shrink-0 text-sm text-sub sm:w-16">Budget</span>
              <div className="no-scrollbar flex w-full min-w-0 gap-2 overflow-x-auto sm:w-auto sm:flex-wrap sm:overflow-visible">
                {market.budgets.map((b) => (
                  <Pill key={b} active={occasion.budget === b} onClick={() => setChoice({ ...choice, budget: b })}>
                    Up to {formatMoney(b, market)}
                  </Pill>
                ))}
              </div>
            </div>
            <label className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="shrink-0 text-sm text-sub sm:w-16">Shop on</span>
              {/* The native arrow sits differently in every browser, so draw our own at a fixed inset. */}
              <span className="relative w-full min-w-0 sm:w-auto">
                <select
                  value={market.code}
                  onChange={(e) => setMarket(marketFor(e.target.value))}
                  className="w-full min-w-0 appearance-none rounded-full border border-line bg-base py-1.5 pl-3.5 pr-10 text-sm outline-none hover:border-sub sm:w-auto"
                >
                  {MARKETS.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.domain} ({m.name})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-sub" aria-hidden />
              </span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => confirmRemove(persona)} className="grid size-11 place-items-center rounded-full text-sub hover:bg-hi hover:text-alert" aria-label={`Remove ${persona.name}`}>
              <Trash2 className="size-5" />
            </button>
            <button onClick={() => go({ name: "edit", id: persona.id })} className="grid size-11 place-items-center rounded-full text-sub hover:bg-hi hover:text-text" aria-label={`Edit ${persona.name}`}>
              <Pencil className="size-5" />
            </button>
            <button
              onClick={start}
              disabled={run?.running}
              className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-ribbon px-6 py-3 font-semibold text-ink transition-colors hover:bg-ribbon-deep disabled:opacity-70 lg:flex-none"
            >
              {run?.running ? <LoaderCircle className="size-5 animate-spin" /> : <GiftIcon className="size-5" />}
              {run?.running ? "Finding gifts…" : hasGifts ? "Find new gifts" : "Find gifts"}
            </button>
          </div>
        </div>

        {!run && <Loves persona={persona} />}

        {run && (run.running || run.steps.length > 0) && <AgentLog run={run} />}

        {run?.error && !run.running && (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-alert/40 bg-alert/10 p-5 sm:flex-row sm:items-start">
            <CircleAlert className="size-5 shrink-0 text-alert" />
            <div className="flex-1">
              <p className="font-semibold">{hasGifts ? "The latest run stopped early" : "The run stopped before any gifts were chosen"}</p>
              <p className="mt-1 text-sm text-text/80">{run.error}</p>
            </div>
            <button onClick={start} className="flex items-center gap-2 self-start rounded-full border border-text/30 px-4 py-2 text-sm font-semibold hover:border-text">
              <RotateCcw className="size-4" /> Try again
            </button>
          </div>
        )}

        {hasGifts && run?.gifts && (
          <section className="mt-10">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl font-semibold">{run.profile?.shared ? `Gifts for ${persona.name} and you` : `Gifts for ${persona.name}`}</h2>
                <Discovery gifts={run.gifts} persona={persona} />
                {run.sample && <p className="mb-1 text-sm font-semibold text-lilac">A sample run, ready for you to explore. Press Find gifts for a fresh one.</p>}
                <p className="mt-1 text-sm text-sub">
                  {run.occasion.event}, up to {formatMoney(run.occasion.budget, marketFor(run.occasion.market))} on {marketFor(run.occasion.market).domain}
                  {history.length > 1 && <HistoryPicker history={history} onPick={(h) => setRun({ running: false, steps: [], profile: h.profile, gifts: h.gifts, occasion: h.occasion })} />}
                </p>
              </div>
              {run.profile && (
                <button onClick={() => setShowStory(true)} className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-sub">
                  <Sparkles className="size-4 text-ribbon" /> Play their taste story
                </button>
              )}
            </div>
            {run.profile?.shared && (
              <div className="mb-5 rounded-2xl border border-lilac/30 bg-lilac/10 p-4">
                <p className="font-semibold">Where your tastes meet</p>
                <p className="mt-1 text-sm text-text/80">
                  Qloo compared what you love with what {persona.name} loves.
                  {run.profile.shared.tags.length ? " You both lean toward:" : " There's no strong overlap, so these bridge both tastes."}
                </p>
                {run.profile.shared.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {run.profile.shared.tags.map((t) => (
                      <span key={t} className="rounded-full bg-lilac/20 px-3 py-1 text-sm">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <GiftList gifts={run.gifts} name={run.profile?.shared ? "you both" : persona.name} />
            <Compare persona={persona} occasion={run.occasion} />
          </section>
        )}

        {run?.profile && <TasteShelves profile={run.profile} name={persona.name} />}
        {run && <Loves persona={persona} />}
      </div>

      {showStory && run?.profile && run.gifts && <TasteStory persona={persona} profile={run.profile} gifts={run.gifts} occasion={run.occasion} onClose={() => setShowStory(false)} />}
    </div>
  );
}

/** How many picks Qloo surfaced through something the person never listed: the case for the taste graph in one line. */
function Discovery({ gifts, persona }: { gifts: Gift[]; persona: Persona }) {
  const loved = new Set(persona.loves.map((l) => l.name.toLowerCase()));
  const found = gifts.filter((g) => g.trail.some((t) => t.via && t.affinity !== undefined && !loved.has(t.via.toLowerCase()))).length;
  if (!found) return null;
  return (
    <p className="mb-1 text-sm font-semibold text-ribbon">
      {found} of {gifts.length} found through Qloo, by way of things {persona.name} never mentioned
    </p>
  );
}

function HistoryPicker({ history, onPick }: { history: GiftRun[]; onPick: (h: GiftRun) => void }) {
  return (
    <select
      className="ml-3 rounded-md border border-line bg-base px-2 py-0.5 text-xs text-text outline-none"
      onChange={(e) => onPick(history[Number(e.target.value)])}
      defaultValue={0}
      aria-label="Earlier runs"
    >
      {history.map((h, i) => (
        <option key={h.createdAt} value={i}>
          {h.occasion.event}, {formatMoney(h.occasion.budget, marketFor(h.occasion.market))}, {new Date(h.createdAt).toLocaleDateString()}
        </option>
      ))}
    </select>
  );
}

function AgentLog({ run }: { run: RunState }) {
  return (
    <section className="mt-6 rounded-2xl border border-line p-4 sm:p-5" aria-live="polite">
      <h2 className="font-display text-lg font-semibold">{run.running ? "Working on it" : "How these were found"}</h2>
      <p className="mb-3 text-sm text-sub">Qloo maps the taste, the strategist plans ideas, the shopper finds listings.</p>
      <ol className="flex flex-col">
        {run.steps.map((s) => (
          <li key={s.id} className="grid grid-cols-[1.25rem_5.5rem_minmax(0,1fr)] items-start gap-2 py-1.5">
            <span className="mt-0.5 grid size-5 place-items-center">
              {s.status === "running" ? <LoaderCircle className="size-4 animate-spin text-ribbon" /> : s.status === "done" ? <Check className="size-4 text-sub" /> : <CircleAlert className="size-4 text-alert" />}
            </span>
            <span className={`text-sm font-semibold ${AGENT_LABEL[s.agent].className}`}>{AGENT_LABEL[s.agent].name}</span>
            <span className="min-w-0">
              <span className="block text-sm">{s.label}</span>
              {s.detail && <span className="block text-xs leading-relaxed text-sub">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function GiftList({ gifts, name }: { gifts: Gift[]; name: string }) {
  return (
    <ol className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {gifts.map((g, i) => {
        const isListing = g.product.source !== "search-link";
        return (
          <li key={g.product.url + i} className="unwrap flex min-w-0 flex-col gap-4 rounded-2xl bg-card p-4 sm:flex-row sm:p-5" style={{ animationDelay: `${i * 70}ms` }}>
            <a href={g.product.url} target="_blank" rel="noopener noreferrer" className="shrink-0 self-start" aria-label={`${g.headline} on Amazon`}>
              {g.product.image ? (
                <img src={g.product.image} alt="" className="size-28 rounded-xl bg-white object-contain p-2 sm:size-32" />
              ) : (
                <span className="grid size-28 place-items-center rounded-xl bg-hi sm:size-32">
                  <GiftIcon className="size-8 text-sub" />
                </span>
              )}
            </a>
            <div className="flex min-w-0 flex-1 flex-col">
              <h3 className="font-display text-xl font-semibold leading-snug">{g.headline}</h3>
              {isListing && <p className="mt-1 line-clamp-2 text-sm text-sub">{g.product.title}</p>}

              <div className="mt-3 border-l-2 border-ribbon pl-3">
                <p className="text-xs font-semibold text-ribbon">Why it fits {name}</p>
                <p className="mt-1 text-[15px] leading-relaxed">{g.reasoning}</p>
              </div>

              {g.trail.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {g.trail.map((t, j) => (
                    <span key={j} className="flex max-w-full items-center gap-1.5 rounded-2xl bg-hi py-0.5 pl-0.5 pr-2.5 text-xs">
                      {t.image ? <img src={t.image} alt="" className="size-5 shrink-0 rounded-full object-cover" /> : <span className="size-5 shrink-0 rounded-full bg-line" />}
                      <span className="min-w-0">
                        {t.from && t.via ? (
                          <>
                            {t.from} <span className="text-sub">led to</span> {t.via}
                          </>
                        ) : (
                          (t.via ?? t.from)
                        )}
                      </span>
                      {t.affinity ? <span className="shrink-0 whitespace-nowrap font-semibold text-ribbon">{Math.round(t.affinity * 100)}% match</span> : null}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 sm:mt-auto sm:pt-4">
                {g.product.priceDisplay && <span className="font-display text-xl font-semibold tabular-nums">{g.product.priceDisplay}</span>}
                {g.product.rating ? (
                  <span className="flex items-center gap-1 text-sm text-sub">
                    <Star className="size-3.5 fill-current text-ribbon" /> {g.product.rating}
                    {g.product.reviews ? ` (${g.product.reviews.toLocaleString()} reviews)` : ""}
                  </span>
                ) : null}
                <a
                  href={g.product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-ribbon px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-ribbon-deep"
                >
                  {isListing ? "View on Amazon" : "Search on Amazon"} <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
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
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line p-4">
        <Scale className="size-5 text-sub" />
        <p className="flex-1 text-sm text-sub">See what the same AI suggests for {persona.name} without Qloo&apos;s taste graph.</p>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 rounded-full border border-text/30 px-4 py-1.5 text-sm font-semibold hover:border-text disabled:opacity-50">
          {loading && <LoaderCircle className="size-4 animate-spin" />} Compare
        </button>
        {error && <p className="w-full text-sm text-alert">Comparison failed: {error}</p>}
      </div>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-line p-5">
      <h3 className="font-display text-lg font-semibold">Without Qloo, the same model suggests</h3>
      <p className="mb-4 text-sm text-sub">Same person, same occasion. No taste graph, so no brand signal and no listings.</p>
      <ol className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {ideas.map((idea, i) => (
          <li key={i}>
            <p className="text-sm font-semibold">{idea.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-sub">{idea.reason}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const SHELVES: [string, string][] = [
  ["brand", "Brands"],
  ["book", "Books"],
  ["artist", "Artists"],
  ["movie", "Films"],
  ["tv_show", "Shows"],
  ["videogame", "Games"],
  ["podcast", "Podcasts"],
  ["place", "Places nearby"],
];

function TasteShelves({ profile, name }: { profile: TasteProfile; name: string }) {
  return (
    <section className="mt-14">
      <h2 className="font-display text-3xl font-semibold">What people with {name}&apos;s taste love</h2>
      <p className="mt-1 max-w-2xl text-sm text-sub">Qloo&apos;s taste graph, seeded with everything {name} loves. These are signals the agents worked from, not gift picks.</p>
      {profile.dna.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {profile.dna.map((d) => (
            <span key={d.name} className="rounded-full bg-hi px-3 py-1 text-sm">
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
    <div className="mt-7">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <ul className="no-scrollbar flex gap-4 overflow-x-auto">
        {items.slice(0, 10).map((e) => (
          <li key={e.id} className="w-32 shrink-0 sm:w-40">
            {e.image ? (
              <img src={e.image} alt="" className="aspect-square w-full rounded-xl bg-hi object-cover" />
            ) : (
              <div className="font-display grid aspect-square w-full place-items-center rounded-xl bg-hi text-3xl text-sub">{e.name.slice(0, 1)}</div>
            )}
            <p className="mt-2 truncate text-sm font-semibold">{e.name}</p>
            <p className="text-xs text-sub">
              <span className="font-semibold text-ribbon">{Math.round(e.affinity * 100)}% match</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Loves({ persona }: { persona: Persona }) {
  return (
    <section className="mt-12">
      <h2 className="font-display mb-4 text-3xl font-semibold">What {persona.name} loves</h2>
      <ul className="no-scrollbar flex gap-4 overflow-x-auto">
        {persona.loves.map((l) => (
          <li key={l.id} className="w-32 shrink-0 sm:w-40">
            <SeedThumb seed={l} className="aspect-square w-full" />
            <p className="mt-2 truncate text-sm font-semibold">{l.name}</p>
            <p className="text-xs text-sub">{typeLabel(l.type)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
