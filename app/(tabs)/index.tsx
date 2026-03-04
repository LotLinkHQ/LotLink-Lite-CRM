import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { useRouter } from "expo-router";
import { C } from "@/constants/theme";

const STATUS_COLORS: Record<string, string> = {
  pending: C.amber,
  notified: C.tealMid,
  contacted: C.teal,
  sold: C.green,
  dismissed: C.muted,
};

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isOwner } = useDealershipAuth();

  const { data: leadsData, isLoading: leadsLoading } = trpc.leads.list.useQuery(
    {},
    { enabled: isAuthenticated }
  );

  const { data: inventoryPage, isLoading: inventoryLoading } = trpc.inventory.list.useQuery(
    {},
    { enabled: isAuthenticated }
  );

  const { data: matchesPage, isLoading: matchesLoading } = trpc.matches.list.useQuery(
    {},
    { enabled: isAuthenticated, refetchInterval: 10000 }
  );

  const { data: teamData } = trpc.analytics.team.useQuery(
    undefined,
    { enabled: isAuthenticated && isOwner, refetchInterval: 30000 }
  );

  const isLoading = leadsLoading || inventoryLoading || matchesLoading;

  const leads = leadsData?.items || [];
  const inventoryData = inventoryPage?.items || [];
  const matchesData = matchesPage?.items || [];

  const activeLeads = leads.filter((l: any) => l.status === "active").length;
  const totalLeads = leads.length;
  const inStockUnits = inventoryData.filter((i: any) => i.status === "in_stock").length;
  const totalMatches = matchesData.length;
  const pendingMatches = matchesData.filter((m: any) => m.match?.status === "pending").length;
  const notifiedMatches = matchesData.filter((m: any) => m.match?.status === "notified").length;
  const soldMatches = matchesData.filter((m: any) => m.match?.status === "sold").length;
  const recentMatches = matchesData.slice(0, 5);

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View style={s.center}>
          <Text style={s.centerText}>Please log in to continue</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.teal} />
        </View>
      </ScreenContainer>
    );
  }

  // Team totals for owner summary
  const teamMembers = teamData || [];
  const teamTotalLeads = teamMembers.reduce((sum: number, m: any) => sum + m.stats.totalLeads, 0);
  const teamTotalSold = teamMembers.reduce((sum: number, m: any) => sum + m.stats.soldLeads, 0);
  const teamTotalMatches = teamMembers.reduce((sum: number, m: any) => sum + m.stats.totalMatches, 0);
  const teamAvgConversion = teamMembers.length > 0
    ? Math.round(teamMembers.reduce((sum: number, m: any) => sum + m.stats.conversionRate, 0) / teamMembers.length)
    : 0;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.logoMark}>
            <Text style={s.logoText}>LL</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Dashboard</Text>
            <Text style={s.headerSub}>
              {user?.name || "Salesperson"} · {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : ""}
            </Text>
          </View>
        </View>

        {/* Stats row 1 */}
        <View style={s.row}>
          <View style={[s.statCard, { borderLeftColor: C.teal }]}>
            <Text style={s.statLabel}>Active Leads</Text>
            <Text style={[s.statNum, { color: C.teal }]}>{activeLeads}</Text>
            <Text style={s.statSub}>{totalLeads} total</Text>
          </View>
          <View style={[s.statCard, { borderLeftColor: C.green }]}>
            <Text style={s.statLabel}>In Stock</Text>
            <Text style={[s.statNum, { color: C.green }]}>{inStockUnits}</Text>
            <Text style={s.statSub}>{inventoryData?.length || 0} total</Text>
          </View>
        </View>

        {/* Stats row 2 */}
        <View style={s.row}>
          <View style={[s.statCard, { borderLeftColor: C.tealMid }]}>
            <Text style={s.statLabel}>Matches</Text>
            <Text style={[s.statNum, { color: C.tealMid }]}>{totalMatches}</Text>
            <Text style={s.statSub}>{notifiedMatches} notified</Text>
          </View>
          <View style={[s.statCard, { borderLeftColor: C.amber }]}>
            <Text style={s.statLabel}>Sold</Text>
            <Text style={[s.statNum, { color: C.amber }]}>{soldMatches}</Text>
            <Text style={s.statSub}>{pendingMatches} pending</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Quick Actions</Text>
          <View style={{ gap: 8 }}>
            <TouchableOpacity onPress={() => router.push("/(tabs)/leads")} style={[s.actionBtn, { backgroundColor: C.teal }]}>
              <Text style={s.actionBtnText}>+ Add New Lead</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/(tabs)/inventory")} style={[s.actionBtn, { backgroundColor: C.tealMid }]}>
              <Text style={s.actionBtnText}>+ Log Unit Arrival</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/(tabs)/matches")} style={[s.actionBtn, { backgroundColor: C.tealDark }]}>
              <Text style={s.actionBtnText}>View Matches</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Team Performance (Owner Only) ─── */}
        {isOwner && teamMembers.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Team Performance</Text>

            {/* Team summary row */}
            <View style={s.row}>
              <View style={[s.statCard, { borderLeftColor: C.mint }]}>
                <Text style={s.statLabel}>Team Leads</Text>
                <Text style={[s.statNum, { color: C.mint }]}>{teamTotalLeads}</Text>
                <Text style={s.statSub}>{teamTotalSold} sold</Text>
              </View>
              <View style={[s.statCard, { borderLeftColor: C.green }]}>
                <Text style={s.statLabel}>Conversion</Text>
                <Text style={[s.statNum, { color: C.green }]}>{teamAvgConversion}%</Text>
                <Text style={s.statSub}>{teamTotalMatches} matches</Text>
              </View>
            </View>

            {/* Individual salesperson cards */}
            <View style={{ gap: 8, marginTop: 4 }}>
              {teamMembers.map((member: any) => (
                <View key={member.userId} style={s.teamCard}>
                  <View style={s.teamCardHeader}>
                    <View style={s.teamAvatar}>
                      <Text style={s.teamAvatarText}>
                        {member.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.teamName}>{member.name}</Text>
                      <Text style={s.teamRole}>
                        {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        {!member.isActive && " (Inactive)"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[s.teamConversion, { color: member.stats.conversionRate >= 20 ? C.green : member.stats.conversionRate >= 10 ? C.amber : C.red }]}>
                        {member.stats.conversionRate}%
                      </Text>
                      <Text style={s.teamConvLabel}>conversion</Text>
                    </View>
                  </View>
                  <View style={s.teamStatsRow}>
                    <View style={s.teamStat}>
                      <Text style={s.teamStatNum}>{member.stats.totalLeads}</Text>
                      <Text style={s.teamStatLabel}>Leads</Text>
                    </View>
                    <View style={s.teamStat}>
                      <Text style={s.teamStatNum}>{member.stats.activeLeads}</Text>
                      <Text style={s.teamStatLabel}>Active</Text>
                    </View>
                    <View style={s.teamStat}>
                      <Text style={s.teamStatNum}>{member.stats.totalMatches}</Text>
                      <Text style={s.teamStatLabel}>Matches</Text>
                    </View>
                    <View style={s.teamStat}>
                      <Text style={s.teamStatNum}>{member.stats.contactedMatches}</Text>
                      <Text style={s.teamStatLabel}>Contacted</Text>
                    </View>
                    <View style={s.teamStat}>
                      <Text style={[s.teamStatNum, { color: C.green }]}>{member.stats.soldLeads}</Text>
                      <Text style={s.teamStatLabel}>Sold</Text>
                    </View>
                  </View>
                  {member.lastSignedIn && (
                    <Text style={s.teamLastSeen}>
                      Last active: {new Date(member.lastSignedIn).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Recent Matches */}
        {recentMatches.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Recent Matches</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/matches")}>
                <Text style={s.linkText}>View All</Text>
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
                    style={[s.matchCard, { borderLeftColor: STATUS_COLORS[status] || C.muted }]}
                  >
                    <View style={s.matchRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.matchName}>{lead.customerName || "Unknown"}</Text>
                        <Text style={s.matchUnit}>{unit.year} {unit.make} {unit.model}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={s.matchScore}>{match.matchScore}%</Text>
                        <Text style={[s.matchStatus, { color: STATUS_COLORS[status] }]}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* System Status */}
        <View style={s.statusCard}>
          <Text style={s.statusTitle}>System Status</Text>
          {["Database", "API Server", "AI Matching Engine", "Email Notifications"].map((name) => (
            <View key={name} style={s.statusRow}>
              <Text style={s.statusName}>{name}</Text>
              <View style={[s.statusDot, { backgroundColor: C.green }]} />
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerText: { color: C.ink, fontSize: 18 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  logoMark: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.teal, alignItems: "center", justifyContent: "center" },
  logoText: { color: C.mint, fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },
  headerTitle: { fontSize: 24, fontWeight: "700", color: C.ink },
  headerSub: { fontSize: 13, color: C.muted, marginTop: 1 },
  row: { flexDirection: "row", gap: 10, marginBottom: 10 },
  statCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: C.rule, borderLeftWidth: 3,
  },
  statLabel: { color: C.muted, fontSize: 12, marginBottom: 4 },
  statNum: { fontSize: 28, fontWeight: "700" },
  statSub: { fontSize: 11, color: C.muted, marginTop: 2 },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: "600", color: C.ink, marginBottom: 10 },
  linkText: { color: C.teal, fontWeight: "600", fontSize: 14 },
  actionBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, alignItems: "center" },
  actionBtnText: { color: C.white, fontWeight: "600", fontSize: 15 },
  matchCard: {
    backgroundColor: C.surface, borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: C.rule, borderLeftWidth: 3,
  },
  matchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  matchName: { fontWeight: "600", color: C.ink, fontSize: 14 },
  matchUnit: { fontSize: 12, color: C.teal, marginTop: 2 },
  matchScore: { fontSize: 13, fontWeight: "700", color: C.teal },
  matchStatus: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  statusCard: { backgroundColor: C.surface, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: C.rule, marginBottom: 24 },
  statusTitle: { fontSize: 14, fontWeight: "600", color: C.ink, marginBottom: 10 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  statusName: { fontSize: 14, color: C.muted },
  statusDot: { borderRadius: 8, width: 8, height: 8 },

  // Team Performance styles
  teamCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: C.rule,
  },
  teamCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  teamAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: C.tealDark,
    alignItems: "center", justifyContent: "center",
  },
  teamAvatarText: { color: C.mint, fontWeight: "700", fontSize: 13 },
  teamName: { fontWeight: "600", color: C.ink, fontSize: 14 },
  teamRole: { fontSize: 11, color: C.muted, marginTop: 1 },
  teamConversion: { fontSize: 18, fontWeight: "700" },
  teamConvLabel: { fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  teamStatsRow: {
    flexDirection: "row", justifyContent: "space-between",
    backgroundColor: C.bg, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 8,
  },
  teamStat: { alignItems: "center", flex: 1 },
  teamStatNum: { fontSize: 16, fontWeight: "700", color: C.ink },
  teamStatLabel: { fontSize: 9, color: C.muted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.3 },
  teamLastSeen: { fontSize: 10, color: C.muted, marginTop: 8 },
});
