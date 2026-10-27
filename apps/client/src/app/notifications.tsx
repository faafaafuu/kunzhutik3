import { useState } from "react";
import { View } from "react-native";

import { api } from "@/api/client";
import type { Customer } from "@/api/types";
import { ScreenHeader } from "@/components/Chrome";
import { toast } from "@/components/Toast";
import { Muted, Panel, Shell, T, Toggle } from "@/components/ui";
import { useSession } from "@/store/session";
import { useTheme } from "@/theme";

const ROWS: { key: "notify_status" | "notify_bonus" | "notify_promo"; title: string; text: string }[] = [
  { key: "notify_status", title: "Статус заказа", text: "принят, готов, курьер в пути" },
  { key: "notify_bonus", title: "Бонусы и подарки", text: "начисления и сгорание" },
  { key: "notify_promo", title: "Акции", text: "раз в неделю, не чаще" },
];

export default function NotificationsScreen() {
  const { c } = useTheme();
  const customer = useSession((state) => state.customer);
  const setCustomer = useSession((state) => state.setCustomer);
  const [values, setValues] = useState({
    notify_status: customer?.notify_status ?? true,
    notify_bonus: customer?.notify_bonus ?? true,
    notify_promo: customer?.notify_promo ?? false,
  });

  const change = async (key: keyof typeof values, value: boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
    try {
      const payload = await api<{ customer: Customer }>("/me", { method: "PATCH", body: { [key]: value } });
      setCustomer(payload.customer);
    } catch {
      setValues((current) => ({ ...current, [key]: !value }));
      toast("Не получилось сохранить", "bad");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScreenHeader title="Уведомления" />
      <Shell style={{ maxWidth: 760 }}>
        <Panel style={{ gap: 0, paddingVertical: 8 }}>
          {ROWS.map((row, index) => (
            <View key={row.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: index === ROWS.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
              <View style={{ flex: 1 }}>
                <T weight="semibold">{row.title}</T>
                <Muted size={13}>{row.text}</Muted>
              </View>
              <Toggle value={values[row.key]} onChange={(value) => change(row.key, value)} label={row.title} />
            </View>
          ))}
        </Panel>
      </Shell>
    </View>
  );
}
