"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, Search, Trash2, X } from "lucide-react";
import type { Persona, TasteSeed } from "@/lib/types";
import { useApp } from "./App";
import { AGE_OPTIONS, Cover, HUES, Pill, SeedThumb, hue, typeLabel } from "./ui";

const RELATIONSHIPS = ["Partner", "Mother", "Father", "Sister", "Brother", "Friend", "Coworker", "Grandparent"];

const SEARCH_TYPES: [string, string][] = [
  ["", "All"],
  ["urn:entity:artist", "Artists"],
  ["urn:entity:tv_show", "TV"],
  ["urn:entity:movie", "Films"],
  ["urn:entity:book", "Books"],
  ["urn:entity:brand", "Brands"],
  ["urn:entity:videogame", "Games"],
  ["urn:entity:podcast", "Podcasts"],
  ["urn:entity:person", "People"],
];

export function PersonaEditor({ initial, isNew }: { initial: Persona; isNew: boolean }) {
  const { upsert, confirmRemove, go } = useApp();
  const [p, setP] = useState<Persona>(initial);
  const set = <K extends keyof Persona>(k: K, v: Persona[K]) => setP((prev) => ({ ...prev, [k]: v }));
  const canSave = p.name.trim().length > 0 && p.loves.length > 0;

  const save = () => {
    if (!canSave) return;
    const clean = { ...p, name: p.name.trim(), relationship: p.isSelf ? "You" : p.relationship.trim() || "Friend" };
    upsert(clean);
    go({ name: "persona", id: clean.id });
  };

  return (
    <div className="pb-16">
      <header className="flex flex-col gap-6 px-4 pb-8 pt-10 sm:flex-row sm:items-end sm:px-6" style={{ background: `linear-gradient(to bottom, ${hue(p)[2]}, transparent)` }}>
        <Cover persona={{ ...p, name: p.name || "?" }} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-sub">{p.isSelf ? "Your own taste" : isNew ? "Someone new" : `Editing ${initial.name}`}</p>
          <input
            autoFocus={isNew}
            value={p.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={p.isSelf ? "Your name" : "Their name"}
            aria-label="Name"
            className="font-display mt-1 w-full border-b-2 border-transparent bg-transparent text-5xl font-semibold tracking-tight outline-none transition-colors placeholder:text-text/30 focus:border-ribbon/70 focus-visible:outline-none sm:text-7xl"
          />
          <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Cover color">
            {HUES.map(([paper, ribbon], i) => (
              <button
                key={paper}
                onClick={() => set("hue", i)}
                aria-label={`Color ${i + 1}`}
                aria-pressed={p.hue === i}
                className={`size-6 rounded-full ring-offset-2 ring-offset-transparent transition ${p.hue === i ? "ring-2 ring-text" : ""}`}
                style={{ background: `linear-gradient(135deg, ${paper} 62%, ${ribbon} 62%)` }}
              />
            ))}
          </div>
        </div>
      </header>

      <div className="flex max-w-3xl flex-col gap-8 px-4 sm:px-6">
        <Field
          label={p.isSelf ? "What do you love?" : "What do they love?"}
          hint={
            p.isSelf
              ? "Wrapt compares this with each person's taste to find gifts you can enjoy together."
              : "Search Qloo for artists, shows, films, books, brands and games. Four or more works best."
          }
        >
          <EntitySearch selected={p.loves} onAdd={(s) => set("loves", [...p.loves, s])} />
          {p.loves.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {p.loves.map((l) => (
                <li key={l.id} className="flex items-center gap-2 rounded-full bg-hi py-1 pl-1 pr-2">
                  <SeedThumb seed={l} className="size-7" />
                  <span className="text-sm font-medium">{l.name}</span>
                  <span className="text-xs text-sub">{typeLabel(l.type)}</span>
                  <button onClick={() => set("loves", p.loves.filter((x) => x.id !== l.id))} aria-label={`Remove ${l.name}`} className="text-sub hover:text-text">
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>

        <Field label={p.isSelf ? "This is you" : "Who are they to you?"}>
          <div className="flex flex-wrap gap-2">
            {!p.isSelf &&
              RELATIONSHIPS.map((r) => (
                <Pill key={r} active={p.relationship === r} onClick={() => set("relationship", r)}>
                  {r}
                </Pill>
              ))}
            <Pill active={!!p.isSelf} onClick={() => set("isSelf", !p.isSelf)}>
              This is me
            </Pill>
          </div>
        </Field>

        <div className="grid gap-8 sm:grid-cols-2">
          <Field label="Age">
            <div className="flex flex-wrap gap-2">
              {AGE_OPTIONS.map((o) => (
                <Pill key={o.value} active={p.age === o.value} onClick={() => set("age", p.age === o.value ? undefined : o.value)}>
                  {o.label}
                </Pill>
              ))}
            </div>
          </Field>
          <Field label="Gender" hint="Optional. Sharpens Qloo's demographic signal.">
            <div className="flex flex-wrap gap-2">
              {(["female", "male", "unspecified"] as const).map((g) => (
                <Pill key={g} active={p.gender === g} onClick={() => set("gender", g)}>
                  {g === "unspecified" ? "Prefer not to say" : g[0].toUpperCase() + g.slice(1)}
                </Pill>
              ))}
            </div>
          </Field>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <Field label="Hobbies" hint="Comma separated, e.g. film photography, bouldering">
            <TextInput value={p.hobbies ?? ""} onChange={(v) => set("hobbies", v)} placeholder="film photography, journaling" />
          </Field>
          <Field label="City" hint="Optional. Adds places near them to their taste map.">
            <TextInput value={p.location ?? ""} onChange={(v) => set("location", v)} placeholder="Brooklyn" />
          </Field>
        </div>

        <Field label="Anything else?" hint="Things the agent should know: already owns a Kindle, just moved, hates clutter…">
          <textarea
            value={p.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            className="w-full resize-none rounded-md bg-hi px-3 py-2.5 text-sm outline-none ring-ribbon/60 placeholder:text-dim focus:ring-2"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded-full bg-ribbon px-8 py-3 font-semibold text-ink transition-colors hover:bg-ribbon-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isNew ? "Save person" : "Save changes"}
          </button>
          <button onClick={() => go(isNew ? { name: "home" } : { name: "persona", id: p.id })} className="rounded-full px-6 py-3 font-semibold text-sub hover:text-text">
            Cancel
          </button>
          {!canSave && <span className="text-sm text-sub">Add a name and at least one thing they love to save.</span>}
          {!isNew && (
            <button
              onClick={() => confirmRemove(initial)}
              className="ml-auto flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-sub hover:text-alert"
            >
              <Trash2 className="size-4" /> Remove {initial.name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-lg font-semibold">{label}</h3>
      {hint && <p className="mb-3 mt-0.5 text-sm text-sub">{hint}</p>}
      {!hint && <div className="h-3" />}
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md bg-hi px-3 py-2.5 text-sm outline-none ring-ribbon/60 placeholder:text-dim focus:ring-2"
    />
  );
}

function EntitySearch({ selected, onAdd }: { selected: TasteSeed[]; onAdd: (s: TasteSeed) => void }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [results, setResults] = useState<TasteSeed[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}${type ? `&type=${type}` : ""}`);
        const data = (await res.json()) as { results: TasteSeed[]; error?: string };
        if (id !== seq.current) return;
        setResults(data.results);
        setError(data.error ? "Qloo search is unavailable right now." : null);
      } catch {
        if (id === seq.current) setError("Couldn't reach search.");
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, type]);

  const visible = q.trim().length >= 2 ? results.filter((r) => !selected.some((s) => s.id === r.id)) : [];

  return (
    <div className="rounded-lg bg-card p-2">
      <label className="flex items-center gap-2 rounded-md bg-hi px-3 ring-ribbon/60 focus-within:ring-2">
        <Search className="size-5 text-sub" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Phoebe Bridgers, The Bear, Patagonia…"
          aria-label="Search things they love"
          className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-dim"
        />
        {loading && <LoaderCircle className="size-4 animate-spin text-sub" />}
      </label>
      <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
        {SEARCH_TYPES.map(([value, label]) => (
          <Pill key={label} active={type === value} onClick={() => setType(value)}>
            {label}
          </Pill>
        ))}
      </div>
      {error && <p className="px-2 pt-3 text-sm text-sub">{error}</p>}
      {visible.length > 0 && (
        <ul className="mt-2 max-h-80 overflow-y-auto scroll-panel">
          {visible.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => {
                  onAdd(r);
                  setQ("");
                  setResults([]);
                }}
                className="group flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-hi"
              >
                <SeedThumb seed={r} className="size-11" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="block truncate text-sm text-sub">
                    {typeLabel(r.type)}
                    {r.tags?.length ? ` · ${r.tags.slice(0, 3).join(", ")}` : ""}
                  </span>
                </span>
                <Plus className="size-5 text-sub opacity-0 transition group-hover:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !loading && !error && results.length > 0 && visible.length === 0 && <p className="px-2 pt-3 text-sm text-sub">Already added.</p>}
    </div>
  );
}
