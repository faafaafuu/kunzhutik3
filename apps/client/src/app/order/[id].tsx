// Order status: big number, timeline, contacts, composition. Polls every 20 seconds while active.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, ScrollView, View } from "react-native";

import { api, ApiError } from "@/api/client";
import type { Order, OrderStatusLite } from "@/api/types";
import { ScreenHeader } from "@/components/Chrome";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toast";
import { Button, Chip, Columns, IconButton, Muted, Notice, Panel, Shell, Skeleton, StateView, T, Title, Totals } from "@/components/ui";
import { useShared } from "@/hooks/data";
import { modifiersText, money, time } from "@/lib/format";
import { PaymentWidget } from "@/components/PaymentWidget";
import { closePayment, openPayment } from "@/lib/payment";
import { useCart } from "@/store/cart";
import { useSession } from "@/store/session";
import { radius, useTheme } from "@/theme";

const POLL_MS = 20000;
// Waiting for money: the server checks with ЮKassa on every poll, so the screen follows the payment quickly.
const PAYMENT_POLL_MS = 3000;

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const welcomed = useSession((state) => state.welcomed);
  const setWelcomed = useSession((state) => state.setWelcomed);
  const lastUpdate = useRef<string | null>(null);

  const load = async () => {
    try {
      const payload = await api<{ order: Order }>(`/orders/${id}`);
      setOrder(payload.order);
      lastUpdate.current = payload.order.updated_at;
      setError(null);
    } catch (caught) {
      setError(caught as ApiError);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!order?.is_active) return;
    const timer = setInterval(async () => {
      try {
        const status = await api<OrderStatusLite>(`/orders/${id}/status`);
        if (status.updated_at !== lastUpdate.current) await load();
      } catch {
        // Next tick will try again.
      }
    }, order.status === "pending_payment" ? PAYMENT_POLL_MS : POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, order?.is_active, order?.status]);

  const pay = async () => {
    setPaying(true);
    try {
      await openPayment(id);
    } finally {
      setPaying(false);
      load();
    }
  };

  // Paid while the payment page was open: close it, the screen already shows the order going to the kitchen.
  const wasWaiting = useRef(false);
  useEffect(() => {
    if (order?.status === "pending_payment") wasWaiting.current = true;
    else if (order && wasWaiting.current) {
      wasWaiting.current = false;
      closePayment();
    }
  }, [order]);

  const cancel = async () => {
    setCancelling(true);
    try {
      const payload = await api<{ order: Order }>(`/orders/${id}/cancel`, { method: "POST", body: { reason: "" } });
      setOrder(payload.order);
      toast("Заказ отменён");
    } catch (caught) {
      toast((caught as ApiError).message, "bad");
      load();
    } finally {
      setCancelling(false);
    }
  };

  const repeat = () => {
    const menu = useShared.getState().menu?.items ?? [];
    const added = order ? useCart.getState().repeat(order.items, menu) : 0;
    if (!added) {
      toast("Этих блюд сейчас нет", "bad");
      return;
    }
    if (order && added < order.items.length) toast("Часть блюд закончилась — их пропустили");
    router.push("/cart");
  };

  if (error && !order) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <ScreenHeader title="Заказ" onBack={() => router.replace("/orders")} />
        <StateView
          icon={error.status === 404 ? "search" : "wifi-off"}
          title={error.status === 404 ? "Здесь ничего нет" : "Не удалось загрузить"}
          text={error.status === 404 ? "Возможно, ссылка устарела." : error.message}
          action={<Button title={error.status === 404 ? "В меню" : "Повторить"} onPress={() => (error.status === 404 ? router.replace("/") : load())} />}
        />
      </View>
    );
  }
  if (!order) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <ScreenHeader title="Заказ" onBack={() => router.replace("/orders")} />
        <Shell style={{ gap: 16 }}>
          <Skeleton style={{ height: 220 }} />
          <Skeleton style={{ height: 160 }} />
        </Shell>
      </View>
    );
  }

  const cancelled = order.status === "cancelled" || order.status === "rejected";
  const venuePhone = order.venue?.phone ?? "";
  const heading = headingFor(order);

  const main = (
    <>
      {welcomed?.orderId === order.id ? (
        <Panel style={{ backgroundColor: c.sesameSoft, alignItems: "center", gap: 8 }}>
          <Title size={20} style={{ textAlign: "center" }}>
            Кабинет открыт
          </Title>
          <Muted style={{ textAlign: "center" }}>
            {welcomed.bonus > 0 ? `На счёт уже упало ${welcomed.bonus} бонусов — ими можно оплатить часть следующего заказа. ` : ""}
            Заказы, адреса и бонусы теперь сохраняются.
          </Muted>
          <View style={{ flexDirection: "row", gap: 8, alignSelf: "stretch" }}>
            <Button style={{ flex: 1 }} tone="white" title="Бонусы" onPress={() => router.push("/bonus")} />
            <Button style={{ flex: 1 }} tone="tonal" title="Понятно" onPress={() => setWelcomed(null)} />
          </View>
        </Panel>
      ) : null}
      <Panel>
        <View style={{ alignItems: "center", gap: 6 }}>
          <Chip tone={order.status === "completed" ? "good" : cancelled ? "default" : "brand"} title={order.status_label} />
          <Muted>Заказ</Muted>
          <T weight="bold" size={44} style={{ lineHeight: 48, letterSpacing: -1 }}>
            № {order.number}
          </T>
          <Title size={22} style={{ textAlign: "center" }}>
            {heading.title}
          </Title>
          {heading.text ? <Muted style={{ textAlign: "center" }}>{heading.text}</Muted> : null}
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {order.timeline.map((step) => (
            <View key={step.status} style={{ flex: 1, gap: 8, alignItems: "center" }}>
              <View style={{ width: "100%", height: 6, borderRadius: radius.pill, backgroundColor: c.surfaceSunken, overflow: "hidden", flexDirection: "row" }}>
                {!cancelled && step.state !== "todo" ? <View style={{ width: step.state === "done" ? "100%" : "50%", backgroundColor: c.brand }} /> : null}
              </View>
              <T weight="semibold" size={12} color={step.state === "now" ? c.ink : c.inkSoft} style={{ textAlign: "center" }}>
                {step.title}
              </T>
            </View>
          ))}
        </View>
        {order.can_pay && Platform.OS === "web" ? (
          <View style={{ gap: 6 }}>
            <PaymentWidget orderId={order.id} onSettled={load} />
            <Muted size={12} style={{ textAlign: "center" }}>
              Оплата через ЮKassa. Заказ отменится, если не оплатить в течение получаса.
            </Muted>
          </View>
        ) : order.can_pay ? (
          <View style={{ gap: 10 }}>
            {order.payment_status === "failed" ? <Notice tone="bad">Оплата не прошла. Можно попробовать ещё раз или выбрать другую карту.</Notice> : null}
            <Button block title={`Оплатить ${money(order.total_amount)}`} loading={paying} onPress={pay} />
            <Muted size={13} style={{ textAlign: "center" }}>
              Картой, по СБП или SberPay. Заказ отменится, если не оплатить в течение получаса.
            </Muted>
          </View>
        ) : null}
        {cancelled ? (
          <Notice tone="bad">
            {order.payment_status === "paid" || order.payment_status === "refunded"
              ? "Деньги вернутся на карту в течение нескольких дней."
              : order.payment_method === "online"
                ? "Деньги не списывались."
                : "Деньги не списывались — оплата при получении."}
          </Notice>
        ) : null}
        {order.status === "completed" && order.bonus_accrued ? (
          <View style={{ alignSelf: "center", paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.sesameSoft }}>
            <T weight="semibold" size={13} color={c.sesameText}>
              +{Math.floor(Number(order.bonus_accrued))} бонусов начислено
            </T>
          </View>
        ) : null}
      </Panel>
      {order.venue ? (
        <Panel>
          <T weight="semibold" size={16}>
            Связь
          </T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: c.surfaceSunken }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}>
              <Icon name="store" size={22} color={c.brandText} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="semibold">Брайт, {order.venue.address}</T>
              <Muted size={13}>{venuePhone}</Muted>
            </View>
            <IconButton icon="phone" label="Позвонить в кафе" tone="card" onPress={() => Linking.openURL(`tel:${venuePhone.replace(/[^+\d]/g, "")}`)} />
          </View>
          {order.fulfillment === "pickup" && order.venue ? (
            <Button tone="tonal" size="sm" icon="map" title="Маршрут" onPress={() => Linking.openURL(`https://yandex.ru/maps/?rtext=~${order.venue!.latitude},${order.venue!.longitude}`)} />
          ) : null}
        </Panel>
      ) : null}
    </>
  );

  const side = (
    <Panel>
      <T weight="semibold" size={16}>
        Состав
      </T>
      <View style={{ gap: 10 }}>
        {order.items.map((item, index) => (
          <View key={index} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <T weight="semibold">
                {item.title}
                {item.quantity > 1 ? ` ×${item.quantity}` : ""}
              </T>
              {item.modifiers.length ? (
                <T size={13} color={c.brandText}>
                  {modifiersText(item.modifiers)}
                </T>
              ) : null}
            </View>
            <T weight="semibold">{money(item.line_total)}</T>
          </View>
        ))}
      </View>
      <Totals
        rows={[
          ...(Number(order.discount_total) ? [{ label: "Скидка", value: `−${money(order.discount_total)}`, tone: "discount" as const }] : []),
          ...(Number(order.bonus_spent) ? [{ label: "Бонусами", value: `−${money(order.bonus_spent)}`, tone: "discount" as const }] : []),
          ...(order.fulfillment === "delivery" ? [{ label: "Доставка", value: Number(order.delivery_fee) ? money(order.delivery_fee) : "бесплатно", tone: "muted" as const }] : []),
        ]}
        grand={{ label: "Итого", value: money(order.total_amount) }}
      />
      <View style={{ gap: 8 }}>
        <Row label="Оплата" value={order.payment_label} />
        {order.fulfillment === "delivery" ? <Row label="Адрес" value={[order.address_text, order.address_details.apartment ? `кв. ${order.address_details.apartment}` : ""].filter(Boolean).join(", ")} /> : <Row label="Получение" value="Самовывоз" />}
        {order.comment ? <Row label="Комментарий" value={order.comment} /> : null}
      </View>
      {order.can_cancel ? (
        <Button block tone="tonal" title="Отменить заказ" loading={cancelling} onPress={cancel} />
      ) : order.is_active ? (
        <Button block tone="tonal" title="Позвонить в кафе" onPress={() => Linking.openURL(`tel:${venuePhone.replace(/[^+\d]/g, "")}`)} />
      ) : (
        <Button block title={cancelled ? "Выбрать другое" : "Повторить заказ"} onPress={cancelled ? () => router.replace("/") : repeat} />
      )}
    </Panel>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScreenHeader title={`Заказ № ${order.number}`} onBack={() => (router.canGoBack() ? router.back() : router.replace("/orders"))} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Shell>
          <Columns main={main} side={side} />
        </Shell>
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <T size={14} color={c.inkSoft}>
        {label}
      </T>
      <T size={14} style={{ flexShrink: 1, textAlign: "right" }}>
        {value}
      </T>
    </View>
  );
}

function headingFor(order: Order): { title: string; text?: string } {
  const at = order.promised_at ? time(order.promised_at) : "";
  const delivery = order.fulfillment === "delivery";
  switch (order.status) {
    case "pending_payment":
      return { title: "Ждём оплату", text: "Заказ увидит кафе сразу после оплаты" };
    case "new":
      return { title: "Ждём подтверждения кафе", text: "Обычно это меньше минуты" };
    case "confirmed":
      return { title: at ? `${delivery ? "Привезём" : "Будет готов"} к ${at}` : "Кафе приняло заказ", text: "Кафе приняло заказ" };
    case "preparing":
      return { title: at ? `Готовим · ${delivery ? "привезём" : "будет готов"} к ${at}` : "Готовим", text: "Повар уже собирает ваш заказ" };
    case "ready":
      return delivery ? { title: "Готов, ждёт курьера", text: at ? `Привезём к ${at}` : undefined } : { title: "Можно забирать", text: "Подойдите к стойке и назовите номер" };
    case "delivering":
      return { title: at ? `Курьер в пути · будет к ${at}` : "Курьер в пути" };
    case "completed":
      return { title: `${delivery ? "Доставлен" : "Выдан"}${order.completed_at ? ` в ${time(order.completed_at)}` : ""}`, text: "Приятного аппетита!" };
    case "rejected":
      return { title: "Кафе не сможет выполнить заказ", text: order.cancel_reason || undefined };
    default:
      return { title: "Заказ отменён", text: order.cancel_reason || undefined };
  }
}
