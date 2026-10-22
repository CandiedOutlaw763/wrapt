"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { House, Plus } from "lucide-react";
import { loadPersonas, newId, savePersonas, deleteRuns } from "@/lib/store";
import type { Persona } from "@/lib/types";
import { Cover, PulseDot, Wordmark } from "./ui";
import { Home } from "./Home";
import { PersonaEditor } from "./PersonaEditor";
import { PersonaView } from "./PersonaView";

type View = { name: "home" } | { name: "persona"; id: string } | { name: "edit"; id?: string };

export interface NowPlaying {
  personaId: string;
  label: string;
  progress: number;
}

interface AppState {
  personas: Persona[];
  upsert: (p: Persona) => void;
  remove: (id: string) => void;
  go: (v: View) => void;
  nowPlaying: NowPlaying | null;
  setNowPlaying: (n: NowPlaying | null) => void;
}

const Ctx = createContext<AppState | null>(null);
export const useApp = () => useContext(Ctx)!;

// #/p/<id> → persona, #/edit/<id> → editor, #/new → new persona, anything else → home.
function viewFromHash(): View {
  const [, kind, id] = window.location.hash.split("/");
  if (kind === "p" && id) return { name: "persona", id };
  if (kind === "edit" && id) return { name: "edit", id };
  if (kind === "new") return { name: "edit" };
  return { name: "home" };
}

function hashFor(v: View): string {
  if (v.name === "persona") return `#/p/${v.id}`;
  if (v.name === "edit") return v.id ? `#/edit/${v.id}` : "#/new";
  return "";
}

export function blankPersona(count: number): Persona {
  return { id: newId(), name: "", relationship: "Friend", loves: [], hue: count % 8, createdAt: Date.now() };
}

export default function App() {
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [view, setView] = useState<View>({ name: "home" });
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);

  useEffect(() => {
    // Storage and the hash are only readable after mount; read once, then state is the source of truth.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPersonas(loadPersonas());
    setView(viewFromHash());
    /* eslint-enable react-hooks/set-state-in-effect */
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const persist = useCallback((next: Persona[]) => {
    setPersonas(next);
    savePersonas(next);
  }, []);

  const go = useCallback((v: View) => {
    const hash = hashFor(v);
    if (window.location.hash !== hash) history.pushState(null, "", hash || window.location.pathname);
    setView(v);
    document.getElementById("main")?.scrollTo({ top: 0 });
  }, []);

  if (!personas) return <div className="h-full bg-ink" />;

  const state: AppState = {
    personas,
    upsert: (p) => persist(personas.some((x) => x.id === p.id) ? personas.map((x) => (x.id === p.id ? p : x)) : [...personas, p]),
    remove: (id) => {
      persist(personas.filter((p) => p.id !== id));
      deleteRuns(id);
    },
    go,
    nowPlaying,
    setNowPlaying,
  };

  const current = view.name === "persona" ? personas.find((p) => p.id === view.id) : undefined;
  const editing = view.name === "edit" ? personas.find((p) => p.id === view.id) : undefined;

  return (
    <Ctx.Provider value={state}>
      <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-2 bg-ink p-2 md:grid-rows-[minmax(0,1fr)]">
        <MobileBar />
        <div className="flex min-h-0 gap-2">
          <Sidebar activeId={current?.id} />
          <main id="main" className="scroll-panel relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-2xl bg-base">
            {view.name === "home" && <Home />}
            {view.name === "edit" && <PersonaEditor key={view.id ?? "new"} initial={editing ?? blankPersona(personas.length)} isNew={!editing} />}
            {view.name === "persona" && current && <PersonaView key={current.id} persona={current} />}
            {view.name === "persona" && !current && <Home />}
          </main>
        </div>
      </div>
      <AgentStatus />
    </Ctx.Provider>
  );
}

function MobileBar() {
  const { go } = useApp();
  return (
    <header className="flex items-center justify-between rounded-2xl bg-base px-4 py-2 md:hidden">
      <button onClick={() => go({ name: "home" })} aria-label="Home">
        <Wordmark className="!text-xl" />
      </button>
      <div className="flex gap-1">
        <button onClick={() => go({ name: "home" })} aria-label="Home" className="grid size-10 place-items-center rounded-full text-sub hover:text-text">
          <House className="size-5" />
        </button>
        <button onClick={() => go({ name: "edit" })} aria-label="New persona" className="grid size-10 place-items-center rounded-full text-sub hover:text-text">
          <Plus className="size-5" />
        </button>
      </div>
    </header>
  );
}

function Sidebar({ activeId }: { activeId?: string }) {
  const { personas, go, nowPlaying } = useApp();
  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-2 md:flex">
      <nav className="rounded-2xl bg-base px-3 py-4">
        <button onClick={() => go({ name: "home" })} className="mb-3 px-3">
          <Wordmark />
        </button>
        <button onClick={() => go({ name: "home" })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 font-semibold text-sub transition-colors hover:text-text">
          <House className="size-5" /> Home
        </button>
      </nav>

      <section className="flex min-h-0 flex-1 flex-col rounded-2xl bg-base">
        <header className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="font-display text-lg font-semibold">Your people</h2>
          <button
            onClick={() => go({ name: "edit" })}
            className="grid size-8 place-items-center rounded-full text-sub transition-colors hover:bg-hi hover:text-text"
            aria-label="Create persona"
          >
            <Plus className="size-5" />
          </button>
        </header>
        <ul className="scroll-panel min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {personas.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => go({ name: "persona", id: p.id })}
                aria-current={activeId === p.id ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-hi ${activeId === p.id ? "bg-hi" : ""}`}
              >
                <Cover persona={p} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block truncate text-sm text-sub">{p.relationship}</span>
                </span>
                {nowPlaying?.personaId === p.id && <PulseDot />}
              </button>
            </li>
          ))}
          <li>
            <button onClick={() => go({ name: "edit" })} className="flex w-full items-center gap-3 rounded-xl p-2 text-left text-sub transition-colors hover:bg-hi hover:text-text">
              <span className="grid size-11 place-items-center rounded-md border border-dashed border-line">
                <Plus className="size-5" />
              </span>
              <span className="font-semibold">Add someone</span>
            </button>
          </li>
        </ul>
      </section>
    </aside>
  );
}

/** Floats over the page only while the agents are working, so it can be followed from any view. */
function AgentStatus() {
  const { nowPlaying, personas, go } = useApp();
  const persona = personas.find((p) => p.id === nowPlaying?.personaId);
  if (!persona || !nowPlaying) return null;
  return (
    <button
      onClick={() => go({ name: "persona", id: persona.id })}
      className="unwrap fixed bottom-4 left-1/2 z-40 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 overflow-hidden rounded-2xl border border-line bg-card/95 p-2 pr-4 text-left shadow-[0_16px_40px_rgba(0,0,0,.55)] backdrop-blur"
      aria-live="polite"
    >
      <Cover persona={persona} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <PulseDot /> Finding gifts for {persona.name}
        </span>
        <span className="block truncate text-xs text-sub">{nowPlaying.label}</span>
      </span>
      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-line">
        <span className="block h-full bg-ribbon transition-[width] duration-500" style={{ width: `${Math.round(nowPlaying.progress * 100)}%` }} />
      </span>
    </button>
  );
}
