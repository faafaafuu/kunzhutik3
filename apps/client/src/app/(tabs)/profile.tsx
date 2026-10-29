// Profile («Мои данные»): name and e-mail, the ways to sign in, the account sections, sign out. Guests see the sign-in offer.

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";

import { api, ApiError } from "@/api/client";
import type { Customer } from "@/api/types";
import { ScreenHeader } from "@/components/Chrome";
import { Icon, type IconName } from "@/components/Icon";
import { toast } from "@/components/Toast";
import { Button, Field, Muted, Panel, Shell, StateView, T, Title } from "@/components/ui";
import { useShared } from "@/hooks/data";
import { signOut as endSession } from "@/lib/auth";
import { useSession } from "@/store/session";
import { radius, useTheme } from "@/theme";

export default function ProfileScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const session = useSession();
  const config = useShared((state) => state.config);
  const customer = session.customer;
  const [name, setName] = useState(customer?.name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session.tokens) return;
    api<{ customer: Customer }>("/me")
      .then((payload) => {
        session.setCustomer(payload.customer);
        setName(payload.customer.name);
        setEmail(payload.customer.email ?? "");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.tokens?.access_token]);

  const emailValid = !email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const changed = Boolean(customer) && (name.trim() !== customer?.name || email.trim().toLowerCase() !== (customer?.email ?? ""));

  const save = async () => {
    setSaving(true);
    try {
      const payload = await api<{ customer: Customer }>("/me", { method: "PATCH", body: { name, email: email.trim() } });
      session.setCustomer(payload.customer);
      setEmail(payload.customer.email ?? "");
      toast("Сохранили");
    } catch (error) {
      toast((error as ApiError).message, "bad");
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => {
    endSession();
    toast("Вы вышли");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScreenHeader title="Мои данные" />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Shell style={{ gap: 16, paddingTop: 8, maxWidth: 560 }}>
          {!customer ? (
            <Panel>
              <StateView icon="user" title="Вы не вошли" text="Сохраним адреса и историю заказов, начислим бонусы с первого заказа." action={<Button title="Войти" onPress={() => router.push("/login")} />} />
            </Panel>
          ) : (
            <Panel style={{ alignItems: "stretch" }}>
              <View style={{ alignItems: "center", gap: 4, paddingBottom: 4 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                  <T weight="bold" size={28} color={c.brandText}>
                    {(customer.name || customer.email || "Б").trim().charAt(0).toUpperCase()}
                  </T>
                </View>
                <Title size={22} style={{ textAlign: "center" }}>
                  {customer.name || "Без имени"}
                </Title>
                <Muted style={{ textAlign: "center" }}>{[customer.phone_display, customer.email].filter(Boolean).join(" · ") || "Телефон спросим при заказе"}</Muted>
              </View>
              <Field label="Имя" value={name} onChangeText={setName} autoComplete="name" />
              <Field
                label="E-mail"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                error={emailValid ? undefined : "Проверьте e-mail"}
              />
              <Muted size={13}>
                Вход: {[customer.phone ? "по телефону" : null, customer.telegram_linked ? "Telegram" : null, customer.google_linked ? "Google" : null].filter(Boolean).join(", ") || "—"}
              </Muted>
              <Button block title="Сохранить" onPress={save} loading={saving} disabled={!changed || !emailValid} />
            </Panel>
          )}
          <Panel style={{ gap: 0, paddingVertical: 8 }}>
            {customer ? <Item icon="pin" title="Адреса доставки" onPress={() => router.push("/addresses")} /> : null}
            <Item icon="receipt" title="Мои заказы" onPress={() => router.navigate("/orders")} />
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
