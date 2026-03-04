import { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { C } from "@/constants/theme";

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function getActionIcon(action: string) {
  if (action === "login") return "🔑";
  if (action === "heartbeat") return "💓";
  if (action.includes("lead")) return "📋";
  if (action.includes("inventory")) return "🚐";
  if (action.includes("match")) return "🔔";
  return "📌";
}

export default function ActivityScreen() {
  const [tab, setTab] = useState<"logs" | "sessions">("logs");
  const [days, setDays] = useState(7);

  const { data: logs, isLoading: logsLoading } = trpc.owner.activity.list.useQuery({ limit: 50 });
  const { data: sessions, isLoading: sessionsLoading } = trpc.owner.activity.sessions.useQuery({ days });

  const isLoading = tab === "logs" ? logsLoading : sessionsLoading;

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerInner}>
          <View style={s.headerLogo}><Text style={s.headerLogoText}>LL</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerEyebrow}>LotLink Owner Portal</Text>
            <Text style={s.headerTitle}>User <Text style={{ color: C.mint }}>Activity</Text></Text>
          </View>
        </View>
      </View>

      {/* Tab Switcher */}
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tabBtn, tab === "logs" && s.tabBtnActive]}
          onPress={() => setTab("logs")}
        >
          <Text style={[s.tabBtnText, tab === "logs" && s.tabBtnTextActive]}>Activity Log</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === "sessions" && s.tabBtnActive]}
          onPress={() => setTab("sessions")}
        >
          <Text style={[s.tabBtnText, tab === "sessions" && s.tabBtnTextActive]}>Session Time</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={s.centerBox}><ActivityIndicator size="large" color={C.teal} /></View>
      ) : tab === "logs" ? (
        <>
          <View style={s.sectionLabel}>
            <Text style={s.sectionLabelText}>{logs?.length || 0} Recent Actions</Text>
          </View>
          <FlatList
            data={logs || []}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View style={s.logRow}>
                <Text style={s.logIcon}>{getActionIcon(item.action)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.logUser}>{(item as any).userName || "Unknown"}</Text>
                  <Text style={s.logAction}>{item.action}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={s.logTime}>
                    {new Date(item.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </Text>
                  <Text style={s.logTime}>
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>📈</Text>
                <Text style={s.emptyTitle}>No activity recorded yet</Text>
                <Text style={s.emptySubtitle}>Activity will appear here as users interact with the CRM</Text>
              </View>
            }
          />
        </>
      ) : (
        <>
          {/* Date range filter */}
          <View style={s.filterRow}>
            {[7, 14, 30].map((d) => (
              <TouchableOpacity
                key={d}
                style={[s.filterChip, days === d && s.filterChipActive]}
                onPress={() => setDays(d)}
              >
                <Text style={[s.filterChipText, days === d && s.filterChipTextActive]}>{d}d</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.sectionLabel}>
            <Text style={s.sectionLabelText}>Session Duration (last {days} days)</Text>
          </View>
          <FlatList
            data={sessions || []}
            keyExtractor={(item) => item.userId.toString()}
            renderItem={({ item }) => {
              const totalSec = Number(item.totalDuration) || 0;
              const sessionCount = Number(item.sessionCount) || 0;
              return (
                <View style={s.sessionCard}>
                  <View style={s.sessionLeft}>
                    <Text style={s.sessionUser}>{(item as any).userName || `User #${item.userId}`}</Text>
                    <Text style={s.sessionMeta}>{sessionCount} session{sessionCount !== 1 ? "s" : ""}</Text>
                  </View>
                  <View style={s.sessionRight}>
                    <Text style={s.sessionDuration}>{formatDuration(totalSec)}</Text>
                    <Text style={s.sessionAvg}>
                      avg {formatDuration(sessionCount > 0 ? Math.round(totalSec / sessionCount) : 0)}
                    </Text>
                  </View>
                  {/* Simple bar */}
                  <View style={s.barBg}>
                    <View
                      style={[
                        s.barFill,
                        { width: `${Math.min(100, (totalSec / 3600) * 100)}%` },
                      ]}
                    />
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>⏱️</Text>
                <Text style={s.emptyTitle}>No session data yet</Text>
                <Text style={s.emptySubtitle}>Session times are recorded via heartbeat as users use the app</Text>
              </View>
            }
          />
        </>
      )}
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

  tabRow: { flexDirection: "row", marginHorizontal: 14, marginTop: 12, backgroundColor: C.surface, borderRadius: 10, padding: 3 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8 },
  tabBtnActive: { backgroundColor: C.teal },
  tabBtnText: { fontSize: 12, fontWeight: "700", color: C.muted },
  tabBtnTextActive: { color: C.white },

  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 12 },
  filterChip: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.rule, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  filterChipActive: { backgroundColor: C.teal, borderColor: C.teal },
  filterChipText: { fontSize: 12, fontWeight: "700", color: C.muted },
  filterChipTextActive: { color: C.white },

  sectionLabel: { paddingHorizontal: 14, marginTop: 14, marginBottom: 8 },
  sectionLabelText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, color: C.muted },

  logRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rule },
  logIcon: { fontSize: 20 },
  logUser: { fontSize: 13, fontWeight: "700", color: C.ink },
  logAction: { fontSize: 11, color: C.muted },
  logTime: { fontSize: 10, color: C.muted, fontWeight: "600" },

  sessionCard: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.rule, borderRadius: 14, marginHorizontal: 14, marginBottom: 8, padding: 14 },
  sessionLeft: { marginBottom: 6 },
  sessionUser: { fontSize: 14, fontWeight: "800", color: C.ink },
  sessionMeta: { fontSize: 11, color: C.muted },
  sessionRight: { position: "absolute", top: 14, right: 14, alignItems: "flex-end" },
  sessionDuration: { fontSize: 18, fontWeight: "800", color: C.teal },
  sessionAvg: { fontSize: 10, color: C.muted },
  barBg: { height: 6, backgroundColor: C.rule, borderRadius: 3, marginTop: 4 },
  barFill: { height: 6, backgroundColor: C.mint, borderRadius: 3 },

  emptyBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.ink, textAlign: "center", marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 18 },
});
