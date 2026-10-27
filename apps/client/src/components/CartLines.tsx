import { Image } from "expo-image";
import { Pressable, View } from "react-native";

import { assetUrl } from "@/api/client";
import type { Quote } from "@/api/types";
import { modifiersText, money } from "@/lib/format";
import { type CartLine, linePrice, useCart } from "@/store/cart";
import { radius, useTheme } from "@/theme";

import { Icon } from "./Icon";
import { QtyControl, T } from "./ui";

/** Cart lines with quantities. A line the quote marks unavailable turns red and can only be removed. */
export function CartLines({ quote }: { quote: Quote | null }) {
  const lines = useCart((state) => state.lines);
  return (
    <View style={{ gap: 10 }}>
      {lines.map((line, index) => (
        <Line key={line.key} line={line} quoted={quote?.items[index]} />
      ))}
    </View>
  );
}

function Line({ line, quoted }: { line: CartLine; quoted?: Quote["items"][number] }) {
  const { c } = useTheme();
  const setQuantity = useCart((state) => state.setQuantity);
  const remove = useCart((state) => state.remove);
  const unavailable = quoted ? !quoted.is_available : false;
  const unit = quoted ? Number(quoted.unit_price) : linePrice(line);
  const mods = modifiersText(line.modifiers);
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 12 }, unavailable && { padding: 10, marginHorizontal: -10, borderRadius: radius.sm, backgroundColor: c.dangerSoft }]}>
      <View style={{ width: 56, height: 56, borderRadius: radius.sm, overflow: "hidden", backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}>
        {line.image ? <Image source={{ uri: assetUrl(line.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <Icon name="menu" size={28} color={c.brandText} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="semibold" color={unavailable ? c.danger : c.ink} numberOfLines={2}>
          {line.title}
        </T>
        {mods ? (
          <T size={13} color={c.brandText} numberOfLines={2}>
            {mods}
          </T>
        ) : null}
        <T size={13} color={c.inkSoft}>
          {unavailable ? (
            <>
              <T weight="bold" size={13} color={c.danger}>
                Закончилось
              </T>{" "}
              — уберите, чтобы оформить
            </>
          ) : (
            `${line.weight ? `${line.weight} · ` : ""}${money(unit)}`
          )}
        </T>
      </View>
      {unavailable ? (
        <Pressable accessibilityRole="button" onPress={() => remove(line.key)} hitSlop={8}>
          <T size={13} color={c.inkSoft} style={{ textDecorationLine: "underline" }}>
            Убрать
          </T>
        </Pressable>
      ) : (
        <QtyControl flat value={line.quantity} onChange={(value) => setQuantity(line.key, value)} />
      )}
    </View>
  );
}

/** "Блюда / Скидка / Бонусы / Доставка / Итого" from the quote. */
export function quoteRows(quote: Quote, fulfillment: "delivery" | "pickup") {
  const rows: { label: string; value: string; tone?: "muted" | "discount" }[] = [{ label: "Блюда", value: money(quote.items_total), tone: "muted" }];
  if (Number(quote.discount_total)) rows.push({ label: "Скидка по промокоду", value: `−${money(quote.discount_total)}`, tone: "discount" });
  if (Number(quote.bonus_spent)) rows.push({ label: "Бонусами", value: `−${money(quote.bonus_spent)}`, tone: "discount" });
  if (fulfillment === "delivery") {
    rows.push({ label: "Доставка", value: quote.delivery_fee === null ? "по адресу" : Number(quote.delivery_fee) ? money(quote.delivery_fee) : "бесплатно", tone: "muted" });
  }
  return rows;
}
