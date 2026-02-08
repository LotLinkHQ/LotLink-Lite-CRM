import { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { ActivityIndicator, View } from "react-native";

export function RootLayoutWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useDealershipAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "login";

    if (!isAuthenticated && !inAuthGroup) {
      // Not authenticated and not on login screen, redirect to login
      router.replace("/login");
    } else if (isAuthenticated && inAuthGroup) {
      // Authenticated but on login screen, redirect to home
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, segments, loading, router]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#0B5E7E" />
      </View>
    );
  }

  return <>{children}</>;
}
