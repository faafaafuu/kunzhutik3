// Where the order goes: delivery to an address or pickup from a venue.

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AddressDetails, Fulfillment, Venue, Zone } from "@/api/types";

import { persistStorage } from "./storage";

export type DeliveryAddress = {
  text: string;
  latitude: number;
  longitude: number;
  details: AddressDetails;
  savedId?: string;
  label?: string;
};

type Place = {
  fulfillment: Fulfillment;
  address: DeliveryAddress | null;
  // Venue and zone found for the address (POST /venues/resolve); null — out of zone or not known yet.
  venue: Venue | null;
  zone: Zone | null;
  outOfZone: boolean;
  // Venue chosen for pickup; null — the nearest/default one.
  pickupVenueId: string | null;
  setPickupVenue: (venueId: string | null) => void;
  setFulfillment: (value: Fulfillment) => void;
  setAddress: (address: DeliveryAddress | null) => void;
  setResolution: (venue: Venue | null, zone: Zone | null, outOfZone: boolean) => void;
  setDetails: (details: Partial<AddressDetails>) => void;
};

export const emptyDetails: AddressDetails = { entrance: "", floor: "", apartment: "", intercom: "" };

export const usePlace = create<Place>()(
  persist(
    (set, get) => ({
      fulfillment: "delivery",
      address: null,
      venue: null,
      zone: null,
      outOfZone: false,
      pickupVenueId: null,
      setPickupVenue: (pickupVenueId) => set({ pickupVenueId }),
      setFulfillment: (fulfillment) => set({ fulfillment }),
      setAddress: (address) => set({ address, outOfZone: false, zone: null }),
      setResolution: (venue, zone, outOfZone) => set({ venue, zone, outOfZone }),
      setDetails: (details) => {
        const address = get().address;
        if (address) set({ address: { ...address, details: { ...address.details, ...details } } });
      },
    }),
    { name: "bright-place", storage: persistStorage, partialize: (state) => ({ fulfillment: state.fulfillment, address: state.address, pickupVenueId: state.pickupVenueId }) },
  ),
);
