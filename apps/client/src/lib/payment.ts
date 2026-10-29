// Online payment (ЮKassa). The site shows the widget right on the order screen (components/PaymentWidget.tsx);
// the app opens our /pay/<order> page — the same widget — in an in-app browser and closes it once paid.

import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { API_URL } from "@/api/client";

/** App: the payment page over the app. Plain in-app browser, not a sign-in session: no "wants to sign in" prompt. */
export async function openPayment(orderId: string): Promise<void> {
  if (Platform.OS === "web") return;
  await WebBrowser.openBrowserAsync(`${API_URL}/pay/${orderId}`, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
}

/** The order got paid while the page was open: take it away, the order screen shows the news. */
export function closePayment(): void {
  if (Platform.OS !== "web") WebBrowser.dismissBrowser();
}
