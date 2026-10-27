// Starting the app: config, Telegram sign-in, the forced update check, push registration.

import * as Application from "expo-application";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "@/api/client";
import type { AppConfig, Customer, Tokens } from "@/api/types";
import { useSession } from "@/store/session";

import { loadTelegramScript, telegram } from "./telegram";

export async function signInWithTelegram(): Promise<boolean> {
  await loadTelegramScript();
  const app = telegram();
  if (!app) return false;
  app.ready();
  app.expand();
  if (useSession.getState().tokens) return true;
  try {
    const result = await api<{ customer: Customer; tokens: Tokens }>("/auth/telegram", { method: "POST", body: { init_data: app.initData }, auth: false });
    useSession.getState().signIn(result.customer, result.tokens);
    return true;
  } catch {
    return false;
  }
}

/** True when this build is older than the API accepts — the app must be updated from the store. */
export function updateRequired(config: AppConfig | null): boolean {
  if (!config || Platform.OS === "web") return false;
  const current = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "0.0.0";
  return compareVersions(current, config.min_supported_app_version) < 0;
}

export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Asks for push permission and sends the Expo token to the API. Needs an EAS project id in a real build. */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice || !useSession.getState().tokens) return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("orders", { name: "Заказы", importance: Notifications.AndroidImportance.HIGH });
    }
    const existing = await Notifications.getPermissionsAsync();
    const granted = existing.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api("/me/devices", { method: "POST", body: { platform: Platform.OS, token } });
  } catch {
    // Push is a convenience; the order screen polls anyway.
  }
}
