import { View, Text, TouchableOpacity, ScrollView, Switch, TextInput, ActivityIndicator, Alert } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useDealershipAuth();

  const { data: preferences } = trpc.preferences.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: dealership, refetch: refetchDealership } = trpc.dealership.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const updatePreferences = trpc.preferences.update.useMutation();
  const updateWebsite = trpc.dealership.updateWebsite.useMutation({
    onSuccess: () => {
      refetchDealership();
    },
  });
  const syncInventory = trpc.dealership.syncInventory.useMutation({
    onSuccess: (data) => {
      refetchDealership();
      if (data.success) {
        Alert.alert(
          "Sync Complete",
          `Found ${data.totalFound} vehicles.\n${data.newUnits} new units added.\n${data.updatedUnits} units updated.${data.errors.length > 0 ? `\n${data.errors.length} errors.` : ""}`
        );
      } else {
        Alert.alert("Sync Failed", data.errors?.join("\n") || "Unknown error");
      }
    },
    onError: (error) => {
      Alert.alert("Sync Error", error.message);
    },
  });

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteEdited, setWebsiteEdited] = useState(false);

  useEffect(() => {
    if (dealership?.websiteUrl && !websiteEdited) {
      setWebsiteUrl(dealership.websiteUrl);
    }
  }, [dealership?.websiteUrl]);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const handleSaveWebsite = () => {
    if (!websiteUrl.trim()) return;
    updateWebsite.mutate({ websiteUrl: websiteUrl.trim() });
    setWebsiteEdited(false);
  };

  const handleSync = () => {
    if (!dealership?.websiteUrl && !websiteUrl.trim()) {
      Alert.alert("No Website", "Please enter your dealership website URL first.");
      return;
    }
    if (websiteEdited && websiteUrl.trim()) {
      updateWebsite.mutate(
        { websiteUrl: websiteUrl.trim() },
        {
          onSuccess: () => {
            setWebsiteEdited(false);
            syncInventory.mutate();
          },
        }
      );
    } else {
      syncInventory.mutate();
    }
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

  const lastSynced = dealership?.lastScrapedAt
    ? new Date(dealership.lastScrapedAt).toLocaleString()
    : "Never";

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Text style={{ fontSize: 24, fontWeight: "bold", color: "#2C3E50", marginBottom: 24 }}>
          Settings
        </Text>

        {/* Dealership Profile */}
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

        {/* Inventory Sync */}
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
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#2C3E50", marginBottom: 4 }}>
            Inventory Sync
          </Text>
          <Text style={{ fontSize: 12, color: "#95A5A6", marginBottom: 12 }}>
            Enter your dealership website to auto-import inventory
          </Text>

          <Text style={{ fontSize: 13, fontWeight: "500", color: "#2C3E50", marginBottom: 6 }}>
            Website URL
          </Text>
          <TextInput
            value={websiteUrl}
            onChangeText={(text) => {
              setWebsiteUrl(text);
              setWebsiteEdited(true);
            }}
            placeholder="https://www.yourdealership.com"
            placeholderTextColor="#BDC3C7"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={{
              backgroundColor: "#F8F9FA",
              borderRadius: 8,
              borderWidth: 1,
              borderColor: "#ECF0F1",
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14,
              color: "#2C3E50",
              marginBottom: 8,
            }}
          />

          {websiteEdited && websiteUrl.trim() !== (dealership?.websiteUrl || "") && (
            <TouchableOpacity
              onPress={handleSaveWebsite}
              disabled={updateWebsite.isLoading}
              style={{
                backgroundColor: "#0B5E7E",
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }}>
                {updateWebsite.isLoading ? "Saving..." : "Save URL"}
              </Text>
            </TouchableOpacity>
          )}

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ color: "#7F8C8D", fontSize: 13 }}>Last synced</Text>
            <Text style={{ color: "#2C3E50", fontSize: 13 }}>{lastSynced}</Text>
          </View>

          <TouchableOpacity
            onPress={handleSync}
            disabled={syncInventory.isLoading}
            style={{
              backgroundColor: syncInventory.isLoading ? "#95A5A6" : "#27AE60",
              borderRadius: 8,
              paddingVertical: 12,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {syncInventory.isLoading && <ActivityIndicator size="small" color="white" />}
            <Text style={{ color: "white", fontWeight: "600", fontSize: 15 }}>
              {syncInventory.isLoading ? "Syncing Inventory..." : "Sync Inventory Now"}
            </Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 11, color: "#95A5A6", marginTop: 8, textAlign: "center" }}>
            Inventory auto-syncs every 24 hours when a URL is configured
          </Text>
        </View>

        {/* Notifications */}
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

        {/* API Configuration Info */}
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
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#2C3E50", marginBottom: 4 }}>
            Email Configuration
          </Text>
          <Text style={{ fontSize: 12, color: "#95A5A6", marginBottom: 12 }}>
            Set these in your Railway environment variables
          </Text>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: "#7F8C8D", fontSize: 13 }}>SENDGRID_API_KEY</Text>
              <Text style={{ color: "#27AE60", fontSize: 13, fontWeight: "500" }}>
                {/* This is informational only - actual check happens server-side */}
                Set in Railway
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: "#7F8C8D", fontSize: 13 }}>SENDGRID_FROM_EMAIL</Text>
              <Text style={{ color: "#27AE60", fontSize: 13, fontWeight: "500" }}>
                Set in Railway
              </Text>
            </View>
          </View>
        </View>

        {/* App Info */}
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
            marginBottom: 40,
          }}
        >
          <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
