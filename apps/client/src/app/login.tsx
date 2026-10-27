// Sign in by phone: a 4-digit SMS code, sent automatically on the last digit.

import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";

import { api, ApiError } from "@/api/client";
import type { Customer, Tokens } from "@/api/types";
import { ScreenHeader } from "@/components/Chrome";
import { toast } from "@/components/Toast";
import { Button, Field, LinkButton, Muted, Notice, Panel, Shell, T, Title } from "@/components/ui";
import { maskPhone, phoneComplete } from "@/lib/format";
import { useSession } from "@/store/session";
import { fonts, radius, useTheme } from "@/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const signIn = useSession((state) => state.signIn);
  const guestPhone = useSession((state) => state.guest.phone);
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState(guestPhone || "+7");
  const [code, setCode] = useState("");
  const [length, setLength] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    setLimited(null);
    try {
      const result = await api<{ retry_after: number; length: number; debug_code?: string }>("/auth/otp/request", { method: "POST", body: { phone }, auth: false });
      setLength(result.length);
      setWait(result.retry_after);
      setStep("code");
      setCode(result.debug_code ?? "");
      if (result.debug_code) toast(`Тестовый режим: код ${result.debug_code}`);
      setTimeout(() => input.current?.focus(), 100);
    } catch (caught) {
      const apiError = caught as ApiError;
      if (apiError.code === "otp_rate_limited") {
        setLimited(apiError.message);
        if (apiError.details.retry_after) setWait(Number(apiError.details.retry_after));
      } else setError(apiError.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ customer: Customer; tokens: Tokens }>("/auth/otp/verify", { method: "POST", body: { phone, code: value }, auth: false });
      signIn(result.customer, result.tokens);
      toast("Вы вошли");
      router.canGoBack() ? router.back() : router.replace("/profile");
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setBusy(false);
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
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 24 }}>
        <Shell style={{ maxWidth: 460 }}>
          <Panel>
            {step === "phone" ? (
              <>
                <Title size={26}>Вход</Title>
                <Muted>Пришлём код в SMS. Пароль не нужен.</Muted>
                {limited ? <Notice tone="bad" icon="clock">{limited}</Notice> : null}
                <Field label="Телефон" value={phone} onChangeText={(value) => setPhone(maskPhone(value))} keyboardType="phone-pad" autoComplete="tel" error={error} autoFocus onSubmitEditing={() => phoneComplete(phone) && requestCode()} />
                <Button block title="Получить код" onPress={requestCode} loading={busy} disabled={!phoneComplete(phone) || (Boolean(limited) && wait > 0)} />
                <Muted size={12}>Без входа тоже можно заказать — нужны только имя и телефон.</Muted>
              </>
            ) : (
              <>
                <LinkButton title="← Изменить номер" onPress={() => setStep("phone")} />
                <Title size={26}>Код из SMS</Title>
                <Muted>Отправили на {phone}</Muted>
                <View>
                  <View style={{ flexDirection: "row", gap: 8 }} pointerEvents="none">
                    {Array.from({ length }).map((_, index) => (
                      <View
                        key={index}
                        style={{
                          flex: 1,
                          height: 64,
                          borderRadius: radius.sm,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: c.surfaceSunken,
                          borderWidth: 1,
                          borderColor: error ? c.danger : index === code.length ? c.brand : "transparent",
                        }}
                      >
                        <T weight="bold" size={26}>
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
                    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, fontFamily: fonts.bold, color: "transparent" }}
                  />
                </View>
                {error ? (
                  <T size={13} color={c.danger}>
                    {error}
                  </T>
                ) : null}
                <LinkButton title={wait > 0 ? `Отправить ещё раз через 0:${String(wait).padStart(2, "0")}` : "Отправить новый код"} disabled={wait > 0 || busy} onPress={requestCode} />
              </>
            )}
          </Panel>
        </Shell>
      </ScrollView>
    </View>
  );
}
