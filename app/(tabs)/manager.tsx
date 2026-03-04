import React, { useState } from "react";
import {
  ScrollView, Text, View, TouchableOpacity, ActivityIndicator,
  StyleSheet, Alert, Platform, FlatList,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { C } from "@/constants/theme";

type Section = "overview" | "timers" | "funnel" | "feed";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "overview", label: "Team", icon: "👥" },
  { key: "timers", label: "Timers", icon: "⏱" },
  { key: "funnel", label: "Funnel", icon: "📊" },
  { key: "feed", label: "Activity", icon: "📋" },
];

function timeAgo(date: string | Date | null) {
  if (!date) return "Never";
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ManagerDashboard() {
  const { isAuthenticated, isManager, user } = useDealershipAuth();
  const [section, setSection] = useState<Section>("overview");
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: team, isLoading: teamLoading } = trpc.manager.teamOverview.useQuery(
    undefined, { enabled: isAuthenticated && isManager, refetchInterval: 15000 }
  );
  const { data: timers, isLoading: timersLoading } = trpc.manager.timerBoard.useQuery(
    undefined, { enabled: isAuthenticated && isManager && section === "timers", refetchInterval: 15000 }
  );
  const { data: funnel, isLoading: funnelLoading } = trpc.manager.conversionFunnel.useQuery(
    { days: 30, userId: selectedUser ?? undefined },
    { enabled: isAuthenticated && isManager && section === "funnel" }
  );
  const { data: feed, isLoading: feedLoading } = trpc.manager.activityFeed.useQuery(
    { limit: 50 },
    { enabled: isAuthenticated && isManager && section === "feed", refetchInterval: 10000 }
  );
  const { data: teamUsers } = trpc.users.list.useQuery(
    undefined, { enabled: isAuthenticated && isManager }
  );

  const nudgeMutation = trpc.manager.nudge.useMutation({
    onSuccess: () => { alert("Nudge sent!"); },
  });
  const escalateMutation = trpc.manager.escalate.useMutation({
    onSuccess: () => {
      alert("Escalation sent!");
      utils.manager.timerBoard.invalidate();
    },
  });
  const reassignMutation = trpc.manager.reassignMatch.useMutation({
    onSuccess: () => {
      alert("Match reassigned!");
      utils.manager.timerBoard.invalidate();
      utils.manager.teamOverview.invalidate();
    },
  });

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View style={s.center}><Text style={s.centerText}>Please log in</Text></View>
      </ScreenContainer>
    );
  }

  if (!isManager) {
    return (
      <ScreenContainer>
        <View style={s.center}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🔒</Text>
          <Text style={s.centerText}>Manager access required</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Manager Dashboard</Text>
          <Text style={s.subtitle}>Team accountability & performance</Text>
        </View>

        {/* Section tabs */}
        <View style={s.tabs}>
          {SECTIONS.map((sec) => (
            <TouchableOpacity
              key={sec.key}
              onPress={() => setSection(sec.key)}
              style={[s.tab, section === sec.key && s.tabActive]}
            >
              <Text style={s.tabIcon}>{sec.icon}</Text>
              <Text style={[s.tabLabel, section === sec.key && s.tabLabelActive]}>{sec.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Team Overview ─── */}
        {section === "overview" && (
          <View style={s.sectionBody}>
            {teamLoading ? (
              <ActivityIndicator size="large" color={C.teal} style={{ margin: 40 }} />
            ) : !team || team.length === 0 ? (
              <Text style={s.emptyText}>No team members found</Text>
            ) : (
              team.map((member: any) => (
                <View key={member.userId} style={s.memberCard}>
                  <View style={s.memberHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.memberName}>{member.name}</Text>
                      <Text style={s.memberRole}>{member.role}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => nudgeMutation.mutate({ userId: member.userId })}
                      style={s.nudgeBtn}
                    >
                      <Text style={s.nudgeBtnText}>Nudge</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.statRow}>
                    <View style={s.statBox}>
                      <Text style={s.statNum}>{member.leadsToday}</Text>
                      <Text style={s.statLabel}>Today</Text>
                    </View>
                    <View style={s.statBox}>
                      <Text style={s.statNum}>{member.leadsThisWeek}</Text>
                      <Text style={s.statLabel}>This Week</Text>
                    </View>
                    <View style={s.statBox}>
                      <Text style={s.statNum}>{member.activeMatchCount}</Text>
                      <Text style={s.statLabel}>Active</Text>
                    </View>
                    <View style={[s.statBox, member.unactedMatchCount > 0 && s.statBoxAlert]}>
                      <Text style={[s.statNum, member.unactedMatchCount > 0 && { color: C.red }]}>
                        {member.unactedMatchCount}
                      </Text>
                      <Text style={s.statLabel}>Unacted</Text>
                    </View>
                  </View>

                  {member.unactedMatchCount > 0 && (
                    <Text style={s.alertText}>
                      Oldest unacted: {member.oldestUnactedHours}h
                    </Text>
                  )}

                  <Text style={s.lastActivity}>
                    Last activity: {timeAgo(member.lastActivityAt)}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* ─── Timer Board ─── */}
        {section === "timers" && (
          <View style={s.sectionBody}>
            {timersLoading ? (
              <ActivityIndicator size="large" color={C.teal} style={{ margin: 40 }} />
            ) : timers ? (
              <>
                {renderTimerColumn("New", timers.newMatches, C.teal, "🟢")}
                {renderTimerColumn("Overdue", timers.overdue, C.amber, "🟡")}
                {renderTimerColumn("Critical", timers.critical, C.red, "🔴")}
                {renderTimerColumn("Contacted", timers.contacted, C.green, "✅")}
              </>
            ) : null}
          </View>
        )}

        {/* ─── Conversion Funnel ─── */}
        {section === "funnel" && (
          <View style={s.sectionBody}>
            {/* User filter */}
            <View style={s.filterRow}>
              <TouchableOpacity
                onPress={() => setSelectedUser(null)}
                style={[s.filterChip, !selectedUser && s.filterChipActive]}
              >
                <Text style={[s.filterText, !selectedUser && s.filterTextActive]}>All Team</Text>
              </TouchableOpacity>
              {teamUsers?.map((u: any) => (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => setSelectedUser(u.id)}
                  style={[s.filterChip, selectedUser === u.id && s.filterChipActive]}
                >
                  <Text style={[s.filterText, selectedUser === u.id && s.filterTextActive]}>
                    {u.name.split(" ")[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {funnelLoading ? (
              <ActivityIndicator size="large" color={C.teal} style={{ margin: 40 }} />
            ) : funnel ? (
              <View style={s.funnelCard}>
                <Text style={s.funnelTitle}>Last {funnel.days} Days</Text>

                <View style={s.funnelRow}>
                  <View style={s.funnelStage}>
                    <Text style={s.funnelNum}>{funnel.total}</Text>
                    <Text style={s.funnelLabel}>Matched</Text>
                  </View>
                  <Text style={s.funnelArrow}>→</Text>
                  <View style={s.funnelStage}>
                    <Text style={s.funnelNum}>{funnel.contacted}</Text>
                    <Text style={s.funnelLabel}>Contacted</Text>
                    <Text style={s.funnelPct}>{funnel.contactedPct}%</Text>
                  </View>
                  <Text style={s.funnelArrow}>→</Text>
                  <View style={s.funnelStage}>
                    <Text style={s.funnelNum}>{funnel.appointments}</Text>
                    <Text style={s.funnelLabel}>Appts</Text>
                    <Text style={s.funnelPct}>{funnel.appointmentsPct}%</Text>
                  </View>
                  <Text style={s.funnelArrow}>→</Text>
                  <View style={s.funnelStage}>
                    <Text style={[s.funnelNum, { color: C.green }]}>{funnel.sold}</Text>
                    <Text style={s.funnelLabel}>Sold</Text>
                    <Text style={s.funnelPct}>{funnel.soldPct}%</Text>
                  </View>
                </View>

                <View style={s.funnelMetric}>
                  <Text style={s.funnelMetricLabel}>Avg. Time to Contact</Text>
                  <Text style={s.funnelMetricValue}>{funnel.avgContactTimeMinutes} min</Text>
                </View>
              </View>
            ) : null}
          </View>
        )}

        {/* ─── Activity Feed ─── */}
        {section === "feed" && (
          <View style={s.sectionBody}>
            {feedLoading ? (
              <ActivityIndicator size="large" color={C.teal} style={{ margin: 40 }} />
            ) : !feed || feed.length === 0 ? (
              <Text style={s.emptyText}>No recent activity</Text>
            ) : (
              feed.map((entry: any, i: number) => (
                <View key={entry.id || i} style={s.feedItem}>
                  <View style={s.feedDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.feedAction}>
                      <Text style={{ fontWeight: "700", color: C.ink }}>{entry.userName}</Text>
                      {" "}{formatAction(entry.action, entry.metadata)}
                    </Text>
                    <Text style={s.feedTime}>{timeAgo(entry.createdAt)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </ScreenContainer>
  );

  function renderTimerColumn(title: string, items: any[], color: string, icon: string) {
    return (
      <View style={s.timerColumn}>
        <View style={s.timerHeader}>
          <Text style={s.timerIcon}>{icon}</Text>
          <Text style={[s.timerTitle, { color }]}>{title}</Text>
          <View style={[s.timerBadge, { backgroundColor: color + "30" }]}>
            <Text style={[s.timerBadgeText, { color }]}>{items.length}</Text>
          </View>
        </View>
        {items.length === 0 ? (
          <Text style={s.timerEmpty}>None</Text>
        ) : (
          items.map((item: any) => (
            <View key={item.matchId} style={s.timerCard}>
              <Text style={s.timerLead}>{item.leadName}</Text>
              <Text style={s.timerUnit}>{item.unitName}</Text>
              <View style={s.timerMeta}>
                <Text style={s.timerSalesperson}>{item.salesperson}</Text>
                <Text style={[s.timerAge, { color }]}>{item.ageHours}h</Text>
              </View>
              <Text style={s.timerScore}>Score: {item.matchScore}</Text>

              {/* Quick actions */}
              <View style={s.timerActions}>
                {item.salespersonUserId && (
                  <TouchableOpacity
                    onPress={() => nudgeMutation.mutate({ userId: item.salespersonUserId, matchId: item.matchId })}
                    style={[s.actionBtn, { backgroundColor: C.amber + "20" }]}
                  >
                    <Text style={[s.actionBtnText, { color: C.amber }]}>Nudge</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => escalateMutation.mutate({ matchId: item.matchId })}
                  style={[s.actionBtn, { backgroundColor: C.red + "20" }]}
                >
                  <Text style={[s.actionBtnText, { color: C.red }]}>Escalate</Text>
                </TouchableOpacity>
                {teamUsers && teamUsers.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      const others = teamUsers.filter((u: any) => u.id !== item.salespersonUserId);
                      if (others.length === 0) return;
                      if (Platform.OS === "web") {
                        const name = prompt(`Reassign to? (${others.map((u: any) => u.name).join(", ")})`);
                        const target = others.find((u: any) => u.name.toLowerCase().includes((name || "").toLowerCase()));
                        if (target) reassignMutation.mutate({ matchId: item.matchId, newUserId: target.id });
                      } else {
                        Alert.alert("Reassign", "Select team member", others.map((u: any) => ({
                          text: u.name,
                          onPress: () => reassignMutation.mutate({ matchId: item.matchId, newUserId: u.id }),
                        })));
                      }
                    }}
                    style={[s.actionBtn, { backgroundColor: C.teal + "20" }]}
                  >
                    <Text style={[s.actionBtnText, { color: C.teal }]}>Reassign</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </View>
    );
  }
}

function formatAction(action: string, metadata: any): string {
  const meta = metadata || {};
  switch (action) {
    case "lead_create": return `captured a new lead: ${meta.customerName || ""}`;
    case "lead_status_change": return `changed lead status to ${meta.to || ""}`;
    case "match_status_change": return `updated match for ${meta.leadName || ""} → ${meta.to || ""}`;
    case "match_reassigned": return `reassigned ${meta.leadName || ""} from ${meta.from || ""} to ${meta.to || ""}`;
    case "manager_nudge": return `nudged ${meta.targetName || "team member"}`;
    case "manager_escalation": return `escalated match for ${meta.leadName || ""} (${meta.ageHours || 0}h)`;
    case "login_success": return "logged in";
    case "signup_success": return "signed up";
    case "voice_note_added": return `added voice note to ${meta.leadName || "a lead"}`;
    case "inventory_hold": return `placed hold on ${meta.unitName || "a unit"}`;
    case "inventory_hold_released": return `released hold on ${meta.unitName || "a unit"}`;
    default: return action.replace(/_/g, " ");
  }
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  centerText: { color: C.muted, fontSize: 16 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: "800", color: C.ink },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 2 },

  // Tabs
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  tab: {
    flex: 1, alignItems: "center", paddingVertical: 10,
    backgroundColor: C.surface, borderRadius: 12,
  },
  tabActive: { backgroundColor: C.teal + "25", borderWidth: 1, borderColor: C.teal },
  tabIcon: { fontSize: 18, marginBottom: 4 },
  tabLabel: { fontSize: 11, fontWeight: "600", color: C.muted },
  tabLabelActive: { color: C.teal },

  sectionBody: { paddingHorizontal: 16, paddingTop: 8 },

  // Team overview
  memberCard: {
    backgroundColor: C.surface, borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: C.rule,
  },
  memberHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  memberName: { fontSize: 16, fontWeight: "700", color: C.ink },
  memberRole: { fontSize: 12, color: C.muted, textTransform: "capitalize" },
  nudgeBtn: {
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: C.amber + "20", borderRadius: 8,
  },
  nudgeBtnText: { fontSize: 12, fontWeight: "700", color: C.amber },

  statRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statBox: {
    flex: 1, alignItems: "center", paddingVertical: 8,
    backgroundColor: C.bg, borderRadius: 8,
  },
  statBoxAlert: { backgroundColor: C.red + "15" },
  statNum: { fontSize: 20, fontWeight: "800", color: C.ink },
  statLabel: { fontSize: 10, color: C.muted, marginTop: 2 },

  alertText: { fontSize: 12, color: C.red, fontWeight: "600", marginBottom: 4 },
  lastActivity: { fontSize: 11, color: C.muted },

  // Timer board
  timerColumn: { marginBottom: 20 },
  timerHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  timerIcon: { fontSize: 16 },
  timerTitle: { fontSize: 16, fontWeight: "700" },
  timerBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  timerBadgeText: { fontSize: 12, fontWeight: "700" },
  timerEmpty: { color: C.muted, fontSize: 13, paddingLeft: 4, marginBottom: 8 },
  timerCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: C.rule,
  },
  timerLead: { fontSize: 14, fontWeight: "700", color: C.ink },
  timerUnit: { fontSize: 12, color: C.muted, marginTop: 2 },
  timerMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  timerSalesperson: { fontSize: 12, color: C.tealMid },
  timerAge: { fontSize: 12, fontWeight: "700" },
  timerScore: { fontSize: 11, color: C.muted, marginTop: 4 },
  timerActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  actionBtnText: { fontSize: 11, fontWeight: "700" },

  // Funnel
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: C.surface, borderRadius: 8,
  },
  filterChipActive: { backgroundColor: C.teal + "25", borderWidth: 1, borderColor: C.teal },
  filterText: { fontSize: 12, color: C.muted, fontWeight: "600" },
  filterTextActive: { color: C.teal },
  funnelCard: {
    backgroundColor: C.surface, borderRadius: 14, padding: 20,
    borderWidth: 1, borderColor: C.rule,
  },
  funnelTitle: { fontSize: 16, fontWeight: "700", color: C.ink, marginBottom: 16 },
  funnelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  funnelStage: { alignItems: "center", flex: 1 },
  funnelNum: { fontSize: 24, fontWeight: "800", color: C.ink },
  funnelLabel: { fontSize: 11, color: C.muted, marginTop: 2 },
  funnelPct: { fontSize: 11, color: C.teal, fontWeight: "700", marginTop: 2 },
  funnelArrow: { fontSize: 18, color: C.muted },
  funnelMetric: {
    marginTop: 20, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: C.rule,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  funnelMetricLabel: { fontSize: 13, color: C.muted },
  funnelMetricValue: { fontSize: 18, fontWeight: "700", color: C.ink },

  // Activity feed
  feedItem: {
    flexDirection: "row", gap: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.rule,
  },
  feedDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.teal, marginTop: 6,
  },
  feedAction: { fontSize: 13, color: C.muted, lineHeight: 18 },
  feedTime: { fontSize: 11, color: C.muted, marginTop: 4 },
  emptyText: { color: C.muted, fontSize: 14, textAlign: "center", padding: 40 },
});
