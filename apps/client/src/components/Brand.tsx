// The «Брайт» brand: the sun with the coffee bean, and the «БРАЙТ · КОФЕ И ЕДА» wordmark (paths in brandPaths.ts,
// the same art as services/api/app/web/logo-mark.svg). The wordmark takes the text colour, so it reads on a dark theme.

import { Pressable, View } from "react-native";
import Svg, { G, Path } from "react-native-svg";

import { useTheme } from "@/theme";

import { type Shape, SUN, WORDMARK } from "./brandPaths";
import { T } from "./ui";

export const BRAND_ORANGE = "#E85A28";

function Traced({ shape, height, color }: { shape: Shape; height: number; color: string }) {
  return (
    <Svg width={(height * shape.width) / shape.height} height={height} viewBox={`0 0 ${shape.width} ${shape.height}`}>
      <G transform={`translate(0 ${shape.height}) scale(0.1 -0.1)`} fill={color}>
        {shape.paths.map((d, index) => (
          <Path key={index} d={d} />
        ))}
      </G>
    </Svg>
  );
}

/** The sun mark alone. */
export function BrandMark({ height = 28 }: { height?: number }) {
  return <Traced shape={SUN} height={height} color={BRAND_ORANGE} />;
}

/** Sun and wordmark; a tap goes home. `size` is about the height of the wordmark's capitals. */
export function BrandLogo({ size = 22, onPress, subtitle }: { size?: number; onPress?: () => void; subtitle?: string | null }) {
  const { c } = useTheme();
  // The wordmark art: capitals take ~58% of its height, the «КОФЕ И ЕДА» line the rest.
  const wordHeight = Math.round(size * 1.7);
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="link" accessibilityLabel="Брайт — кофе и еда, на главную" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <BrandMark height={Math.round(wordHeight * 1.15)} />
      <View style={{ gap: 2 }}>
        <Traced shape={WORDMARK} height={wordHeight} color={c.ink} />
        {subtitle ? (
          <T size={12} style={{ opacity: 0.6 }}>
            {subtitle}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}
