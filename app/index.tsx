import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { ActivityIndicator, View, Text, TouchableOpacity } from "react-native";

export default function Index() {
  const { isAuthenticated, loading, meError } = useDealershipAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) setTimedOut(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  if (timedOut && !isAuthenticated) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8F9FA", paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", color: "#2C3E50", marginBottom: 8 }}>
          Server not responding
        </Text>
        <Text style={{ color: "#7F8C8D", textAlign: "center", marginBottom: 24 }}>
          Could not connect to the server. Check that it's running and try again.
        </Text>
        <TouchableOpacity
          onPress={() => {
            setTimedOut(false);
            // Force a page reload on web to re-attempt connection
            if (typeof window !== "undefined") {
              window.location.reload();
            }
          }}
          style={{
            backgroundColor: "#0B5E7E",
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
