// Invite a friend: the ?ref= code of a shared link waits on this device until an account can take it.

import { Platform } from "react-native";

import { api } from "@/api/client";
import { useSession } from "@/store/session";

/** Web: keeps the friend's code from the link and cleans the address bar. */
export function captureReferralFromUrl(): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("ref");
  if (!code) return;
  if (/^[A-Za-z0-9]{4,12}$/.test(code)) useSession.getState().setReferralCode(code.toUpperCase());
  url.searchParams.delete("ref");
  // After the router has read the address, or it would put the old one back.
  setTimeout(() => window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash), 1500);
}

/** Signed in with a code still waiting: hand it to the account once; a wrong or late code is just dropped. */
export async function applyPendingReferral(): Promise<void> {
  const { referralCode, tokens, setReferralCode } = useSession.getState();
  if (!referralCode || !tokens) return;
  setReferralCode(null);
  try {
    await api("/me/referral/apply", { method: "POST", body: { code: referralCode } });
  } catch {
    // Own code, already applied, or after the first order: nothing to do.
  }
}
