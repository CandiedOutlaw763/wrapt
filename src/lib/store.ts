"use client";

// Where personas and gift runs live: the browser for signed-out visitors, Firestore
// (users/{uid}/personas/{id}/runs/{createdAt}) once someone signs in.

import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import type { User } from "firebase/auth";
import { firebase } from "./firebase";
import type { GiftRun, Persona } from "./types";

export interface Store {
  kind: "local" | "cloud";
  loadPersonas(): Promise<Persona[]>;
  savePersona(p: Persona): Promise<void>;
  deletePersona(id: string): Promise<void>;
  loadRuns(personaId: string): Promise<GiftRun[]>;
  saveRun(personaId: string, run: GiftRun): Promise<void>;
}

const RUNS_KEPT = 5;

// ── Browser storage ──────────────────────────────────────────────────────────
// Every read and write is guarded so private windows or blocked storage just mean "no saved data".

const PERSONAS_KEY = "wrapt:personas";
const runsKey = (id: string) => `wrapt:runs:${id}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — the session still works in memory.
  }
}

const localPersonas = () => read<Persona[]>(PERSONAS_KEY) ?? DEMO_PERSONAS;
const localRuns = (id: string) => read<GiftRun[]>(runsKey(id)) ?? [];

export const localStore: Store = {
  kind: "local",
  async loadPersonas() {
    return localPersonas();
  },
  async savePersona(p) {
    const all = localPersonas();
    write(PERSONAS_KEY, all.some((x) => x.id === p.id) ? all.map((x) => (x.id === p.id ? p : x)) : [...all, p]);
  },
  async deletePersona(id) {
    write(
      PERSONAS_KEY,
      localPersonas().filter((p) => p.id !== id),
    );
    try {
      localStorage.removeItem(runsKey(id));
    } catch {}
  },
  async loadRuns(personaId) {
    return localRuns(personaId);
  },
  async saveRun(personaId, run) {
    write(runsKey(personaId), [run, ...localRuns(personaId)].slice(0, RUNS_KEPT));
  },
};

// ── Firestore ────────────────────────────────────────────────────────────────

/** Firestore rejects `undefined`; a JSON round-trip drops those fields. */
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function cloudStore(uid: string): Store {
  const db = firebase()!.db;
  const personas = collection(db, "users", uid, "personas");
  const runs = (personaId: string) => collection(db, "users", uid, "personas", personaId, "runs");

  return {
    kind: "cloud",
    async loadPersonas() {
      const snap = await getDocs(query(personas, orderBy("createdAt")));
      return snap.docs.map((d) => d.data() as Persona);
    },
    async savePersona(p) {
      await setDoc(doc(personas, p.id), clean(p));
    },
    async deletePersona(id) {
      const batch = writeBatch(db);
      (await getDocs(runs(id))).forEach((r) => batch.delete(r.ref));
      batch.delete(doc(personas, id));
      await batch.commit();
    },
    async loadRuns(personaId) {
      const snap = await getDocs(query(runs(personaId), orderBy("createdAt", "desc"), limit(RUNS_KEPT)));
      return snap.docs.map((d) => d.data() as GiftRun);
    },
    async saveRun(personaId, run) {
      await setDoc(doc(runs(personaId), String(run.createdAt)), clean(run));
      // Keep only the latest few runs per persona.
      const old = await getDocs(query(runs(personaId), orderBy("createdAt", "desc")));
      await Promise.all(old.docs.slice(RUNS_KEPT).map((d) => deleteDoc(d.ref)));
    },
  };
}

/**
 * Record the sign-in on users/{uid}. The first time an account is seen, copy this
 * browser's personas and runs into it so nothing made before signing in is lost.
 */
export async function prepareAccount(user: User): Promise<void> {
  const db = firebase()!.db;
  const ref = doc(db, "users", user.uid);
  const profile = {
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    provider: user.isAnonymous ? "anonymous" : (user.providerData[0]?.providerId ?? "unknown"),
    lastSignInAt: serverTimestamp(),
  };
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await setDoc(ref, profile, { merge: true });
    return;
  }

  const cloud = cloudStore(user.uid);
  for (const p of localPersonas()) {
    await cloud.savePersona(p);
    for (const run of localRuns(p.id).reverse()) await cloud.saveRun(p.id, run);
  }
  await setDoc(ref, { ...profile, createdAt: serverTimestamp() });
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const img = (id: string) => `https://images.qloo.com/i/${id}-420x-auto.jpg`;

export const DEMO_PERSONAS: Persona[] = [
  {
    id: "demo-maya",
    name: "Maya",
    relationship: "Sister",
    age: "25_to_29",
    gender: "female",
    location: "Brooklyn",
    hobbies: "film photography, journaling",
    notes: "Just moved into her first solo apartment.",
    hue: 0,
    createdAt: 1,
    loves: [
      { id: "AFBC71A7-9439-4AB0-AB68-D14B11AAF836", name: "Phoebe Bridgers", type: "urn:entity:artist", image: img("AFBC71A7-9439-4AB0-AB68-D14B11AAF836"), tags: ["Indie", "Singer & Songwriter", "Folk", "Introspective", "Melancholic", "Poetic"] },
      { id: "19DF9974-2931-42F7-AF6F-DC29B9E17974", name: "Normal People", type: "urn:entity:tv_show", image: img("19DF9974-2931-42F7-AF6F-DC29B9E17974"), tags: ["Vulnerable", "Romance", "Friendship", "Introspective"] },
      { id: "969911E8-7092-43D9-8C7D-C7547EAE3C00", name: "Little Women", type: "urn:entity:movie", image: img("969911E8-7092-43D9-8C7D-C7547EAE3C00"), tags: ["Romance", "Emotional", "Coming of age drama", "Atmospheric"] },
      { id: "7D903E2F-70AB-44CB-AA88-82501E6D04DD", name: "Hozier", type: "urn:entity:artist", image: img("7D903E2F-70AB-44CB-AA88-82501E6D04DD"), tags: ["Indie", "Soul", "Singer & Songwriter", "Passionate", "Thoughtful"] },
      { id: "0044C2D6-C96D-4571-8EFE-E81E8CF722D4", name: "Kinfolk", type: "urn:entity:brand", image: img("0044C2D6-C96D-4571-8EFE-E81E8CF722D4"), tags: ["Lifestyle", "Minimalist Layouts", "Neutral Color Palette"] },
    ],
  },
  {
    id: "demo-dad",
    name: "Dad",
    relationship: "Father",
    age: "55_and_older",
    gender: "male",
    hobbies: "grilling, road trips",
    notes: "Says he doesn't need anything. Retiring next spring.",
    hue: 3,
    createdAt: 2,
    loves: [
      { id: "120E288E-858F-4AC1-A825-736D5A16D65F", name: "Bruce Springsteen", type: "urn:entity:artist", image: img("120E288E-858F-4AC1-A825-736D5A16D65F"), tags: ["Classic Rock", "Folk", "Rock", "Working-Class", "Loyal"] },
      { id: "A7C09282-07B4-4101-8B58-64D96FDC1333", name: "Anthony Bourdain", type: "urn:entity:person", image: img("A7C09282-07B4-4101-8B58-64D96FDC1333"), tags: ["Travel", "Television Presenter"] },
      { id: "F99FB2EB-7253-4E9B-B982-D21D29BFB238", name: "The Godfather", type: "urn:entity:movie", image: img("F99FB2EB-7253-4E9B-B982-D21D29BFB238"), tags: ["Mature", "20th century", "Mafioso"] },
      { id: "DCA1F3CA-7A25-421C-BB4D-A864B6D53848", name: "Ted Lasso", type: "urn:entity:tv_show", image: img("DCA1F3CA-7A25-421C-BB4D-A864B6D53848"), tags: ["Heartfelt", "Feel good series", "Sports loving"] },
    ],
  },
  {
    id: "demo-alex",
    name: "Alex",
    relationship: "Partner",
    age: "30_to_34",
    gender: "unspecified",
    hobbies: "bouldering, pour-over coffee",
    hue: 5,
    createdAt: 3,
    loves: [
      { id: "BA00D00A-E4CD-48C0-A22E-CFC52039D618", name: "Hades", type: "urn:entity:videogame", image: img("BA00D00A-E4CD-48C0-A22E-CFC52039D618"), tags: ["stylized", "hand-drawn", "challenging", "narrative-driven"] },
      { id: "878A5D45-469C-4556-8494-963C2B1D3A95", name: "Dune: Part Two", type: "urn:entity:movie", image: img("878A5D45-469C-4556-8494-963C2B1D3A95"), tags: ["Science fantasy", "Chosen one"] },
      { id: "D1AE8792-9129-46E0-AEE7-2C3A81E91385", name: "Tame Impala", type: "urn:entity:artist", image: img("D1AE8792-9129-46E0-AEE7-2C3A81E91385"), tags: ["Psychedelic", "Indie Rock", "Eclectic", "Creative"] },
      { id: "7B75291D-103B-476A-91B5-81E7687D6A59", name: "Project Hail Mary", type: "urn:entity:book", image: img("7B75291D-103B-476A-91B5-81E7687D6A59"), tags: ["Adventure", "Science Fiction Fantasy", "Space"] },
      { id: "4C305B2F-5A46-4885-A6DA-5E22D11E86E0", name: "The Bear", type: "urn:entity:tv_show", image: img("4C305B2F-5A46-4885-A6DA-5E22D11E86E0"), tags: ["Dining", "Tense", "Food preparation", "Restaurant"] },
    ],
  },
];
