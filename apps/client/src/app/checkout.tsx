// Checkout: contacts, where, when, payment, bonuses — and the server total with the promised time.

import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Keyboard, type LayoutChangeEvent, Platform, Pressable, ScrollView, View } from "react-native";

import { api, ApiError } from "@/api/client";
import type { Customer, Order, PaymentMethod, Quote, SavedAddress, Tokens } from "@/api/types";
import { CartLines, quoteRows } from "@/components/CartLines";
import { ScreenHeader } from "@/components/Chrome";
import { Icon } from "@/components/Icon";
import { agreed, ConsentChecks, ConsentNote, noAgreements } from "@/components/Legal";
import { toast } from "@/components/Toast";
import { BonusWheel } from "@/components/BonusWheel";
import { Button, Columns, Field, LinkButton, Muted, Notice, OptionRow, Panel, Segmented, Shell, StateView, T, Title, Toggle, Totals } from "@/components/ui";
import { buildQuoteBody, loadMenu, useFetch, useQuote, useShared } from "@/hooks/data";
import { maskPhone, money, phoneComplete, slotLabel, time } from "@/lib/format";
import { handOverPayment, preloadPaymentWidget } from "@/components/PaymentWidget";
import { openPayment } from "@/lib/payment";
import { orderSource } from "@/lib/telegram";
import { useCart } from "@/store/cart";
import { usePlace } from "@/store/place";
import { useSession } from "@/store/session";
import { radius, useTheme } from "@/theme";

// Online first: it is the default whenever the shop accepts it.
const PAYMENT: { value: PaymentMethod; title: string; subtitle?: string; icon: "card" | "cash" }[] = [
  { value: "online", title: "Онлайн — картой или СБП", subtitle: "Картой, по СБП или SberPay сразу после оформления", icon: "card" },
  { value: "card_on_delivery", title: "Картой при получении", icon: "card" },
  { value: "cash", title: "Наличными", icon: "cash" },
];

export default function CheckoutScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const config = useShared((state) => state.config);
  const lines = useCart((state) => state.lines);
  const useBonus = useCart((state) => state.useBonus);
  const setUseBonus = useCart((state) => state.setUseBonus);
  const rewards = useCart((state) => state.rewards);
  const setRewards = useCart((state) => state.setRewards);
  const menuItems = useShared((state) => state.menu?.items);
  const menuVenueId = useShared((state) => state.menu?.venue_id);
  const place = usePlace();
  const session = useSession();
  const signedIn = Boolean(session.tokens);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [slotsOpen, setSlotsOpen] = useState(false);
  // Hooks stay above the early returns below (an emptied cart after the order must not change their count).
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const spots = useRef<Record<string, number>>({});
  // The consent boxes. A customer who ticked them for the current edition of the documents is not asked again.
  const [agreements, setAgreements] = useState(noAgreements);
  const consentVersion = useSession((state) => state.consentVersion);
  const { quote, quoting, error } = useQuote({ scheduledFor });
  const [name, setName] = useState(session.customer?.name || session.guest.name);
  const [phone, setPhone] = useState(session.customer?.phone ? maskPhone(session.customer.phone) : session.guest.phone);
  const onlineAccepted = (config?.payment_methods ?? []).includes("online");
  const [payment, setPayment] = useState<PaymentMethod>(onlineAccepted ? "online" : "card_on_delivery");
  const [paymentPicked, setPaymentPicked] = useState(false);
  const [comment, setComment] = useState("");
  const [privateHouse, setPrivateHouse] = useState(false);
  const [saveAddress, setSaveAddress] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [changed, setChanged] = useState<{ before: string; quote: Quote } | null>(null);
  const saved = useFetch<{ addresses: SavedAddress[] }>(signedIn ? "/me/addresses" : null);

  // The config may arrive after the screen opened: switch to online unless the customer already chose.
  useEffect(() => {
    if (onlineAccepted && !paymentPicked) setPayment("online");
  }, [onlineAccepted, paymentPicked]);

  // The wheel: dishes of this venue that can be taken for bonuses, cheapest first.
  const giftChoices = (menuItems ?? []).filter((item) => item.bonus_price && item.is_available).sort((a, b) => (a.bonus_price ?? 0) - (b.bonus_price ?? 0));
  // The wheel shows what the venue making this order has: opened straight on /checkout, or the address moved the
  // order to another cafe — fetch that venue's menu.
  const quoteVenueId = quote?.venue.id;
  useEffect(() => {
    if (signedIn && quoteVenueId && menuVenueId !== quoteVenueId) loadMenu(quoteVenueId).catch(() => {});
  }, [signedIn, quoteVenueId, menuVenueId]);
  // A gift that is no longer offered here (another venue, taken off the wheel) leaves the order quietly.
  useEffect(() => {
    if (!menuItems) return;
    const kept = rewards.filter((id) => giftChoices.some((item) => item.id === id));
    if (kept.length !== rewards.length) setRewards(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuItems, rewards]);

  // Paying online: ЮKassa's widget script downloads while the form is being filled, not after «Перейти к оплате».
  useEffect(() => {
    if (payment === "online") preloadPaymentWidget();
  }, [payment]);

  useEffect(() => {
    if (!scheduledFor || !quote) return;
    if (!quote.slots.includes(scheduledFor)) setScheduledFor(null);
  }, [quote, scheduledFor]);

  if (!lines.length) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <ScreenHeader title="Оформление" />
        <StateView icon="cart" title="В корзине пусто" text="Добавьте что-нибудь из меню." action={<Button title="В меню" onPress={() => router.replace("/")} />} />
      </View>
    );
  }

  const delivery = place.fulfillment === "delivery";
  const details = place.address?.details ?? { entrance: "", floor: "", apartment: "", intercom: "" };
  const detailsMissing = delivery && place.address && !privateHouse && !details.apartment.trim();
  const nameError = touched && !name.trim() ? "Как к вам обращаться?" : null;
  const phoneError = touched && !phoneComplete(phone) ? "Введите номер в формате +7 900 000-00-00" : null;
  const methods = PAYMENT.filter((method) => (config?.payment_methods ?? ["card_on_delivery", "cash"]).includes(method.value));
  const problems = quote?.problems ?? [];
  const outOfZone = problems.some((problem) => problem.code === "out_of_delivery_zone");
  const closed = problems.find((problem) => problem.code === "venue_closed");
  const otherProblems = problems.filter((problem) => !["out_of_delivery_zone", "address_required", "venue_closed"].includes(problem.code));
  const balance = Number(quote?.bonus_available ?? 0);
  const needsConsent = !config?.consent_version || consentVersion !== config.consent_version;
  // What still has to be filled in, in the order it appears on the screen. Tapping the button then scrolls there
  // instead of doing nothing; the button is off only while the price is being counted or the venue cannot take it.
  const missing: "contacts" | "address" | "consent" | null =
    !signedIn && (!name.trim() || !phoneComplete(phone))
      ? "contacts"
      : delivery && (!place.address || outOfZone || detailsMissing)
        ? "address"
        : needsConsent && !agreed(agreements, true)
          ? "consent"
          : null;
  const blocked = !quote || quoting || (!quote.can_order && !missing);

  const mark = (key: string) => (event: LayoutChangeEvent) => {
    spots.current[key] = event.nativeEvent.layout.y;
  };
  const showMissing = () => {
    if (!missing) return;
    setTouched(true);
    Keyboard.dismiss();
    if (missing === "consent") scroll.current?.scrollToEnd({ animated: true });
    else scroll.current?.scrollTo({ y: Math.max(0, (spots.current[missing] ?? 0) - 12), animated: true });
    toast(missing === "contacts" ? "Укажите имя и телефон" : missing === "address" ? (place.address ? "Проверьте адрес и квартиру" : "Укажите адрес доставки") : "Отметьте согласие с условиями", "bad");
  };

  const submit = async (expected?: string) => {
    setTouched(true);
    if (!name.trim() || !phoneComplete(phone) || !quote || detailsMissing) return;
    setSubmitting(true);
    try {
      const body = {
        ...buildQuoteBody({
          lines,
          promo: useCart.getState().promo,
          useBonus: useBonus && signedIn,
          rewards: signedIn ? useCart.getState().rewards : [],
          fulfillment: place.fulfillment,
          address: place.address,
          venueId: quote.venue.id,
          scheduledFor,
        }),
        customer_name: name.trim(),
        customer_phone: phone,
        address_details: details,
        payment_method: payment,
        comment: comment.trim(),
        expected_total: expected ?? quote.total_amount,
        save_address: signedIn && delivery && saveAddress && !place.address?.savedId,
        address_label: "",
        source: orderSource(),
        referral_code: signedIn ? null : session.referralCode,
        // Ticked before on this device for the current documents: it goes along, the server writes it for this phone.
        consent: needsConsent ? agreed(agreements, true) : true,
        marketing_consent: needsConsent && agreed(agreements, true) && agreements.ads,
      };
      const { order, account, payment: toPay } = await api<{ order: Order; account: { customer: Customer; tokens: Tokens } | null; payment: { url?: string; token?: string } | null }>("/orders", { method: "POST", body });
      if (needsConsent && config?.consent_version) session.setConsentVersion(config.consent_version);
      if (!signedIn) session.rememberGuest(name.trim(), phone);
      // A first order from a new phone opens the account from the order's details: no sign-up step.
      if (account) {
        session.signIn(account.customer, account.tokens);
        session.setReferralCode(null);
        session.setWelcomed({ orderId: order.id, bonus: config?.bonus.welcome ?? 0 });
      }
      session.rememberOrder(order.id);
      useCart.getState().clear();
      router.replace({ pathname: "/order/[id]", params: { id: order.id } });
      // Online: the site shows ЮKassa's widget on the order screen; the app opens ЮKassa's page over itself.
      // If it did not start, the order screen offers to pay again.
      if (toPay?.token) handOverPayment(order.id, toPay.token);
      if (toPay) openPayment(order.id);
      else if (order.can_pay) toast("Не получилось открыть оплату — попробуйте ещё раз в заказе", "bad");
    } catch (caught) {
      const apiError = caught as ApiError;
      if (apiError.code === "price_changed" && apiError.details.quote) {
        setChanged({ before: quote.total_amount, quote: apiError.details.quote as Quote });
      } else {
        // The documents changed since the last tick: show the boxes again.
        if (apiError.code === "consent_required") session.setConsentVersion(null);
        toast(apiError.message, "bad");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (changed) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <ScreenHeader title="Оформление" onBack={() => setChanged(null)} />
        <Shell style={{ maxWidth: 520 }}>
          <Panel>
            <Title size={22}>Цена изменилась</Title>
            <Muted>Пока вы оформляли, точка обновила меню.</Muted>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T color={c.inkSoft}>Итого</T>
              <T>
                <T color={c.inkSoft} style={{ textDecorationLine: "line-through" }}>
                  {money(changed.before)}
                </T>{" "}
                <T weight="bold">{money(changed.quote.total_amount)}</T>
              </T>
            </View>
            <Button block title={`Оформить за ${money(changed.quote.total_amount)}`} loading={submitting} onPress={() => submit(changed.quote.total_amount).then(() => setChanged(null))} />
            <Button block tone="tonal" title="Вернуться в корзину" onPress={() => router.replace("/cart")} />
          </Panel>
        </Shell>
      </View>
    );
  }

  const main = (
    <>
      {!signedIn ? (
        <Panel onLayout={mark("contacts")}>
          <Title size={22}>Контакты</Title>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Field label="Имя" value={name} onChangeText={setName} error={nameError} autoComplete="name" style={{ flex: 1, minWidth: 160 }} />
            <Field label="Телефон" value={phone} onChangeText={(value) => setPhone(maskPhone(value))} error={phoneError} keyboardType="phone-pad" autoComplete="tel" placeholder="+7 900 000-00-00" style={{ flex: 1, minWidth: 180 }} />
          </View>
          <T size={13} color={c.inkSoft}>
            Заказ без регистрации.{" "}
            <T size={13} weight="semibold" color={c.brandText} onPress={() => router.push("/login")}>
              Войти
            </T>{" "}
            — чтобы копить бонусы и сохранить адрес.
          </T>
        </Panel>
      ) : null}

      <Segmented
        value={place.fulfillment}
        onChange={place.setFulfillment}
        options={[
          { value: "delivery", label: "Доставка" },
          { value: "pickup", label: "Самовывоз" },
        ]}
      />

      {delivery ? (
        <Panel onLayout={mark("address")}>
          <Title size={22}>Куда</Title>
          {outOfZone ? (
            <Notice tone="bad" icon="map">
              <T weight="bold" size={14} color={c.danger}>
                Сюда пока не доставляем.
              </T>{" "}
              Можно забрать заказ самим{quote ? ` на ${quote.venue.address}` : ""}.
            </Notice>
          ) : null}
          {saved.data?.addresses.length ? (
            <View style={{ gap: 8 }}>
              {saved.data.addresses.map((address) => (
                <OptionRow
                  key={address.id}
                  selected={place.address?.savedId === address.id}
                  onPress={() =>
                    place.setAddress({
                      text: address.text,
                      latitude: address.latitude,
                      longitude: address.longitude,
                      details: { entrance: address.entrance, floor: address.floor, apartment: address.apartment, intercom: address.intercom },
                      savedId: address.id,
                      label: address.label,
                    })
                  }
                  title={address.label || address.text}
                  subtitle={[address.label ? address.text : "", address.apartment ? `кв. ${address.apartment}` : "", address.entrance ? `подъезд ${address.entrance}` : ""].filter(Boolean).join(" · ")}
                />
              ))}
            </View>
          ) : null}
          {place.address && !place.address.savedId ? <OptionRow selected onPress={() => router.push("/address")} icon="pin" title={place.address.text} right={<LinkButton title="Изменить" onPress={() => router.push("/address")} />} /> : null}
          <Button tone="tonal" size="sm" icon="plus" title={place.address ? "Другой адрес" : "Указать адрес"} onPress={() => router.push("/address")} />
          {place.address ? (
            <>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {(["entrance", "floor", "apartment", "intercom"] as const).map((key) => (
                  <Field
                    key={key}
                    label={{ entrance: "Подъезд", floor: "Этаж", apartment: "Квартира", intercom: "Домофон" }[key]}
                    value={details[key]}
                    onChangeText={(value) => place.setDetails({ [key]: value })}
                    error={detailsMissing && key === "apartment" && touched ? " " : null}
                    style={{ flex: 1, minWidth: 110 }}
                  />
                ))}
              </View>
              {detailsMissing && touched ? <T size={13} color={c.danger}>Укажите квартиру — без неё курьер не найдёт вас. Частный дом — отметьте ниже.</T> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Toggle value={privateHouse} onChange={setPrivateHouse} label="Частный дом" />
                <T>Частный дом, квартиры нет</T>
              </View>
              {signedIn && !place.address.savedId ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Toggle value={saveAddress} onChange={setSaveAddress} label="Сохранить адрес" />
                  <T>Сохранить адрес в профиле</T>
                </View>
              ) : null}
            </>
          ) : null}
        </Panel>
      ) : (
        <Panel>
          <Title size={22}>Где забрать</Title>
          {quote ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: c.surfaceSunken }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}>
                <Icon name="store" size={22} color={c.brandText} />
              </View>
              <View style={{ flex: 1 }}>
                <T weight="semibold">{quote.venue.address}</T>
                <Muted size={13}>
                  {quote.venue.is_open ? `Открыто до ${time(quote.venue.closes_at)}` : "Сейчас закрыто"} · готовим ~{quote.venue.cook_minutes} мин
                </Muted>
              </View>
            </View>
          ) : null}
        </Panel>
      )}

      <Panel>
        <Title size={22}>Когда</Title>
        {closed ? <Notice tone="bad" icon="clock">Сейчас закрыто — выберите время.</Notice> : null}
        <View style={{ gap: 8 }}>
          {!closed ? (
            <OptionRow
              selected={!scheduledFor}
              icon="clock"
              title="Как можно скорее"
              // The quote's time follows the picked slot, so it describes "as soon as possible" only while no slot is picked.
              subtitle={!scheduledFor && quote?.promised_at ? `${delivery ? "Привезём" : "Будет готов"} к ${time(quote.promised_at)}` : undefined}
              onPress={() => {
                setScheduledFor(null);
                setSlotsOpen(false);
              }}
            />
          ) : null}
          {quote?.slots.length ? (
            <OptionRow
              selected={Boolean(scheduledFor)}
              icon="clock"
              title="Ко времени"
              subtitle={scheduledFor ? slotLabel(scheduledFor) : "Выбрать время"}
              onPress={() => setSlotsOpen((open) => !open)}
              right={<Icon name={slotsOpen ? "up" : "down"} size={20} color={c.inkSoft} />}
            />
          ) : null}
          {slotsOpen && quote ? <SlotList slots={quote.slots} value={scheduledFor} onPick={(slot) => {
            setScheduledFor(slot);
            setSlotsOpen(false);
          }} /> : null}
        </View>
      </Panel>

      <Panel>
        <Title size={22}>Оплата</Title>
        <View style={{ gap: 8 }}>
          {methods.map((method) => (
            <OptionRow
              key={method.value}
              selected={payment === method.value}
              onPress={() => {
                setPaymentPicked(true);
                setPayment(method.value);
              }}
              icon={method.icon}
              title={method.title}
              subtitle={method.subtitle}
            />
          ))}
        </View>
      </Panel>

      <Panel>
        <Title size={22}>Ещё</Title>
        <Field label="Комментарий" value={comment} onChangeText={setComment} placeholder="Например, не звонить в домофон" multiline numberOfLines={2} maxLength={500} />
      </Panel>
    </>
  );

  const side = (
    <Panel>
      <T weight="semibold" size={16}>
        Ваш заказ
      </T>
      <CartLines quote={quote} />
      {signedIn && balance > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T weight="semibold">Списать бонусы</T>
            <Muted size={13}>
              до {config?.bonus.max_redeem_percent ?? 30}% суммы · баланс {Math.floor(balance)}
            </Muted>
          </View>
          <Toggle value={useBonus} onChange={setUseBonus} label="Списать бонусы" />
        </View>
      ) : null}
      {signedIn && quote?.bonus_available != null && giftChoices.length ? (
        <BonusWheel items={giftChoices} balance={Number(quote.bonus_available)} taken={rewards} onChange={setRewards} />
      ) : null}
      {quote ? (
        <View style={{ opacity: quoting ? 0.45 : 1, gap: 12 }}>
          <Totals rows={quoteRows(quote, place.fulfillment)} grand={{ label: "Итого", value: money(quote.total_amount) }} />
          {Number(quote.bonus_accrual) > 0 ? (
            <View style={{ alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.sesameSoft }}>
              <T weight="semibold" size={13} color={c.sesameText}>
                +{Math.floor(Number(quote.bonus_accrual))} бонусов за этот заказ{signedIn ? "" : " — после входа"}
              </T>
            </View>
          ) : null}
          {quote.promised_at ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.sm, backgroundColor: c.brandSoft }}>
              <Icon name="clock" size={20} color={c.brandText} />
              <T weight="semibold" color={c.brandText}>
                {delivery ? "Привезём" : "Заберёте готово"} к {time(quote.promised_at)}
              </T>
            </View>
          ) : null}
          {quote.warnings.map((warning) => (
            <Notice key={warning} icon="clock">
              {warning}
            </Notice>
          ))}
          {otherProblems.map((problem) => (
            <Notice key={problem.code + problem.message} tone="bad">
              {problem.message}
            </Notice>
          ))}
        </View>
      ) : null}
      {error ? <Notice tone="bad">{error.message}</Notice> : null}
      <Button
        block
        loading={submitting}
        disabled={blocked}
        title={
          quoting || !quote
            ? "Считаем…"
            : outOfZone
              ? "Укажите другой адрес"
              : delivery && !place.address
                ? "Укажите адрес"
                : payment === "online"
                  ? `Перейти к оплате · ${money(quote.total_amount)}`
                  : `Подтвердить${delivery ? " заказ" : ""} · ${money(quote.total_amount)}`
        }
        onPress={() => (missing ? showMissing() : submit())}
      />
      {needsConsent ? <ConsentChecks withOffer value={agreements} onChange={setAgreements} /> : <ConsentNote />}
    </Panel>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScreenHeader title="Оформление" />
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        <Shell>
          <Columns main={main} side={side} />
        </Shell>
      </ScrollView>
    </View>
  );
}

/** The times one can order for, as a dropdown list: one row per slot, the picked one ticked. */
function SlotList({ slots, value, onPick }: { slots: string[]; value: string | null; onPick: (slot: string) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ maxHeight: 288, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surfaceCard, overflow: "hidden" }}>
      <ScrollView nestedScrollEnabled>
        {slots.map((slot, index) => {
          const active = slot === value;
          return (
            <Pressable
              key={slot}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => onPick(slot)}
              style={({ pressed }) => ({
                height: 48,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                borderTopWidth: index ? 1 : 0,
                borderTopColor: c.line,
                backgroundColor: active ? c.brandSoft : pressed ? c.surfaceSunken : "transparent",
              })}
            >
              <T weight={active ? "semibold" : "medium"} color={active ? c.brandText : c.ink}>
                {slotLabel(slot)}
              </T>
              {active ? <Icon name="check" size={20} color={c.brandText} strokeWidth={2.2} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
