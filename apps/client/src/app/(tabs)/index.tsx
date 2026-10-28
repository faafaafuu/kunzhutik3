// Menu — the main screen: where we deliver, categories (with search) and the dishes as a list.

import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, Pressable, ScrollView, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MenuItem } from "@/api/types";
import { MobileHeader, TopBar } from "@/components/Chrome";
import { Icon } from "@/components/Icon";
import { LegalFooter } from "@/components/Legal";
import { MenuRow, ROW_HEIGHT } from "@/components/MenuRow";
import { Promotions } from "@/components/Promotions";
import { Button, Muted, Notice, Shell, Skeleton, StateView, T, Title } from "@/components/ui";
import { loadMenu, usePlaceResolution, useShared } from "@/hooks/data";
import { money, time } from "@/lib/format";
import { usePlace } from "@/store/place";
import { fonts, radius, SHELL_MAX, useTheme, useWide } from "@/theme";

const GAP = 10;
const SECTION_GAP = 28;
const LIST_PADDING = 8;
const STRIP_HEIGHT = 56;

export default function MenuScreen() {
  usePlaceResolution();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const { width } = useWindowDimensions();
  const menu = useShared((state) => state.menu);
  const menuError = useShared((state) => state.menuError);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  // On the web onLayout fires only when a view's size changes, not when it moves, so positions
  // go stale once something above grows (the menu arrives, a notice appears). Offsets are therefore
  // summed from heights: the address block, then the sections before this one.
  // The category strip is skipped twice over: the list starts below it, and when it sticks it covers
  // exactly its own height, so a section's scroll target does not depend on it.
  const sectionHeight = useRef<Record<string, number>>({});
  const headHeight = useRef(0);

  // Two equal columns of rows on the desktop, one on phones.
  const innerWidth = Math.min(width, SHELL_MAX) - 32;
  const columns = wide ? 2 : 1;
  const rowWidth = Math.floor((innerWidth - GAP * (columns - 1)) / columns);

  const venue = menu?.venue ?? null;
  const canOrder = Boolean(venue);
  const search = searching ? query.trim().toLowerCase() : "";
  const found = useMemo(() => {
    if (!menu || !search) return [];
    return menu.items.filter((item) => `${item.title} ${item.description} ${item.composition}`.toLowerCase().includes(search));
  }, [menu, search]);

  const sections = useMemo(() => {
    if (!menu) return [];
    return menu.categories.map((category) => ({ category, items: menu.items.filter((item) => item.category_id === category.id) })).filter((section) => section.items.length);
  }, [menu]);

  const sectionTop = (categoryId: string) => {
    let y = headHeight.current + LIST_PADDING;
    for (const { category } of sections) {
      if (category.id === categoryId) return y;
      const height = sectionHeight.current[category.id];
      if (height === undefined) return undefined;
      y += height + SECTION_GAP;
    }
    return undefined;
  };

  const jump = (categoryId: string) => {
    setActiveCategory(categoryId);
    const y = sectionTop(categoryId);
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

  const onScroll = (y: number) => {
    if (search) return;
    let current: string | null = null;
    for (const section of sections) {
      const top = sectionTop(section.category.id);
      if (top !== undefined && top - 24 <= y) current = section.category.id;
    }
    if (current && current !== activeCategory) setActiveCategory(current);
  };

  const closeSearch = () => {
    setQuery("");
    setSearching(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: wide ? 0 : insets.top }}>
      <TopBar />
      <MobileHeader />
      <ScrollView
        ref={scroll}
        stickyHeaderIndices={[1]}
        onScroll={(event) => onScroll(event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={64}
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >
        <View onLayout={(event: LayoutChangeEvent) => (headHeight.current = event.nativeEvent.layout.height)}>
          <Shell style={{ paddingTop: wide ? 20 : 4, gap: 12 }}>
            <PlaceBar />
            <Promotions />
          </Shell>
        </View>
        <View style={{ backgroundColor: c.surface, height: STRIP_HEIGHT, justifyContent: "center" }}>
          <Shell>
            {searching ? (
              <SearchField value={query} onChange={setQuery} onClose={closeSearch} />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Поиск по меню"
                  onPress={() => setSearching(true)}
                  style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.line : c.surfaceCard })}
                >
                  <Icon name="search" size={20} color={c.ink} />
                </Pressable>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flex: 1 }}>
                  {sections.map(({ category }) => {
                    const active = (activeCategory ?? sections[0]?.category.id) === category.id;
                    return (
                      <Pressable
                        key={category.id}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        onPress={() => jump(category.id)}
                        style={{ height: 40, justifyContent: "center", paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: active ? c.ink : c.surfaceCard }}
                      >
                        <T weight="semibold" size={14} color={active ? c.surfaceCard : c.ink}>
                          {category.title}
                        </T>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </Shell>
        </View>
        <Shell style={{ paddingTop: LIST_PADDING }}>
          {!menu && menuError ? (
            <StateView icon="refresh" title="Не удалось загрузить меню" text="Проверьте подключение и попробуйте ещё раз." action={<Button title="Повторить" onPress={() => loadMenu(usePlace.getState().venue?.id ?? null)} />} />
          ) : !menu ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
              {Array.from({ length: columns * 5 }).map((_, index) => (
                <Skeleton key={index} style={{ width: rowWidth, height: ROW_HEIGHT }} />
              ))}
            </View>
          ) : search ? (
            found.length ? (
              <View style={{ gap: 12 }}>
                <Muted>Найдено: {found.length}</Muted>
                <Rows items={found} rowWidth={rowWidth} canOrder={canOrder} />
              </View>
            ) : (
              <StateView icon="search" title="Ничего не нашли" text="Попробуйте другое слово или посмотрите всё меню." action={<Button tone="tonal" title="Всё меню" onPress={closeSearch} />} />
            )
          ) : (
            <View style={{ gap: SECTION_GAP }}>
              {sections.map(({ category, items }) => (
                <View key={category.id} style={{ gap: 12 }} onLayout={(event) => (sectionHeight.current[category.id] = event.nativeEvent.layout.height)}>
                  <Title size={22}>{category.title}</Title>
                  <Rows items={items} rowWidth={rowWidth} canOrder={canOrder} />
                </View>
              ))}
            </View>
          )}
          <LegalFooter />
        </Shell>
      </ScrollView>
    </View>
  );
}

function Rows({ items, rowWidth, canOrder }: { items: MenuItem[]; rowWidth: number; canOrder: boolean }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
      {items.map((item) => (
        <View key={item.id} style={{ width: rowWidth }}>
          <MenuRow item={item} canOrder={canOrder} />
        </View>
      ))}
    </View>
  );
}

function SearchField({ value, onChange, onClose }: { value: string; onChange: (value: string) => void; onClose: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ height: 40, flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceCard, borderRadius: radius.pill, paddingLeft: 14, paddingRight: 4 }}>
      <Icon name="search" size={18} color={c.inkSoft} />
      <TextInput
        value={value}
        onChangeText={onChange}
        autoFocus
        placeholder="Поиск по названию и составу"
        placeholderTextColor={c.inkSoft}
        returnKeyType="search"
        accessibilityLabel="Поиск по меню"
        style={{ flex: 1, height: 40, paddingHorizontal: 10, fontFamily: fonts.medium, fontSize: 15, color: c.ink, outlineStyle: "none" } as object}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Закрыть поиск" onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSunken }}>
        <Icon name="close" size={16} color={c.ink} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

/** One card: how we deliver and where, the time and the price; notices only when something is wrong. */
function PlaceBar() {
  const { c } = useTheme();
  const router = useRouter();
  const fulfillment = usePlace((state) => state.fulfillment);
  const address = usePlace((state) => state.address);
  const zone = usePlace((state) => state.zone);
  const outOfZone = usePlace((state) => state.outOfZone);
  const setFulfillment = usePlace((state) => state.setFulfillment);
  const menu = useShared((state) => state.menu);
  const venue = menu?.venue ?? null;

  const pickup = fulfillment === "pickup";
  const label = pickup ? `Самовывоз · ${venue?.address ?? ""}` : address ? shortAddress(address.text) : "Укажите адрес доставки";
  const hours = venue ? (venue.is_open ? `открыто до ${time(venue.closes_at)}` : "сейчас закрыто") : "";
  const meta = pickup
    ? [venue ? `готовим ~${venue.cook_minutes} мин` : "", hours].filter(Boolean).join(" · ")
    : zone
      ? `~${zone.eta_minutes} мин · доставка ${Number(zone.delivery_fee) ? money(zone.delivery_fee) : "бесплатно"}`
      : [hours, venue ? "или самовывоз" : ""].filter(Boolean).join(" · ");

  return (
    <View style={{ gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/address")}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: pressed ? c.surfaceSunken : c.surfaceCard })}
      >
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name={pickup ? "store" : address ? "truck" : "pin"} size={22} color={c.brandText} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="semibold" numberOfLines={1}>
            {label}
          </T>
          {meta ? (
            <Muted size={13} numberOfLines={1}>
              {meta}
            </Muted>
          ) : null}
        </View>
        <Icon name="right" size={18} color={c.inkSoft} />
      </Pressable>
      {venue && !venue.is_open ? (
        <Notice tone="bad" icon="clock">
          {venue.opens_at ? `Сейчас закрыто. Откроемся ${openLabel(venue.opens_at)} — можно заказать ко времени.` : "Сейчас закрыто — можно заказать ко времени."}
        </Notice>
      ) : null}
      {!pickup && outOfZone ? (
        <View style={{ gap: 8 }}>
          <Notice tone="bad" icon="map">
            Сюда пока не доставляем.{venue ? ` Можно забрать заказ на ${venue.address}.` : ""}
          </Notice>
          <Button block tone="tonal" title="Заберу сам" onPress={() => setFulfillment("pickup")} />
        </View>
      ) : null}
    </View>
  );
}

function shortAddress(text: string): string {
  // "Солнечногорск, улица Ленина, 5" → "улица Ленина, 5"
  const parts = text.split(",").map((part) => part.trim());
  return parts.length > 2 ? parts.slice(1).join(", ") : text;
}

function openLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const hm = time(iso);
  if (date.toDateString() === today.toDateString()) return `сегодня в ${hm}`;
  if (date.toDateString() === tomorrow.toDateString()) return `завтра в ${hm}`;
  return `${date.toLocaleDateString("ru-RU", { weekday: "long" })} в ${hm}`;
}
