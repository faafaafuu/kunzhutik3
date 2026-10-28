// HTTP client of the app. Adds the access token, refreshes it once on 401, unwraps API errors.

import { Platform } from "react-native";

import { useSession } from "@/store/session";

import type { Customer, Tokens } from "./types";

// On the web the app is served by the API itself, so relative URLs work.
// Native builds need the address: EXPO_PUBLIC_API_URL=https://bright.example.ru
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === "web" ? "" : "http://localhost:8000")).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, any>;

  constructor(status: number, code: string, message: string, details: Record<string, any> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}

const PHOTOS = "/static/assets/photos/";

/** A 360 px copy of a menu photo for lists: the full 1200 px one is for the dish screen only. */
export function thumbUrl(path: string | null | undefined): string | undefined {
  if (path?.startsWith(PHOTOS)) return assetUrl(PHOTOS + "thumb/" + path.slice(PHOTOS.length));
  return assetUrl(path);
}

type Options = { method?: string; body?: unknown; auth?: boolean };

let refreshing: Promise<boolean> | null = null;

export async function api<T>(path: string, { method = "GET", body, auth = true }: Options = {}): Promise<T> {
  const response = await send(path, method, body, auth);
  if (response.status === 401 && auth && useSession.getState().tokens) {
    if (await refreshOnce()) {
      return parse<T>(await send(path, method, body, auth));
    }
  }
  return parse<T>(response);
}

async function send(path: string, method: string, body: unknown, auth: boolean): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = useSession.getState().tokens?.access_token;
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(`${API_URL}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "offline", "Нет подключения к интернету");
  }
}

async function parse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload?.error ?? {};
    if (response.status >= 500 && !error.code) throw new ApiError(response.status, "server_error", "Что-то пошло не так. Попробуйте через минуту");
    throw new ApiError(response.status, error.code ?? "error", error.message ?? "Не получилось", error.details ?? {});
  }
  return payload as T;
}

function refreshOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const refresh = useSession.getState().tokens?.refresh_token;
      if (!refresh) return false;
      try {
        const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!response.ok) {
          useSession.getState().signOut();
          return false;
        }
        const payload = (await response.json()) as { customer: Customer; tokens: Tokens };
        useSession.getState().signIn(payload.customer, payload.tokens);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}
