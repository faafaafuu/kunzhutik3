import { useEffect } from "react";
import { View } from "react-native";
import { create } from "zustand";

import { useTheme } from "@/theme";

import { Icon } from "./Icon";
import { T } from "./ui";

type ToastState = { text: string | null; tone: "ok" | "bad"; show: (text: string, tone?: "ok" | "bad") => void; hide: () => void };

export const useToast = create<ToastState>()((set) => ({
  text: null,
  tone: "ok",
  show: (text, tone = "ok") => set({ text, tone }),
  hide: () => set({ text: null }),
}));

export const toast = (text: string, tone: "ok" | "bad" = "ok") => useToast.getState().show(text, tone);

export function ToastHost() {
  const { c } = useTheme();
  const { text, tone, hide } = useToast();
  useEffect(() => {
    if (!text) return;
    const timer = setTimeout(hide, 2600);
    return () => clearTimeout(timer);
  }, [text, hide]);
  if (!text) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 110, alignItems: "center", zIndex: 100 }}>
      <View
        accessibilityLiveRegion="polite"
        style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, backgroundColor: tone === "bad" ? c.danger : c.ink, maxWidth: "90%" }}
      >
        <Icon name={tone === "bad" ? "alert" : "check"} size={18} color={tone === "bad" ? "#fff" : c.surfaceCard} />
        <T weight="semibold" size={14} color={tone === "bad" ? "#fff" : c.surfaceCard}>
          {text}
        </T>
      </View>
    </View>
  );
}
