// Bonuses: balance and level for a signed-in customer, the programme for a guest.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/api/client";
import type { Loyalty } from "@/api/types";
import { MobileHeader, TopBar } from "@/components/Chrome";
import { InviteFriend } from "@/components/InviteFriend";
import { Button, Muted, Progress, Shell, Skeleton, T, Title } from "@/components/ui";
import { useShared } from "@/hooks/data";
import { dayLabel, money } from "@/lib/format";
import { useSession } from "@/store/session";
import { radius, useTheme, useWide } from "@/theme";

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
  const card = { padding: 24, borderRadius: radius.lg, backgroundColor: c.surfaceCard } as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: wide ? 0 : insets.top }}>
      <TopBar />
      <MobileHeader />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <Shell style={{ gap: 16, paddingTop: wide ? 20 : 4, maxWidth: 760 }}>
          <Title>Бонусы</Title>

          <View style={[card, { alignItems: "center", gap: 8, backgroundColor: c.brandSoft }]}>
            <T weight="semibold" size={13} color={c.brandText}>
              {loyalty ? `Ваш баланс · уровень «${loyalty.level.title}»` : "Кэшбэк бонусами"}
            </T>
            {signedIn && !loyalty ? (
              <Skeleton style={{ height: 52, width: 160 }} />
            ) : (
              <T weight="bold" size={48} color={c.brandText} style={{ lineHeight: 54, letterSpacing: -1.5 }}>
                {loyalty ? Math.floor(Number(loyalty.balance)).toLocaleString("ru-RU") : `${lowest}–${highest}%`}
              </T>
            )}
            <T size={14} color={c.inkSoft} style={{ textAlign: "center", maxWidth: 420 }}>
              {loyalty
                ? `1 бонус = 1 ₽. Начисляем ${loyalty.level.percent}% с заказа, оплатить можно до ${maxRedeem}% следующего.`
                : `1 бонус = 1 ₽. ${config?.bonus.welcome ? `${config.bonus.welcome} бонусов сразу за регистрацию, дальше ` : ""}копите с каждого заказа и оплачивайте до ${maxRedeem}% следующего.`}
            </T>
            {loyalty?.next_level && loyalty.to_next_level ? (
              <View style={{ alignSelf: "stretch", gap: 6, marginTop: 8 }}>
                <Progress value={progress} />
                <Muted size={13} style={{ textAlign: "center" }}>
                  До уровня «{loyalty.next_level.title}» осталось {money(loyalty.to_next_level)}
                </Muted>
              </View>
            ) : null}
            {!signedIn ? (
              <View style={{ alignSelf: "stretch", marginTop: 8 }}>
                <Button block title="Войти и копить" onPress={() => router.push("/login")} />
              </View>
            ) : null}
          </View>

          <InviteFriend />

          <View style={card}>
            <T weight="bold" size={18} style={{ marginBottom: 4 }}>
              Уровни
            </T>
            {levels.map((level, index) => {
              const mine = loyalty?.level.title === level.title;
              return (
                <View key={level.title} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderTopWidth: index ? 1 : 0, borderTopColor: c.line }}>
                  <View style={{ flex: 1 }}>
                    <T weight="semibold" color={mine ? c.brandText : c.ink}>
                      {level.title}
                      {mine ? " · ваш" : ""}
                    </T>
                    <Muted size={13}>{level.threshold ? `от ${money(level.threshold)} за 90 дней` : "с первого заказа"}</Muted>
                  </View>
                  <T weight="bold" size={18} color={mine ? c.brandText : c.ink}>
                    {level.percent}%
                  </T>
                </View>
              );
            })}
          </View>

          {loyalty?.history.length ? (
            <View style={card}>
              <T weight="bold" size={18} style={{ marginBottom: 4 }}>
                История
              </T>
              {loyalty.history.map((row, index) => (
                <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: c.line }}>
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
