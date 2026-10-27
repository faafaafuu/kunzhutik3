// "Заказы" tab: active orders on top, history with "Повторить" below.

import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, assetUrl } from "@/api/client";
import type { Order } from "@/api/types";
import { TopBar } from "@/components/Chrome";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toast";
import { Button, Muted, Shell, Skeleton, StateView, T, Title } from "@/components/ui";
import { useShared } from "@/hooks/data";
import { dayLabel, money, time } from "@/lib/format";
import { useCart } from "@/store/cart";
import { useSession } from "@/store/session";
import { radius, useTheme, useWide } from "@/theme";

export default function OrdersScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const signedIn = useSession((state) => Boolean(state.tokens));
  const recent = useSession((state) => state.recentOrderIds);
  const [orders, setOrders] = useState<Order[] | null>(null);

  const load = useCallback(async () => {
    try {
      if (signedIn) {
        setOrders((await api<{ orders: Order[] }>("/me/orders")).orders);
      } else {
        const found = await Promise.all(recent.slice(0, 10).map((id) => api<{ order: Order }>(`/orders/${id}`).then((payload) => payload.order).catch(() => null)));
        setOrders(found.filter(Boolean) as Order[]);
      }
    } catch {
      setOrders([]);
    }
  }, [signedIn, recent]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const repeat = (order: Order) => {
    const added = useCart.getState().repeat(order.items, useShared.getState().menu?.items ?? []);
    if (!added) return toast("Этих блюд сейчас нет", "bad");
    router.push("/cart");
  };

  const active = (orders ?? []).filter((order) => order.is_active);
  const history = (orders ?? []).filter((order) => !order.is_active);

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: wide ? 0 : insets.top }}>
      <TopBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <Shell style={{ gap: 12, paddingTop: 20, maxWidth: 760 }}>
          <Title>Заказы</Title>
          {orders === null ? (
            <>
              <Skeleton style={{ height: 84 }} />
              <Skeleton style={{ height: 84 }} />
            </>
          ) : !orders.length ? (
            <StateView
              icon="receipt"
              title="Заказов пока нет"
              text={signedIn ? "Самое время выбрать что-нибудь вкусное." : "Войдите, чтобы видеть заказы со всех устройств."}
              action={
                <View style={{ gap: 8, alignItems: "center" }}>
                  <Button title="В меню" onPress={() => router.navigate("/")} />
                  {!signedIn ? <Button tone="tonal" title="Войти" onPress={() => router.push("/login")} /> : null}
                </View>
              }
            />
          ) : (
            <>
              {active.map((order) => (
                <Card key={order.id} order={order} highlight onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })} />
              ))}
              {history.length ? (
                <T weight="semibold" size={16} style={{ marginTop: 12 }}>
                  История
                </T>
              ) : null}
              {history.map((order) => (
                <Card key={order.id} order={order} onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })} onRepeat={() => repeat(order)} />
              ))}
            </>
          )}
        </Shell>
      </ScrollView>
    </View>
  );
}

function Card({ order, highlight, onPress, onRepeat }: { order: Order; highlight?: boolean; onPress: () => void; onRepeat?: () => void }) {
  const { c } = useTheme();
  const thumbs = order.items.filter((item) => item.image_url).slice(0, 2);
  const titles = order.items.map((item) => `${item.title}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`).join(", ");
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: highlight ? c.brandSoft : c.surfaceSunken, opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ flexDirection: "row" }}>
        {thumbs.map((item, index) => (
          <Image key={index} source={{ uri: assetUrl(item.image_url) }} style={{ width: 44, height: 44, borderRadius: 22, marginLeft: index ? -14 : 0, borderWidth: 2, borderColor: c.surfaceCard }} contentFit="cover" />
        ))}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="semibold">{highlight ? `№ ${order.number} · ${order.status_label}` : `${dayLabel(order.created_at)} · ${money(order.total_amount)} · ${order.status_label.toLowerCase()}`}</T>
        <Muted size={13} numberOfLines={1}>
          {highlight ? `${order.promised_at ? `${order.fulfillment === "delivery" ? "Привезём" : "Готов"} к ${time(order.promised_at)} · ` : ""}${money(order.total_amount)}` : titles}
        </Muted>
      </View>
      {onRepeat ? <Button size="sm" tone="tonal" title="Повторить" onPress={onRepeat} /> : <Icon name="right" size={20} color={c.ink} />}
    </Pressable>
  );
}
