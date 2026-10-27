import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Customer, Tokens } from "@/api/types";

import { persistStorage } from "./storage";

type Session = {
  customer: Customer | null;
  tokens: Tokens | null;
  // Name and phone typed by a guest, offered again at the next checkout.
  guest: { name: string; phone: string };
  // Orders placed on this device without signing in, newest first — the "Заказы" tab shows them.
  recentOrderIds: string[];
  rememberOrder: (orderId: string) => void;
  signIn: (customer: Customer, tokens: Tokens) => void;
  setCustomer: (customer: Customer) => void;
  signOut: () => void;
  rememberGuest: (name: string, phone: string) => void;
};

export const useSession = create<Session>()(
  persist(
    (set) => ({
      customer: null,
      tokens: null,
      guest: { name: "", phone: "" },
      recentOrderIds: [],
      rememberOrder: (orderId) => set((state) => ({ recentOrderIds: [orderId, ...state.recentOrderIds.filter((id) => id !== orderId)].slice(0, 20) })),
      signIn: (customer, tokens) => set({ customer, tokens }),
      setCustomer: (customer) => set({ customer }),
      signOut: () => set({ customer: null, tokens: null }),
      rememberGuest: (name, phone) => set({ guest: { name, phone } }),
    }),
    { name: "bright-session", storage: persistStorage },
  ),
);

export const useSignedIn = () => useSession((state) => Boolean(state.tokens));
