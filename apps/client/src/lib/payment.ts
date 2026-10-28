// Online payment (ЮKassa): the customer pays on ЮKassa's page and comes back to the order.

import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

/**
 * Opens ЮKassa's payment page. On the web the page itself goes there and ЮKassa sends the customer back to
 * /order/<id>. In the app it opens as a sheet that closes by itself when the payment page returns to bright://order/<id>;
 * the caller then asks the server how it went.
 */
export async function openPayment(url: string, orderId: string): Promise<void> {
  if (Platform.OS === "web") {
    window.location.assign(url);
    return;
  }
  await WebBrowser.openAuthSessionAsync(url, `bright://order/${orderId}`);
}
