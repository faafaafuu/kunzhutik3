// A dish in the menu list: photo, title, weight, price and the add button — every row the same height.

import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { thumbUrl } from "@/api/client";
import type { MenuItem } from "@/api/types";
import { money } from "@/lib/format";
import { useCart } from "@/store/cart";
import { radius, useTheme } from "@/theme";

import { Icon } from "./Icon";
import { QtyControl, T } from "./ui";

export const ROW_HEIGHT = 124;
const PHOTO = 100;

export function MenuRow({ item, canOrder }: { item: MenuItem; canOrder: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  const hasModifiers = item.modifier_groups.length > 0;
  const plainLine = useCart((state) => state.lines.find((line) => line.key === item.id));
  const add = useCart((state) => state.add);
  const setQuantity = useCart((state) => state.setQuantity);
  const soldOut = !item.is_available;

  const open = () => router.push({ pathname: "/dish/[slug]", params: { slug: item.slug } });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${money(item.price)}${soldOut ? ", закончилось" : ""}`}
      onPress={open}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        height: ROW_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 12,
        borderRadius: radius.md,
        backgroundColor: hovered ? c.surfaceSunken : c.surfaceCard,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: PHOTO, height: PHOTO, borderRadius: 18, overflow: "hidden", backgroundColor: c.surfaceSunken }}>
        {item.image_url ? (
          <Image source={{ uri: thumbUrl(item.image_url) }} style={{ width: "100%", height: "100%", opacity: soldOut ? 0.45 : 1 }} contentFit="cover" transition={150} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Icon name="menu" size={36} color={c.inkSoft} />
          </View>
        )}
      </View>
      <View style={{ flex: 1, height: PHOTO, justifyContent: "space-between" }}>
        <View style={{ gap: 2 }}>
          <T weight="semibold" size={16} numberOfLines={2} color={soldOut ? c.inkSoft : c.ink} style={{ lineHeight: 20 }}>
            {item.title}
          </T>
          <T size={13} color={c.inkSoft} numberOfLines={1}>
            {soldOut ? "Закончилось" : item.weight || item.description}
          </T>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <T weight="bold" size={17} color={soldOut ? c.inkSoft : c.ink}>
            {money(item.price)}
          </T>
          {soldOut || !canOrder ? null : plainLine && !hasModifiers ? (
            <QtyControl flat small value={plainLine.quantity} onChange={(value) => setQuantity(plainLine.key, value)} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Добавить ${item.title}`}
              onPress={() => (hasModifiers ? open() : add(item))}
              hitSlop={8}
              style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.brandStrong : c.brand })}
            >
              <Icon name="plus" size={18} color={c.onBrand} strokeWidth={2.4} />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}
