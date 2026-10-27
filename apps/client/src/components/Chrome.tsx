// App chrome: the bottom tab bar with the cart bar above it (phones), the top bar (desktop web).

import { usePathname, useRouter } from "expo-router";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useShared } from "@/hooks/data";
import { money, plural } from "@/lib/format";
import { isTelegram } from "@/lib/telegram";
import { linePrice, useCart, useCartCount } from "@/store/cart";
import { usePlace } from "@/store/place";
import { cardShadow, floatShadow, radius, SHELL_MAX, useTheme, useWide } from "@/theme";

import { Icon, type IconName } from "./Icon";
import { T } from "./ui";

export const TABS: { href: string; name: string; title: string; icon: IconName }[] = [
  { href: "/", name: "index", title: "Меню", icon: "menu" },
  { href: "/bonus", name: "bonus", title: "Бонусы", icon: "gift" },
  { href: "/orders", name: "orders", title: "Заказы", icon: "receipt" },
  { href: "/profile", name: "profile", title: "Профиль", icon: "user" },
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
  if (!count) return null;
  return (
    <View style={[{ alignItems: "center", paddingHorizontal: 16, paddingBottom: 10 }, floating && { position: "absolute", left: 0, right: 0, bottom: 16 }]} pointerEvents="box-none">
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
    </View>
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
        <Pressable onPress={() => router.navigate("/")} style={{ flexDirection: "row", alignItems: "center", gap: 10 }} accessibilityRole="link">
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" }}>
            <T weight="bold" size={18} color={c.onBrand}>
              Б
            </T>
          </View>
          <View>
            <T weight="bold" size={16}>
              Брайт
            </T>
            {venue ? (
              <T size={12} color={c.inkSoft}>
                {venue.address}
              </T>
            ) : null}
          </View>
        </Pressable>
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
        {venue ? (
          <View style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.brandSoft }}>
            <T weight="semibold" size={13} color={c.brandText}>
              {venue.is_open && venue.closes_at ? `до ${new Date(venue.closes_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "закрыто"}
            </T>
          </View>
        ) : null}
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
      </View>
    </View>
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
