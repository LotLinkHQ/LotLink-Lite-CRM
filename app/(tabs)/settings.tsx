import { View, Text, TouchableOpacity, ScrollView, Switch } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useDealershipAuth();

  const { data: preferences } = trpc.preferences.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const updatePreferences = trpc.preferences.update.useMutation();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#2C3E50", fontSize: 18 }}>Please log in to continue</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Text style={{ fontSize: 24, fontWeight: "bold", color: "#2C3E50", marginBottom: 24 }}>
          Settings
        </Text>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: "#ECF0F1",
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#2C3E50", marginBottom: 12 }}>
            Dealership Profile
          </Text>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: "#7F8C8D" }}>Name</Text>
              <Text style={{ color: "#2C3E50", fontWeight: "500" }}>{user?.name || "-"}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: "#7F8C8D" }}>Username</Text>
              <Text style={{ color: "#2C3E50", fontWeight: "500" }}>{user?.username || "-"}</Text>
            </View>
          </View>
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: "#ECF0F1",
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#2C3E50", marginBottom: 12 }}>
            Notifications
          </Text>
          <View style={{ gap: 12 }}>
            {[
              { label: "Email Notifications", key: "emailNotifications" },
              { label: "SMS Notifications", key: "smsNotifications" },
              { label: "In-App Notifications", key: "inAppNotifications" },
            ].map((item) => (
              <View key={item.key} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: "#2C3E50" }}>{item.label}</Text>
                <Switch
                  value={(preferences as any)?.[item.key] ?? (item.key === "emailNotifications" || item.key === "inAppNotifications")}
                  onValueChange={(val) => {
                    updatePreferences.mutate({ [item.key]: val });
                  }}
                  trackColor={{ false: "#ECF0F1", true: "#0B5E7E" }}
                  thumbColor="#FFFFFF"
                />
              </View>
            ))}
          </View>
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: "#ECF0F1",
            marginBottom: 24,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#2C3E50", marginBottom: 12 }}>
            App Info
          </Text>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: "#7F8C8D" }}>Version</Text>
              <Text style={{ color: "#2C3E50" }}>1.0.0</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          style={{
            backgroundColor: "#E74C3C",
            borderRadius: 8,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
