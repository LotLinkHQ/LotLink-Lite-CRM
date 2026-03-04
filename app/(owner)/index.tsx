import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { C } from "@/constants/theme";

function StatCard({ label, value, emoji }: { label: string; value: number | string; emoji: string }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statEmoji}>{emoji}</Text>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export default function OwnerDashboard() {
  const { user, logout } = useDealershipAuth();
  const { data: stats, isLoading } = trpc.owner.dashboard.useQuery();
  const { data: recentActivity } = trpc.owner.activity.list.useQuery({ limit: 10 });

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={C.teal} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerInner}>
            <View style={s.headerLogo}>
              <Text style={s.headerLogoText}>LL</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.headerEyebrow}>LotLink Owner Portal</Text>
              <Text style={s.headerTitle}>
                Dashboard <Text style={s.headerMint}>Overview</Text>
              </Text>
            </View>
            <TouchableOpacity style={s.logoutBtn} onPress={logout}>
              <Text style={s.logoutBtnText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Welcome */}
        <View style={s.welcomeBox}>
          <Text style={s.welcomeText}>Welcome back, {user?.name || "Owner"}</Text>
        </View>

        {/* Stats Grid */}
        <View style={s.sectionLabel}>
          <Text style={s.sectionLabelText}>Platform Stats</Text>
        </View>
        <View style={s.statsGrid}>
          <StatCard emoji="🏢" label="Dealerships" value={stats?.dealerships ?? 0} />
          <StatCard emoji="👥" label="Users" value={stats?.users ?? 0} />
          <StatCard emoji="📋" label="Leads" value={stats?.leads ?? 0} />
          <StatCard emoji="🚐" label="Inventory" value={stats?.inventory ?? 0} />
        </View>

        {/* Recent Activity */}
        <View style={s.sectionLabel}>
          <Text style={s.sectionLabelText}>Recent Activity</Text>
        </View>
        {recentActivity && recentActivity.length > 0 ? (
          recentActivity.map((log: any) => (
            <View key={log.id} style={s.activityRow}>
              <View style={s.activityDot} />
              <View style={{ flex: 1 }}>
                <Text style={s.activityUser}>{log.userName}</Text>
                <Text style={s.activityAction}>{log.action}</Text>
              </View>
              <Text style={s.activityTime}>
                {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          ))
        ) : (
          <View style={s.emptyBox}>
            <Text style={s.emptyText}>No recent activity yet</Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: { backgroundColor: C.tealDeep, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 22 },
  headerInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerLogo: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.mint, alignItems: "center", justifyContent: "center" },
  headerLogoText: { fontSize: 13, fontWeight: "800", color: C.tealDeep, letterSpacing: -0.5 },
  headerEyebrow: { fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 1 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  headerMint: { color: C.mint },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)" },
  logoutBtnText: { color: C.white, fontSize: 12, fontWeight: "700" },

  welcomeBox: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 4 },
  welcomeText: { fontSize: 16, fontWeight: "700", color: C.ink },

  sectionLabel: { paddingHorizontal: 14, marginTop: 18, marginBottom: 8 },
  sectionLabelText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, color: C.muted },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 14 },
  statCard: {
    width: "47%", flexGrow: 1, flexBasis: "45%",
    backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.rule,
    borderRadius: 14, padding: 16, alignItems: "center",
  },
  statEmoji: { fontSize: 28, marginBottom: 6 },
  statValue: { fontSize: 28, fontWeight: "800", color: C.ink, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 },

  activityRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.rule,
  },
  activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.teal },
  activityUser: { fontSize: 13, fontWeight: "700", color: C.ink },
  activityAction: { fontSize: 11, color: C.muted },
  activityTime: { fontSize: 10, color: C.muted, fontWeight: "600" },

  emptyBox: { paddingHorizontal: 14, paddingVertical: 32, alignItems: "center" },
  emptyText: { fontSize: 13, color: C.muted, fontWeight: "600" },
});
