// Cart: lines, upsell, promo code. The total always comes from the server quote.

import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { assetUrl } from "@/api/client";
import { CartLines, quoteRows } from "@/components/CartLines";
import { Icon } from "@/components/Icon";
import { Button, Field, IconButton, LinkButton, Muted, Notice, Progress, StateView, T, Title, Totals } from "@/components/ui";
import { useQuote, useShared } from "@/hooks/data";
import { money } from "@/lib/format";
import { useCart } from "@/store/cart";
import { usePlace } from "@/store/place";
import { floatShadow, radius, useTheme } from "@/theme";

export default function CartScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const drawer = Platform.OS === "web" && width >= 600;

  const body = (
    <View style={{ flex: 1, backgroundColor: c.surfaceCard, paddingTop: drawer ? 0 : insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
        <Title size={24}>Корзина</Title>
        <IconButton icon="close" label="Закрыть" onPress={close} />
      </View>
      <CartBody onClose={close} bottomInset={insets.bottom} />
    </View>
  );

  if (!drawer) return body;
  return (
    <View style={{ flex: 1 }}>
      <Pressable accessibilityLabel="Закрыть корзину" onPress={close} style={{ position: "absolute", inset: 0, backgroundColor: c.scrim } as object} />
      <View style={[{ position: "absolute", top: 12, right: 12, bottom: 12, width: Math.min(440, width - 24), borderRadius: radius.lg, overflow: "hidden" }, floatShadow()]}>{body}</View>
    </View>
  );
}

function CartBody({ onClose, bottomInset }: { onClose: () => void; bottomInset: number }) {
  const { c } = useTheme();
  const router = useRouter();
  const lines = useCart((state) => state.lines);
  const promo = useCart((state) => state.promo);
  const setPromo = useCart((state) => state.setPromo);
  const add = useCart((state) => state.add);
  const fulfillment = usePlace((state) => state.fulfillment);
  const menu = useShared((state) => state.menu);
  const { quote, quoting, error } = useQuote();
  const [promoDraft, setPromoDraft] = useState(promo);

  if (!lines.length) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <StateView icon="cart" title="В корзине пусто" text="Добавьте что-нибудь из меню." action={<Button title="В меню" onPress={onClose} />} />
      </View>
    );
  }

  const problems = quote?.problems ?? [];
  const unavailable = problems.filter((problem) => problem.code === "item_unavailable");
  const minOrder = problems.find((problem) => problem.code === "below_min_order");
  const promoProblem = problems.find((problem) => problem.code === "promo_invalid");
  // In the cart only the dishes can block; address, time and the like are settled at checkout.
  const blocking = problems.filter((problem) => ["item_unavailable", "invalid_modifiers", "below_min_order"].includes(problem.code));
  const inCart = new Set(lines.map((line) => line.itemId));
  const upsell = (menu?.items ?? []).filter((item) => item.is_available && !item.modifier_groups.length && !inCart.has(item.id) && item.image_url).slice(0, 3);
  const minMissing = minOrder ? Number(minOrder.details.missing) : 0;
  const minTotal = minOrder ? Number(minOrder.details.min_order_amount) : 0;

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 18 }}>
        {unavailable.map((problem) => (
          <Notice key={problem.message} tone="bad">
            {problem.message}, пока вы собирали заказ.
          </Notice>
        ))}
        <CartLines quote={quote} />
        {minOrder ? (
          <View style={{ gap: 6 }}>
            <T>
              <T weight="bold">Ещё {money(minMissing)}</T> до минимальной суммы доставки
            </T>
            <Progress value={minTotal ? ((minTotal - minMissing) / minTotal) * 100 : 0} />
          </View>
        ) : null}
        {upsell.length ? (
          <View style={{ gap: 10 }}>
            <T weight="semibold">Добавить к заказу?</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {upsell.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Добавить ${item.title}`}
                  onPress={() => add(item)}
                  style={{ flex: 1, minHeight: 128, alignItems: "center", gap: 4, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: c.surfaceSunken }}
                >
                  <Image source={{ uri: assetUrl(item.image_url) }} style={{ width: 48, height: 48, borderRadius: 24 }} contentFit="cover" />
                  <T weight="semibold" size={13} numberOfLines={2} style={{ textAlign: "center", lineHeight: 16 }}>
                    {item.title}
                  </T>
                  <Muted size={12}>+{money(item.price)}</Muted>
                  <View style={{ marginTop: "auto", width: 28, height: 28, borderRadius: 14, backgroundColor: c.surfaceCard, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="plus" size={16} color={c.ink} strokeWidth={2.2} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {quote?.promo?.applied ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderRadius: radius.sm, backgroundColor: c.successSoft }}>
            <T weight="semibold" color={c.success}>
              {quote.promo.code} · {quote.promo.label}
            </T>
            <LinkButton
              title="Убрать"
              onPress={() => {
                setPromo("");
                setPromoDraft("");
              }}
            />
          </View>
        ) : (
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <Field
                value={promoDraft}
                onChangeText={setPromoDraft}
                placeholder="Промокод"
                autoCapitalize="characters"
                autoCorrect={false}
                style={{ flex: 1 }}
                onSubmitEditing={() => setPromo(promoDraft)}
              />
              <Button tone="tonal" title="Применить" onPress={() => setPromo(promoDraft)} disabled={!promoDraft.trim()} />
            </View>
            {promo && promoProblem ? (
              <T size={13} color={c.danger} style={{ marginLeft: 4 }}>
                {promoProblem.message}
              </T>
            ) : null}
          </View>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18 + bottomInset, gap: 14, borderTopWidth: 1, borderTopColor: c.line }}>
        {error ? <Notice tone="bad">{error.message}</Notice> : null}
        {quote ? (
          <View style={{ opacity: quoting ? 0.45 : 1 }}>
            <Totals rows={quoteRows(quote, fulfillment)} grand={{ label: "Итого", value: money(quote.total_amount) }} />
          </View>
        ) : null}
        <Button
          block
          title={quoting || !quote ? "Считаем…" : minOrder ? `Минимум ${money(minTotal)} на доставку` : "Оформить заказ"}
          disabled={quoting || !quote || blocking.length > 0}
          onPress={() => router.replace("/checkout")}
        />
      </View>
    </>
  );
}
