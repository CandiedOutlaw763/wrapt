"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { firebase, firebaseEnabled } from "./firebase";

export interface Auth {
  enabled: boolean;
  /** False until Firebase has restored (or ruled out) a previous session. */
  ready: boolean;
  user: User | null;
  google(): Promise<void>;
  emailSignIn(email: string, password: string): Promise<void>;
  emailSignUp(email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  guest(): Promise<void>;
  signOut(): Promise<void>;
}

export function useAuth(): Auth {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!firebaseEnabled);

  useEffect(() => {
    const fb = firebase();
    if (!fb) return;
    return onAuthStateChanged(fb.auth, (u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  // Linking keeps the same uid (so a guest's personas carry over) and updates the User in
  // place without firing onAuthStateChanged, so re-render by hand to show the new account.
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const google = useCallback(async () => {
    const { auth } = firebase()!;
    const provider = new GoogleAuthProvider();
    if (auth.currentUser?.isAnonymous) {
      try {
        await linkWithPopup(auth.currentUser, provider);
        return refresh();
      } catch (err) {
        // That Google account already exists: switch to it (the guest's data stays with the guest).
        if ((err as { code?: string }).code !== "auth/credential-already-in-use") throw err;
      }
    }
    await signInWithPopup(auth, provider);
  }, [refresh]);

  const emailSignIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(firebase()!.auth, email, password);
  }, []);

  const emailSignUp = useCallback(
    async (email: string, password: string) => {
      const { auth } = firebase()!;
      if (auth.currentUser?.isAnonymous) {
        await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(email, password));
        return refresh();
      }
      await createUserWithEmailAndPassword(auth, email, password);
    },
    [refresh],
  );

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(firebase()!.auth, email);
  }, []);

  const guest = useCallback(async () => {
    await signInAnonymously(firebase()!.auth);
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(firebase()!.auth);
  }, []);

  return { enabled: firebaseEnabled, ready, user, google, emailSignIn, emailSignUp, resetPassword, guest, signOut };
}

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "That email and password don't match an account.",
  "auth/wrong-password": "That email and password don't match an account.",
  "auth/user-not-found": "There's no account with that email. Create one instead.",
  "auth/email-already-in-use": "An account with that email already exists. Sign in instead.",
  "auth/weak-password": "Use a password of at least 6 characters.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/popup-closed-by-user": "The Google window was closed before signing in.",
  "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
  "auth/operation-not-allowed": "This sign-in method isn't turned on in the Firebase console yet.",
  "auth/unauthorized-domain": "This domain isn't authorized in Firebase. Add it under Authentication → Settings → Authorized domains.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/network-request-failed": "Couldn't reach Firebase. Check your connection.",
};

export function authMessage(err: unknown): string {
  const code = (err as { code?: string }).code ?? "";
  return MESSAGES[code] ?? (err as Error).message ?? "Sign-in failed.";
}
