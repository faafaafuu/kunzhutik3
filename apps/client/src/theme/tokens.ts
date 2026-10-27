// Design tokens of «Брайт». Source: design/assets/tokens.css — keep the two in sync.

export type Palette = {
  brand: string;
  brandStrong: string;
  onBrand: string;
  brandSoft: string;
  brandText: string;
  surface: string;
  surfaceCard: string;
  surfaceSunken: string;
  ink: string;
  inkSoft: string;
  line: string;
  glass: string;
  glassStrong: string;
  glassLine: string;
  scrim: string;
  sesame: string;
  onTint: string;
  sesameSoft: string;
  sesameText: string;
  couponRose: string;
  couponOlive: string;
  couponPeach: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  telegram: string;
  shadow: string;
};

export const light: Palette = {
  brand: "#ff6900",
  brandStrong: "#e85d00",
  onBrand: "#ffffff",
  brandSoft: "#fff1e6",
  brandText: "#b84a00",
  surface: "#f4f4f6",
  surfaceCard: "#ffffff",
  surfaceSunken: "#ececef",
  ink: "#1c1c1e",
  inkSoft: "#62666f",
  line: "#e4e4e8",
  glass: "rgba(255, 255, 255, 0.2)",
  glassStrong: "rgba(255, 255, 255, 0.88)",
  glassLine: "rgba(255, 255, 255, 0.38)",
  scrim: "rgba(20, 16, 14, 0.45)",
  sesame: "#f6c453",
  onTint: "#141622",
  sesameSoft: "#fbf0d3",
  sesameText: "#7a5300",
  couponRose: "#f8c6cc",
  couponOlive: "#c4cf86",
  couponPeach: "#cfc6f5",
  success: "#157a42",
  successSoft: "#e6f5ec",
  danger: "#c2343a",
  dangerSoft: "#fdeaea",
  warning: "#8f5a0b",
  warningSoft: "#fcf1de",
  info: "#245d9e",
  infoSoft: "#e8f0fa",
  telegram: "#2aabee",
  shadow: "rgba(28, 28, 30, 0.08)",
};

export const dark: Palette = {
  ...light,
  brandStrong: "#ff7f26",
  brandSoft: "#3a2414",
  brandText: "#ffa060",
  surface: "#141110",
  surfaceCard: "#1f1b19",
  surfaceSunken: "#29231f",
  ink: "#f2efea",
  inkSoft: "#aba49c",
  line: "#352e29",
  glass: "rgba(255, 255, 255, 0.1)",
  glassStrong: "rgba(31, 27, 25, 0.86)",
  glassLine: "rgba(255, 255, 255, 0.16)",
  scrim: "rgba(0, 0, 0, 0.6)",
  sesameSoft: "#33290f",
  sesameText: "#f6c453",
  success: "#5fd08f",
  successSoft: "#15301f",
  danger: "#ff7d80",
  dangerSoft: "#3a1a1b",
  warning: "#f0b55a",
  warningSoft: "#352610",
  info: "#79acef",
  infoSoft: "#162638",
  shadow: "rgba(0, 0, 0, 0.5)",
};

export const radius = { sm: 14, md: 24, lg: 32, pill: 999 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 22, xxl: 34 };

export const fonts = {
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
};

// Wider than this the web build switches to the desktop layout from the mockups.
export const WIDE = 900;
export const SHELL_MAX = 1200;
