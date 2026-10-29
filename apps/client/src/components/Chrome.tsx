// App chrome: the bottom tab bar with the cart bar above it (phones), the top bar (desktop web).

import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useShared } from "@/hooks/data";
import { money, plural } from "@/lib/format";
import { isTelegram } from "@/lib/telegram";
import { linePrice, useCart, useCartCount } from "@/store/cart";
import { usePlace } from "@/store/place";
import { useSession } from "@/store/session";
import { cardShadow, floatShadow, radius, SHELL_MAX, useTheme, useWide } from "@/theme";

import { BrandLogo } from "./Brand";
import { Icon, type IconName } from "./Icon";
import { T } from "./ui";

export const TABS: { href: string; name: string; title: string; icon: IconName }[] = [
  { href: "/", name: "index", title: "Меню", icon: "menu" },
  { href: "/bonus", name: "bonus", title: "Бонусы", icon: "gift" },
  { href: "/orders", name: "orders", title: "Заказы", icon: "receipt" },
];

function activeTab(pathname: string): string {
  const tab = TABS.find((item) => item.href !== "/" && pathname.startsWith(item.href));
  return tab ? tab.href : "/";
}

export function BottomBar() {
  const { c } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  if (wide) return null;
  const current = activeTab(pathname);
  return (
    <View>
      <CartBar />
      <View
        style={{
          flexDirection: "row",
          backgroundColor: c.surfaceCard,
          borderTopWidth: 1,
          borderTopColor: c.line,
          paddingBottom: Math.max(insets.bottom, Platform.OS === "web" ? 6 : 8),
          paddingTop: 6,
        }}
        accessibilityRole="tablist"
      >
        {TABS.map((tab) => {
          const active = tab.href === current;
          const color = active ? c.brandText : c.inkSoft;
          return (
            <Pressable
              key={tab.href}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => router.navigate(tab.href as never)}
              style={{ flex: 1, alignItems: "center", gap: 2, paddingVertical: 4 }}
            >
              <Icon name={tab.icon} size={24} color={color} />
              <T weight="semibold" size={11} color={color}>
                {tab.title}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Orange bar with the cart total, floating above the tabs. */
export function CartBar({ floating }: { floating?: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  const count = useCartCount();
  const total = useCart((state) => state.lines.reduce((sum, line) => sum + linePrice(line) * line.quantity, 0));
  // Something was added: the bar itself bounces — the answer to "did it go in?", no message on top of it.
  const bump = useRef(new Animated.Value(1)).current;
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current) {
      Animated.sequence([
        Animated.timing(bump, { toValue: 1.06, duration: 120, useNativeDriver: Platform.OS !== "web" }),
        Animated.spring(bump, { toValue: 1, friction: 4, useNativeDriver: Platform.OS !== "web" }),
      ]).start();
    }
    previous.current = count;
  }, [count, bump]);
  if (!count) return null;
  return (
    <Animated.View style={[{ alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, transform: [{ scale: bump }] }, floating && { position: "absolute", left: 0, right: 0, bottom: 16 }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Корзина, ${count} ${plural(count, "позиция", "позиции", "позиций")}, ${money(total)}`}
        onPress={() => router.push("/cart")}
        style={({ pressed }) => [
          {
            width: "100%",
            maxWidth: 460,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 8,
            paddingRight: 8,
            paddingLeft: 22,
            borderRadius: radius.pill,
            backgroundColor: pressed ? c.brandStrong : c.brand,
          },
          floatShadow(),
        ]}
      >
        <T size={14} color={c.onBrand} style={{ opacity: 0.9 }}>
          {count} {plural(count, "позиция", "позиции", "позиций")}
        </T>
        <T weight="semibold" size={18} color={c.onBrand} style={{ flex: 1, textAlign: "right" }}>
          {money(total)}
        </T>
        <View style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: c.onBrand }}>
          <T weight="semibold" color={c.onTint}>
            Корзина
          </T>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Desktop header from the mockups: brand, sections, hours, cart pill. */
export function TopBar() {
  const { c } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const wide = useWide();
  const count = useCartCount();
  const menuVenue = useShared((state) => state.menu?.venue);
  const venue = usePlace((state) => state.venue) ?? menuVenue;
  if (!wide || isTelegram()) return null;
  const current = activeTab(pathname);
  return (
    <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <View style={{ width: "100%", maxWidth: SHELL_MAX, alignSelf: "center", paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 20 }}>
        <BrandLogo size={18} subtitle={venue?.address} onPress={() => router.navigate("/")} />
        <View style={{ flexDirection: "row", gap: 4, flex: 1, marginLeft: 12 }}>
          {TABS.map((tab) => {
            const active = tab.href === current;
            return (
              <Pressable
                key={tab.href}
                accessibilityRole="link"
                onPress={() => router.navigate(tab.href as never)}
                style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ paddingVertical: 9, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: active ? c.surfaceCard : hovered ? c.surfaceCard : "transparent" })}
              >
                <T weight="semibold" color={active ? c.brandText : c.ink}>
                  {tab.title}
                </T>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть корзину"
          onPress={() => router.push("/cart")}
          style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: pressed ? c.brandStrong : c.brand }, cardShadow(c)]}
        >
          <Icon name="cart" size={20} color={c.onBrand} />
          <T weight="semibold" color={c.onBrand}>
            Корзина
          </T>
          {count ? (
            <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: c.onBrand, alignItems: "center", justifyContent: "center" }}>
              <T weight="bold" size={12} color={c.onTint}>
                {count}
              </T>
            </View>
          ) : null}
        </Pressable>
        <AccountButton />
      </View>
    </View>
  );
}

/** Phone header of the tab screens: the name on the left, sign-in or the profile on the right. */
export function MobileHeader() {
  const { c } = useTheme();
  const router = useRouter();
  const wide = useWide();
  if (wide) return null;
  return (
    <View style={{ width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8, minHeight: 56 }}>
      <BrandLogo size={22} onPress={() => router.navigate("/")} />
      <AccountButton />
    </View>
  );
}

/** Round personal-account button: a person icon for a guest (leads to sign-in), the initial for a signed-in customer (leads to the profile). */
export function AccountButton() {
  const { c } = useTheme();
  const router = useRouter();
  const customer = useSession((state) => (state.tokens ? state.customer : null));
  const initial = customer ? (customer.name || customer.email || "Б").trim().charAt(0).toUpperCase() : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={customer ? "Личный кабинет" : "Войти в личный кабинет"}
      onPress={() => router.push(customer ? "/profile" : "/login")}
      style={({ pressed }) => [
        { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: customer ? c.brandSoft : c.surfaceCard, opacity: pressed ? 0.7 : 1 },
        customer ? null : cardShadow(c),
      ]}
    >
      {initial ? (
        <T weight="bold" size={17} color={c.brandText}>
          {initial}
        </T>
      ) : (
        <Icon name="user" size={22} color={c.ink} />
      )}
    </Pressable>
  );
}

/** Header for stacked screens: back arrow and a title. */
export function ScreenHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: c.surface, paddingTop: insets.top }}>
      <TopBar />
      <View style={{ width: "100%", maxWidth: SHELL_MAX, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceCard, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="back" size={20} color={c.ink} strokeWidth={2} />
        </Pressable>
        <T weight="bold" size={20} numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </T>
      </View>
    </View>
  );
}
