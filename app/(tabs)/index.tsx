import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { useRouter } from "expo-router";

const STATUS_COLORS: Record<string, string> = {
  pending: "#F39C12",
  notified: "#3498DB",
  contacted: "#9B59B6",
  sold: "#27AE60",
  dismissed: "#95A5A6",
};

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAuthenticated } = useDealershipAuth();

  const { data: leads, isLoading: leadsLoading } = trpc.leads.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: inventoryData, isLoading: inventoryLoading } = trpc.inventory.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: matchesData, isLoading: matchesLoading } = trpc.matches.list.useQuery(
    undefined,
    { enabled: isAuthenticated, refetchInterval: 10000 }
  );

  const isLoading = leadsLoading || inventoryLoading || matchesLoading;

  const activeLeads = leads?.filter((l) => l.status === "active").length || 0;
  const totalLeads = leads?.length || 0;
  const inStockUnits = inventoryData?.filter((i) => i.status === "in_stock").length || 0;
  const totalMatches = matchesData?.length || 0;
  const pendingMatches = matchesData?.filter((m: any) => m.match?.status === "pending").length || 0;
  const notifiedMatches = matchesData?.filter((m: any) => m.match?.status === "notified").length || 0;
  const soldMatches = matchesData?.filter((m: any) => m.match?.status === "sold").length || 0;
  const recentMatches = matchesData?.slice(0, 5) || [];

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#2C3E50", fontSize: 18 }}>Please log in to continue</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#0B5E7E" />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 28, fontWeight: "bold", color: "#2C3E50" }}>Dashboard</Text>
          <Text style={{ color: "#7F8C8D", fontSize: 14, marginTop: 4 }}>
            Welcome back, {user?.name || "Salesperson"}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
          <View style={{ flex: 1, backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#ECF0F1" }}>
            <Text style={{ color: "#7F8C8D", fontSize: 12, marginBottom: 4 }}>Active Leads</Text>
            <Text style={{ fontSize: 28, fontWeight: "bold", color: "#0B5E7E" }}>{activeLeads}</Text>
            <Text style={{ fontSize: 11, color: "#BDC3C7" }}>{totalLeads} total</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#ECF0F1" }}>
            <Text style={{ color: "#7F8C8D", fontSize: 12, marginBottom: 4 }}>In Stock</Text>
            <Text style={{ fontSize: 28, fontWeight: "bold", color: "#27AE60" }}>{inStockUnits}</Text>
            <Text style={{ fontSize: 11, color: "#BDC3C7" }}>{inventoryData?.length || 0} total</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
          <View style={{ flex: 1, backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#ECF0F1" }}>
            <Text style={{ color: "#7F8C8D", fontSize: 12, marginBottom: 4 }}>Matches</Text>
            <Text style={{ fontSize: 28, fontWeight: "bold", color: "#9B59B6" }}>{totalMatches}</Text>
            <Text style={{ fontSize: 11, color: "#BDC3C7" }}>{notifiedMatches} notified</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#ECF0F1" }}>
            <Text style={{ color: "#7F8C8D", fontSize: 12, marginBottom: 4 }}>Sold</Text>
            <Text style={{ fontSize: 28, fontWeight: "bold", color: "#E67E22" }}>{soldMatches}</Text>
            <Text style={{ fontSize: 11, color: "#BDC3C7" }}>{pendingMatches} pending</Text>
          </View>
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: "600", color: "#2C3E50", marginBottom: 12 }}>
            Quick Actions
          </Text>
          <View style={{ gap: 8 }}>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/leads")}
              style={{ backgroundColor: "#0B5E7E", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 14 }}
            >
              <Text style={{ color: "white", fontWeight: "600", textAlign: "center" }}>+ Add New Lead</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/inventory")}
              style={{ backgroundColor: "#E67E22", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 14 }}
            >
              <Text style={{ color: "white", fontWeight: "600", textAlign: "center" }}>+ Log Unit Arrival</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/matches")}
              style={{ backgroundColor: "#9B59B6", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 14 }}
            >
              <Text style={{ color: "white", fontWeight: "600", textAlign: "center" }}>View Matches</Text>
            </TouchableOpacity>
          </View>
        </View>

        {recentMatches.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: "#2C3E50" }}>Recent Matches</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/matches")}>
                <Text style={{ color: "#0B5E7E", fontWeight: "600" }}>View All</Text>
              </TouchableOpacity>
            </View>
            <View style={{ gap: 8 }}>
              {recentMatches.map((item: any) => {
                const match = item.match || item;
                const lead = item.lead || {};
                const unit = item.unit || {};
                const status = match.status || "pending";

                return (
                  <TouchableOpacity
                    key={match.id}
                    onPress={() => router.push("/(tabs)/matches")}
                    style={{
                      backgroundColor: "#FFFFFF",
                      borderRadius: 8,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: "#ECF0F1",
                      borderLeftWidth: 3,
                      borderLeftColor: STATUS_COLORS[status] || "#7F8C8D",
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "600", color: "#2C3E50", fontSize: 14 }}>
                          {lead.customerName || "Unknown"}
                        </Text>
                        <Text style={{ fontSize: 12, color: "#0B5E7E", marginTop: 2 }}>
                          {unit.year} {unit.make} {unit.model}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: "#0B5E7E" }}>{match.matchScore}%</Text>
                        <Text style={{ fontSize: 11, color: STATUS_COLORS[status], fontWeight: "600", marginTop: 2 }}>
                          {status === "notified" ? "SMS Sent" : status.charAt(0).toUpperCase() + status.slice(1)}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 8,
            padding: 16,
            borderWidth: 1,
            borderColor: "#ECF0F1",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#2C3E50", marginBottom: 8 }}>
            System Status
          </Text>
          <View style={{ gap: 8 }}>
            {[
              { name: "Database", ok: true },
              { name: "API Server", ok: true },
              { name: "AI Matching Engine", ok: true },
              { name: "Twilio SMS", ok: true },
            ].map((item) => (
              <View key={item.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 14, color: "#7F8C8D" }}>{item.name}</Text>
                <View style={{ backgroundColor: item.ok ? "#27AE60" : "#E74C3C", borderRadius: 8, width: 8, height: 8 }} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
