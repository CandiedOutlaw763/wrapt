"use client";

// Personas and past gift runs live in the browser. Every read and write is
// guarded so private windows or blocked storage just mean "no saved data".

import type { GiftRun, Persona } from "./types";

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

export function loadPersonas(): Persona[] {
  return read<Persona[]>(PERSONAS_KEY) ?? DEMO_PERSONAS;
}

export function savePersonas(personas: Persona[]) {
  write(PERSONAS_KEY, personas);
}

export function loadRuns(personaId: string): GiftRun[] {
  return read<GiftRun[]>(runsKey(personaId)) ?? [];
}

export function saveRun(personaId: string, run: GiftRun) {
  write(runsKey(personaId), [run, ...loadRuns(personaId)].slice(0, 5));
}

export function deleteRuns(personaId: string) {
  try {
    localStorage.removeItem(runsKey(personaId));
  } catch {}
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
