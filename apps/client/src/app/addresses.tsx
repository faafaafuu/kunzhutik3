// Профиль → Адреса: list, make default, delete; "Добавить" opens the address picker in save mode.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { ScrollView, View } from "react-native";

import { api, ApiError } from "@/api/client";
import type { SavedAddress } from "@/api/types";
import { ScreenHeader } from "@/components/Chrome";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toast";
import { Button, Chip, IconButton, LinkButton, Muted, Panel, Shell, StateView, T } from "@/components/ui";
import { useFetch } from "@/hooks/data";
import { useTheme } from "@/theme";

export default function AddressesScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { data, reload } = useFetch<{ addresses: SavedAddress[] }>("/me/addresses");

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const remove = async (address: SavedAddress) => {
    try {
      await api(`/me/addresses/${address.id}`, { method: "DELETE" });
      reload();
    } catch (error) {
      toast((error as ApiError).message, "bad");
    }
  };

  const makeDefault = async (address: SavedAddress) => {
    await api(`/me/addresses/${address.id}`, { method: "PATCH", body: { ...address, is_default: true } }).catch(() => {});
    reload();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScreenHeader title="Адреса" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Shell style={{ maxWidth: 760, gap: 16 }}>
          <Panel style={{ gap: 0, paddingVertical: 8 }}>
            {data && !data.addresses.length ? <StateView icon="pin" title="Адресов пока нет" text="Сохраните адрес — и оформление займёт пару касаний." /> : null}
            {data?.addresses.map((address, index) => (
              <View key={address.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: index === data.addresses.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                <Icon name="pin" size={22} color={c.ink} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <T weight="semibold">{address.label || "Адрес"}</T>
                    {address.is_default ? <Chip tone="brand" title="основной" /> : <LinkButton title="сделать основным" onPress={() => makeDefault(address)} />}
                  </View>
                  <Muted size={13}>
                    {[address.text, address.apartment && `кв. ${address.apartment}`, address.entrance && `подъезд ${address.entrance}`, address.floor && `этаж ${address.floor}`, address.intercom && `домофон ${address.intercom}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </Muted>
                </View>
                <IconButton icon="trash" label="Удалить адрес" onPress={() => remove(address)} />
              </View>
            ))}
          </Panel>
          <Button tone="tonal" icon="plus" title="Добавить адрес" onPress={() => router.push({ pathname: "/address", params: { save: "1" } })} />
        </Shell>
      </ScrollView>
    </View>
  );
}
