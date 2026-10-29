// A ScrollView that refreshes when pulled down from the top. Phones' apps get the system RefreshControl; on the web
// (where the page itself does not scroll, so the browser's own pull-to-refresh never fires) the pull is followed
// by touch and the brand's spinner shows above the content.

import { forwardRef, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Animated, Platform, RefreshControl, ScrollView, type ScrollViewProps, View } from "react-native";

import { useTheme } from "@/theme";

import { Spinner } from "./Spinner";

const PULL = 70; // px of pull that starts a refresh
// The spinner stays at least this long: an iOS RefreshControl switched off within the same moment it came on keeps
// spinning for good. And at most this long: a request that hangs must not leave it turning forever.
const MIN_SHOWN_MS = 600;
const MAX_SHOWN_MS = 12000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Props = ScrollViewProps & { onRefresh: () => Promise<unknown> | void; children: ReactNode };

export const RefreshableScrollView = forwardRef<React.ComponentRef<typeof ScrollView>, Props>(function RefreshableScrollView({ onRefresh, children, ...rest }, ref) {
  const { c } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const inner = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const pull = useRef(new Animated.Value(0)).current;

  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    try {
      const work = Promise.resolve(onRefresh()).catch(() => {});
      await Promise.all([Promise.race([work, wait(MAX_SHOWN_MS)]), wait(MIN_SHOWN_MS)]);
    } finally {
      running.current = false;
      setRefreshing(false);
    }
  }, [onRefresh]);

  // Web: follow a downward drag that starts while the list is at its very top.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = (inner.current as unknown as { getScrollableNode?: () => HTMLElement })?.getScrollableNode?.();
    if (!node) return;
    let startY: number | null = null;
    let distance = 0;
    const start = (event: TouchEvent) => {
      startY = node.scrollTop <= 0 ? event.touches[0].clientY : null;
      distance = 0;
    };
    const move = (event: TouchEvent) => {
      if (startY === null) return;
      distance = Math.max(0, event.touches[0].clientY - startY - Math.max(0, node.scrollTop));
      pull.setValue(Math.min(distance, PULL * 1.4));
    };
    const end = () => {
      if (startY !== null && distance >= PULL) run();
      startY = null;
      Animated.spring(pull, { toValue: 0, useNativeDriver: false }).start();
    };
    node.addEventListener("touchstart", start, { passive: true });
    node.addEventListener("touchmove", move, { passive: true });
    node.addEventListener("touchend", end);
    return () => {
      node.removeEventListener("touchstart", start);
      node.removeEventListener("touchmove", move);
      node.removeEventListener("touchend", end);
    };
  }, [pull, run]);

  const setRef = (value: React.ComponentRef<typeof ScrollView> | null) => {
    inner.current = value;
    if (typeof ref === "function") ref(value);
    else if (ref) ref.current = value;
  };

  if (Platform.OS !== "web") {
    return (
      <ScrollView ref={setRef} {...rest} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={run} tintColor={c.brand} colors={[c.brand]} />}>
        {children}
      </ScrollView>
    );
  }
  const shown = refreshing ? 1 : pull.interpolate({ inputRange: [0, PULL], outputRange: [0, 1], extrapolate: "clamp" });
  return (
    <View style={{ flex: 1 }}>
      <Animated.View pointerEvents="none" style={{ position: "absolute", top: 8, left: 0, right: 0, alignItems: "center", zIndex: 5, opacity: shown, transform: [{ scale: shown }] }}>
        <View style={{ padding: 8, borderRadius: 24, backgroundColor: c.surfaceCard }}>
          <Spinner size={26} />
        </View>
      </Animated.View>
      <ScrollView ref={setRef} {...rest}>
        {children}
      </ScrollView>
    </View>
  );
});
