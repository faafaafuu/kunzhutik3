// Where to deliver: address search, my location, saved addresses — or pickup from a venue.
// With ?save=1 the address is stored in the profile instead (Профиль → Адреса).

import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { api, ApiError } from "@/api/client";
import type { GeoResult, SavedAddress, Venue, Zone } from "@/api/types";
import { ScreenHeader } from "@/components/Chrome";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toast";
import { Button, Field, Muted, Notice, OptionRow, Segmented, Shell, T, Toggle } from "@/components/ui";
import { useFetch } from "@/hooks/data";
import { money } from "@/lib/format";
import { emptyDetails, usePlace } from "@/store/place";
import { useSignedIn } from "@/store/session";
import { radius, useTheme } from "@/theme";

type Check = { state: "idle" | "checking" | "ok" | "out" | "error"; zone?: Zone; venue?: Venue; message?: string };

export default function AddressScreen() {
  const params = useLocalSearchParams<{ save?: string; id?: string }>();
  const saveMode = params.save === "1";
  const router = useRouter();
  const { c } = useTheme();
  const signedIn = useSignedIn();
  const place = usePlace();
  const [fulfillment, setFulfillment] = useState(saveMode ? "delivery" : place.fulfillment);
  const [query, setQuery] = useState(place.address && !saveMode ? place.address.text : "");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<GeoResult | null>(null);
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const [locating, setLocating] = useState(false);
  const [label, setLabel] = useState("");
  const [details, setDetails] = useState({ ...emptyDetails });
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const typed = useRef(false);
  const venues = useFetch<{ venues: Venue[] }>("/venues");
  const saved = useFetch<{ addresses: SavedAddress[] }>(signedIn && !saveMode ? "/me/addresses" : null);

  useEffect(() => {
    if (!typed.current || query.trim().length < 3 || picked?.text === query) return;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const payload = await api<{ results: GeoResult[] }>(`/geo/suggest?q=${encodeURIComponent(query.trim())}`, { auth: false });
        setResults(payload.results);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, picked]);

  const choose = async (result: GeoResult) => {
    setPicked(result);
    setQuery(result.text);
    setResults([]);
    setCheck({ state: "checking" });
    try {
      const resolution = await api<{ venue: Venue; zone: Zone }>("/venues/resolve", { method: "POST", body: { latitude: result.latitude, longitude: result.longitude }, auth: false });
      setCheck({ state: "ok", zone: resolution.zone, venue: resolution.venue });
    } catch (error) {
      const code = (error as ApiError).code;
      setCheck(code === "out_of_delivery_zone" ? { state: "out" } : { state: "error", message: (error as ApiError).message });
    }
  };

  const locate = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        toast("Нет доступа к геолокации — введите адрес вручную", "bad");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = position.coords;
      const payload = await api<{ result: GeoResult | null }>(`/geo/reverse?lat=${latitude}&lon=${longitude}`, { auth: false });
      const result = payload.result ? { ...payload.result, latitude, longitude } : { title: "Моё местоположение", subtitle: "", text: "Моё местоположение", latitude, longitude, precise: false };
      typed.current = false;
      await choose(result);
    } catch {
      toast("Не удалось определить место", "bad");
    } finally {
      setLocating(false);
    }
  };

  const confirmDelivery = () => {
    if (!picked) return;
    place.setFulfillment("delivery");
    place.setAddress({ text: picked.text, latitude: picked.latitude, longitude: picked.longitude, details: place.address?.text === picked.text ? place.address.details : { ...emptyDetails } });
    router.canGoBack() ? router.back() : router.replace("/");
  };

  const useSaved = (address: SavedAddress) => {
    place.setFulfillment("delivery");
    place.setAddress({
      text: address.text,
      latitude: address.latitude,
      longitude: address.longitude,
      details: { entrance: address.entrance, floor: address.floor, apartment: address.apartment, intercom: address.intercom },
      savedId: address.id,
      label: address.label,
    });
    router.canGoBack() ? router.back() : router.replace("/");
  };

  const choosePickup = (venue: Venue) => {
    place.setPickupVenue(venue.id);
    place.setFulfillment("pickup");
    router.canGoBack() ? router.back() : router.replace("/");
  };

  const saveToProfile = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      await api("/me/addresses", { method: "POST", body: { label, text: picked.text, latitude: picked.latitude, longitude: picked.longitude, ...details, is_default: makeDefault } });
      toast("Адрес сохранён");
      router.back();
    } catch (error) {
      toast((error as ApiError).message, "bad");
    } finally {
      setSaving(false);
    }
  };

  const pickupVenues = (venues.data?.venues ?? []).filter((venue) => venue.pickup_enabled);

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScreenHeader title={saveMode ? "Новый адрес" : "Куда доставить"} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Shell style={{ gap: 16, maxWidth: 640 }}>
          {!saveMode ? (
            <Segmented
              value={fulfillment}
              onChange={setFulfillment}
              options={[
                { value: "delivery", label: "Доставка" },
                { value: "pickup", label: "Самовывоз" },
              ]}
            />
          ) : (
            <Field label="Название" value={label} onChangeText={setLabel} placeholder="Дом, работа, дача" />
          )}

          {fulfillment === "pickup" ? (
            <View style={{ gap: 10 }}>
              {pickupVenues.map((venue) => (
                <OptionRow
                  key={venue.id}
                  selected={place.fulfillment === "pickup" && (place.pickupVenueId ?? pickupVenues[0]?.id) === venue.id}
                  onPress={() => choosePickup(venue)}
                  icon="store"
                  title={venue.address}
                  subtitle={`${venue.is_open ? "открыто" : "закрыто"} · ${venue.hours_text} · готовим ~${venue.cook_minutes} мин`}
                />
              ))}
              {venues.loading ? <ActivityIndicator color={c.brand} /> : null}
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <View>
                <Field
                  label="Улица и дом"
                  value={query}
                  onChangeText={(value) => {
                    typed.current = true;
                    setQuery(value);
                    setPicked(null);
                    setCheck({ state: "idle" });
                  }}
                  placeholder="Начните вводить адрес"
                  autoFocus={!place.address}
                  autoCorrect={false}
                />
                {searching ? <ActivityIndicator color={c.brand} style={{ position: "absolute", right: 14, top: 40 }} /> : null}
              </View>
              {results.length ? (
                <View style={{ borderRadius: radius.md, backgroundColor: c.surfaceCard, overflow: "hidden" }}>
                  {results.map((result, index) => (
                    <Pressable
                      key={`${result.text}-${index}`}
                      accessibilityRole="button"
                      onPress={() => {
                        typed.current = false;
                        choose(result);
                      }}
                      style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: index ? 1 : 0, borderTopColor: c.line, backgroundColor: pressed ? c.surfaceSunken : "transparent" })}
                    >
                      <T weight="semibold">{result.title}</T>
                      {result.subtitle ? <Muted size={13}>{result.subtitle}</Muted> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Button tone="tonal" size="sm" icon="locate" title={locating ? "Определяем…" : "Моё местоположение"} onPress={locate} disabled={locating} />

              {check.state === "checking" ? <ActivityIndicator color={c.brand} /> : null}
              {check.state === "out" ? (
                <Notice tone="bad" icon="map">
                  <T weight="bold" size={14} color={c.danger}>
                    Сюда пока не доставляем.
                  </T>{" "}
                  Можно забрать заказ самим — переключитесь на «Самовывоз».
                </Notice>
              ) : null}
              {check.state === "error" ? <Notice tone="bad">{check.message}</Notice> : null}
              {check.state === "ok" && check.zone ? (
                <Notice tone="good" icon="truck">
                  Доставим за ~{check.zone.eta_minutes} мин · {Number(check.zone.delivery_fee) ? money(check.zone.delivery_fee) : "бесплатно"}
                  {check.zone.free_delivery_from ? `, бесплатно от ${money(check.zone.free_delivery_from)}` : ""} · минимальный заказ {money(check.zone.min_order_amount)}
                </Notice>
              ) : null}
              {picked && !picked.precise && check.state === "ok" ? <Notice tone="warn">Уточните номер дома — так курьер точно найдёт вас.</Notice> : null}

              {saveMode ? (
                <>
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    {(["entrance", "floor", "apartment", "intercom"] as const).map((key) => (
                      <Field
                        key={key}
                        label={{ entrance: "Подъезд", floor: "Этаж", apartment: "Квартира", intercom: "Домофон" }[key]}
                        value={details[key]}
                        onChangeText={(value) => setDetails((current) => ({ ...current, [key]: value }))}
                        style={{ flex: 1, minWidth: 120 }}
                      />
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Toggle value={makeDefault} onChange={setMakeDefault} label="Сделать основным" />
                    <T>Сделать основным</T>
                  </View>
                  <Button title="Сохранить" onPress={saveToProfile} disabled={!picked || check.state === "checking"} loading={saving} />
                </>
              ) : (
                <Button title="Доставить сюда" block onPress={confirmDelivery} disabled={!picked || check.state !== "ok"} />
              )}

              {saved.data?.addresses.length ? (
                <View style={{ gap: 10, marginTop: 8 }}>
                  <T weight="semibold" size={16}>
                    Сохранённые адреса
                  </T>
                  {saved.data.addresses.map((address) => (
                    <OptionRow
                      key={address.id}
                      selected={place.address?.savedId === address.id}
                      onPress={() => useSaved(address)}
                      icon="pin"
                      title={address.label || address.text}
                      subtitle={address.label ? address.text : undefined}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          )}
          {!saveMode && fulfillment === "delivery" ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Icon name="map" size={18} color={c.inkSoft} />
              <Muted size={13} style={{ flex: 1 }}>
                Доставляем в пределах зон на карте. Если адреса нет в зоне — заказ можно забрать самим.
              </Muted>
            </View>
          ) : null}
        </Shell>
      </ScrollView>
    </View>
  );
}
