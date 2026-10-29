// The personal-account dropdown under the round button in the header: who is signed in, the sections of the
// account and sign-out. A Modal so it floats over every screen and closes on a tap outside.

import { useRouter } from "expo-router";
import { Modal, Pressable, View } from "react-native";

import { Icon, type IconName } from "@/components/Icon";
import { toast } from "@/components/Toast";
import { Muted, T } from "@/components/ui";
import { signOut } from "@/lib/auth";
import { useSession } from "@/store/session";
import { cardShadow, radius, useTheme } from "@/theme";

export type Anchor = { top: number; right: number };

type Entry = { icon: IconName; title: string; href: string };

const ENTRIES: Entry[] = [
  { icon: "receipt", title: "Мои заказы", href: "/orders" },
  { icon: "user", title: "Мои данные", href: "/profile" },
  { icon: "pin", title: "Адреса доставки", href: "/addresses" },
  { icon: "gift", title: "Бонусы", href: "/bonus" },
  { icon: "bell", title: "Уведомления", href: "/notifications" },
];

export function AccountMenu({ anchor, onClose }: { anchor: Anchor | null; onClose: () => void }) {
  const { c } = useTheme();
  const router = useRouter();
  const customer = useSession((state) => state.customer);
  if (!anchor || !customer) return null;

  const open = (href: string) => {
    onClose();
    router.navigate(href as never);
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Закрыть меню" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(20, 14, 8, 0.18)" }}>
        <Pressable
          // Taps inside the card must not reach the backdrop.
          onPress={() => {}}
          style={[{ position: "absolute", top: anchor.top, right: anchor.right, width: 280, borderRadius: radius.lg, backgroundColor: c.surfaceCard, paddingVertical: 8 }, cardShadow(c)]}
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <T weight="bold" size={16} numberOfLines={1}>
              {customer.name || "Без имени"}
            </T>
            <Muted size={13} numberOfLines={1}>
              {customer.phone_display || customer.email || "Телефон спросим при заказе"}
            </Muted>
          </View>
          {ENTRIES.map((entry) => (
            <Row key={entry.href} icon={entry.icon} title={entry.title} onPress={() => open(entry.href)} />
          ))}
          <View style={{ height: 1, backgroundColor: c.line, marginVertical: 4 }} />
          <Row
            icon="logout"
            title="Выйти"
            danger
            onPress={() => {
              onClose();
              signOut();
              toast("Вы вышли");
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ icon, title, onPress, danger }: { icon: IconName; title: string; onPress: () => void; danger?: boolean }) {
  const { c } = useTheme();
  const color = danger ? c.danger : c.ink;
  return (
    <Pressable
      accessibilityRole="menuitem"
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 11,
        paddingHorizontal: 16,
        backgroundColor: pressed || hovered ? c.surfaceSunken : "transparent",
      })}
    >
      <Icon name={icon} size={20} color={danger ? c.danger : c.brandText} />
      <T weight="semibold" color={color}>
        {title}
      </T>
    </Pressable>
  );
}
