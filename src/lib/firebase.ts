"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// NEXT_PUBLIC_ values are inlined at build time, so each must be referenced literally.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Without Firebase config the app still runs; sign-in is simply hidden and data stays in the browser. */
export const firebaseEnabled = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

let services: { auth: Auth; db: Firestore } | null = null;

export function firebase(): { auth: Auth; db: Firestore } | null {
  if (!firebaseEnabled) return null;
  if (!services) {
    const app = getApps().length ? getApp() : initializeApp(config);
    services = { auth: getAuth(app), db: getFirestore(app) };
  }
  return services;
}
