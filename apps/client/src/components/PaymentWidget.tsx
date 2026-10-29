// ЮKassa's checkout widget on the order screen (web): the payment methods — card, СБП, SberPay, ЮMoney — right here,
// no trip to ЮKassa's site. The app keeps ЮKassa's page over itself (lib/payment.ts).

import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";

import { api, ApiError } from "@/api/client";
import { useTheme } from "@/theme";

import { Button, Muted } from "./ui";
import { Spinner } from "./Spinner";

const SCRIPT = "https://yookassa.ru/checkout-widget/v1/checkout-widget.js";

type Widget = { render: (id: string) => Promise<void>; on: (event: "success" | "fail", callback: () => void) => void; destroy: () => void };
type WidgetClass = new (options: object) => Widget;

let loading: Promise<WidgetClass> | null = null;
// The token that came back with the new order: the widget starts on it without asking the server again.
const handedOver = new Map<string, string>();

/** Checkout: start fetching ЮKassa's script while the customer fills the form, so the order screen does not wait for it. */
export function preloadPaymentWidget(): void {
  if (Platform.OS === "web") loadWidget().catch(() => {});
}

/** The payment created together with the order; used once by the order screen's widget. */
export function handOverPayment(orderId: string, token: string): void {
  handedOver.set(orderId, token);
}

async function paymentToken(orderId: string): Promise<string | undefined> {
  const token = handedOver.get(orderId);
  if (token) {
    handedOver.delete(orderId);
    return token;
  }
  return (await api<{ token?: string }>(`/orders/${orderId}/pay?embedded=true`, { method: "POST" })).token;
}

function loadWidget(): Promise<WidgetClass> {
  const ready = () => (window as unknown as { YooMoneyCheckoutWidget?: WidgetClass }).YooMoneyCheckoutWidget;
  if (ready()) return Promise.resolve(ready()!);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.onload = () => (ready() ? resolve(ready()!) : reject(new Error("widget")));
    script.onerror = () => {
      loading = null;
      reject(new Error("widget"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Shows the widget for an order that waits for money; `onSettled` after a payment went through or failed. */
export function PaymentWidget({ orderId, onSettled }: { orderId: string; onSettled: () => void }) {
  const { c } = useTheme();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const containerId = `yookassa-${orderId}-${attempt}`;
  const settled = useRef(onSettled);
  settled.current = onSettled;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let widget: Widget | null = null;
    let alive = true;
    setState("loading");
    (async () => {
      try {
        const [Widget, token] = await Promise.all([loadWidget(), paymentToken(orderId)]);
        if (!alive || !token) return;
        widget = new Widget({
          confirmation_token: token,
          return_url: `${window.location.origin}/order/${orderId}`,
          customization: { colors: { control_primary: c.brand, background: c.surfaceCard } },
          error_callback: () => {
            setError("Не получилось загрузить оплату");
            setState("error");
          },
        });
        widget.on("success", () => {
          widget?.destroy();
          settled.current();
        });
        widget.on("fail", () => {
          widget?.destroy();
          setError("Оплата не прошла. Попробуйте ещё раз или другую карту.");
          setState("error");
          settled.current();
        });
        await widget.render(containerId);
        if (alive) setState("ready");
      } catch (caught) {
        if (!alive) return;
        setError(caught instanceof ApiError ? caught.message : "Не получилось загрузить оплату. Проверьте интернет.");
        setState("error");
      }
    })();
    return () => {
      alive = false;
      widget?.destroy();
    };
  }, [orderId, attempt, containerId, c.brand, c.surfaceCard]);

  return (
    <View style={{ gap: 10 }}>
      {state === "loading" ? (
        <View style={{ height: 120, alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Spinner />
          <Muted size={13}>Загружаем способы оплаты</Muted>
        </View>
      ) : null}
      {state === "error" ? (
        <View style={{ gap: 8, alignItems: "center" }}>
          <Muted style={{ textAlign: "center" }}>{error}</Muted>
          <Button title="Попробовать снова" tone="tonal" onPress={() => setAttempt((value) => value + 1)} />
        </View>
      ) : null}
      {/* The widget draws itself into this element; it stays mounted while loading so render() can find it. */}
      <View nativeID={containerId} style={{ display: state === "error" ? "none" : "flex", minHeight: state === "ready" ? 0 : 1 }} />
    </View>
  );
}
