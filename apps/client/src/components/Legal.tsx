// Links to the legal pages (requisites, offer, delivery, refunds, privacy). The pages themselves are plain HTML
// served by the API, so payment providers can check them without JavaScript; here we only link to them.

import * as Linking from "expo-linking";
import { Platform, View } from "react-native";

import { assetUrl } from "@/api/client";
import { useTheme } from "@/theme";

import { Muted, T } from "./ui";

export const LEGAL_LINKS = [
  { path: "/legal", title: "Реквизиты и контакты" },
  { path: "/legal/offer", title: "Оферта" },
  { path: "/legal/delivery", title: "Доставка и оплата" },
  { path: "/legal/refund", title: "Отмена и возврат" },
  { path: "/legal/bonus", title: "Бонусы и «Приведи друга»" },
  { path: "/legal/privacy", title: "Политика данных" },
  { path: "/legal/consent", title: "Согласие на обработку данных" },
];

function openLegal(path: string) {
  const url = assetUrl(path) ?? path;
  // Same tab on the site: these are ordinary pages with a link back to the menu.
  if (Platform.OS === "web") window.location.assign(url);
  else Linking.openURL(url);
}

function LegalLink({ path, title, size }: { path: string; title: string; size: number }) {
  const { c } = useTheme();
  return (
    <T size={size} color={c.inkSoft} style={{ textDecorationLine: "underline" }} onPress={() => openLegal(path)} accessibilityRole="link">
      {title}
    </T>
  );
}

/** Bottom of the menu: the links payment providers and buyers look for. */
export function LegalFooter() {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 16, rowGap: 8, paddingTop: 32, paddingBottom: 8 }}>
      {LEGAL_LINKS.map((link) => (
        <LegalLink key={link.path} path={link.path} title={link.title} size={13} />
      ))}
    </View>
  );
}

/**
 * The consent as one line under the button that sends the data (sign-in, a guest's order): pressing it is the
 * agreement, like in Drinkit or Яндекс Еда. The documents are listed on /legal/documents; the consent to personal data
 * is its own document there, promotions are asked for separately (the «Акции» switch in the notifications).
 */
export function AgreementLine({ action }: { action: string }) {
  return (
    <Muted size={12} style={{ textAlign: "center" }}>
      {action}, вы соглашаетесь с <LegalLink path="/legal/documents" title="документами и соглашениями" size={12} />
    </Muted>
  );
}
