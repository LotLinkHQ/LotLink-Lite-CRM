import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { ActivityIndicator, View, Text, TouchableOpacity } from "react-native";

export default function Index() {
  const { isAuthenticated, isLinkedToDealership, isOwner, loading } = useDealershipAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) setTimedOut(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  if (timedOut && !isAuthenticated) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0c1f1f", paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", color: "#e8f4f4", marginBottom: 8 }}>
          Server not responding
        </Text>
        <Text style={{ color: "#7fa8a8", textAlign: "center", marginBottom: 24 }}>
          Could not connect to the server. Check that it's running and try again.
        </Text>
        <TouchableOpacity
          onPress={() => {
            setTimedOut(false);
            if (typeof window !== "undefined") {
              window.location.reload();
            }
          }}
          style={{
            backgroundColor: "#1d9a9a",
            borderRadius: 8,
            paddingVertical: 12,
            paddingHorizontal: 32,
          }}
        >
          <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0c1f1f" }}>
        <ActivityIndicator size="large" color="#1d9a9a" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (isOwner) {
    return <Redirect href={"/(owner)" as any} />;
  }

  if (!isLinkedToDealership) {
    return <Redirect href={"/create-dealership" as any} />;
  }

  return <Redirect href="/(tabs)" />;
}
