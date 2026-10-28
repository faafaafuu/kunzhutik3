import { createContext, type ReactNode, useContext, useMemo } from "react";
import { Platform, StyleSheet, useWindowDimensions } from "react-native";

import { dark, light, type Palette, WIDE } from "./tokens";

export * from "./tokens";

type Theme = { c: Palette; isDark: boolean };

const ThemeContext = createContext<Theme>({ c: light, isDark: false });

/** The brand is light: the phone's or Telegram's dark mode does not switch it; pass forced="dark" to opt in. */
export function ThemeProvider({ children, forced }: { children: ReactNode; forced?: "light" | "dark" | null }) {
  const isDark = forced === "dark";
  const value = useMemo(() => ({ c: isDark ? dark : light, isDark }), [isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Styles that depend on the palette, rebuilt only when the theme flips. */
export function useStyles<T extends Record<string, object>>(factory: (c: Palette) => T): T {
  const { c } = useTheme();
  return useMemo(() => StyleSheet.create(factory(c)), [c, factory]);
}

export function useWide(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= WIDE;
}

export function cardShadow(c: Palette) {
  return Platform.select({
    web: { boxShadow: `0 1px 2px ${c.shadow}, 0 6px 20px ${c.shadow}` },
    default: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  }) as object;
}

export function floatShadow() {
  return Platform.select({
    web: { boxShadow: "0 12px 32px rgba(80, 36, 0, 0.18)" },
    default: { shadowColor: "#502400", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  }) as object;
}
