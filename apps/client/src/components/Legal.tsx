// Links to the legal pages (requisites, offer, delivery, refunds, privacy). The pages themselves are plain HTML
// served by the API, so payment providers can check them without JavaScript; here we only link to them.

import * as Linking from "expo-linking";
import { Platform, View } from "react-native";

import { assetUrl } from "@/api/client";
import { useTheme } from "@/theme";

import { Checkbox, Muted, T } from "./ui";

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

/** For a customer who has already ticked the consent: a line with the documents, no boxes. */
export function ConsentNote() {
  return (
    <Muted size={12}>
      Оформляя заказ, вы принимаете условия <LegalLink path="/legal/offer" title="оферты" size={12} /> и{" "}
      <LegalLink path="/legal/delivery" title="доставки" size={12} />. Согласие на обработку данных уже дано,{" "}
      <LegalLink path="/legal/privacy" title="подробнее" size={12} />.
    </Muted>
  );
}

export type Agreements = { offer: boolean; data: boolean; ads: boolean };
export const noAgreements: Agreements = { offer: false, data: false, ads: false };

/**
 * The boxes of the consent: the offer (checkout only) and personal data processing are required and start unticked,
 * promotions are optional and start unticked too. A separate document for each, as the law asks.
 */
export function ConsentChecks({ value, onChange, withOffer }: { value: Agreements; onChange: (value: Agreements) => void; withOffer?: boolean }) {
  return (
    <View style={{ gap: 12 }}>
      {withOffer ? (
        <Checkbox checked={value.offer} onChange={(offer) => onChange({ ...value, offer })}>
          Принимаю условия <LegalLink path="/legal/offer" title="оферты" size={14} /> и <LegalLink path="/legal/delivery" title="доставки" size={14} />
        </Checkbox>
      ) : null}
      <Checkbox checked={value.data} onChange={(data) => onChange({ ...value, data })}>
        Даю <LegalLink path="/legal/consent" title="согласие на обработку персональных данных" size={14} /> на условиях <LegalLink path="/legal/privacy" title="политики" size={14} />
      </Checkbox>
      <Checkbox checked={value.ads} onChange={(ads) => onChange({ ...value, ads })}>
        Хочу получать акции и новости (необязательно)
      </Checkbox>
    </View>
  );
}

/** The boxes that must be ticked before the customer may go on. */
export function agreed(value: Agreements, withOffer?: boolean): boolean {
  return value.data && (!withOffer || value.offer);
}
