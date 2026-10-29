// Data hooks: menu, config, quote, orders. Kept small on purpose — no query library needed at this size.

import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError } from "@/api/client";
import type { AppConfig, Menu, Quote, Venue, Zone } from "@/api/types";
import { useCart } from "@/store/cart";
import { usePlace } from "@/store/place";
import { useSession } from "@/store/session";
import { create } from "zustand";

type Loadable<T> = { data: T | null; error: ApiError | null; loading: boolean; reload: () => Promise<void> };

/** Fetches on mount and on `deps` change; `intervalMs` re-polls while mounted. */
export function useFetch<T>(path: string | null, deps: unknown[] = [], intervalMs?: number): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const alive = useRef(true);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const payload = await api<T>(path);
      if (!alive.current) return;
      setData(payload);
      setError(null);
    } catch (caught) {
      if (alive.current) setError(caught as ApiError);
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    alive.current = true;
    setLoading(Boolean(path));
    reload();
    if (!intervalMs || !path) return () => void (alive.current = false);
    const timer = setInterval(reload, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [reload, intervalMs, path]);

  return { data, error, loading, reload };
}

// ---- app-wide data: config and menu, loaded once and shared ----

type Shared = {
  config: AppConfig | null;
  menu: Menu | null;
  menuError: ApiError | null;
  menuVenueId: string | null;
  setConfig: (config: AppConfig) => void;
  setMenu: (menu: Menu | null, error: ApiError | null, venueId: string | null) => void;
};

export const useShared = create<Shared>()((set) => ({
  config: null,
  menu: null,
  menuError: null,
  menuVenueId: null,
  setConfig: (config) => set({ config }),
  setMenu: (menu, menuError, menuVenueId) => set({ menu, menuError, menuVenueId }),
}));

export async function loadConfig(): Promise<AppConfig | null> {
  try {
    const config = await api<AppConfig>("/config", { auth: false });
    useShared.getState().setConfig(config);
    return config;
  } catch {
    return null;
  }
}

export async function loadMenu(venueId: string | null): Promise<void> {
  try {
    const menu = await api<Menu>(venueId ? `/menu?venue_id=${venueId}` : "/menu", { auth: false });
    useShared.getState().setMenu(menu, null, venueId);
  } catch (error) {
    useShared.getState().setMenu(useShared.getState().menu, error as ApiError, venueId);
  }
}

/** Finds the venue and zone for the chosen address, then loads that venue's menu. */
export function usePlaceResolution() {
  const address = usePlace((state) => state.address);
  const fulfillment = usePlace((state) => state.fulfillment);
  const pickupVenueId = usePlace((state) => state.pickupVenueId);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (fulfillment === "delivery" && address) {
        try {
          const result = await api<{ venue: Venue; zone: Zone }>("/venues/resolve", {
            method: "POST",
            body: { latitude: address.latitude, longitude: address.longitude },
            auth: false,
          });
          if (cancelled) return;
          usePlace.getState().setResolution(result.venue, result.zone, false);
          await loadMenu(result.venue.id);
          return;
        } catch (error) {
          if (cancelled) return;
          const outOfZone = (error as ApiError).code === "out_of_delivery_zone";
          usePlace.getState().setResolution(null, null, outOfZone);
        }
      } else {
        usePlace.getState().setResolution(null, null, false);
        if (fulfillment === "pickup" && pickupVenueId) {
          await loadMenu(pickupVenueId);
          return;
        }
      }
      if (!cancelled) await loadMenu(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [address?.latitude, address?.longitude, fulfillment, pickupVenueId]);
}

/** Server calculation of the current cart. Re-runs, debounced, on every change. */
export function useQuote(options: { scheduledFor?: string | null } = {}) {
  const lines = useCart((state) => state.lines);
  const promo = useCart((state) => state.promo);
  const rewards = useCart((state) => state.rewards);
  const fulfillment = usePlace((state) => state.fulfillment);
  const address = usePlace((state) => state.address);
  const venue = usePlace((state) => state.venue);
  const menuVenue = useShared((state) => state.menu?.venue);
  const signedIn = useSession((state) => Boolean(state.tokens));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const counter = useRef(0);

  const body = buildQuoteBody({ lines, promo, rewards: signedIn ? rewards : [], fulfillment, address, venueId: venue?.id ?? menuVenue?.id ?? null, scheduledFor: options.scheduledFor ?? null });
  const key = JSON.stringify(body);

  useEffect(() => {
    if (!lines.length) {
      setQuote(null);
      return;
    }
    const ticket = ++counter.current;
    setQuoting(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api<Quote>("/orders/quote", { method: "POST", body });
        if (ticket === counter.current) {
          setQuote(result);
          setError(null);
        }
      } catch (caught) {
        if (ticket === counter.current) setError(caught as ApiError);
      } finally {
        if (ticket === counter.current) setQuoting(false);
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, signedIn]);

  return { quote, quoting, error, body };
}

export function buildQuoteBody(input: {
  lines: ReturnType<typeof useCart.getState>["lines"];
  promo: string;
  rewards?: string[];
  fulfillment: "delivery" | "pickup";
  address: ReturnType<typeof usePlace.getState>["address"];
  venueId: string | null;
  scheduledFor: string | null;
}) {
  return {
    venue_id: input.venueId,
    fulfillment: input.fulfillment,
    address: input.fulfillment === "delivery" && input.address ? { latitude: input.address.latitude, longitude: input.address.longitude, text: input.address.text } : null,
    items: input.lines.map((line) => ({
      menu_item_id: line.itemId,
      quantity: line.quantity,
      modifiers: line.modifiers.map((mod) => ({ id: mod.id, quantity: mod.quantity })),
    })),
    promo_code: input.promo.trim() || null,
    rewards: input.rewards ?? [],
    scheduled_for: input.scheduledFor,
  };
}
