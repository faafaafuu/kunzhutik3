// Menu — the main screen: where we deliver, search, categories and dishes.

import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { assetUrl } from "@/api/client";
import type { MenuItem } from "@/api/types";
import { TopBar } from "@/components/Chrome";
import { Icon } from "@/components/Icon";
import { MenuCard } from "@/components/MenuCard";
import { Button, Chip, LinkButton, Muted, Notice, Shell, Skeleton, StateView, T, Title } from "@/components/ui";
import { loadMenu, usePlaceResolution, useShared } from "@/hooks/data";
import { money, time } from "@/lib/format";
import { usePlace } from "@/store/place";
import { cardShadow, fonts, radius, SHELL_MAX, useTheme, useWide } from "@/theme";

const GAP = 16;

export default function MenuScreen() {
  usePlaceResolution();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const { width } = useWindowDimensions();
  const menu = useShared((state) => state.menu);
  const menuError = useShared((state) => state.menuError);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const sectionY = useRef<Record<string, number>>({});
  const listTop = useRef(0);

  const innerWidth = Math.min(width, SHELL_MAX) - 32;
  const columns = wide ? Math.max(3, Math.floor((innerWidth + GAP) / (220 + GAP))) : width >= 600 ? 3 : 2;
  const cardWidth = Math.floor((innerWidth - GAP * (columns - 1)) / columns);

  const venue = menu?.venue ?? null;
  const canOrder = Boolean(venue);
  const search = query.trim().toLowerCase();
  const found = useMemo(() => {
    if (!menu || !search) return [];
    return menu.items.filter((item) => `${item.title} ${item.description} ${item.composition}`.toLowerCase().includes(search));
  }, [menu, search]);

  const sections = useMemo(() => {
    if (!menu) return [];
    return menu.categories.map((category) => ({ category, items: menu.items.filter((item) => item.category_id === category.id) })).filter((section) => section.items.length);
  }, [menu]);

  const jump = (categoryId: string) => {
    setActiveCategory(categoryId);
    const y = sectionY.current[categoryId];
    if (y !== undefined) scroll.current?.scrollTo({ y: listTop.current + y - 8, animated: true });
  };

  const onScroll = (y: number) => {
    let current: string | null = null;
    for (const section of sections) {
      const top = sectionY.current[section.category.id];
      if (top !== undefined && listTop.current + top - 120 <= y) current = section.category.id;
    }
    if (current && current !== activeCategory) setActiveCategory(current);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: wide ? 0 : insets.top }}>
      <TopBar />
      <ScrollView
        ref={scroll}
        stickyHeaderIndices={search ? undefined : [2]}
        onScroll={(event) => onScroll(event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={64}
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >
        {wide && venue ? <Hero /> : <View />}
        <Shell style={{ gap: 12, paddingTop: 12 }}>
          <PlaceBar />
          <SearchField value={query} onChange={setQuery} />
        </Shell>
        {search || !menu ? (
          <View />
        ) : (
          <View style={{ backgroundColor: c.surface, paddingVertical: 10 }}>
            <Shell>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {sections.map(({ category }) => {
                  const active = (activeCategory ?? sections[0]?.category.id) === category.id;
                  return (
                    <Pressable
                      key={category.id}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      onPress={() => jump(category.id)}
                      style={{ paddingVertical: 11, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: active ? c.brand : c.surfaceCard }}
                    >
                      <T weight="semibold" color={active ? c.onBrand : c.ink}>
                        {category.title}
                      </T>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Shell>
          </View>
        )}
        <Shell style={{ paddingTop: 8 }}>
          {!menu && menuError ? (
            <StateView icon="refresh" title="Не удалось загрузить меню" text="Проверьте подключение и попробуйте ещё раз." action={<Button title="Повторить" onPress={() => loadMenu(usePlace.getState().venue?.id ?? null)} />} />
          ) : !menu ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
              {Array.from({ length: columns * 2 }).map((_, index) => (
                <Skeleton key={index} style={{ width: cardWidth, aspectRatio: 0.78 }} />
              ))}
            </View>
          ) : search ? (
            found.length ? (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Muted>Найдено {found.length}</Muted>
                  <LinkButton title="Сбросить" onPress={() => setQuery("")} />
                </View>
                <Grid items={found} cardWidth={cardWidth} canOrder={canOrder} />
              </View>
            ) : (
              <StateView icon="search" title="Ничего не нашли" text="Попробуйте другое слово или посмотрите всё меню." action={<Button tone="tonal" title="Всё меню" onPress={() => setQuery("")} />} />
            )
          ) : (
            <View style={{ gap: 28 }} onLayout={(event) => (listTop.current = event.nativeEvent.layout.y)}>
              {sections.map(({ category, items }) => (
                <View key={category.id} style={{ gap: 14 }} onLayout={(event) => (sectionY.current[category.id] = event.nativeEvent.layout.y)}>
                  <Title size={24}>{category.title}</Title>
                  <Grid items={items} cardWidth={cardWidth} canOrder={canOrder} />
                </View>
              ))}
            </View>
          )}
        </Shell>
      </ScrollView>
    </View>
  );
}

function Grid({ items, cardWidth, canOrder }: { items: MenuItem[]; cardWidth: number; canOrder: boolean }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
      {items.map((item) => (
        <MenuCard key={item.id} item={item} width={cardWidth} canOrder={canOrder} />
      ))}
    </View>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { c } = useTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceCard, borderRadius: radius.pill, paddingLeft: 16, paddingRight: 6 }, cardShadow(c)]}>
      <Icon name="search" size={20} color={c.inkSoft} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Поиск по названию и составу"
        placeholderTextColor={c.inkSoft}
        returnKeyType="search"
        accessibilityLabel="Поиск по меню"
        style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 12, fontFamily: fonts.medium, fontSize: 15, color: c.ink, outlineStyle: "none" } as object}
      />
      {value ? (
        <Pressable accessibilityLabel="Очистить" onPress={() => onChange("")} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSunken }}>
          <Icon name="close" size={16} color={c.ink} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** "Доставка · ул. Ленина, 5 ▾ · ~35 мин · открыто до 22:00" and the notices that go with it. */
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
  const label = pickup ? `Самовывоз · ${venue?.address ?? ""}` : address ? `Доставка · ${shortAddress(address.text)}` : "Укажите адрес доставки";
  const meta = pickup
    ? venue
      ? `готовим ~${venue.cook_minutes} мин`
      : ""
    : zone
      ? `~${zone.eta_minutes} мин · доставка ${Number(zone.delivery_fee) ? money(zone.delivery_fee) : "бесплатно"}${zone.free_delivery_from ? `, 0 ₽ от ${money(zone.free_delivery_from)}` : ""}`
      : !address && venue
        ? `или заберите сами на ${venue.address}`
        : "";

  return (
    <View style={{ gap: 10 }}>
      <View style={[{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: c.surfaceCard }, cardShadow(c)]}>
        <Icon name={pickup ? "store" : address ? "truck" : "pin"} size={22} color={c.ink} />
        <Pressable accessibilityRole="button" onPress={() => router.push("/address")} style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
          <T weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
            {label}
          </T>
          <Icon name="down" size={16} color={c.ink} />
        </Pressable>
        {meta ? <Muted size={13}>{meta}</Muted> : null}
        {venue ? <Chip tone="brand" title={venue.is_open ? `открыто до ${time(venue.closes_at)}` : "закрыто"} style={{ marginLeft: "auto" }} /> : null}
      </View>
      {venue && !venue.is_open ? (
        <Notice tone="bad" icon="clock">
          <T weight="bold" color={c.danger} size={14}>
            Сейчас закрыто.
          </T>{" "}
          {venue.opens_at ? `Откроемся ${openLabel(venue.opens_at)} — можно оформить заказ ко времени.` : "Можно оформить заказ ко времени."}
        </Notice>
      ) : null}
      {!pickup && outOfZone ? (
        <View style={{ gap: 8 }}>
          <Notice tone="bad" icon="map">
            <T weight="bold" color={c.danger} size={14}>
              Сюда пока не доставляем.
            </T>{" "}
            {venue ? `Можно забрать заказ самим на ${venue.address}.` : ""}
          </Notice>
          <Button tone="tonal" size="sm" title="Заберу сам" onPress={() => setFulfillment("pickup")} />
        </View>
      ) : null}
      {!pickup && !address && menu ? (
        <Notice tone="info" icon="alert">
          Показываем меню ближайшей точки.{" "}
          <T weight="bold" color={c.info} size={14}>
            Цены и наличие уточним по адресу.
          </T>
        </Notice>
      ) : null}
    </View>
  );
}

function Hero() {
  const { c } = useTheme();
  const router = useRouter();
  const menu = useShared((state) => state.menu);
  const venue = menu?.venue;
  const photos = (menu?.items ?? []).filter((item) => item.image_url && item.badges.length).slice(0, 3);
  return (
    <View style={{ width: "100%", maxWidth: SHELL_MAX, alignSelf: "center", paddingHorizontal: 16, paddingTop: 16 }}>
      <View style={[{ flexDirection: "row", alignItems: "center", gap: 24, padding: 40, borderRadius: radius.lg, backgroundColor: c.surfaceCard, overflow: "hidden" }, cardShadow(c)]}>
        <View style={{ flex: 1, gap: 18 }}>
          {venue ? <Chip tone="brand" title={venue.hours_text} /> : null}
          <T weight="semibold" size={52} style={{ lineHeight: 54, letterSpacing: -1.5, maxWidth: 560 }}>
            заказывай поке и <T weight="semibold" size={52} color={c.brand} style={{ lineHeight: 54 }}>кофе</T> по пути
          </T>
          <T size={17} color={c.inkSoft} style={{ maxWidth: 440 }}>
            Соберите заказ в пару касаний — заберите без очереди{venue ? ` на ${venue.address}` : ""} или ждите доставку.
          </T>
        </View>
        <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-end" }}>
          {photos.map((item, index) => (
            <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/dish/[slug]", params: { slug: item.slug } })} style={[{ width: 150, padding: 10, paddingBottom: 14, borderRadius: radius.lg, backgroundColor: c.surfaceCard, gap: 6, alignItems: "center", transform: [{ rotate: `${[-6, 4, -3][index]}deg` }, { translateY: [0, -20, 10][index] }] }, cardShadow(c)]}>
              <Image source={{ uri: assetUrl(item.image_url) }} style={{ width: "100%", aspectRatio: 1, borderRadius: radius.md }} contentFit="cover" />
              <T weight="semibold" size={14} numberOfLines={1}>
                {item.title}
              </T>
              <Muted size={13}>{money(item.price)}</Muted>
            </Pressable>
          ))}
        </View>
      </View>
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
