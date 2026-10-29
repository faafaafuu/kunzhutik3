// «Приведи друга» on the bonus screen: the customer's code to share, what it brought, and a field for a friend's code.

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Share, View } from "react-native";

import { api, ApiError } from "@/api/client";
import type { Referral } from "@/api/types";
import { useShared } from "@/hooks/data";
import { plural } from "@/lib/format";
import { useSession } from "@/store/session";
import { radius, useTheme } from "@/theme";

import { toast } from "./Toast";
import { Button, Field, Muted, T } from "./ui";

export function InviteFriend() {
  const { c } = useTheme();
  const router = useRouter();
  const signedIn = useSession((state) => Boolean(state.tokens));
  const programme = useShared((state) => state.config?.bonus.referral);
  const [referral, setReferral] = useState<Referral | null>(null);
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (signedIn) api<Referral>("/me/referral").then(setReferral).catch(() => setReferral(null));
  }, [signedIn]);

  if (!programme?.enabled) return null;
  const terms = `Вам ${programme.referrer} и другу ${programme.friend} бонусов, когда он сделает первый заказ от ${programme.min_order} ₽.`;

  const share = async () => {
    if (!referral) return;
    const message = `Заказываю еду в «Брайтс» — держи ${programme.friend} бонусов на первый заказ: ${referral.link}`;
    try {
      if (Platform.OS !== "web") {
        await Share.share({ message });
        return;
      }
      const nav = navigator as Navigator & { share?: (data: { text: string; url: string }) => Promise<void> };
      if (nav.share) await nav.share({ text: message, url: referral.link });
      else {
        await navigator.clipboard.writeText(message);
        toast("Ссылка скопирована — отправьте её другу");
      }
    } catch {
      // The share sheet was closed.
    }
  };

  const apply = async () => {
    setApplying(true);
    try {
      setReferral(await api<Referral>("/me/referral/apply", { method: "POST", body: { code: code.trim() } }));
      toast("Код друга принят");
      setCode("");
    } catch (caught) {
      toast((caught as ApiError).message, "bad");
    } finally {
      setApplying(false);
    }
  };

  return (
    <View style={{ padding: 24, borderRadius: radius.lg, backgroundColor: c.surfaceCard, gap: 12 }}>
      <T weight="bold" size={18}>
        Приведи друга
      </T>
      <Muted>{terms}</Muted>
      {!signedIn ? (
        <Button block tone="tonal" title="Войти и получить свой код" onPress={() => router.push("/login")} />
      ) : referral ? (
        <>
          <View style={{ alignItems: "center", gap: 2, paddingVertical: 12, borderRadius: radius.md, backgroundColor: c.surfaceSunken }}>
            <Muted size={13}>Ваш код</Muted>
            <T weight="bold" size={30} style={{ letterSpacing: 4 }}>
              {referral.code}
            </T>
          </View>
          <Button block title="Поделиться ссылкой" icon="send" onPress={share} />
          {referral.invited ? (
            <Muted size={13} style={{ textAlign: "center" }}>
              По вашему коду пришли {referral.invited} {plural(referral.invited, "друг", "друга", "друзей")}
              {Number(referral.earned) ? ` · вы получили ${Math.round(Number(referral.earned))} бонусов` : " · бонусы придут после их первого заказа"}
            </Muted>
          ) : null}
          {referral.can_apply ? (
            <View style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.line }}>
              <T weight="semibold">Есть код друга?</T>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Field value={code} onChangeText={(value) => setCode(value.toUpperCase())} placeholder="Например, K7M2PQ" autoCapitalize="characters" autoCorrect={false} maxLength={12} style={{ flex: 1, letterSpacing: 2 }} />
                <Button title="Применить" tone="tonal" loading={applying} disabled={code.trim().length < 4} onPress={apply} />
              </View>
            </View>
          ) : referral.applied ? (
            <Muted size={13} style={{ textAlign: "center" }}>
              Код друга уже применён
            </Muted>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
