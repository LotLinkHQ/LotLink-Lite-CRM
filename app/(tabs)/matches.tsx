import { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  Modal, ScrollView, TextInput, Platform, Alert, StyleSheet,
} from "react-native";
import { router as navRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { Ionicons } from "@expo/vector-icons";
import { NotificationsModal } from "@/components/notifications-modal";
import { NotificationBadge } from "@/components/notification-badge";
import { C } from "@/constants/theme";

const STATUS_COLORS: Record<string, string> = {
  new: C.amber,
  pending: C.amber,
  notified: C.tealMid,
  contacted: C.teal,
  appointment: "#7c3aed",
  sold: C.green,
  dismissed: C.muted,
};

const STATUS_LABELS: Record<string, string> = {
  new: "New", pending: "Pending", notified: "Notified", contacted: "Contacted",
  appointment: "Appointment", sold: "Sold", dismissed: "Dismissed",
};

const MATCH_STATUSES = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "notified", label: "Notified" },
  { key: "contacted", label: "Contacted" },
  { key: "appointment", label: "Appt" },
  { key: "sold", label: "Sold" },
  { key: "dismissed", label: "Dismissed" },
];

const DISMISS_REASONS = [
  { key: "customer_not_interested", label: "Customer not interested" },
  { key: "unit_sold", label: "Unit already sold" },
  { key: "budget_changed", label: "Budget changed" },
  { key: "other", label: "Other" },
];

function formatTimeAgo(dateInput: string | Date | undefined | null) {
  if (!dateInput) return "Unknown";
  const date = new Date(dateInput);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function MatchesScreen() {
  const { isAuthenticated } = useDealershipAuth();
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [contactNotes, setContactNotes] = useState("");
  const [scanning, setScanning] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dismissReason, setDismissReason] = useState<string | null>(null);
  const [callPrep, setCallPrep] = useState<string | null>(null);

  const { data: infiniteMatches, isLoading, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.matches.list.useInfiniteQuery(
      { limit: 20 },
      { enabled: isAuthenticated, getNextPageParam: (lastPage) => lastPage.nextCursor, refetchInterval: 10000 }
    );

  const { data: matchStats } = trpc.matches.getStats.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 10000 });

  const allMatches = infiniteMatches?.pages.flatMap((page) => page.items) || [];
  const matchesList = statusFilter === "all" ? allMatches : allMatches.filter(
    (m: any) => (m.match?.status || "new") === statusFilter
  );

  const updateStatusMutation = trpc.matches.updateStatus.useMutation({
    onSuccess: () => { refetch(); setSelectedMatch(null); setContactNotes(""); },
  });

  const prepareCallMutation = trpc.ai.prepareCall.useMutation({
    onSuccess: (data) => {
      if (data.talkingPoints) setCallPrep(data.talkingPoints);
      else if (data.error) { Platform.OS === "web" ? window.alert(data.error) : Alert.alert("Error", data.error); }
    },
  });
  const enhanceExplanationMutation = trpc.ai.enhanceExplanation.useMutation({
    onSuccess: () => refetch(),
  });

  const runScanMutation = trpc.matches.runScan.useMutation({
    onSuccess: (data) => {
      setScanning(false);
      refetch();
      const msg = `Scanned ${data.unitsScanned} units.\n${data.totalMatches} new matches found.\n${data.totalNotifications} notifications sent.`;
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Full Scan Complete", msg);
    },
    onError: () => setScanning(false),
  });

  const handleStatusUpdate = (matchId: number, status: string, reason?: string) => {
    updateStatusMutation.mutate({
      id: matchId,
      status: status as any,
      contactNotes: contactNotes || null,
      dismissReason: reason as any || null,
    });
    setDismissReason(null);
  };

  if (!isAuthenticated) {
    return <ScreenContainer><View style={s.center}><Text style={s.centerText}>Please log in to continue</Text></View></ScreenContainer>;
  }
  if (isLoading) {
    return <ScreenContainer><View style={s.center}><ActivityIndicator size="large" color={C.teal} /></View></ScreenContainer>;
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={s.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={s.screenTitle}>AI Matches</Text>
          <Text style={s.screenSub}>"AI will never forget." Real-time matched leads.</Text>
        </View>
        <TouchableOpacity onPress={() => setShowNotifications(true)} style={s.bellBtn}>
          <Ionicons name="notifications-outline" size={22} color={C.teal} />
          <NotificationBadge />
        </TouchableOpacity>
      </View>

      {/* Stats pills */}
      <View style={s.pills}>
        <View style={[s.pill, { backgroundColor: C.amberLite }]}>
          <Text style={[s.pillNum, { color: C.amber }]}>{matchStats?.new || 0}</Text>
          <Text style={s.pillLabel}>New</Text>
        </View>
        <View style={[s.pill, { backgroundColor: C.tealLite }]}>
          <Text style={[s.pillNum, { color: C.teal }]}>{matchStats?.contacted || 0}</Text>
          <Text style={s.pillLabel}>Contacted</Text>
        </View>
        <View style={[s.pill, { backgroundColor: "#ede9fe" }]}>
          <Text style={[s.pillNum, { color: "#7c3aed" }]}>{matchStats?.appointment || 0}</Text>
          <Text style={s.pillLabel}>Appts</Text>
        </View>
        <View style={[s.pill, { backgroundColor: C.greenLite }]}>
          <Text style={[s.pillNum, { color: C.green }]}>{matchStats?.sold || 0}</Text>
          <Text style={s.pillLabel}>Sold</Text>
        </View>
      </View>

      {/* Status filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10, maxHeight: 36 }}>
        {MATCH_STATUSES.map((st) => {
          const active = statusFilter === st.key;
          return (
            <TouchableOpacity
              key={st.key}
              onPress={() => setStatusFilter(st.key)}
              style={[s.filterChip, active && { backgroundColor: C.teal, borderColor: C.teal }]}
            >
              <Text style={[s.filterChipText, active && { color: C.white }]}>{st.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Scan button */}
      <TouchableOpacity onPress={() => { setScanning(true); runScanMutation.mutate(); }} disabled={scanning} style={[s.scanBtn, { opacity: scanning ? 0.7 : 1 }]}>
        {scanning ? (
          <><ActivityIndicator color={C.white} size="small" /><Text style={s.scanBtnText}>Scanning...</Text></>
        ) : (
          <><Ionicons name="scan-circle-outline" size={18} color={C.white} /><Text style={s.scanBtnText}>Run Full Scan</Text></>
        )}
      </TouchableOpacity>

      {matchesList.length === 0 ? (
        <View style={[s.center, { paddingHorizontal: 32 }]}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>🔍</Text>
          <Text style={[s.centerText, { textAlign: "center" }]}>No matches yet. Add leads and inventory — the AI will match automatically!</Text>
        </View>
      ) : (
        <FlatList
          data={matchesList}
          keyExtractor={(item: any) => (item.match?.id || item.id || Math.random()).toString()}
          onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={() => isFetchingNextPage ? <ActivityIndicator color={C.teal} style={{ paddingVertical: 20 }} /> : null}
          renderItem={({ item }) => {
            const match = item.match || item;
            const lead = item.lead || {};
            const unit = item.unit || {};
            const status = match.status || "pending";
            const isVerified = lead.customerEmail && lead.customerPhone;
            return (
              <TouchableOpacity onPress={() => setSelectedMatch(item)} style={[s.matchCard, { borderLeftColor: STATUS_COLORS[status] || C.muted }]}>
                <View style={s.matchTop}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={s.matchName}>{lead.customerName || "Unknown Customer"}</Text>
                      {isVerified && <Ionicons name="checkmark-circle" size={15} color={C.green} />}
                    </View>
                    <Text style={s.matchUnit}>MATCH: {unit.year} {unit.make} {unit.model}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <Ionicons name="time-outline" size={11} color={C.muted} />
                      <Text style={s.timeText}>{formatTimeAgo(lead.updatedAt || lead.createdAt)}</Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: STATUS_COLORS[status] || C.muted }]}>
                      <Text style={s.statusText}>{STATUS_LABELS[status] || status}</Text>
                    </View>
                  </View>
                </View>

                {/* Score bar */}
                <View style={s.scoreRow}>
                  <View style={s.scoreTrack}>
                    <View style={[s.scoreFill, {
                      width: `${match.matchScore}%` as any,
                      backgroundColor: match.matchScore > 80 ? C.green : match.matchScore > 50 ? C.amber : C.muted,
                    }]} />
                  </View>
                  <Text style={s.scoreText}>{match.matchScore}% Match</Text>
                </View>

                {match.matchReason && (
                  <View style={{ flexDirection: "row", gap: 4, marginTop: 4 }}>
                    <Ionicons name="bulb-outline" size={13} color={C.muted} style={{ marginTop: 1 }} />
                    <Text style={s.reasonText} numberOfLines={2}>{match.matchReason.replace(/;/g, " •")}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Detail Modal */}
      <Modal visible={!!selectedMatch} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <ScrollView style={{ maxHeight: "92%" }}>
            <View style={s.modalCard}>
              {selectedMatch && (() => {
                const match = selectedMatch.match || selectedMatch;
                const lead = selectedMatch.lead || {};
                const unit = selectedMatch.unit || {};
                const status = match.status || "pending";
                const isVerified = lead.customerEmail && lead.customerPhone;
                return (
                  <>
                    <View style={s.modalHeader}>
                      <Text style={s.modalTitle}>Match Analysis</Text>
                      <TouchableOpacity onPress={() => { setSelectedMatch(null); setContactNotes(""); }}>
                        <Ionicons name="close" size={24} color={C.muted} />
                      </TouchableOpacity>
                    </View>

                    {/* Customer card */}
                    <View style={s.customerCard}>
                      <View style={s.customerCardTop}>
                        <Text style={s.sectionLabel}>PROSPECT PROFILE</Text>
                        {isVerified && (
                          <View style={s.verifiedBadge}>
                            <Ionicons name="shield-checkmark" size={11} color={C.green} />
                            <Text style={s.verifiedText}>Verified Lead</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.customerName}>{lead.customerName}</Text>
                      <View style={{ marginTop: 8, gap: 5 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Ionicons name="call-outline" size={15} color={C.teal} />
                          <Text style={s.contactText}>{lead.customerPhone || "No phone"}</Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Ionicons name="mail-outline" size={15} color={C.teal} />
                          <Text style={s.contactText}>{lead.customerEmail || "No email"}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Why section */}
                    <View style={s.whyCard}>
                      <Text style={s.whyTitle}>WHY THIS MATCH?</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
                        <View style={{ alignItems: "center" }}>
                          <Text style={s.confNum}>{match.matchScore}%</Text>
                          <Text style={s.confLabel}>CONFIDENCE</Text>
                        </View>
                        <View style={{ flex: 1, gap: 4 }}>
                          {(match.matchReason || "").split(";").map((r: string, i: number) => (
                            <View key={i} style={{ flexDirection: "row", gap: 6 }}>
                              <Ionicons name="checkmark-circle" size={13} color={C.green} style={{ marginTop: 2 }} />
                              <Text style={s.reasonItem}>{r.trim()}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                      <View style={s.whyDivider}>
                        <Text style={s.unitRef}>Matched: <Text style={{ fontWeight: "700" }}>{unit.year} {unit.make} {unit.model}</Text></Text>
                        <Text style={s.unitPrice}>${parseFloat(unit.price || "0").toLocaleString()}</Text>
                      </View>
                    </View>

                    {/* AI Actions */}
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                      <TouchableOpacity
                        onPress={() => { setCallPrep(null); prepareCallMutation.mutate({ matchId: match.id }); }}
                        disabled={prepareCallMutation.isLoading}
                        style={[s.aiBtn, { flex: 1 }]}
                      >
                        {prepareCallMutation.isLoading
                          ? <ActivityIndicator color={C.teal} size="small" />
                          : <><Ionicons name="chatbubble-ellipses-outline" size={16} color={C.teal} /><Text style={s.aiBtnText}>Prepare Me</Text></>
                        }
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => enhanceExplanationMutation.mutate({ matchId: match.id })}
                        disabled={enhanceExplanationMutation.isLoading}
                        style={[s.aiBtn, { flex: 1 }]}
                      >
                        {enhanceExplanationMutation.isLoading
                          ? <ActivityIndicator color={C.teal} size="small" />
                          : <><Ionicons name="sparkles-outline" size={16} color={C.teal} /><Text style={s.aiBtnText}>AI Explain</Text></>
                        }
                      </TouchableOpacity>
                    </View>

                    {/* Call prep card */}
                    {callPrep && (
                      <View style={s.callPrepCard}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <Text style={s.callPrepTitle}>Call Prep</Text>
                          <TouchableOpacity onPress={() => setCallPrep(null)}>
                            <Ionicons name="close-circle" size={18} color={C.muted} />
                          </TouchableOpacity>
                        </View>
                        <Text style={s.callPrepText}>{callPrep}</Text>
                      </View>
                    )}

                    {/* Actions */}
                    {status !== "sold" && status !== "dismissed" && (
                      <>
                        <Text style={s.actionLabel}>Sales Action</Text>
                        <TextInput
                          placeholder="Add notes from your call..."
                          value={contactNotes}
                          onChangeText={setContactNotes}
                          multiline
                          style={s.notesInput}
                          placeholderTextColor={C.muted}
                        />
                        <View style={{ gap: 8 }}>
                          <TouchableOpacity onPress={() => handleStatusUpdate(match.id, "contacted")} style={s.contactBtn}>
                            <Text style={s.contactBtnText}>Log Customer Contact</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleStatusUpdate(match.id, "appointment")} style={[s.contactBtn, { backgroundColor: "#7c3aed" }]}>
                            <Text style={s.contactBtnText}>Set Appointment</Text>
                          </TouchableOpacity>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            <TouchableOpacity onPress={() => handleStatusUpdate(match.id, "sold")} style={[s.halfBtn, { backgroundColor: C.green }]}>
                              <Text style={s.halfBtnText}>Mark Sold</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setDismissReason(dismissReason ? null : "pick")} style={[s.halfBtn, { backgroundColor: C.muted }]}>
                              <Text style={s.halfBtnText}>Dismiss</Text>
                            </TouchableOpacity>
                          </View>
                          {dismissReason === "pick" && (
                            <View style={s.dismissGrid}>
                              {DISMISS_REASONS.map((r) => (
                                <TouchableOpacity key={r.key} onPress={() => handleStatusUpdate(match.id, "dismissed", r.key)} style={s.dismissChip}>
                                  <Text style={s.dismissChipText}>{r.label}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
                      </>
                    )}
                  </>
                );
              })()}
            </View>
          </ScrollView>
        </View>
      </Modal>

      <NotificationsModal visible={showNotifications} onClose={() => setShowNotifications(false)} />
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerText: { color: C.muted, fontSize: 16 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  screenTitle: { fontSize: 22, fontWeight: "700", color: C.ink },
  screenSub: { fontSize: 13, color: C.muted, marginTop: 2 },
  bellBtn: { padding: 8, backgroundColor: C.surface, borderRadius: 20, position: "relative" },
  pills: { flexDirection: "row", gap: 8, marginBottom: 12 },
  pill: { flex: 1, borderRadius: 8, padding: 10, alignItems: "center" },
  pillNum: { fontSize: 20, fontWeight: "700" },
  pillLabel: { fontSize: 11, color: C.muted, marginTop: 2 },
  scanBtn: { backgroundColor: C.teal, borderRadius: 10, paddingVertical: 13, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 14 },
  scanBtnText: { color: C.white, fontWeight: "600", fontSize: 15 },
  matchCard: { backgroundColor: C.surface, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.rule, borderLeftWidth: 4 },
  matchTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  matchName: { fontSize: 15, fontWeight: "700", color: C.ink },
  matchUnit: { fontSize: 13, color: C.teal, fontWeight: "600", marginTop: 2 },
  timeText: { fontSize: 11, color: C.muted },
  statusBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  statusText: { color: C.white, fontSize: 11, fontWeight: "600" },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  scoreTrack: { flex: 1, height: 5, backgroundColor: C.rule, borderRadius: 3, overflow: "hidden" },
  scoreFill: { height: "100%", borderRadius: 3 },
  scoreText: { fontSize: 12, fontWeight: "700", color: C.ink },
  reasonText: { fontSize: 12, color: C.muted, flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(5,15,15,0.85)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: C.bg, borderRadius: 16, padding: 22, borderWidth: 1, borderColor: C.rule },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: C.ink },
  customerCard: { backgroundColor: C.surface, borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.rule },
  customerCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  sectionLabel: { fontWeight: "600", color: C.muted, fontSize: 11, letterSpacing: 0.5 },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.greenLite, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  verifiedText: { fontSize: 11, color: C.green, fontWeight: "600" },
  customerName: { fontSize: 19, fontWeight: "700", color: C.ink },
  contactText: { color: C.teal, fontSize: 14 },
  whyCard: { backgroundColor: C.surface, borderRadius: 10, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.rule },
  whyTitle: { fontWeight: "700", color: C.teal, marginBottom: 8, fontSize: 13 },
  confNum: { fontSize: 22, fontWeight: "800", color: C.teal },
  confLabel: { fontSize: 10, color: C.teal },
  reasonItem: { fontSize: 13, color: C.ink, flex: 1 },
  whyDivider: { borderTopWidth: 1, borderTopColor: C.rule, paddingTop: 10, marginTop: 4 },
  unitRef: { fontSize: 12, color: C.muted },
  unitPrice: { fontSize: 13, color: C.green, fontWeight: "700", marginTop: 2 },
  actionLabel: { fontWeight: "600", color: C.ink, marginBottom: 8, fontSize: 14 },
  notesInput: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14, marginBottom: 12, minHeight: 80,
  },
  contactBtn: { backgroundColor: C.teal, borderRadius: 8, paddingVertical: 13, alignItems: "center" },
  contactBtnText: { color: C.white, fontWeight: "600", fontSize: 15 },
  halfBtn: { flex: 1, borderRadius: 8, paddingVertical: 11, alignItems: "center" },
  halfBtnText: { color: C.white, fontWeight: "600" },
  filterChip: { borderWidth: 1, borderColor: C.rule, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginRight: 6, backgroundColor: C.surface },
  filterChipText: { fontSize: 12, fontWeight: "600", color: C.muted },
  dismissGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  dismissChip: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  dismissChipText: { fontSize: 12, color: C.ink, fontWeight: "600" },
  aiBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: C.teal + "15", borderWidth: 1, borderColor: C.teal + "40",
    borderRadius: 10, paddingVertical: 12,
  },
  aiBtnText: { color: C.teal, fontWeight: "700", fontSize: 13 },
  callPrepCard: {
    backgroundColor: C.surface, borderRadius: 10, padding: 14,
    marginBottom: 14, borderWidth: 1, borderColor: C.teal + "40",
  },
  callPrepTitle: { fontSize: 14, fontWeight: "700", color: C.teal },
  callPrepText: { fontSize: 13, color: C.ink, lineHeight: 20 },
});
