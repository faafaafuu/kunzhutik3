// The bonus wheel at checkout: a half-circle of dishes that can be taken free for bonuses, the balance in its middle.
// Drag it sideways like the iOS time picker — a finger, or on a computer the mouse and the wheel/trackpad: it clicks
// on every dish passing the top (a haptic tick in the app, a short click sound on the site) and settles on the
// nearest one. The dish at the top is the one the button takes.

import { Image } from "expo-image";
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
const native = Platform.OS !== "web";
// Dragging the wheel must not select its text or call up "Скопировать" on a long press.
const NO_SELECT = (native ? {} : { userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }) as object;

// Samples of the position relative to the top (in dishes): the curves below are interpolated between them.
const SAMPLES = Array.from({ length: 33 }, (_, index) => -4 + index * 0.25);

type Props = {
  items: MenuItem[];
  balance: number;
  taken: string[];
  onChange: (taken: string[]) => void;
};

export function BonusWheel({ items, balance, taken, onChange }: Props) {
  const { c } = useTheme();
  // It opens on the middle dish, so there is something on both sides of the half-circle.
  const middle = Math.floor((items.length - 1) / 2);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(middle);
  const position = useRef(new Animated.Value(middle)).current;
  const current = useRef(middle);
  const start = useRef(middle);
  const lastTick = useRef(middle);

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

  // A click for every dish that passes the top, as the wheel turns or settles.
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
    Animated.spring(position, { toValue: target, useNativeDriver: native, friction: 9, tension: 70 }).start();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Horizontal drags only: the page keeps scrolling up and down through the wheel.
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          position.stopAnimation();
          start.current = current.current;
          unlockSound();
        },
        onPanResponderMove: (_, g) => {
          let next = start.current - g.dx / perDish;
          // Past either end it gives a little, like a rubber band.
          if (next < 0) next = next / 3;
          if (next > items.length - 1) next = items.length - 1 + (next - items.length + 1) / 3;
          position.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          // A flick carries on: vx is px/ms, ~250 ms of glide.
          settle(Math.round(current.current - (g.vx * 250) / perDish));
        },
        onPanResponderTerminate: () => settle(Math.round(current.current)),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [perDish, items.length],
  );

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
      unlockSound();
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
      unlockSound();
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

  return (
    <View style={{ gap: 12 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View>
        <T weight="semibold" size={16}>
          Бесплатно за бонусы
        </T>
        <Muted size={13}>Покрутите колесо и выберите, что взять к заказу</Muted>
      </View>

      {width ? (
        <View ref={surface} {...pan.panHandlers} style={[{ height: baseline + 8, overflow: "hidden" }, NO_SELECT]}>
          {/* The rim: a thin half-circle the dishes ride on. */}
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: centerX - radius, top: SIZE / 2 + 6, width: radius * 2, height: radius * 2, borderRadius: radius, borderWidth: 1.5, borderColor: c.line, borderStyle: "dashed" }}
          />
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

// ---- the click ----

let audio: AudioContext | null = null;

/** Browsers only play sound after a gesture: the first drag of the wheel opens the audio. */
function unlockSound(): void {
  if (native || audio) return;
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audio = Context ? new Context() : null;
  } catch {
    audio = null;
  }
}

/** One detent: a selection tick in the app; on the site a 10 ms click (and a buzz on Android phones that allow it). */
function tick(): void {
  haptics.select();
  if (native || !audio) return;
  const now = audio.currentTime;
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  // A low, short "tok" — closer to the iOS picker than a beep.
  tone.type = "triangle";
  tone.frequency.setValueAtTime(520, now);
  tone.frequency.exponentialRampToValueAtTime(260, now + 0.018);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
  tone.connect(gain).connect(audio.destination);
  tone.start(now);
  tone.stop(now + 0.025);
}
