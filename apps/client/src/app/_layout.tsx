import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ToastHost } from "@/components/Toast";
import { Button, StateView } from "@/components/ui";
import { loadConfig, useShared } from "@/hooks/data";
import { registerForPush, signInWithTelegram, updateRequired } from "@/lib/session";
import { useSession } from "@/store/session";
import { ThemeProvider, useTheme } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold });
  const [booted, setBooted] = useState(false);
  const config = useShared((state) => state.config);
  const signedIn = useSession((state) => Boolean(state.tokens));

  useEffect(() => {
    (async () => {
      await Promise.all([loadConfig(), signInWithTelegram()]);
      setBooted(true);
    })();
  }, []);

  useEffect(() => {
    if (signedIn) registerForPush();
  }, [signedIn]);

  useEffect(() => {
    if (fontsLoaded && booted) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, booted]);

  if (!fontsLoaded || !booted) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {updateRequired(config) ? <ForceUpdate storeUrl={Platform.OS === "ios" ? config!.ios_store_url : config!.android_store_url} /> : <AppStack />}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppStack() {
  const { c, isDark } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.surface } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="dish/[slug]" options={{ presentation: Platform.OS === "web" ? "transparentModal" : "modal", animation: Platform.OS === "web" ? "fade" : "default" }} />
        <Stack.Screen name="cart" options={{ presentation: Platform.OS === "web" ? "transparentModal" : "modal", animation: Platform.OS === "web" ? "fade" : "default" }} />
        <Stack.Screen name="address" options={{ presentation: Platform.OS === "web" ? "card" : "modal" }} />
        <Stack.Screen name="login" options={{ presentation: Platform.OS === "web" ? "card" : "modal" }} />
      </Stack>
      <ToastHost />
    </View>
  );
}

function ForceUpdate({ storeUrl }: { storeUrl: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, justifyContent: "center" }}>
      <StateView
        icon="refresh"
        title="Обновите приложение"
        text="Эта версия больше не поддерживается. Обновление займёт минуту."
        action={<Button title={Platform.OS === "ios" ? "Обновить в App Store" : "Обновить в Google Play"} onPress={() => storeUrl && Linking.openURL(storeUrl)} />}
      />
    </View>
  );
}
