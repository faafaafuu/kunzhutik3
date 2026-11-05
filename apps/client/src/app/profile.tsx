// Profile («Мои данные»): name and e-mail, the ways to sign in, the account sections, sign out, delete the account
// (required by the App Store for any app with sign-up). Guests see the sign-in offer.

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, View } from "react-native";

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

  const [deleting, setDeleting] = useState(false);
  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await api("/me", { method: "DELETE" });
      // The server has already ended every session; this device also forgets the name and phone it offers a guest.
      session.signOut();
      session.rememberGuest("", "");
      toast("Аккаунт удалён");
      router.replace("/");
    } catch (error) {
      toast((error as ApiError).message, "bad");
    } finally {
      setDeleting(false);
    }
  };
  const askToDelete = () =>
    confirmDestructive("Удалить аккаунт?", DELETE_TEXT, "Удалить", () => {
      deleteAccount();
    });

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
            {customer ? <Item icon="logout" title="Выйти" onPress={signOut} /> : null}
            {/* A row of the list, not a small link under it: Apple's review looks for it, and so do people. */}
            {customer ? <Item icon="trash" title={deleting ? "Удаляем…" : "Удалить аккаунт"} onPress={deleting ? () => {} : askToDelete} danger last /> : null}
          </Panel>
        </Shell>
      </ScrollView>
    </View>
  );
}

const DELETE_TEXT =
  "Сотрём телефон, имя, e-mail, адреса и вход через Telegram и Google, а в истории заказов — ваши контакты. Бонусы сгорят. Отменить это нельзя, но войти заново можно в любой момент — это будет новый аккаунт.";

/** The system dialog in the app; the browser's own confirm on the site, where Alert has no buttons. */
function confirmDestructive(title: string, text: string, action: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${text}`)) onConfirm();
    return;
  }
  Alert.alert(title, text, [
    { text: "Отмена", style: "cancel" },
    { text: action, style: "destructive", onPress: onConfirm },
  ]);
}

function Item({ icon, title, onPress, last, danger }: { icon: IconName; title: string; onPress: () => void; last?: boolean; danger?: boolean }) {
  const { c } = useTheme();
  const tint = danger ? c.danger : c.brandText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: danger ? c.dangerSoft : c.brandSoft, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={20} color={tint} />
      </View>
      <T weight="semibold" color={danger ? c.danger : undefined} style={{ flex: 1 }}>
        {title}
      </T>
      <Icon name="right" size={18} color={c.inkSoft} />
    </Pressable>
  );
}
