// Touch feedback. The app uses the phone's taptic engine; the site a short buzz where the browser allows it
// (Android Chrome — Safari on iPhone has no vibration for web pages).

import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const native = Platform.OS !== "web";

function buzz(ms: number): void {
  if (!native && typeof navigator !== "undefined") navigator.vibrate?.(ms);
}

/** iOS wakes the taptic engine on its first request and can drop it, so the first tap after launch goes unfelt.
 *  One quiet tick at start-up gets that out of the way. */
export function warmUp(): void {
  if (native) Haptics.selectionAsync().catch(() => {});
}

/** A detent: one step of a picker or the wheel, a switch, a quantity going up or down. */
export function select(): void {
  if (native) Haptics.selectionAsync().catch(() => {});
  else buzz(4);
}

/** A light tap: «+» that puts something in the cart. */
export function tap(): void {
  if (native) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  else buzz(8);
}

/** Done: a dish added from its card, a gift taken for bonuses. */
export function success(): void {
  if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else buzz(12);
}
