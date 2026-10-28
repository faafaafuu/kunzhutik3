// «Акции» on the home screen: equal cards in a row; a tap applies a promo code, opens «Приведи друга» or sign-in.

import { useRouter } from "expo-router";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";

import type { Promotion } from "@/api/types";
import { useFetch } from "@/hooks/data";
import { useCart } from "@/store/cart";
import { useSession } from "@/store/session";
import { radius, SHELL_MAX, useTheme, useWide } from "@/theme";

import { Icon } from "./Icon";
import { toast } from "./Toast";
import { T } from "./ui";

const GAP = 10;
const HEIGHT = 116;

export function Promotions() {
  const { c } = useTheme();
  const router = useRouter();
  const wide = useWide();
  const { width } = useWindowDimensions();
  const signedIn = useSession((state) => Boolean(state.tokens));
  const { data } = useFetch<{ promotions: Promotion[] }>("/promotions");
  const promotions = data?.promotions ?? [];
  if (!promotions.length) return null;

  const inner = Math.min(width, SHELL_MAX) - 32;
  // Desktop: up to three equal cards side by side. Phone: one card and the edge of the next, scrolled sideways.
  const cardWidth = wide ? Math.floor((inner - GAP * (Math.min(3, promotions.length) - 1)) / Math.min(3, promotions.length)) : promotions.length === 1 ? inner : Math.round(inner * 0.82);

  const palette = {
    brand: { bg: c.brand, fg: c.onBrand, soft: "rgba(255,255,255,0.85)" },
    sesame: { bg: c.sesameSoft, fg: c.sesameText, soft: c.inkSoft },
    good: { bg: c.successSoft, fg: c.success, soft: c.inkSoft },
    info: { bg: c.infoSoft, fg: c.info, soft: c.inkSoft },
  };

  const onPress = (promotion: Promotion) => {
    if (promotion.action === "promo" && promotion.promo_code) {
      useCart.getState().setPromo(promotion.promo_code);
      toast(`Промокод ${promotion.promo_code} применится в корзине`);
    } else if (promotion.action === "referral") router.push("/bonus");
    else if (promotion.action === "welcome") router.push(signedIn ? "/bonus" : "/login");
  };

  const cards = promotions.map((promotion) => {
    const colors = palette[promotion.accent] ?? palette.brand;
    const tappable = promotion.action !== "none";
    return (
      <Pressable
        key={promotion.id}
        accessibilityRole={tappable ? "button" : undefined}
        disabled={!tappable}
        onPress={() => onPress(promotion)}
        style={({ pressed }) => ({ width: cardWidth, height: HEIGHT, padding: 16, borderRadius: radius.md, backgroundColor: colors.bg, justifyContent: "space-between", opacity: pressed ? 0.85 : 1 })}
      >
        <View style={{ gap: 4 }}>
          <T weight="bold" size={17} color={colors.fg} numberOfLines={1}>
            {promotion.title}
          </T>
          <T size={13} color={colors.soft} numberOfLines={2} style={{ lineHeight: 17 }}>
            {promotion.text}
          </T>
        </View>
        {tappable ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <T weight="semibold" size={13} color={colors.fg}>
              {promotion.action === "promo" ? `Применить ${promotion.promo_code}` : promotion.action === "referral" ? "Пригласить" : signedIn ? "Мои бонусы" : "Получить"}
            </T>
            <Icon name="right" size={14} color={colors.fg} strokeWidth={2.2} />
          </View>
        ) : null}
      </Pressable>
    );
  });

  if (wide) return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>{cards}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + GAP} decelerationRate="fast" contentContainerStyle={{ gap: GAP }} style={{ marginHorizontal: -16 }}>
      <View style={{ width: 16 - GAP }} />
      {cards}
      <View style={{ width: 16 - GAP }} />
    </ScrollView>
  );
}
