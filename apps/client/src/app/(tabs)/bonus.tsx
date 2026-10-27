// Bonuses: balance and level for a signed-in customer, the programme for a guest.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/api/client";
import type { Loyalty } from "@/api/types";
import { TopBar } from "@/components/Chrome";
import { Button, Muted, Progress, Shell, Skeleton, T, Title } from "@/components/ui";
import { useShared } from "@/hooks/data";
import { dayLabel, money } from "@/lib/format";
import { useSession } from "@/store/session";
import { cardShadow, radius, useTheme, useWide } from "@/theme";

export default function BonusScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const signedIn = useSession((state) => Boolean(state.tokens));
  const config = useShared((state) => state.config);
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (signedIn) api<Loyalty>("/loyalty/me").then(setLoyalty).catch(() => setLoyalty(null));
    }, [signedIn]),
  );

  const levels = loyalty?.levels ?? config?.bonus.levels ?? [];
  const maxRedeem = loyalty?.max_redeem_percent ?? config?.bonus.max_redeem_percent ?? 30;
  const lowest = levels[0]?.percent ?? 3;
  const highest = levels[levels.length - 1]?.percent ?? 7;
  const progress = loyalty?.next_level ? (Number(loyalty.spent_90_days) / loyalty.next_level.threshold) * 100 : 100;

  const card = { padding: 24, borderRadius: radius.lg, gap: 12, flex: wide ? 1 : undefined } as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: wide ? 0 : insets.top }}>
      <TopBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <Shell style={{ gap: 16, paddingTop: 20 }}>
          <Title>Бонусы</Title>
          <View style={{ flexDirection: wide ? "row" : "column", gap: 16, alignItems: wide ? "flex-start" : "stretch" }}>
            <View style={[card, { backgroundColor: c.brandSoft }]}>
              <T weight="semibold" size={13} color={c.inkSoft}>
                {signedIn && loyalty ? `Бонусы · уровень «${loyalty.level.title}»` : "Бонусы"}
              </T>
              {signedIn && !loyalty ? (
                <Skeleton style={{ height: 44, width: 160 }} />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
                  <T weight="bold" size={44} color={c.brandText} style={{ lineHeight: 48, letterSpacing: -1 }}>
                    {loyalty ? Math.floor(Number(loyalty.balance)).toLocaleString("ru-RU") : `${lowest}–${highest}%`}
                  </T>
                  <T color={c.inkSoft}>{loyalty ? `= ${money(loyalty.balance)}` : "с заказа"}</T>
                </View>
              )}
              <T size={14} color={c.inkSoft}>
                {loyalty
                  ? `Начисляем ${loyalty.level.percent}% с выполненного заказа. Оплачивайте бонусами до ${maxRedeem}% следующего.`
                  : `Возвращаем бонусами: 1 бонус = 1 ₽. Войдите по телефону — и копите с первого заказа. Бонусами можно оплатить до ${maxRedeem}% заказа.`}
              </T>
              {!signedIn ? <Button size="sm" title="Войти" onPress={() => router.push("/login")} /> : null}
            </View>

            <View style={[card, { backgroundColor: c.surfaceCard }, cardShadow(c)]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <T weight="semibold" size={19}>
                  Уровни
                </T>
                {loyalty?.next_level && loyalty.to_next_level ? (
                  <View style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.sesameSoft }}>
                    <T weight="semibold" size={13} color={c.sesameText}>
                      до «{loyalty.next_level.title}» {money(loyalty.to_next_level)}
                    </T>
                  </View>
                ) : null}
              </View>
              {loyalty ? <Progress value={progress} /> : null}
              {levels.map((level) => {
                const mine = loyalty?.level.title === level.title;
                return (
                  <View
                    key={level.title}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: c.surfaceSunken, borderWidth: 2, borderColor: mine ? c.brand : "transparent" }}
                  >
                    <View>
                      <T weight="semibold">
                        {level.title}
                        {mine ? " · ваш уровень" : ""}
                      </T>
                      <Muted size={13}>{level.threshold ? `от ${money(level.threshold)} за 90 дней` : "с первого заказа"}</Muted>
                    </View>
                    <View style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.sesameSoft }}>
                      <T weight="semibold" size={13} color={c.sesameText}>
                        {level.percent}%
                      </T>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {loyalty?.history.length ? (
            <View style={[{ padding: 24, borderRadius: radius.lg, gap: 10, backgroundColor: c.surfaceCard }, cardShadow(c)]}>
              <T weight="semibold" size={19}>
                История начислений
              </T>
              {loyalty.history.map((row) => (
                <View key={row.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <T size={14}>{row.comment}</T>
                    <Muted size={12}>{dayLabel(row.created_at)}</Muted>
                  </View>
                  <T weight="semibold" color={Number(row.amount) < 0 ? c.danger : c.success}>
                    {Number(row.amount) > 0 ? "+" : ""}
                    {Math.round(Number(row.amount))}
                  </T>
                </View>
              ))}
            </View>
          ) : null}
        </Shell>
      </ScrollView>
    </View>
  );
}
