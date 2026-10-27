// The cart keeps dish snapshots for display; prices that count always come from POST /orders/quote.

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { MenuItem, ModifierGroup, QuoteLine } from "@/api/types";

import { persistStorage } from "./storage";

export type CartModifier = { id: string; title: string; kind: ModifierGroup["kind"]; price: number; quantity: number };

export type CartLine = {
  key: string;
  itemId: string;
  slug: string;
  title: string;
  image: string | null;
  weight: string;
  basePrice: number;
  quantity: number;
  modifiers: CartModifier[];
};

type Cart = {
  lines: CartLine[];
  promo: string;
  useBonus: boolean;
  add: (item: MenuItem, modifiers?: CartModifier[], quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setPromo: (promo: string) => void;
  setUseBonus: (value: boolean) => void;
  repeat: (lines: Omit<QuoteLine, "is_available">[], menu: MenuItem[]) => number;
};

export function lineKey(itemId: string, modifiers: CartModifier[]): string {
  const mods = [...modifiers].sort((a, b) => a.id.localeCompare(b.id)).map((mod) => `${mod.id}x${mod.quantity}`);
  return [itemId, ...mods].join("|");
}

export function linePrice(line: Pick<CartLine, "basePrice" | "modifiers">): number {
  return line.basePrice + line.modifiers.reduce((sum, mod) => sum + mod.price * mod.quantity, 0);
}

export const useCart = create<Cart>()(
  persist(
    (set, get) => ({
      lines: [],
      promo: "",
      useBonus: false,
      add: (item, modifiers = [], quantity = 1) => {
        const key = lineKey(item.id, modifiers);
        const lines = get().lines;
        const existing = lines.find((line) => line.key === key);
        if (existing) {
          set({ lines: lines.map((line) => (line.key === key ? { ...line, quantity: Math.min(50, line.quantity + quantity) } : line)) });
          return;
        }
        set({
          lines: [
            ...lines,
            {
              key,
              itemId: item.id,
              slug: item.slug,
              title: item.title,
              image: item.image_url,
              weight: item.weight,
              basePrice: Number(item.price),
              quantity,
              modifiers,
            },
          ],
        });
      },
      setQuantity: (key, quantity) =>
        set({
          lines: quantity <= 0 ? get().lines.filter((line) => line.key !== key) : get().lines.map((line) => (line.key === key ? { ...line, quantity: Math.min(50, quantity) } : line)),
        }),
      remove: (key) => set({ lines: get().lines.filter((line) => line.key !== key) }),
      clear: () => set({ lines: [], promo: "", useBonus: false }),
      setPromo: (promo) => set({ promo }),
      setUseBonus: (useBonus) => set({ useBonus }),
      repeat: (orderLines, menu) => {
        // Puts a past order back in the cart; dishes that are gone or sold out are skipped.
        let added = 0;
        for (const line of orderLines) {
          const item = menu.find((entry) => entry.id === line.menu_item_id);
          if (!item || !item.is_available) continue;
          const options = new Map(item.modifier_groups.flatMap((group) => group.options.map((option) => [option.id, { option, group }] as const)));
          const modifiers: CartModifier[] = line.modifiers
            .filter((mod) => options.has(mod.id))
            .map((mod) => {
              const { option, group } = options.get(mod.id)!;
              return { id: option.id, title: option.title, kind: group.kind, price: Number(option.price_delta), quantity: mod.quantity };
            });
          get().add(item, modifiers, line.quantity);
          added += 1;
        }
        return added;
      },
    }),
    { name: "bright-cart", storage: persistStorage, partialize: (state) => ({ lines: state.lines, promo: state.promo, useBonus: state.useBonus }) },
  ),
);

export const useCartCount = () => useCart((state) => state.lines.reduce((sum, line) => sum + line.quantity, 0));
