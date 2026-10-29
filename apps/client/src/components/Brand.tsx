// The «Брайт» mark: four tiles, sesame on the tall one. Same geometry as services/api/app/web/logo-mark.svg.

import { Pressable, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { T } from "./ui";

const TILES: [number, number, number, number, number, string][] = [
  [222, 0, 248, 167, 34, "#FF8D4D"],
  [222, 190, 118, 145, 40, "#FCC55A"],
  [362, 190, 108, 145, 34, "#C9B8F2"],
];
const SEEDS: [number, number, number, boolean][] = [
  [47, 58, -28, true], [115, 55, -35, false], [97, 110, 35, false], [169, 120, -30, false], [50, 177, 35, true],
  [112, 203, -30, false], [167, 208, 32, false], [55, 262, 30, true], [120, 293, -35, false],
];

export function BrandMark({ height = 28 }: { height?: number }) {
  return (
    <Svg width={(height * 470) / 335} height={height} viewBox="0 0 470 335">
      <Rect x={0} y={0} width={200} height={335} rx={30} fill="#FF6F10" />
      {SEEDS.map(([cx, cy, angle, light], index) => (
        <Rect key={index} x={cx - 7} y={cy - 19} width={14} height={38} rx={7} fill={light ? "#FFF4E6" : "#FFC24F"} transform={`rotate(${angle} ${cx} ${cy})`} />
      ))}
      {TILES.map(([x, y, w, h, r, fill]) => (
        <Rect key={fill} x={x} y={y} width={w} height={h} rx={r} fill={fill} />
      ))}
    </Svg>
  );
}

/** Mark and name; a tap goes home. */
export function BrandLogo({ size = 22, onPress, subtitle }: { size?: number; onPress?: () => void; subtitle?: string | null }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="link" accessibilityLabel="Брайт — на главную" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <BrandMark height={Math.round(size * 1.25)} />
      <View>
        <T weight="bold" size={size} style={{ letterSpacing: -0.5, lineHeight: Math.round(size * 1.15) }}>
          Брайт
        </T>
        {subtitle ? (
          <T size={12} style={{ opacity: 0.6 }}>
            {subtitle}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}
