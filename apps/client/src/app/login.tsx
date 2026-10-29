// Sign in: Telegram (the bot confirms), Google, or the phone with a 4-digit SMS code sent on the last digit.

import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { api, ApiError } from "@/api/client";
import type { Customer, Tokens } from "@/api/types";
import { ScreenHeader } from "@/components/Chrome";
import { agreed, ConsentChecks, noAgreements } from "@/components/Legal";
import { toast } from "@/components/Toast";
import { Button, Field, LinkButton, Muted, Notice, Shell, T, Title } from "@/components/ui";
import { collectLogin, finishWebRedirect, forgetTelegramLogin, LOGIN_ERRORS, openTelegram, pendingTelegramSecret, startGoogleLogin, startTelegramLogin } from "@/lib/auth";
import { useShared } from "@/hooks/data";
import { maskPhone, phoneComplete } from "@/lib/format";
import { isTelegram } from "@/lib/telegram";
import { useSession } from "@/store/session";
import { fonts, radius, useTheme } from "@/theme";

const POLL_MS = 1500;

type Step = "choose" | "code" | "telegram";

export default function LoginScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const signIn = useSession((state) => state.signIn);
  const guestPhone = useSession((state) => state.guest.phone);
  const [step, setStep] = useState<Step>("choose");
  const [phone, setPhone] = useState(guestPhone || "+7");
  const [code, setCode] = useState("");
  const [length, setLength] = useState(4);
  const [busy, setBusy] = useState<"phone" | "telegram" | "google" | "code" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [telegram, setTelegram] = useState<{ url: string | null; app_url?: string; secret: string } | null>(null);
  // The consent boxes of this screen. Ticked once for the current edition of the documents, they are not shown again.
  const [agreements, setAgreements] = useState(noAgreements);
  const config = useShared((state) => state.config);
  const consentVersion = useSession((state) => state.consentVersion);
  const needsConsent = !config?.consent_version || consentVersion !== config.consent_version;
  const ready = !needsConsent || agreed(agreements);
  const agreement = { consent: needsConsent && agreed(agreements), marketing_consent: needsConsent && agreed(agreements) && agreements.ads };
  const rememberConsent = () => needsConsent && config?.consent_version && useSession.getState().setConsentVersion(config.consent_version);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  const done = useCallback(
    (next?: string | null) => {
      forgetTelegramLogin();
      toast("Вы вошли");
      if (next) router.replace(next as never);
      else router.canGoBack() ? router.back() : router.replace("/");
    },
    [router],
  );

  // Back from Google (web), or a Telegram login this page started before it was reloaded.
  useEffect(() => {
    finishWebRedirect().then((result) => {
      if (!result) {
        const secret = pendingTelegramSecret();
        if (secret) {
          setTelegram({ url: null, secret });
          setStep("telegram");
        }
        return;
      }
      if (result.error) setError(result.error);
      else if (useSession.getState().tokens) done(result.next);
    });
  }, [done]);

  // Telegram: ask every two seconds, and right away when the person comes back from the Telegram app.
  useEffect(() => {
    if (step !== "telegram" || !telegram) return;
    let stopped = false;
    const check = async () => {
      try {
        if ((await collectLogin(telegram.secret)) && !stopped) done();
      } catch (caught) {
        if (stopped) return;
        forgetTelegramLogin();
        setTelegram(null);
        setStep("choose");
        setError((caught as ApiError).status === 410 ? LOGIN_ERRORS.login_expired : (caught as ApiError).message);
      }
    };
    const timer = setInterval(check, POLL_MS);
    const subscription = AppState.addEventListener("change", (state) => state === "active" && check());
    return () => {
      stopped = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [step, telegram, done]);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const withTelegram = async () => {
    setBusy("telegram");
    setError(null);
    try {
      const started = await startTelegramLogin(agreement);
      rememberConsent();
      setTelegram(started);
      setStep("telegram");
      openTelegram(started.url, started.app_url);
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const withGoogle = async () => {
    setBusy("google");
    setError(null);
    rememberConsent();
    const failure = await startGoogleLogin("/", agreement);
    if (Platform.OS !== "web") {
      setBusy(null);
      if (failure) setError(failure);
      else if (useSession.getState().tokens) done();
    }
  };

  const requestCode = async () => {
    setBusy("phone");
    setError(null);
    setLimited(null);
    try {
      const result = await api<{ retry_after: number; length: number; debug_code?: string }>("/auth/otp/request", { method: "POST", body: { phone, ...agreement }, auth: false });
      rememberConsent();
      setLength(result.length);
      setWait(result.retry_after);
      setStep("code");
      setCode(result.debug_code ?? "");
      if (result.debug_code) toast(`Тестовый режим: код ${result.debug_code}`);
      setTimeout(() => input.current?.focus(), 100);
    } catch (caught) {
      const apiError = caught as ApiError;
      if (apiError.code === "consent_required") useSession.getState().setConsentVersion(null);
      if (apiError.code === "otp_rate_limited") {
        setLimited(apiError.message);
        if (apiError.details.retry_after) setWait(Number(apiError.details.retry_after));
      } else setError(apiError.message);
    } finally {
      setBusy(null);
    }
  };

  const verify = async (value: string) => {
    setBusy("code");
    setError(null);
    try {
      const result = await api<{ customer: Customer; tokens: Tokens }>("/auth/otp/verify", { method: "POST", body: { phone, code: value }, auth: false });
      signIn(result.customer, result.tokens);
      done();
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const onCode = (raw: string) => {
    const value = raw.replace(/\D/g, "").slice(0, length);
    setCode(value);
    setError(null);
    if (value.length === length) verify(value);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScreenHeader title="Вход" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 16, paddingBottom: 48 }}>
        <Shell style={{ maxWidth: 420, gap: 16 }}>
          {step === "choose" ? (
            <>
              <View style={{ alignItems: "center", gap: 6, paddingBottom: 8 }}>
                <Title size={28} style={{ textAlign: "center" }}>
                  Вход в Брайт
                </Title>
                <Muted style={{ textAlign: "center" }}>Бонусы, адреса и заказы — на всех устройствах</Muted>
              </View>
              {/* A sign-in way that is not set up yet is news, not a failure. */}
              {error ? <Notice tone={error.includes("скоро заработает") ? "info" : "bad"}>{error}</Notice> : null}
              {needsConsent ? <ConsentChecks value={agreements} onChange={setAgreements} /> : null}
              {isTelegram() ? null : <ProviderButton kind="telegram" loading={busy === "telegram"} onPress={withTelegram} disabled={!ready} />}
              <ProviderButton kind="google" loading={busy === "google"} onPress={withGoogle} disabled={!ready} />
              <Divider label="или по номеру телефона" />
              {limited ? (
                <Notice tone="bad" icon="clock">
                  {limited}
                </Notice>
              ) : null}
              <Field value={phone} onChangeText={(value) => setPhone(maskPhone(value))} keyboardType="phone-pad" autoComplete="tel" accessibilityLabel="Телефон" placeholder="+7 900 000-00-00" onSubmitEditing={() => phoneComplete(phone) && requestCode()} style={{ textAlign: "center", fontSize: 17 }} />
              <Button block title="Получить код в SMS" onPress={requestCode} loading={busy === "phone"} disabled={!ready || !phoneComplete(phone) || (Boolean(limited) && wait > 0)} />
              <Muted size={13} style={{ textAlign: "center" }}>
                Без входа тоже можно заказать — нужны только имя и телефон
              </Muted>
            </>
          ) : step === "telegram" ? (
            <View style={{ alignItems: "center", gap: 12, paddingTop: 24 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.telegram, alignItems: "center", justifyContent: "center" }}>
                <TelegramMark size={36} />
              </View>
              <Title size={24} style={{ textAlign: "center" }}>
                Подтвердите вход в Telegram
              </Title>
              <Muted style={{ textAlign: "center", maxWidth: 340 }}>Нажмите «Подтвердить вход» в чате с ботом и вернитесь сюда — мы сразу вас впустим.</Muted>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                <ActivityIndicator color={c.inkSoft} size="small" />
                <Muted size={13}>Ждём подтверждения</Muted>
              </View>
              <View style={{ alignSelf: "stretch", gap: 8 }}>
                {telegram?.url ? <Button block tone="tonal" title="Открыть Telegram ещё раз" onPress={() => openTelegram(telegram.url!, telegram.app_url)} /> : null}
                <Button
                  block
                  tone="tonal"
                  title="Другой способ входа"
                  onPress={() => {
                    forgetTelegramLogin();
                    setTelegram(null);
                    setStep("choose");
                  }}
                />
              </View>
            </View>
          ) : (
            <>
              <View style={{ alignItems: "center", gap: 6 }}>
                <Title size={26} style={{ textAlign: "center" }}>
                  Код из SMS
                </Title>
                <Muted style={{ textAlign: "center" }}>Отправили на {phone}</Muted>
              </View>
              <View>
                <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }} pointerEvents="none">
                  {Array.from({ length }).map((_, index) => (
                    <View
                      key={index}
                      style={{
                        width: 64,
                        height: 68,
                        borderRadius: radius.sm,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: c.surfaceCard,
                        borderWidth: 1.5,
                        borderColor: error ? c.danger : index === code.length ? c.brand : c.line,
                      }}
                    >
                      <T weight="bold" size={28}>
                        {code[index] ?? ""}
                      </T>
                    </View>
                  ))}
                </View>
                <TextInput
                  ref={input}
                  value={code}
                  onChangeText={onCode}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={length}
                  autoFocus
                  accessibilityLabel="Код из SMS"
                  caretHidden
                  selectionColor="transparent"
                  // The digits are drawn by the cells; the real field only takes the keyboard: no caret, no focus ring.
                  style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.01, fontFamily: fonts.bold, fontSize: 1, color: "transparent", backgroundColor: "transparent", caretColor: "transparent", outlineStyle: "none", outlineWidth: 0, outlineColor: "transparent", borderWidth: 0, boxShadow: "none", WebkitTapHighlightColor: "transparent", WebkitAppearance: "none" } as object}
                />
              </View>
              {error ? (
                <T size={13} color={c.danger} style={{ textAlign: "center" }}>
                  {error}
                </T>
              ) : null}
              <View style={{ alignItems: "center", gap: 14, paddingTop: 4 }}>
                <LinkButton title={wait > 0 ? `Отправить ещё раз через 0:${String(wait).padStart(2, "0")}` : "Отправить новый код"} disabled={wait > 0 || busy !== null} onPress={requestCode} />
                <LinkButton title="Изменить номер" color={c.inkSoft} onPress={() => setStep("choose")} />
              </View>
            </>
          )}
        </Shell>
      </ScrollView>
    </View>
  );
}

function ProviderButton({ kind, loading, onPress, disabled }: { kind: "telegram" | "google"; loading: boolean; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  const telegram = kind === "telegram";
  const fg = telegram ? "#ffffff" : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={loading || disabled}
      style={({ pressed }) => ({
        height: 54,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        borderRadius: radius.pill,
        backgroundColor: telegram ? c.telegram : c.surfaceCard,
        borderWidth: telegram ? 0 : 1,
        borderColor: c.line,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      })}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : telegram ? <TelegramMark size={22} /> : <GoogleMark size={20} />}
      <T weight="semibold" size={16} color={fg}>
        {telegram ? "Войти через Telegram" : "Войти через Google"}
      </T>
    </Pressable>
  );
}

function Divider({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
      <Muted size={13}>{label}</Muted>
      <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
    </View>
  );
}

function TelegramMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#ffffff" d="M20.7 4.3 2.9 11.2c-1.2.5-1.2 1.2-.2 1.5l4.6 1.4 1.7 5.3c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.2-2.1 4.6 3.4c.8.5 1.4.2 1.7-.8l3-14.3c.3-1.3-.5-1.9-1.6-1.7zm-3 3.6-8 7.2-.3 3.3-1.6-4.6 9.5-6.2c.5-.3.8 0 .4.3z" />
    </Svg>
  );
}

function GoogleMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}
