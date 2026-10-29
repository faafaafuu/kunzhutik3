// The brand's loader: eight rounded petals around a centre, orange and lilac, the lit one going round.
// With `color` it is one colour (a button on orange takes white).

import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, type StyleProp, View, type ViewStyle } from "react-native";

const PETALS = 8;
const BRAND = ["#FF8D4D", "#C9B8F2"];

export function Spinner({ size = 28, color, style }: { size?: number | "small" | "large"; color?: string; style?: StyleProp<ViewStyle> }) {
  const side = size === "small" ? 20 : size === "large" ? 40 : size;
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: Platform.OS !== "web" }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  // Steps of one petal, so it reads as the light moving round rather than a wheel turning.
  const rotate = spin.interpolate({ inputRange: Array.from({ length: PETALS + 1 }, (_, i) => i / PETALS), outputRange: Array.from({ length: PETALS + 1 }, (_, i) => `${(i * 360) / PETALS}deg`) });
  const petal = { width: side * 0.18, height: side * 0.32, borderRadius: side * 0.09 };
  return (
    <Animated.View accessibilityRole="progressbar" accessibilityLabel="Загрузка" style={[{ width: side, height: side, transform: [{ rotate }] }, style]}>
      {Array.from({ length: PETALS }, (_, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: (side - petal.width) / 2,
            top: 0,
            width: petal.width,
            height: side / 2,
            alignItems: "center",
            transform: [{ translateY: side / 4 }, { rotate: `${(i * 360) / PETALS}deg` }, { translateY: -side / 4 }],
          }}
        >
          <View style={{ ...petal, backgroundColor: color ?? BRAND[i % 2], opacity: 0.25 + (0.75 * (i + 1)) / PETALS }} />
        </View>
      ))}
    </Animated.View>
  );
}
