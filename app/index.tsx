import { Redirect } from "expo-router";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const { isAuthenticated, loading } = useDealershipAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8F9FA" }}>
        <ActivityIndicator size="large" color="#0B5E7E" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/login" />;
}
