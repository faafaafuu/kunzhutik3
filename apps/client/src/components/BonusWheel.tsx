// The bonus wheel at checkout: a half-circle of dishes that can be taken free for bonuses, the balance in its middle.
// Drag it sideways like the iOS time picker — a finger, or on a computer the mouse and the wheel/trackpad: it clicks
// on every dish passing the top (a haptic tick, no sound) and settles on the
// nearest one. The dish at the top is the one the button takes.

import { Image } from "expo-image";
import { useNavigation } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Platform, Pressable, View } from "react-native";

import { thumbUrl } from "@/api/client";
import type { MenuItem } from "@/api/types";
import * as haptics from "@/lib/haptics";
import { useTheme } from "@/theme";

import { Icon } from "./Icon";
import { Button, Muted, T } from "./ui";

const SIZE = 64; // a dish on the rim
const STEP = 30; // degrees between neighbours: ~6 on the visible half
const MAX_TAKEN = 5; // as many as the server takes in one order
// How far a finger has to go sideways before the wheel takes the gesture: small, so the page under the wheel does not
// start scrolling first.
const CLAIM = 3;
const native = Platform.OS !== "web";
// Dragging the wheel must not select its text or call up "Скопировать" on a long press. On the site `pan-y` hands the
// sideways drag to the wheel and keeps the up-and-down swipe for the page.
const NO_SELECT = (native ? {} : { userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", touchAction: "pan-y" }) as object;

// Samples of the position relative to the top (in dishes): the curves below are interpolated between them.
const SAMPLES = Array.from({ length: 33 }, (_, index) => -4 + index * 0.25);

type Props = {
  items: MenuItem[];
  balance: number;
  taken: string[];
  onChange: (taken: string[]) => void;
  /** The wheel took the gesture: the page around it must not scroll while a finger turns it, and must scroll again
   *  the moment the finger is lifted. */
  onTurningChange?: (turning: boolean) => void;
};

export function BonusWheel({ items, balance, taken, onChange, onTurningChange }: Props) {
  const { c } = useTheme();
  // It opens on the middle dish, so there is something on both sides of the half-circle.
  const middle = Math.floor((items.length - 1) / 2);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(middle);
  const position = useRef(new Animated.Value(middle)).current;
  const current = useRef(middle);
  const start = useRef(middle);
  const lastTick = useRef(middle);

  // A sideways drag locks the page under the wheel; a drag up or down never does, so the page scrolls as usual.
  const turning = useRef(false);
  const turningListener = useRef(onTurningChange);
  turningListener.current = onTurningChange;
  const turn = (on: boolean) => {
    if (turning.current === on) return;
    turning.current = on;
    turningListener.current?.(on);
  };
  // Lifted off the screen mid-drag (screen closed, wheel hidden by a new quote): give the page its scrolling back.
  useEffect(() => () => turn(false), []);

  const radius = Math.max(90, Math.min(width / 2 - SIZE / 2 - 8, 150));
  const centerX = width / 2;
  const baseline = radius + SIZE / 2 + 6; // the arc's centre: the balance sits here
  const perDish = (radius * STEP * Math.PI) / 180; // px of drag that moves one dish

  // Where each dish is for any position of the wheel: built once per layout, the animation only moves `position`.
  const layers = useMemo(
    () =>
      items.map((_, index) => {
        const relative = Animated.subtract(new Animated.Value(index), position);
        const at = (f: (degrees: number, r: number) => number) =>
          relative.interpolate({ inputRange: SAMPLES, outputRange: SAMPLES.map((r) => f(90 - r * STEP, r)), extrapolate: "clamp" });
        return {
          translateX: at((deg) => centerX + radius * Math.cos((deg * Math.PI) / 180) - SIZE / 2),
          translateY: at((deg) => baseline - radius * Math.sin((deg * Math.PI) / 180) - SIZE / 2),
          // Fades out towards the ends of the half-circle.
          opacity: at((_, r) => (Math.abs(r) <= 1.5 ? 1 : Math.max(0, 1 - (Math.abs(r) - 1.5) / 1.3))),
          scale: at((_, r) => Math.max(0.7, 1.15 - Math.abs(r) * 0.17)),
        };
      }),
    [items, position, centerX, radius, baseline],
  );

  const spent = taken.reduce((sum, id) => sum + (items.find((item) => item.id === id)?.bonus_price ?? 0), 0);
  const left = Math.max(0, Math.floor(balance - spent));
  const dish = items[selected];
  const price = dish?.bonus_price ?? 0;

  // A tick for every dish that passes the top, as the wheel turns or settles. The wheel runs on the JS driver on
  // purpose: a native-driven animation reports its value to JS only now and then, so dishes were skipped (one click
  // per spin) and the next drag started from a stale position.
  useEffect(() => {
    const id = position.addListener(({ value }) => {
      current.current = value;
      const index = Math.min(items.length - 1, Math.max(0, Math.round(value)));
      if (index !== lastTick.current) {
        lastTick.current = index;
        setSelected(index);
        tick();
      }
    });
    return () => position.removeListener(id);
  }, [position, items.length]);

  const settle = (index: number) => {
    const target = Math.min(items.length - 1, Math.max(0, index));
    // Firm enough not to swing back over a dish (an extra click), soft enough to glide like the iOS time picker.
    Animated.spring(position, { toValue: target, useNativeDriver: false, friction: 11, tension: 60, restDisplacementThreshold: 0.002 }).start();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Sideways only: a drag that leans up or down belongs to the page, and the wheel lets it through untouched.
        // Asked in the capture phase so a dish or a button under the finger cannot keep the drag, and the wheel never
        // gives it away halfway.
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > CLAIM && Math.abs(g.dx) > Math.abs(g.dy),
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > CLAIM && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          // The page stops here at the first sideways pixels — otherwise it keeps scrolling up and down under the
          // finger while the wheel turns, which reads as the whole screen sliding.
          turn(true);
          position.stopAnimation();
          start.current = current.current;
        },
        onPanResponderMove: (_, g) => {
          let next = start.current - g.dx / perDish;
          // Past either end it gives a little, like a rubber band.
          if (next < 0) next = next / 3;
          if (next > items.length - 1) next = items.length - 1 + (next - items.length + 1) / 3;
          position.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          turn(false);
          // A flick carries on: vx is px/ms, ~250 ms of glide.
          settle(Math.round(current.current - (g.vx * 250) / perDish));
        },
        onPanResponderTerminate: () => {
          turn(false);
          settle(Math.round(current.current));
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [perDish, items.length],
  );

  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
    return () => navigation.setOptions({ gestureEnabled: true });
  }, [navigation]);

  // The site: the responder system follows fingers, not a mouse — drag with the mouse and turn with the wheel here.
  const surface = useRef<React.ComponentRef<typeof View>>(null);
  // A mouse drag ends with a click on whatever dish is under the pointer: that click must not turn the wheel back.
  const dragged = useRef(false);
  useEffect(() => {
    if (native) return;
    const node = surface.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    let from: number | null = null;
    let last = 0;
    let lastAt = 0;
    let speed = 0;
    const down = (event: MouseEvent) => {
      if (event.button !== 0) return;
      position.stopAnimation();
      from = event.clientX;
      start.current = current.current;
      last = event.clientX;
      lastAt = event.timeStamp;
      speed = 0;
      dragged.current = false;
      event.preventDefault();
    };
    const move = (event: MouseEvent) => {
      if (from === null) return;
      if (Math.abs(event.clientX - from) > 5) dragged.current = true;
      const dt = Math.max(1, event.timeStamp - lastAt);
      speed = (event.clientX - last) / dt;
      last = event.clientX;
      lastAt = event.timeStamp;
      position.setValue(Math.min(items.length - 0.7, Math.max(-0.3, start.current - (event.clientX - from) / perDish)));
    };
    const up = () => {
      if (from === null) return;
      from = null;
      settle(Math.round(current.current - (speed * 250) / perDish));
    };
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    const wheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      position.stopAnimation();
      position.setValue(Math.min(items.length - 1, Math.max(0, current.current + delta / perDish)));
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => settle(Math.round(current.current)), 120);
    };
    node.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      node.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      node.removeEventListener("wheel", wheel);
      clearTimeout(wheelTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perDish, items.length, width]);

  if (!items.length) return null;

  const take = () => {
    if (!dish || price > left || taken.length >= MAX_TAKEN) return;
    onChange([...taken, dish.id]);
    haptics.success();
  };

  // The whole block — from the title down to the button — turns the wheel.
  return (
    <View ref={surface} {...pan.panHandlers} style={[{ gap: 12 }, NO_SELECT]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View>
        <T weight="semibold" size={16}>
          Бесплатно за бонусы
        </T>
        <Muted size={13}>Покрутите колесо и выберите, что взять к заказу</Muted>
      </View>

      {width ? (
        <View style={{ height: baseline + 8, overflow: "hidden" }}>
          {/* The pointer at the top. */}
          <View pointerEvents="none" style={{ position: "absolute", left: centerX - 6, top: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: c.brand }} />

          {items.map((item, index) => {
            const { translateX, translateY, opacity, scale } = layers[index];
            const affordable = (item.bonus_price ?? 0) <= left;
            return (
              <Animated.View key={item.id} style={{ position: "absolute", left: 0, top: 0, width: SIZE, transform: [{ translateX }, { translateY }, { scale }], opacity }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.bonus_price} бонусов`} onPress={() => {
                    if (dragged.current) dragged.current = false;
                    else settle(index);
                  }} style={{ alignItems: "center" }}>
                  <View
                    style={{
                      width: SIZE,
                      height: SIZE,
                      borderRadius: SIZE / 2,
                      overflow: "hidden",
                      backgroundColor: c.surfaceSunken,
                      borderWidth: index === selected ? 3 : 0,
                      borderColor: c.brand,
                      opacity: affordable ? 1 : 0.55,
                    }}
                    pointerEvents="none"
                  >
                    {item.image_url ? (
                      <Image source={{ uri: thumbUrl(item.image_url) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                        <Icon name="cup" size={28} color={c.inkSoft} />
                      </View>
                    )}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}

          {/* The balance in the middle of the half-circle. */}
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: baseline - 62, alignItems: "center" }}>
            <T weight="bold" size={40} color={c.brandText} style={{ lineHeight: 44, letterSpacing: -1 }}>
              {left.toLocaleString("ru-RU")}
            </T>
            <Muted size={13}>{spent ? "бонусов останется" : "бонусов у вас"}</Muted>
          </View>
        </View>
      ) : (
        <View style={{ height: 200 }} />
      )}

      {dish ? (
        <View style={[{ gap: 10 }, NO_SELECT]}>
          <View style={{ alignItems: "center" }}>
            <T weight="semibold" style={{ textAlign: "center" }}>
              {dish.title}
            </T>
            <Muted size={13}>
              {price} бонусов вместо {Math.round(Number(dish.price))} ₽
            </Muted>
          </View>
          <Button
            block
            title={taken.length >= MAX_TAKEN ? "Больше не поместится" : price > left ? `Не хватает ${price - left} бонусов` : "Взять бесплатно"}
            disabled={price > left || taken.length >= MAX_TAKEN}
            onPress={take}
          />
        </View>
      ) : null}

      {taken.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {taken.map((id, index) => {
            const item = items.find((entry) => entry.id === id);
            if (!item) return null;
            return (
              <Pressable
                key={`${id}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Убрать ${item.title}`}
                onPress={() => onChange(taken.filter((_, position) => position !== index))}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingLeft: 12, paddingRight: 8, borderRadius: 999, backgroundColor: c.brandSoft }}
              >
                <T size={13} weight="semibold" color={c.brandText}>
                  {item.title} · {item.bonus_price}
                </T>
                <Icon name="close" size={14} color={c.brandText} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ---- the detent ----

let lastClickAt = 0;

/** One detent: a haptic tick, no sound. */
function tick(): void {
  // Faster than ~25 ms apart the ticks merge into a buzz anyway (the iOS picker does the same).
  const now = Date.now();
  if (now - lastClickAt < 25) return;
  lastClickAt = now;
  haptics.select();
}
