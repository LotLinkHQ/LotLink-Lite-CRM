import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "expo-router";

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  // Query data
  const { data: leads, isLoading: leadsLoading } = trpc.leads.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: inventory, isLoading: inventoryLoading } = trpc.inventory.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const isLoading = leadsLoading || inventoryLoading;

  // Calculate metrics
  const activeLeads = leads?.filter((l) => l.status === "active").length || 0;
  const inStockUnits = inventory?.filter((i) => i.status === "in_stock").length || 0;
  const recentUnits = inventory?.slice(0, 3) || [];

  if (!isAuthenticated) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text className="text-foreground text-lg">Please log in to continue</Text>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color="#0B5E7E" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1 p-0">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-4">
        {/* Header */}
        <View className="mb-6">
          <Text className="text-3xl font-bold text-foreground">Dashboard</Text>
          <Text className="text-muted text-sm mt-1">
            Welcome back, {user?.name || "Salesperson"}
          </Text>
        </View>

        {/* Key Metrics */}
        <View className="gap-3 mb-6">
          {/* Active Leads Card */}
          <View className="bg-surface rounded-xl p-4 border border-border">
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-muted text-sm mb-1">Active Leads</Text>
                <Text className="text-3xl font-bold text-primary">{activeLeads}</Text>
              </View>
              <View className="bg-primary bg-opacity-10 rounded-lg p-3">
                <Text className="text-2xl">👥</Text>
              </View>
            </View>
          </View>

          {/* In Stock Units Card */}
          <View className="bg-surface rounded-xl p-4 border border-border">
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-muted text-sm mb-1">Units in Stock</Text>
                <Text className="text-3xl font-bold text-success">{inStockUnits}</Text>
              </View>
              <View className="bg-success bg-opacity-10 rounded-lg p-3">
                <Text className="text-2xl">🚐</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View className="mb-6">
          <Text className="text-lg font-semibold text-foreground mb-3">Quick Actions</Text>
          <View className="gap-2">
            <TouchableOpacity
              onPress={() => router.push("/leads/add")}
              className="bg-primary rounded-lg px-4 py-3 active:opacity-80"
            >
              <Text className="text-white font-semibold text-center">+ Add New Lead</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/inventory")}
              className="bg-secondary rounded-lg px-4 py-3 active:opacity-80"
              style={{ backgroundColor: "#E67E22" }}
            >
              <Text className="text-white font-semibold text-center">+ Log Unit Arrival</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Units */}
        {recentUnits.length > 0 && (
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-semibold text-foreground">Recent Arrivals</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/inventory")}>
                <Text className="text-primary font-semibold">View All</Text>
              </TouchableOpacity>
            </View>
            <View className="gap-2">
              {recentUnits.map((unit) => (
                <View
                  key={unit.id}
                  className="bg-surface rounded-lg p-3 border border-border flex-row justify-between items-center"
                >
                  <View className="flex-1">
                    <Text className="font-semibold text-foreground">
                      {unit.year} {unit.make} {unit.model}
                    </Text>
                    <Text className="text-xs text-muted mt-1">
                      {unit.length}ft • {unit.bedType} • ${unit.price}
                    </Text>
                  </View>
                  <View className="bg-success bg-opacity-10 px-2 py-1 rounded">
                    <Text className="text-xs font-semibold text-success">In Stock</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* System Status */}
        <View className="bg-surface rounded-lg p-4 border border-border">
          <Text className="text-sm font-semibold text-foreground mb-2">System Status</Text>
          <View className="gap-2">
            <View className="flex-row justify-between items-center">
              <Text className="text-sm text-muted">Database</Text>
              <View className="bg-success rounded-full w-2 h-2" />
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-sm text-muted">API Server</Text>
              <View className="bg-success rounded-full w-2 h-2" />
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-sm text-muted">AI Matching</Text>
              <View className="bg-success rounded-full w-2 h-2" />
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
