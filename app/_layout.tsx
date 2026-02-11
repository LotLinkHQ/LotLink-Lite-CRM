import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { BrandProvider } from "@/app/context/BrandContext";

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );
  const [trpcClient] = useState(() => createTRPCClient());

  return (
    <View style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <BrandProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="(tabs)" />
              </Stack>
              <StatusBar style="auto" />
            </BrandProvider>
          </SafeAreaProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </View>
  );
}
