// Dish: photo on top, then the description, choices and ingredient tiles; the price follows the choice.

import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, assetUrl } from "@/api/client";
import type { MenuItem, ModifierGroup, ModifierOption } from "@/api/types";
import { Icon, ingredientIcon } from "@/components/Icon";
import { Button, Muted, QtyControl, StateView, T, Title } from "@/components/ui";
import { useShared } from "@/hooks/data";
import { bonusWord, money } from "@/lib/format";
import { type CartModifier, useCart } from "@/store/cart";
import { floatShadow, radius, useTheme } from "@/theme";
import * as haptics from "@/lib/haptics";

const TILE_GAP = 8;

export default function DishScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
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
        <View style={{ flex: 1, justifyContent: "center" }}>
          <StateView icon="search" title="Здесь ничего нет" text="Возможно, блюдо убрали из меню." action={<Button title="В меню" onPress={() => router.replace("/")} />} />
        </View>
      </Frame>
    );
  }
  return <Frame onClose={close}>{item ? <Dish item={item} onDone={close} /> : null}</Frame>;
}

/** Centered dialog over a scrim on the desktop web, full screen on phones. */
function Frame({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const { c } = useTheme();
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== "web" || width < 600) return <View style={{ flex: 1, backgroundColor: c.surfaceCard }}>{children}</View>;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Pressable accessibilityLabel="Закрыть" onPress={onClose} style={{ position: "absolute", inset: 0, backgroundColor: c.scrim } as object} />
      <View style={[{ width: Math.min(520, width - 32), height: Math.min(height - 32, 860), borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surfaceCard }, floatShadow()]}>{children}</View>
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
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  // Set when "Убрать ингредиенты" unfolds: the tiles appear below the fold, so scroll down to them once laid out.
  const followEnd = useRef(false);

  const groups = item.modifier_groups;
  const options = useMemo(() => new Map(groups.flatMap((group) => group.options.map((option) => [option.id, { option, group }] as const))), [groups]);
  const missingGroup = groups.find((group) => group.required && !group.options.some((option) => picked[option.id]));
  const unit = Number(item.price) + Object.entries(picked).reduce((sum, [id, qty]) => sum + Number(options.get(id)?.option.price_delta ?? 0) * qty, 0);
  const total = unit * quantity;
  const percent = config?.bonus.levels[0]?.percent ?? 0;
  const bonus = Math.floor((total * percent) / 100);
  const soldOut = !item.is_available;
  const phoneTop = Platform.OS === "web" ? 12 : insets.top + 8;

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
    haptics.success();
    onDone();
  };

  const meta = [item.weight, item.cook_minutes ? `готовим ~${item.cook_minutes} мин` : "", bonus > 0 && !soldOut ? `+${bonus} ${bonusWord(bonus)}` : ""].filter(Boolean).join(" · ");

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (!followEnd.current) return;
          followEnd.current = false;
          scroll.current?.scrollToEnd({ animated: true });
        }}
      >
        <View style={{ width: "100%", aspectRatio: 1, maxHeight: 520, backgroundColor: c.surfaceSunken }}>
          {item.image_url ? <Image source={{ uri: assetUrl(item.image_url) }} style={{ width: "100%", height: "100%", opacity: soldOut ? 0.6 : 1 }} contentFit="cover" transition={200} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={onDone}
            style={{ position: "absolute", top: phoneTop, left: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceCard, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="close" size={18} color={c.ink} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 24 }}>
          <View style={{ gap: 6 }}>
            <Title size={24}>{item.title}</Title>
            {meta ? <Muted>{meta}</Muted> : null}
            {item.description ? <T color={c.ink} style={{ marginTop: 6 }}>{item.description}</T> : null}
            {item.composition ? (
              <Muted size={13} style={{ marginTop: 4 }}>
                Состав: {item.composition}
              </Muted>
            ) : null}
          </View>
          {soldOut ? (
            <View style={{ padding: 14, borderRadius: radius.sm, backgroundColor: c.surfaceSunken, alignItems: "center" }}>
              <T weight="semibold">Закончилось — загляните позже</T>
            </View>
          ) : (
            // "Убрать" goes last and folded: a stray tap must not take an ingredient out.
            [...groups].sort((a, b) => Number(a.kind === "remove") - Number(b.kind === "remove")).map((group) => (
              <GroupBlock
                key={group.id}
                group={group}
                picked={picked}
                missing={missingGroup?.id === group.id}
                onChoice={(option) => toggleChoice(group, option)}
                onRemove={toggleRemove}
                onAddon={setAddon}
                onUnfold={() => (followEnd.current = true)}
              />
            ))
          )}
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surfaceCard }}>
        {!soldOut ? <QtyControl flat value={quantity} onChange={(value) => setQuantity(Math.max(1, value))} max={20} /> : null}
        <Pressable
          accessibilityRole="button"
          disabled={soldOut || Boolean(missingGroup)}
          onPress={submit}
          style={({ pressed }) => ({ flex: 1, height: 54, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: pressed ? c.brandStrong : c.brand, opacity: soldOut || missingGroup ? 0.5 : 1 })}
        >
          <T weight="semibold" size={17} color={c.onBrand}>
            {soldOut ? "Закончилось" : missingGroup ? `Выберите: ${missingGroup.title.toLowerCase()}` : `Добавить · ${money(total)}`}
          </T>
        </Pressable>
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
  onUnfold,
}: {
  group: ModifierGroup;
  picked: Picked;
  missing: boolean;
  onChoice: (option: ModifierOption) => void;
  onRemove: (option: ModifierOption) => void;
  onAddon: (option: ModifierOption, qty: number) => void;
  onUnfold: () => void;
}) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const [open, setOpen] = useState(false);
  // Equal tiles: as many columns as options up to three, four go 2×2, and a short last row is centred.
  const count = group.options.length;
  const columns = count <= 3 ? count : count === 4 ? 2 : 3;
  const tile = width ? Math.floor((width - TILE_GAP * (columns - 1)) / columns) : 0;
  const hint = group.kind === "choice" ? (group.required ? (missing ? "выберите один" : "обязательно") : "по желанию") : "можно несколько";

  if (group.kind === "remove") {
    const removed = group.options.filter((option) => picked[option.id]).map((option) => option.title);
    return (
      <View style={{ gap: 12 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => {
            if (!open) onUnfold();
            setOpen(!open);
          }}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.sm, borderWidth: 1.5, borderColor: removed.length ? c.danger : c.line, backgroundColor: pressed ? c.surfaceSunken : c.surfaceCard })}
        >
          <View style={{ flex: 1 }}>
            <T weight="semibold">Убрать ингредиенты</T>
            <T size={13} color={removed.length ? c.danger : c.inkSoft} numberOfLines={2}>
              {removed.length ? removed.map((title, index) => (index ? title.toLowerCase() : title)).join(", ") : "по желанию"}
            </T>
          </View>
          <Icon name={open ? "up" : "down"} size={20} color={c.inkSoft} />
        </Pressable>
        {open ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: TILE_GAP }}>
            {group.options.map((option) => (
              <RemoveTile key={option.id} option={option} width={tile} removed={Boolean(picked[option.id])} onPress={() => onRemove(option)} />
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <T weight="bold" size={18}>
          {group.title}
        </T>
        <T size={13} color={missing ? c.brandText : c.inkSoft}>
          {hint}
        </T>
      </View>
      {group.kind === "choice" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: TILE_GAP }}>
          {group.options.map((option) => {
            const on = Boolean(picked[option.id]);
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => onChoice(option)}
                style={{ width: tile || undefined, minHeight: 52, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1.5, borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brandSoft : c.surfaceCard }}
              >
                <T weight="semibold" size={14} color={on ? c.brandText : c.ink} style={{ textAlign: "center" }} numberOfLines={2}>
                  {option.title}
                </T>
                {Number(option.price_delta) ? (
                  <T size={12} color={c.inkSoft}>
                    +{money(option.price_delta)}
                  </T>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: TILE_GAP }}>
          {group.options.map((option) => (
            <AddonTile key={option.id} option={option} width={tile} qty={picked[option.id] ?? 0} max={group.max_quantity} onChange={(qty) => onAddon(option, qty)} />
          ))}
        </View>
      )}
    </View>
  );
}

/** "Без лука": the ingredient's icon; tapped — crossed out and red. */
function RemoveTile({ option, width, removed, onPress }: { option: ModifierOption; width: number; removed: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: removed }}
      onPress={onPress}
      style={{ width: width || undefined, height: 116, alignItems: "center", justifyContent: "center", gap: 8, padding: 8, borderRadius: radius.sm, borderWidth: 1.5, borderColor: removed ? c.danger : c.line, backgroundColor: removed ? c.dangerSoft : c.surfaceCard }}
    >
      <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: removed ? c.surfaceCard : c.surfaceSunken }}>
        <Icon name={ingredientIcon(option.title)} size={26} color={removed ? c.danger : c.ink} />
        {removed ? <View style={{ position: "absolute", width: 40, height: 2, borderRadius: 1, backgroundColor: c.danger, transform: [{ rotate: "-45deg" }] }} /> : null}
      </View>
      <T weight="semibold" size={13} color={removed ? c.danger : c.ink} style={{ textAlign: "center", lineHeight: 16 }} numberOfLines={2}>
        {option.title}
      </T>
    </Pressable>
  );
}

/** "Авокадо +120 ₽": the ingredient's icon, then a quantity control once added. */
function AddonTile({ option, width, qty, max, onChange }: { option: ModifierOption; width: number; qty: number; max: number; onChange: (qty: number) => void }) {
  const { c } = useTheme();
  const on = qty > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${on ? "Добавлено" : "Добавить"} ${option.title}`}
      onPress={() => (on ? null : onChange(1))}
      style={{ width: width || undefined, height: 148, alignItems: "center", justifyContent: "space-between", paddingTop: 12, paddingBottom: 10, paddingHorizontal: 6, borderRadius: radius.sm, borderWidth: 1.5, borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brandSoft : c.surfaceCard }}
    >
      <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.surfaceCard : c.surfaceSunken }}>
        <Icon name={ingredientIcon(option.title)} size={26} color={on ? c.brandText : c.ink} />
      </View>
      <View style={{ alignItems: "center" }}>
        <T weight="semibold" size={13} style={{ textAlign: "center", lineHeight: 16 }} numberOfLines={2}>
          {option.title}
        </T>
        <T size={12} color={c.inkSoft}>
          +{money(option.price_delta)}
        </T>
      </View>
      {on ? (
        <QtyControl small flat value={qty} max={max} onChange={onChange} />
      ) : (
        <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSunken }}>
          <Icon name="plus" size={16} color={c.ink} strokeWidth={2.2} />
        </View>
      )}
    </Pressable>
  );
}

function omit(record: Picked, key: string): Picked {
  const next = { ...record };
  delete next[key];
  return next;
}
