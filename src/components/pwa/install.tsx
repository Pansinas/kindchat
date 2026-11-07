"use client";

import { Download, Share, SquarePlus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The browser fires `beforeinstallprompt` once, early. Keep it in a module-level store.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Registers the service worker and captures the install prompt. Mounted once in the root layout. */
export function PwaSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      emit();
    };
    const onInstalled = () => {
      deferredPrompt = null;
      emit();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
  };
}

type Platform = "installed" | "prompt" | "ios" | "other";

function detect(): Platform {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  if (deferredPrompt) return "prompt";
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIos ? "ios" : "other";
}

export function useInstallState(): Platform | null {
  return useSyncExternalStore(subscribe, detect, () => null);
}

/** Settings section content: one-tap install on Android/desktop, step-by-step on iPhone/iPad. */
export function InstallApp() {
  const platform = useInstallState();
  const [busy, setBusy] = useState(false);

  if (platform === null) return null;
  if (platform === "installed") {
    return <p className="text-sm text-muted-foreground">KindChat is installed on this device. 🎉</p>;
  }
  if (platform === "prompt") {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">Add KindChat to your home screen. It opens full screen, like a regular app.</p>
        <Button
          className="justify-self-start"
          disabled={busy}
          onClick={async () => {
            if (!deferredPrompt) return;
            setBusy(true);
            await deferredPrompt.prompt();
            await deferredPrompt.userChoice.catch(() => undefined);
            deferredPrompt = null;
            emit();
            setBusy(false);
          }}
        >
          <Download /> Install KindChat
        </Button>
      </div>
    );
  }
  if (platform === "ios") {
    return (
      <ol className="grid gap-3 text-[15px]">
        <li className="flex items-start gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">1</span>
          <span>
            Tap the <Share className="mx-0.5 inline size-4 -translate-y-0.5" aria-label="Share" /> <strong>Share</strong> button in Safari&apos;s toolbar.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">2</span>
          <span>
            Scroll down and tap <SquarePlus className="mx-0.5 inline size-4 -translate-y-0.5" aria-hidden /> <strong>Add to Home Screen</strong>.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">3</span>
          <span>
            Tap <strong>Add</strong>. KindChat now opens from your home screen like an app.
          </span>
        </li>
      </ol>
    );
  }
  return (
    <p className="text-sm leading-relaxed text-muted-foreground">
      Open your browser&apos;s menu (⋮) and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. On iPhone, use
      Safari&apos;s Share button and choose <strong>Add to Home Screen</strong>.
    </p>
  );
}

// ---- Dashboard hint (phones only, dismissible) ----------------------------------------------

const HINT_KEY = "kindchat:install-hint-dismissed";
const hintListeners = new Set<() => void>();

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeHint(listener: () => void) {
  hintListeners.add(listener);
  return () => hintListeners.delete(listener);
}

export function InstallHint() {
  const platform = useInstallState();
  const dismissed = useSyncExternalStore(subscribeHint, readDismissed, () => true);
  if (dismissed || (platform !== "ios" && platform !== "prompt")) return null;

  return (
    <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 md:hidden">
      <Download className="size-5 shrink-0 text-accent-foreground" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">Add KindChat to your home screen</span>
        <span className="block text-muted-foreground">Open it like an app, full screen.</span>
      </p>
      <Button asChild size="sm" variant="secondary">
        <a href="/settings#install">How</a>
      </Button>
      <button
        type="button"
        className="px-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => {
          try {
            window.localStorage.setItem(HINT_KEY, "1");
          } catch {
            // Storage unavailable (private mode): hide for this visit only.
          }
          hintListeners.forEach((l) => l());
        }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
