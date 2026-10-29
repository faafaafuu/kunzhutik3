// Building blocks from the UI kit (design/assets/kit.css), in React Native.

import { type ReactNode, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  InputAccessoryView,
  Keyboard,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  type PressableProps,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { cardShadow, fonts, type Palette, radius, SHELL_MAX, useStyles, useTheme, useWide } from "@/theme";

import { Icon, type IconName } from "./Icon";

// ---------- text ----------

type Weight = "medium" | "semibold" | "bold";

export function T({ weight = "medium", size = 15, color, style, ...rest }: TextProps & { weight?: Weight; size?: number; color?: string }) {
  const { c } = useTheme();
  return <Text {...rest} style={[{ fontFamily: fonts[weight], fontSize: size, lineHeight: Math.round(size * 1.35), color: color ?? c.ink }, style]} />;
}

export function Muted(props: TextProps & { size?: number; weight?: Weight }) {
  const { c } = useTheme();
  return <T size={14} {...props} color={c.inkSoft} />;
}

export function Title({ children, size = 28, style }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle> }) {
  return (
    <T weight="bold" size={size} style={[{ letterSpacing: -0.5 }, style]}>
      {children}
    </T>
  );
}

// ---------- layout ----------

/** Page container: centred column of the desktop width on the web, full width on phones. */
export function Shell({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: "100%", maxWidth: SHELL_MAX, alignSelf: "center", paddingHorizontal: 16 }, style]}>{children}</View>;
}

export function Screen({ children, scroll = true, bottomInset = 0 }: { children: ReactNode; scroll?: boolean; bottomInset?: number }) {
  const { c } = useTheme();
  if (!scroll) return <View style={{ flex: 1, backgroundColor: c.surface }}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ paddingBottom: 120 + bottomInset }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Panel({ children, style, onLayout }: { children: ReactNode; style?: StyleProp<ViewStyle>; onLayout?: (event: LayoutChangeEvent) => void }) {
  const s = useStyles(panelStyles);
  return (
    <View style={[s.panel, style]} onLayout={onLayout}>
      {children}
    </View>
  );
}

/** iOS number and phone keyboards have no return key: a «Готово» bar above them hides the keyboard. */
export const KEYBOARD_DONE = "keyboard-done";

export function KeyboardDoneBar() {
  const { c } = useTheme();
  if (Platform.OS !== "ios") return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.surfaceSunken, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
        <Pressable accessibilityRole="button" onPress={() => Keyboard.dismiss()} hitSlop={10}>
          <T weight="semibold" color={c.brandText}>
            Готово
          </T>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const panelStyles = (c: Palette) => ({
  panel: { gap: 14, padding: 22, borderRadius: radius.lg, backgroundColor: c.surfaceCard, ...cardShadow(c) } as ViewStyle,
});

export function Row({ children, gap = 8, style, wrap }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap, flexWrap: wrap ? "wrap" : "nowrap" }, style]}>{children}</View>;
}

// ---------- buttons ----------

type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  title: string;
  tone?: "primary" | "tonal" | "white" | "danger" | "glass";
  size?: "md" | "sm";
  icon?: IconName;
  block?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, tone = "primary", size = "md", icon, block, loading, disabled, style, ...rest }: ButtonProps) {
  const { c } = useTheme();
  const palette = {
    primary: { bg: c.brand, fg: c.onBrand, pressed: c.brandStrong },
    tonal: { bg: c.surfaceSunken, fg: c.ink, pressed: c.line },
    white: { bg: c.onBrand, fg: c.onTint, pressed: c.surfaceSunken },
    danger: { bg: c.dangerSoft, fg: c.danger, pressed: c.dangerSoft },
    glass: { bg: c.glass, fg: c.onBrand, pressed: c.glassLine },
  }[tone];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      {...rest}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderRadius: radius.pill,
          paddingVertical: size === "sm" ? 9 : 15,
          paddingHorizontal: size === "sm" ? 16 : 28,
          backgroundColor: pressed ? palette.pressed : palette.bg,
          opacity: off ? 0.5 : 1,
          alignSelf: block ? "stretch" : "flex-start",
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        tone === "glass" && { borderWidth: 1, borderColor: c.glassLine },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} size="small" /> : icon ? <Icon name={icon} size={18} color={palette.fg} /> : null}
      <T weight="semibold" size={size === "sm" ? 14 : 15} color={palette.fg}>
        {title}
      </T>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, tone = "sunken", size = 40 }: { icon: IconName; onPress: () => void; label: string; tone?: "sunken" | "card" | "glass"; size?: number }) {
  const { c } = useTheme();
  const bg = { sunken: c.surfaceSunken, card: c.surfaceCard, glass: c.glass }[tone];
  const fg = tone === "glass" ? c.onBrand : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
        borderWidth: tone === "glass" ? 1 : 0,
        borderColor: c.glassLine,
      })}
    >
      <Icon name={icon} size={size * 0.5} color={fg} strokeWidth={2} />
    </Pressable>
  );
}

export function LinkButton({ title, onPress, disabled, color }: { title: string; onPress: () => void; disabled?: boolean; color?: string }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} hitSlop={8}>
      <T weight="semibold" size={14} color={disabled ? c.inkSoft : (color ?? c.brandText)}>
        {title}
      </T>
    </Pressable>
  );
}

// ---------- chips, notices, states ----------

export function Chip({ title, tone = "default", style }: { title: string; tone?: "default" | "brand" | "bonus" | "good" | "bad" | "info"; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const palette = {
    default: [c.surfaceSunken, c.inkSoft],
    brand: [c.brandSoft, c.brandText],
    bonus: [c.sesameSoft, c.sesameText],
    good: [c.successSoft, c.success],
    bad: [c.dangerSoft, c.danger],
    info: [c.infoSoft, c.info],
  }[tone];
  return (
    <View style={[{ alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: palette[0] }, style]}>
      <T weight="semibold" size={13} color={palette[1]} numberOfLines={1}>
        {title}
      </T>
    </View>
  );
}

export function Notice({ children, tone = "warn", icon = "alert" }: { children: ReactNode; tone?: "warn" | "info" | "bad" | "good"; icon?: IconName }) {
  const { c } = useTheme();
  const [bg, fg] = { warn: [c.warningSoft, c.warning], info: [c.infoSoft, c.info], bad: [c.dangerSoft, c.danger], good: [c.successSoft, c.success] }[tone];
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: bg }}>
      <Icon name={icon} size={20} color={fg} />
      <T size={14} color={fg} style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  );
}

export function StateView({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 12, paddingVertical: 56, paddingHorizontal: 24 }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={44} color={c.brandText} strokeWidth={1.5} />
      </View>
      <Title size={24} style={{ textAlign: "center" }}>
        {title}
      </Title>
      {text ? <Muted style={{ textAlign: "center", maxWidth: 360 }}>{text}</Muted> : null}
      {/* Button hugs the left edge by default; the wrapper keeps it centred under the text. */}
      {action ? <View style={{ alignItems: "center" }}>{action}</View> : null}
    </View>
  );
}

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== "web" }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ backgroundColor: c.surfaceCard, borderRadius: radius.md, opacity: pulse }, style]} />;
}

// ---------- form controls ----------

export function Field({ label, error, style, ...rest }: TextInputProps & { label?: string; error?: string | null }) {
  const { c } = useTheme();
  const s = useStyles(fieldStyles);
  // Layout props size the whole field (label + input), the rest style the input.
  const { flex, minWidth, width, maxWidth, opacity, ...inputStyle } = StyleSheet.flatten(style) ?? {};
  return (
    <View style={{ gap: 6, flex, minWidth, width, maxWidth, opacity, flexBasis: flex ? 0 : undefined }}>
      {label ? (
        <T weight="semibold" size={13} color={c.inkSoft}>
          {label}
        </T>
      ) : null}
      <TextInput placeholderTextColor={c.inkSoft} inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE : undefined} returnKeyType="done" {...rest} style={[s.field, error ? { borderColor: c.danger } : null, inputStyle]} />
      {error ? (
        <T size={13} color={c.danger} style={{ marginLeft: 4 }}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

const fieldStyles = (c: Palette) => ({
  field: {
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: c.ink,
    backgroundColor: c.surfaceSunken,
    ...(Platform.OS === "web" ? { outlineColor: c.brand } : {}),
  } as TextStyle,
});

export function QtyControl({ value, onChange, flat, small, max = 50 }: { value: number; onChange: (value: number) => void; flat?: boolean; small?: boolean; max?: number }) {
  const { c } = useTheme();
  const size = small ? 26 : 34;
  const button = (sign: -1 | 1) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sign < 0 ? "Меньше" : "Больше"}
      onPress={() => onChange(Math.min(max, value + sign))}
      disabled={sign > 0 && value >= max}
      hitSlop={4}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: flat ? c.surfaceCard : c.surfaceSunken,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : sign > 0 && value >= max ? 0.4 : 1,
      })}
    >
      <Icon name={sign < 0 ? "minus" : "plus"} size={small ? 14 : 16} color={c.ink} strokeWidth={2.2} />
    </Pressable>
  );
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: small ? 2 : 4, padding: small ? 2 : 4, borderRadius: radius.pill, backgroundColor: flat ? c.surfaceSunken : c.surfaceCard }, !flat && cardShadow(c)]}>
      {button(-1)}
      <T weight="semibold" size={small ? 14 : 15} style={{ minWidth: small ? 18 : 24, textAlign: "center" }}>
        {value}
      </T>
      {button(1)}
    </View>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={{ width: 48, height: 28, borderRadius: radius.pill, backgroundColor: value ? c.brand : c.surfaceSunken, justifyContent: "center" }}
    >
      <View style={[{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.surfaceCard, marginLeft: value ? 23 : 3 }, cardShadow(c)]} />
    </Pressable>
  );
}

/** Pill switch: Доставка / Самовывоз. */
export function Segmented<V extends string>({ value, options, onChange }: { value: V; options: { value: V; label: string }[]; onChange: (value: V) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignSelf: "stretch", gap: 4, padding: 4, borderRadius: radius.pill, backgroundColor: c.surfaceSunken }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[{ flex: 1, alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: active ? c.surfaceCard : "transparent" }, active && cardShadow(c)]}
          >
            <T weight="semibold">{option.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Radio card: address, payment method. */
export function OptionRow({ selected, onPress, icon, title, subtitle, right }: { selected: boolean; onPress: () => void; icon?: IconName; title: string; subtitle?: string; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: selected ? c.brand : "transparent",
        backgroundColor: selected ? c.surfaceCard : c.surfaceSunken,
      }}
    >
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: selected ? 6 : 2, borderColor: selected ? c.brand : c.line }} />
      {icon ? <Icon name={icon} size={22} color={c.ink} /> : null}
      <View style={{ flex: 1 }}>
        <T weight="semibold">{title}</T>
        {subtitle ? <Muted size={13}>{subtitle}</Muted> : null}
      </View>
      {right}
    </Pressable>
  );
}

/** A tick box with a label that may hold links: the box and the plain words toggle it, a link only opens its page. */
export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        hitSlop={8}
        style={{ width: 24, height: 24, marginTop: 1, borderRadius: 7, borderWidth: 2, borderColor: checked ? c.brand : c.inkSoft, backgroundColor: checked ? c.brand : c.surfaceCard, alignItems: "center", justifyContent: "center" }}
      >
        {checked ? <Icon name="check" size={16} color={c.onBrand} strokeWidth={3} /> : null}
      </Pressable>
      <T size={14} color={c.inkSoft} style={{ flex: 1 }} onPress={() => onChange(!checked)}>
        {children}
      </T>
    </View>
  );
}

// ---------- money ----------

export function Totals({ rows, grand }: { rows: { label: string; value: string; tone?: "muted" | "discount" }[]; grand: { label: string; value: string } }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {rows.map((row) => (
        <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T color={row.tone === "discount" ? c.success : c.inkSoft}>{row.label}</T>
          <T color={row.tone === "discount" ? c.success : c.inkSoft}>{row.value}</T>
        </View>
      ))}
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: c.line }}>
        <T weight="bold" size={22}>
          {grand.label}
        </T>
        <T weight="bold" size={22}>
          {grand.value}
        </T>
      </View>
    </View>
  );
}

export function Progress({ value }: { value: number }) {
  const { c } = useTheme();
  return (
    <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: c.surfaceSunken, overflow: "hidden" }}>
      <View style={{ height: "100%", width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: c.brand, borderRadius: radius.pill }} />
    </View>
  );
}

/** Two columns on the desktop web (content + side panel), one column on phones. */
export function Columns({ main, side }: { main: ReactNode; side: ReactNode }) {
  const wide = useWide();
  if (!wide) {
    return (
      <View style={{ gap: 16 }}>
        {main}
        {side}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", gap: 20, alignItems: "flex-start" }}>
      <View style={{ flex: 1, gap: 16 }}>{main}</View>
      <View style={{ width: 380, gap: 16 }}>{side}</View>
    </View>
  );
}
