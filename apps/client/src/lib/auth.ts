// Sign-in that finishes outside the app (API: services/social_auth.py).
// Telegram: the bot confirms the login and we poll for it. Google: the browser comes back with a one-time
// code in the URL fragment. Either way the session comes from /auth/collect.

import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { api, API_URL } from "@/api/client";
import type { Customer, Tokens } from "@/api/types";
import { useSession } from "@/store/session";

type Collected = { status: "pending" } | { status: "ok"; customer: Customer; tokens: Tokens };

// The web page leaves for Google (or for t.me without Telegram installed) and comes back:
// what it was doing survives in sessionStorage.
const PENDING = "bright-login-pending";
const NEXT = "bright-login-next";

export const LOGIN_ERRORS: Record<string, string> = {
  cancelled: "Вход отменён",
  login_expired: "Время на вход вышло, попробуйте ещё раз",
  google_unavailable: "Вход через Google скоро заработает. Пока войдите по номеру телефона",
  google_failed: "Google не подтвердил вход, попробуйте ещё раз",
  login_rate_limited: "Слишком много попыток входа. Попробуйте через час",
};

/** True once the login is confirmed and the session is stored; false while it waits. */
export async function collectLogin(secret: string): Promise<boolean> {
  const result = await api<Collected>("/auth/collect", { method: "POST", body: { secret }, auth: false });
  if (result.status !== "ok") return false;
  useSession.getState().signIn(result.customer, result.tokens);
  return true;
}

export async function startTelegramLogin(): Promise<{ url: string; secret: string }> {
  const started = await api<{ url: string; secret: string }>("/auth/telegram/start", { method: "POST", auth: false });
  remember(PENDING, started.secret);
  return started;
}

export function openTelegram(url: string): void {
  if (Platform.OS !== "web") {
    Linking.openURL(url);
    return;
  }
  // A phone hands t.me links to the Telegram app and keeps this page polling; a desktop browser would
  // navigate away, so there the link goes to a new tab.
  if (window.matchMedia?.("(pointer: coarse)").matches) window.location.href = url;
  else window.open(url, "_blank", "noopener");
}

/** The Telegram login this page started before it was reloaded or left, if any. */
export function pendingTelegramSecret(): string | null {
  return recall(PENDING);
}

export function forgetTelegramLogin(): void {
  remember(PENDING, null);
}

/** Web: leaves for Google and returns to /login. Native: an in-app browser sheet; resolves with an error text or null. */
export async function startGoogleLogin(next: string): Promise<string | null> {
  if (Platform.OS === "web") {
    remember(NEXT, next);
    window.location.assign(`${API_URL}/auth/google/start?return_to=${encodeURIComponent(`${window.location.origin}/login`)}`);
    return null;
  }
  const back = Linking.createURL("login");
  const result = await WebBrowser.openAuthSessionAsync(`${API_URL}/auth/google/start?return_to=${encodeURIComponent(back)}`, back);
  if (result.type !== "success") return LOGIN_ERRORS.cancelled;
  return finishRedirect(result.url);
}

/** Web, on /login: the fragment Google's round trip left. Resolves with an error text, or null when signed in or nothing to do. */
export async function finishWebRedirect(): Promise<{ error: string | null; next: string | null } | null> {
  if (Platform.OS !== "web" || !window.location.hash.includes("login_")) return null;
  const url = window.location.href;
  window.history.replaceState(null, "", window.location.pathname);
  const next = recall(NEXT);
  remember(NEXT, null);
  return { error: await finishRedirect(url), next };
}

async function finishRedirect(url: string): Promise<string | null> {
  const params = new URLSearchParams(url.split("#")[1] ?? "");
  const error = params.get("login_error");
  if (error) return LOGIN_ERRORS[error] ?? "Не получилось войти, попробуйте ещё раз";
  const code = params.get("login_code");
  if (!code) return null;
  try {
    return (await collectLogin(code)) ? null : LOGIN_ERRORS.login_expired;
  } catch {
    return LOGIN_ERRORS.login_expired;
  }
}

function remember(key: string, value: string | null): void {
  if (Platform.OS !== "web") return;
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Private mode: the login still works while the page stays open.
  }
}

function recall(key: string): string | null {
  if (Platform.OS !== "web") return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
