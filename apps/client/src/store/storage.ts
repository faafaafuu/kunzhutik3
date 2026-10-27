import AsyncStorage from "@react-native-async-storage/async-storage";
import { createJSONStorage } from "zustand/middleware";

// AsyncStorage maps to localStorage on the web.
export const persistStorage = createJSONStorage(() => AsyncStorage);
