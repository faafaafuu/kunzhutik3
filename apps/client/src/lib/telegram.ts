// Telegram WebApp: the same web build opened inside Telegram (/tg). Signs in by initData.

import { Platform } from "react-native";

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { first_name?: string } };
  colorScheme?: "light" | "dark";
  ready: () => void;
  expand: () => void;
  close: () => void;
  HapticFeedback?: { impactOccurred: (style: string) => void };
};

export function telegram(): TelegramWebApp | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const app = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return app && app.initData ? app : null;
}

export function isTelegram(): boolean {
  return telegram() !== null;
}

export function orderSource(): "web" | "ios" | "android" | "telegram" {
  if (isTelegram()) return "telegram";
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

/** Telegram passes the WebApp data in the URL hash; only then the SDK script is worth loading. */
export function loadTelegramScript(): Promise<void> {
  if (Platform.OS !== "web" || typeof document === "undefined") return Promise.resolve();
  if (!window.location.hash.includes("tgWebAppData") && !window.location.pathname.startsWith("/tg")) return Promise.resolve();
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
    setTimeout(resolve, 4000);
  });
}
