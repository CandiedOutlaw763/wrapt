"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { authMessage, type Auth } from "@/lib/auth";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("[data-autofocus], input, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal aria-label={title} className="unwrap w-full max-w-md rounded-3xl border border-line bg-base p-6 shadow-[0_24px_60px_rgba(0,0,0,.6)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold leading-tight">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-sub hover:bg-hi hover:text-text">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sub">{body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button data-autofocus onClick={onClose} className="rounded-full px-5 py-2.5 font-semibold text-sub hover:text-text">
          Cancel
        </button>
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className="rounded-full bg-alert px-5 py-2.5 font-semibold text-ink hover:bg-alert/85"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

type Mode = "signin" | "signup" | "reset";

export function AuthDialog({ auth, onClose }: { auth: Auth; onClose: () => void }) {
  const upgrading = !!auth.user?.isAnonymous;
  const [mode, setMode] = useState<Mode>(upgrading ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(label: string, action: () => Promise<void>, closeAfter = true) {
    setBusy(label);
    setError(null);
    try {
      await action();
      if (closeAfter) onClose();
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "reset") {
      return run(
        "email",
        async () => {
          await auth.resetPassword(email);
          setNotice(`If ${email} has an account, a reset link is on its way.`);
          setMode("signin");
        },
        false,
      );
    }
    return run("email", () => (mode === "signup" ? auth.emailSignUp(email, password) : auth.emailSignIn(email, password)));
  };

  const title = upgrading ? "Keep your people" : mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Sign in to Wrapt";

  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-5 text-sm text-sub">
        {upgrading
          ? "You're using Wrapt as a guest. Add Google or an email so you can sign back in on any device."
          : "Your people and their gift runs are saved to your account and follow you to any device."}
      </p>

      {mode !== "reset" && (
        <button
          onClick={() => run("google", auth.google)}
          disabled={!!busy}
          className="flex w-full items-center justify-center gap-3 rounded-full bg-text py-3 font-semibold text-ink transition-colors hover:bg-white disabled:opacity-60"
        >
          {busy === "google" ? <LoaderCircle className="size-5 animate-spin" /> : <GoogleMark />}
          Continue with Google
        </button>
      )}

      {mode !== "reset" && (
        <div className="my-5 flex items-center gap-3 text-xs text-dim">
          <span className="h-px flex-1 bg-line" /> or use email <span className="h-px flex-1 bg-line" />
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          aria-label="Email"
          className="rounded-xl bg-hi px-4 py-3 text-sm outline-none ring-ribbon/60 placeholder:text-dim focus:ring-2"
        />
        {mode !== "reset" && (
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            className="rounded-xl bg-hi px-4 py-3 text-sm outline-none ring-ribbon/60 placeholder:text-dim focus:ring-2"
          />
        )}
        {error && <p className="text-sm text-alert">{error}</p>}
        {notice && <p className="text-sm text-sub">{notice}</p>}
        <button type="submit" disabled={!!busy} className="flex items-center justify-center gap-2 rounded-full bg-ribbon py-3 font-semibold text-ink hover:bg-ribbon-deep disabled:opacity-60">
          {busy === "email" && <LoaderCircle className="size-4 animate-spin" />}
          {mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        {mode === "signin" && (
          <>
            <button onClick={() => setMode("signup")} className="text-sub underline-offset-4 hover:text-text hover:underline">
              New here? Create an account
            </button>
            <button onClick={() => setMode("reset")} className="text-sub underline-offset-4 hover:text-text hover:underline">
              Forgot password?
            </button>
          </>
        )}
        {mode !== "signin" && !upgrading && (
          <button onClick={() => setMode("signin")} className="text-sub underline-offset-4 hover:text-text hover:underline">
            Have an account? Sign in
          </button>
        )}
      </div>

      {!auth.user && (
        <button onClick={() => run("guest", auth.guest)} disabled={!!busy} className="mt-5 w-full rounded-full border border-line py-2.5 text-sm font-semibold text-sub hover:border-sub hover:text-text">
          {busy === "guest" ? "Starting…" : "Continue as guest"}
        </button>
      )}
    </Modal>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}
