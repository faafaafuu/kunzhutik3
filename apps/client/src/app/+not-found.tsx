import { useRouter } from "expo-router";
import { View } from "react-native";

import { Button, StateView } from "@/components/ui";
import { useTheme } from "@/theme";

export default function NotFound() {
  const router = useRouter();
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: "center", backgroundColor: c.surface }}>
      <StateView icon="search" title="Здесь ничего нет" text="Возможно, ссылка устарела." action={<Button title="В меню" onPress={() => router.replace("/")} />} />
    </View>
  );
}
