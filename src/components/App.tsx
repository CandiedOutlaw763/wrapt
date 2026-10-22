"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CircleUserRound, House, LogOut, Plus, Trash2 } from "lucide-react";
import { useAuth, type Auth } from "@/lib/auth";
import { DEFAULT_MARKET, MARKETS, guessMarketFromBrowser, marketFor, type Market } from "@/lib/markets";
import { cloudStore, localStore, newId, prepareAccount, type Store } from "@/lib/store";
import type { Persona } from "@/lib/types";
import { AuthDialog, ConfirmDialog } from "./Dialogs";
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
  store: Store;
  upsert: (p: Persona) => void;
  /** Asks for confirmation, then deletes the persona and its gift runs. */
  confirmRemove: (p: Persona) => void;
  go: (v: View) => void;
  nowPlaying: NowPlaying | null;
  setNowPlaying: (n: NowPlaying | null) => void;
  market: Market;
  setMarket: (m: Market) => void;
  auth: Auth;
  openSignIn: () => void;
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

const MARKET_KEY = "wrapt:market";

export default function App() {
  const auth = useAuth();
  const [store, setStore] = useState<Store>(localStore);
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [view, setView] = useState<View>({ name: "home" });
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [market, setMarketState] = useState<Market>(DEFAULT_MARKET);
  const [notice, setNotice] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [removing, setRemoving] = useState<Persona | null>(null);

  useEffect(() => {
    // The hash is only readable after mount; afterwards state is the source of truth.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(viewFromHash());
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Shop in the visitor's own Amazon store: their saved choice, else IP country, else browser locale.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MARKET_KEY);
    } catch {}
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMarketState(marketFor(saved));
      return;
    }
    fetch("/api/geo")
      .then((r) => r.json() as Promise<{ country: string | null }>)
      .then(({ country }) => setMarketState(MARKETS.some((m) => m.code === country) ? marketFor(country) : guessMarketFromBrowser()))
      .catch(() => setMarketState(guessMarketFromBrowser()));
  }, []);

  // Signed in → the account's personas in Firestore; signed out → this browser's.
  const uid = auth.user?.uid;
  useEffect(() => {
    if (!auth.ready) return;
    let live = true;
    (async () => {
      const user = firebaseUser(auth);
      if (user) {
        try {
          await prepareAccount(user);
          const cloud = cloudStore(user.uid);
          const list = await cloud.loadPersonas();
          if (!live) return;
          setStore(cloud);
          setPersonas(list);
          setNotice(null);
          return;
        } catch (err) {
          console.error("[account] falling back to this browser:", err);
          if (live) setNotice("Couldn't reach your account, so you're seeing the people saved in this browser. Changes stay here.");
        }
      }
      const list = await localStore.loadPersonas();
      if (!live) return;
      setStore(localStore);
      setPersonas(list);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the signed-in account changes
  }, [auth.ready, uid]);

  const go = useCallback((v: View) => {
    const hash = hashFor(v);
    if (window.location.hash !== hash) history.pushState(null, "", hash || window.location.pathname);
    setView(v);
    document.getElementById("main")?.scrollTo({ top: 0 });
  }, []);

  const setMarket = useCallback((m: Market) => {
    setMarketState(m);
    try {
      localStorage.setItem(MARKET_KEY, m.code);
    } catch {}
  }, []);

  if (!personas) return <div className="h-full bg-ink" />;

  const saveFailed = (err: unknown) => {
    console.error("[store]", err);
    setNotice("That change couldn't be saved to your account. Check your connection and try again.");
  };

  const remove = (p: Persona) => {
    setPersonas(personas.filter((x) => x.id !== p.id));
    store.deletePersona(p.id).catch(saveFailed);
    if (view.name !== "home" && "id" in view && view.id === p.id) go({ name: "home" });
  };

  const state: AppState = {
    personas,
    store,
    upsert: (p) => {
      setPersonas(personas.some((x) => x.id === p.id) ? personas.map((x) => (x.id === p.id ? p : x)) : [...personas, p]);
      store.savePersona(p).catch(saveFailed);
    },
    confirmRemove: setRemoving,
    go,
    nowPlaying,
    setNowPlaying,
    market,
    setMarket,
    auth,
    openSignIn: () => setSigningIn(true),
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
            {notice && (
              <div className="flex items-start gap-3 border-b border-line bg-alert/10 px-5 py-3 text-sm sm:px-8">
                <p className="flex-1">{notice}</p>
                <button onClick={() => setNotice(null)} className="font-semibold text-sub hover:text-text">
                  Dismiss
                </button>
              </div>
            )}
            {view.name === "home" && <Home />}
            {view.name === "edit" && <PersonaEditor key={view.id ?? "new"} initial={editing ?? blankPersona(personas.length)} isNew={!editing} />}
            {view.name === "persona" && current && <PersonaView key={current.id} persona={current} />}
            {view.name === "persona" && !current && <Home />}
          </main>
        </div>
      </div>
      <AgentStatus />
      {signingIn && <AuthDialog auth={auth} onClose={() => setSigningIn(false)} />}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          body={`${removing.name} and their saved gift runs will be deleted${store.kind === "cloud" ? " from your account" : " from this browser"}. This can't be undone.`}
          confirmLabel={`Remove ${removing.name}`}
          onConfirm={() => remove(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </Ctx.Provider>
  );
}

/** The Firebase user, once auth is enabled and someone is signed in. */
function firebaseUser(auth: Auth) {
  return auth.enabled ? auth.user : null;
}

function AccountButton({ compact = false }: { compact?: boolean }) {
  const { auth, openSignIn } = useApp();
  if (!auth.enabled || !auth.ready) return null;

  if (!auth.user) {
    return compact ? (
      <button onClick={openSignIn} aria-label="Sign in" className="grid size-10 place-items-center rounded-full text-sub hover:text-text">
        <CircleUserRound className="size-5" />
      </button>
    ) : (
      <button onClick={openSignIn} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 font-semibold text-sub transition-colors hover:text-text">
        <CircleUserRound className="size-5" /> Sign in
      </button>
    );
  }

  const u = auth.user;
  const name = u.isAnonymous ? "Guest" : (u.displayName ?? u.email ?? "Signed in");
  const avatar = u.photoURL ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={u.photoURL} alt="" className="size-7 rounded-full" referrerPolicy="no-referrer" />
  ) : (
    <span className="font-display grid size-7 place-items-center rounded-full bg-lilac text-sm font-semibold text-ink">{name.slice(0, 1).toUpperCase()}</span>
  );

  if (compact) {
    return (
      <button onClick={u.isAnonymous ? openSignIn : () => auth.signOut()} aria-label={u.isAnonymous ? "Save your account" : `Sign out ${name}`} className="grid size-10 place-items-center rounded-full">
        {avatar}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{name}</span>
        {u.isAnonymous ? (
          <button onClick={openSignIn} className="text-xs font-semibold text-ribbon hover:underline">
            Save your account
          </button>
        ) : (
          <span className="block text-xs text-sub">Synced to your account</span>
        )}
      </span>
      <button onClick={() => auth.signOut()} aria-label="Sign out" className="grid size-8 place-items-center rounded-full text-sub hover:bg-hi hover:text-text">
        <LogOut className="size-4" />
      </button>
    </div>
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
        <AccountButton compact />
      </div>
    </header>
  );
}

function Sidebar({ activeId }: { activeId?: string }) {
  const { personas, go, nowPlaying, confirmRemove } = useApp();
  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-2 md:flex">
      <nav className="rounded-2xl bg-base px-3 py-4">
        <button onClick={() => go({ name: "home" })} className="mb-3 px-3">
          <Wordmark />
        </button>
        <button onClick={() => go({ name: "home" })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 font-semibold text-sub transition-colors hover:text-text">
          <House className="size-5" /> Home
        </button>
        <AccountButton />
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
            <li key={p.id} className={`group flex items-center rounded-xl transition-colors hover:bg-hi ${activeId === p.id ? "bg-hi" : ""}`}>
              <button
                onClick={() => go({ name: "persona", id: p.id })}
                aria-current={activeId === p.id ? "page" : undefined}
                className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left"
              >
                <Cover persona={p} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block truncate text-sm text-sub">{p.relationship}</span>
                </span>
                {nowPlaying?.personaId === p.id && <PulseDot />}
              </button>
              <button
                onClick={() => confirmRemove(p)}
                aria-label={`Remove ${p.name}`}
                className="mr-2 grid size-8 shrink-0 place-items-center rounded-full text-sub opacity-0 transition-opacity hover:bg-base hover:text-alert focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-4" />
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
