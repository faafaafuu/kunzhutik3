import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { assetUrl } from "@/api/client";
import type { MenuItem } from "@/api/types";
import { money } from "@/lib/format";
import { useCart } from "@/store/cart";
import { cardShadow, radius, useTheme } from "@/theme";

import { Icon } from "./Icon";
import { QtyControl, T } from "./ui";

export function MenuCard({ item, width, canOrder }: { item: MenuItem; width: number; canOrder: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  const hasModifiers = item.modifier_groups.length > 0;
  const plainKey = item.id;
  const plainLine = useCart((state) => state.lines.find((line) => line.key === plainKey));
  const add = useCart((state) => state.add);
  const setQuantity = useCart((state) => state.setQuantity);
  const soldOut = !item.is_available;

  const open = () => router.push({ pathname: "/dish/[slug]", params: { slug: item.slug } });
  const onAdd = () => (hasModifiers ? open() : add(item));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${money(item.price)}${soldOut ? ", закончилось" : ""}`}
      onPress={open}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        {
          width,
          backgroundColor: c.surfaceCard,
          borderRadius: radius.md,
          overflow: "hidden",
          transform: [{ translateY: hovered && !soldOut ? -3 : 0 }, { scale: pressed ? 0.98 : 1 }],
        },
        cardShadow(c),
      ]}
    >
      <View style={{ width: "100%", aspectRatio: 1, backgroundColor: c.brandSoft }}>
        {item.image_url ? (
          <Image source={{ uri: assetUrl(item.image_url) }} style={{ width: "100%", height: "100%", opacity: soldOut ? 0.55 : 1 }} contentFit="cover" transition={150} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Icon name="menu" size={48} color={c.brandText} />
          </View>
        )}
        {soldOut ? (
          <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.25)" }}>
            <View style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.ink }}>
              <T weight="semibold" size={13} color={c.surfaceCard}>
                Закончилось
              </T>
            </View>
          </View>
        ) : null}
        {item.badges.length ? (
          <View style={{ position: "absolute", left: 10, top: 10, flexDirection: "row", gap: 6 }}>
            {item.badges.map((badge) => (
              <View key={badge} style={[{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: badge === "new" ? c.surfaceCard : c.brand }, badge === "new" && cardShadow(c)]}>
                <T weight="bold" size={12} color={badge === "new" ? c.brandText : c.onBrand}>
                  {badge === "new" ? "Новинка" : "Хит"}
                </T>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, flex: 1 }}>
        <T weight="semibold" size={16} numberOfLines={3} color={soldOut ? c.inkSoft : c.ink} style={{ lineHeight: 20 }}>
          {item.title}
        </T>
        {item.weight ? (
          <T size={13} color={c.inkSoft} style={{ marginTop: 3 }}>
            {item.weight}
          </T>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 12, paddingRight: 12, paddingLeft: 16 }}>
        <T weight="semibold" size={17} color={soldOut ? c.inkSoft : c.ink}>
          {money(item.price)}
        </T>
        {soldOut || !canOrder ? null : plainLine && !hasModifiers ? (
          <QtyControl flat small value={plainLine.quantity} onChange={(value) => setQuantity(plainLine.key, value)} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Добавить ${item.title}`}
            onPress={onAdd}
            hitSlop={6}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed || hovered ? c.brand : c.surfaceSunken,
            })}
          >
            {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => <Icon name="plus" size={20} color={pressed || hovered ? c.onBrand : c.ink} strokeWidth={2.2} />}
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}
