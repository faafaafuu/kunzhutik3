// Profile: name, addresses, notifications, sign out. Guests see the sign-in offer.

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError } from "@/api/client";
import type { Customer } from "@/api/types";
import { TopBar } from "@/components/Chrome";
import { Icon, type IconName } from "@/components/Icon";
import { toast } from "@/components/Toast";
import { Button, Field, Muted, Panel, Shell, StateView, T, Title } from "@/components/ui";
import { useShared } from "@/hooks/data";
import { useSession } from "@/store/session";
import { radius, useTheme, useWide } from "@/theme";

export default function ProfileScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const session = useSession();
  const config = useShared((state) => state.config);
  const customer = session.customer;
  const [name, setName] = useState(customer?.name ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session.tokens) return;
    api<{ customer: Customer }>("/me")
      .then((payload) => {
        session.setCustomer(payload.customer);
        setName(payload.customer.name);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.tokens?.access_token]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = await api<{ customer: Customer }>("/me", { method: "PATCH", body: { name } });
      session.setCustomer(payload.customer);
      toast("Сохранили");
    } catch (error) {
      toast((error as ApiError).message, "bad");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    const refresh = session.tokens?.refresh_token;
    session.signOut();
    if (refresh) api("/auth/logout", { method: "POST", body: { refresh_token: refresh }, auth: false }).catch(() => {});
    toast("Вы вышли");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: wide ? 0 : insets.top }}>
      <TopBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Shell style={{ gap: 16, paddingTop: 20, maxWidth: 760 }}>
          <Title>Профиль</Title>
          {!customer ? (
            <Panel>
              <StateView icon="user" title="Войдите по телефону" text="Сохраним адреса и историю заказов, начислим бонусы с первого заказа." action={<Button title="Войти" onPress={() => router.push("/login")} />} />
            </Panel>
          ) : (
            <Panel>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Field label="Имя" value={name} onChangeText={setName} style={{ flex: 1, minWidth: 180 }} />
                <Field label="Телефон" value={customer.phone_display || "не указан"} editable={false} style={{ flex: 1, minWidth: 180, opacity: 0.7 }} />
              </View>
              <Muted size={13}>Телефон меняется только через вход с новым номером.</Muted>
              <Button title="Сохранить" onPress={save} loading={saving} disabled={name.trim() === customer.name} />
            </Panel>
          )}
          <Panel style={{ gap: 0, paddingVertical: 8 }}>
            {customer ? <Item icon="pin" title="Адреса" onPress={() => router.push("/addresses")} /> : null}
            <Item icon="receipt" title="Заказы" onPress={() => router.navigate("/orders")} />
            <Item icon="gift" title="Бонусы" onPress={() => router.navigate("/bonus")} />
            {customer ? <Item icon="bell" title="Уведомления" onPress={() => router.push("/notifications")} /> : null}
            {config?.support_phone ? <Item icon="phone" title={`Поддержка · ${config.support_phone}`} onPress={() => Linking.openURL(`tel:${config.support_phone.replace(/[^+\d]/g, "")}`)} /> : null}
            {customer ? <Item icon="logout" title="Выйти" onPress={signOut} last /> : null}
          </Panel>
        </Shell>
      </ScrollView>
    </View>
  );
}

function Item({ icon, title, onPress, last }: { icon: IconName; title: string; onPress: () => void; last?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={20} color={c.brandText} />
      </View>
      <T weight="semibold" style={{ flex: 1 }}>
        {title}
      </T>
      <Icon name="right" size={18} color={c.inkSoft} />
    </Pressable>
  );
}
