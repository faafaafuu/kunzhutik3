// Dish: photo full screen, modifiers on glass, price that follows the choice.

import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, assetUrl } from "@/api/client";
import type { MenuItem, ModifierGroup, ModifierOption } from "@/api/types";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toast";
import { Button, QtyControl, StateView, T } from "@/components/ui";
import { useShared } from "@/hooks/data";
import { bonusWord, money } from "@/lib/format";
import { type CartModifier, useCart } from "@/store/cart";
import { floatShadow, radius, useTheme } from "@/theme";

export default function DishScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const menu = useShared((state) => state.menu);
  const [item, setItem] = useState<MenuItem | null>(() => menu?.items.find((entry) => entry.slug === slug) ?? null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (item) return;
    api<MenuItem>(`/menu/items/${slug}`, { auth: false })
      .then(setItem)
      .catch(() => setMissing(true));
  }, [item, slug]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (missing) {
    return (
      <Frame onClose={close}>
        <View style={{ flex: 1, justifyContent: "center", backgroundColor: c.surface }}>
          <StateView icon="search" title="Здесь ничего нет" text="Возможно, блюдо убрали из меню." action={<Button title="В меню" onPress={() => router.replace("/")} />} />
        </View>
      </Frame>
    );
  }
  if (!item) return <Frame onClose={close}>{null}</Frame>;
  return (
    <Frame onClose={close}>
      <Dish item={item} onDone={close} />
    </Frame>
  );
}

/** Centered dialog over a scrim on the desktop web, full screen on phones. */
function Frame({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const { c } = useTheme();
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== "web" || width < 600) return <View style={{ flex: 1, backgroundColor: c.brand }}>{children}</View>;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Pressable accessibilityLabel="Закрыть" onPress={onClose} style={{ position: "absolute", inset: 0, backgroundColor: c.scrim } as object} />
      <View style={[{ width: Math.min(540, width - 32), height: Math.min(height - 32, 880), borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.brand }, floatShadow()]}>{children}</View>
    </View>
  );
}

type Picked = Record<string, number>; // option id → quantity

function Dish({ item, onDone }: { item: MenuItem; onDone: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const add = useCart((state) => state.add);
  const config = useShared((state) => state.config);
  const [picked, setPicked] = useState<Picked>({});
  const [quantity, setQuantity] = useState(1);
  const [more, setMore] = useState(false);

  const groups = item.modifier_groups;
  const options = useMemo(() => new Map(groups.flatMap((group) => group.options.map((option) => [option.id, { option, group }] as const))), [groups]);
  const missingGroup = groups.find((group) => group.required && !group.options.some((option) => picked[option.id]));
  const unit = Number(item.price) + Object.entries(picked).reduce((sum, [id, qty]) => sum + Number(options.get(id)?.option.price_delta ?? 0) * qty, 0);
  const total = unit * quantity;
  const percent = config?.bonus.levels[0]?.percent ?? 0;
  const bonus = Math.floor((total * percent) / 100);
  const soldOut = !item.is_available;

  const toggleChoice = (group: ModifierGroup, option: ModifierOption) => {
    setPicked((current) => {
      const next = { ...current };
      const selected = Boolean(next[option.id]);
      for (const other of group.options) delete next[other.id];
      if (!selected || group.required) next[option.id] = 1;
      return next;
    });
  };
  const toggleRemove = (option: ModifierOption) => setPicked((current) => (current[option.id] ? omit(current, option.id) : { ...current, [option.id]: 1 }));
  const setAddon = (option: ModifierOption, qty: number) => setPicked((current) => (qty <= 0 ? omit(current, option.id) : { ...current, [option.id]: qty }));

  const submit = () => {
    const modifiers: CartModifier[] = Object.entries(picked).map(([id, qty]) => {
      const { option, group } = options.get(id)!;
      return { id, title: option.title, kind: group.kind, price: Number(option.price_delta), quantity: qty };
    });
    add(item, modifiers, quantity);
    toast("Добавили в корзину");
    onDone();
  };

  const stats = [
    item.weight ? [item.weight.includes("мл") ? "объём" : "вес", item.weight] : null,
    item.cook_minutes ? ["готовим", `~${item.cook_minutes} мин`] : null,
    bonus > 0 && !soldOut ? [bonusWord(bonus), `+${bonus}`] : null,
  ].filter(Boolean) as [string, string][];

  return (
    <View style={{ flex: 1 }}>
      {item.image_url ? (
        <Image source={{ uri: assetUrl(item.image_url) }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: soldOut ? 0.6 : 1 }} contentFit="cover" />
      ) : null}
      <Veil />
      <View style={{ flex: 1, paddingTop: 16 + (Platform.OS === "web" ? 0 : insets.top), paddingHorizontal: 16, paddingBottom: 16 + insets.bottom, gap: 12 }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={onDone}
            style={{ position: "absolute", left: 0, top: 0, zIndex: 1, width: 44, height: 44, borderRadius: 22, ...glassStyle(c), borderWidth: 1, borderColor: c.glassLine, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="back" size={20} color={c.onBrand} strokeWidth={2} />
          </Pressable>
          <T weight="semibold" size={22} color={c.onBrand} style={{ textAlign: "center", paddingHorizontal: 52, minHeight: 44, lineHeight: 27 }}>
            {item.title}
          </T>
          <View style={{ flexDirection: "row", gap: 22, justifyContent: "center", flexWrap: "wrap" }}>
            {stats.map(([label, value]) => (
              <View key={label} style={{ alignItems: "center" }}>
                <T weight="semibold" color={c.onBrand}>
                  {value}
                </T>
                <T size={12} color={c.onBrand} style={{ opacity: 0.78 }}>
                  {label}
                </T>
              </View>
            ))}
          </View>
          {item.description || item.composition ? (
            <Pressable onPress={() => setMore((value) => !value)} style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.pill, ...glassStyle(c), borderWidth: 1, borderColor: c.glassLine }}>
              <T weight="semibold" size={13} color={c.onBrand}>
                Подробнее {more ? "▴" : "▾"}
              </T>
            </Pressable>
          ) : null}
          {more ? (
            <View style={{ maxWidth: 420, padding: 14, borderRadius: radius.md, backgroundColor: "rgba(20,14,10,0.55)", gap: 8 }}>
              {item.description ? (
                <T size={14} color={c.onBrand}>
                  {item.description}
                </T>
              ) : null}
              {item.composition ? (
                <T size={14} color={c.onBrand}>
                  <T weight="bold" size={14} color={c.onBrand}>
                    Состав:{" "}
                  </T>
                  {item.composition}
                </T>
              ) : null}
            </View>
          ) : null}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", gap: 10 }} showsVerticalScrollIndicator={false}>
          {soldOut ? (
            <View style={{ alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: c.ink }}>
              <T weight="semibold" color={c.surfaceCard}>
                Закончилось — загляните позже
              </T>
            </View>
          ) : (
            groups.map((group) => (
              <GroupBlock
                key={group.id}
                group={group}
                picked={picked}
                missing={missingGroup?.id === group.id}
                onChoice={(option) => toggleChoice(group, option)}
                onRemove={toggleRemove}
                onAddon={setAddon}
              />
            ))
          )}
        </ScrollView>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {!soldOut ? <QtyControl value={quantity} onChange={(value) => setQuantity(Math.max(1, value))} max={20} /> : null}
          <Pressable
            accessibilityRole="button"
            disabled={soldOut || Boolean(missingGroup)}
            onPress={submit}
            style={({ pressed }) => [
              { flex: 1, height: 64, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: pressed ? c.brandStrong : c.brand, opacity: soldOut || missingGroup ? 0.6 : 1 },
              floatShadow(),
            ]}
          >
            {soldOut ? (
              <T weight="semibold" size={18} color={c.onBrand}>
                Закончилось
              </T>
            ) : missingGroup ? (
              <T weight="semibold" size={18} color={c.onBrand}>
                Выберите {missingGroup.title.toLowerCase()}
              </T>
            ) : (
              <>
                <Icon name="plus" size={22} color={c.onBrand} strokeWidth={2.2} />
                <T weight="semibold" size={20} color={c.onBrand}>
                  {money(total)}
                </T>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function GroupBlock({
  group,
  picked,
  missing,
  onChoice,
  onRemove,
  onAddon,
}: {
  group: ModifierGroup;
  picked: Picked;
  missing: boolean;
  onChoice: (option: ModifierOption) => void;
  onRemove: (option: ModifierOption) => void;
  onAddon: (option: ModifierOption, qty: number) => void;
}) {
  const { c } = useTheme();
  if (group.kind === "remove") {
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {group.options.map((option) => {
          const on = Boolean(picked[option.id]);
          return (
            <Pressable
              key={option.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => onRemove(option)}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, ...(on ? { backgroundColor: c.onBrand } : glassStyle(c)), borderWidth: 1, borderColor: on ? "transparent" : c.glassLine }}
            >
              <Icon name="close" size={14} color={on ? c.onTint : c.onBrand} strokeWidth={2.2} />
              <T weight="semibold" size={13} color={on ? c.onTint : c.onBrand}>
                {option.title}
              </T>
            </Pressable>
          );
        })}
      </View>
    );
  }
  if (group.kind === "choice") {
    return (
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <T weight="semibold" color={c.onBrand}>
            {group.title}{" "}
            <T size={12} color={c.onBrand} style={{ opacity: 0.85 }}>
              {group.subtitle}
            </T>
          </T>
          {group.required ? (
            <View style={{ paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: missing ? c.danger : c.glass }}>
              <T weight="semibold" size={12} color={c.onBrand}>
                {missing ? "Выберите" : "Обязательно"}
              </T>
            </View>
          ) : (
            <T size={12} color={c.onBrand} style={{ opacity: 0.85 }}>
              по желанию
            </T>
          )}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {group.options.map((option) => {
            const on = Boolean(picked[option.id]);
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => onChoice(option)}
                style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.pill, ...(on ? { backgroundColor: c.onBrand } : glassStyle(c)), borderWidth: 1, borderColor: on ? "transparent" : c.glassLine }}
              >
                <T weight="semibold" size={13} color={on ? c.onTint : c.onBrand}>
                  {option.title}
                  {Number(option.price_delta) ? ` +${money(option.price_delta)}` : ""}
                </T>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {group.options.map((option) => {
        const qty = picked[option.id] ?? 0;
        const on = qty > 0;
        return (
          <View
            key={option.id}
            style={{
              width: 104,
              minHeight: 148,
              alignItems: "center",
              gap: 3,
              paddingTop: 12,
              paddingBottom: 10,
              paddingHorizontal: 8,
              borderRadius: radius.md,
              ...(on ? { backgroundColor: c.surfaceCard } : glassStyle(c)),
              borderWidth: 1,
              borderColor: on ? "transparent" : c.glassLine,
            }}
          >
            <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.brandSoft : c.glassStrong, marginBottom: 4 }}>
              <Icon name="plus" size={22} color={c.brandText} />
            </View>
            <T weight="semibold" size={13} color={on ? c.ink : c.onBrand} style={{ textAlign: "center", minHeight: 32, lineHeight: 16 }} numberOfLines={2}>
              {option.title}
            </T>
            <T size={12} color={on ? c.inkSoft : c.onBrand}>
              +{money(option.price_delta)}
            </T>
            {on ? (
              <View style={{ marginTop: 4 }}>
                <QtyControl small flat value={qty} max={group.max_quantity} onChange={(value) => onAddon(option, value)} />
              </View>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={`Добавить ${option.title}`} onPress={() => onAddon(option, 1)} hitSlop={8} style={{ marginTop: 6, width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
                <Icon name="plus" size={22} color={c.onBrand} strokeWidth={2.2} />
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Darkens the top and the bottom of the photo so white text stays readable. */
function Veil() {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={["rgba(20,14,10,0.62)", "rgba(20,14,10,0.18)", "rgba(20,14,10,0)", "rgba(20,14,10,0.12)", "rgba(20,14,10,0.72)"]}
      locations={[0, 0.3, 0.44, 0.56, 1]}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
}

/** Frosted glass over the photo: blur on the web; without blur on phones the glass is darker to keep text readable. */
function glassStyle(c: { glass: string }): object {
  return Platform.OS === "web" ? { backgroundColor: c.glass, backdropFilter: "blur(20px)" } : { backgroundColor: "rgba(20,14,10,0.38)" };
}

function omit(record: Picked, key: string): Picked {
  const next = { ...record };
  delete next[key];
  return next;
}
