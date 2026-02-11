import { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { Ionicons } from "@expo/vector-icons"; // Use Ionicons for trust badges

const STATUS_COLORS: Record<string, string> = {
  pending: "#F39C12",
  notified: "#3498DB",
  contacted: "#9B59B6",
  sold: "#27AE60",
  dismissed: "#95A5A6",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  notified: "SMS Sent",
  contacted: "Contacted",
  sold: "Sold",
  dismissed: "Dismissed",
};

// Helper to format "Time Ago" for freshness
function formatTimeAgo(dateInput: string | Date | undefined | null) {
  if (!dateInput) return "Unknown";
  const date = new Date(dateInput);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function MatchesScreen() {
  const { isAuthenticated } = useDealershipAuth();
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [contactNotes, setContactNotes] = useState("");
  const [scanning, setScanning] = useState(false);

  const {
    data: infiniteMatches,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.matches.list.useInfiniteQuery(
    { limit: 20 },
    {
      enabled: isAuthenticated,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchInterval: 10000,
    }
  );

  const matchesList = infiniteMatches?.pages.flatMap((page) => page.items) || [];

  const updateStatusMutation = trpc.matches.updateStatus.useMutation({
    onSuccess: () => {
      refetch();
      setSelectedMatch(null);
      setContactNotes("");
    },
  });

  const runScanMutation = trpc.matches.runScan.useMutation({
    onSuccess: (data) => {
      setScanning(false);
      refetch();
      const msg = `Scan complete! Found ${data.totalMatches} matches, sent ${data.totalNotifications} manager alerts to joanthan@lotlink.io.`;
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Scan Complete", msg);
      }
    },
    onError: () => {
      setScanning(false);
    },
  });

  const handleRunScan = () => {
    setScanning(true);
    runScanMutation.mutate();
  };

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleStatusUpdate = (matchId: number, status: string) => {
    updateStatusMutation.mutate({
      id: matchId,
      status: status as any,
      contactNotes: contactNotes || null,
    });
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

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#0B5E7E" />
        </View>
      </ScreenContainer>
    );
  }

  const pendingCount = matchesList.filter((m: any) => m.match?.status === "pending").length;
  const notifiedCount = matchesList.filter((m: any) => m.match?.status === "notified").length;

  return (
    <ScreenContainer>
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "bold", color: "#2C3E50", marginBottom: 4 }}>
          High-Value Matches
        </Text>
        <Text style={{ color: "#7F8C8D", fontSize: 14, marginBottom: 16 }}>
          Real-time matched leads ready for sales engagement.
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <View style={{ flex: 1, backgroundColor: "#FEF3E2", borderRadius: 8, padding: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: "#F39C12" }}>{pendingCount}</Text>
            <Text style={{ fontSize: 11, color: "#7F8C8D" }}>Hot Leads</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "#E8F4FD", borderRadius: 8, padding: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: "#3498DB" }}>{notifiedCount}</Text>
            <Text style={{ fontSize: 11, color: "#7F8C8D" }}>Manager Alerted</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "#E8F8EF", borderRadius: 8, padding: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: "#27AE60" }}>{matchesList.length}</Text>
            <Text style={{ fontSize: 11, color: "#7F8C8D" }}>Total</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleRunScan}
          disabled={scanning}
          style={{
            backgroundColor: "#9B59B6",
            borderRadius: 8,
            paddingVertical: 14,
            alignItems: "center",
            opacity: scanning ? 0.7 : 1,
            flexDirection: "row",
            justifyContent: "center",
            gap: 8
          }}
        >
          {scanning ? (
            <>
              <ActivityIndicator color="white" size="small" />
              <Text style={{ color: "white", fontWeight: "600" }}>Scanning Database...</Text>
            </>
          ) : (
            <>
              <Ionicons name="scan-circle-outline" size={20} color="white" />
              <Text style={{ color: "white", fontWeight: "600" }}>Run AI Match Scan</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {matchesList.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>🔍</Text>
          <Text style={{ color: "#7F8C8D", fontSize: 16, textAlign: "center" }}>
            No matches yet. Add leads and inventory - the system will alert verify and alert you automatically!
          </Text>
        </View>
      ) : (
        <FlatList
          data={matchesList}
          keyExtractor={(item: any) => (item.match?.id || item.id || Math.random()).toString()}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() => (
            isFetchingNextPage ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator color="#0B5E7E" />
              </View>
            ) : null
          )}
          renderItem={({ item }) => {
            const match = item.match || item;
            const lead = item.lead || {};
            const unit = item.unit || {};
            const status = match.status || "pending";

            // Randomize activity slightly for demo realism if date missing
            const activeTime = formatTimeAgo(lead.updatedAt || lead.createdAt);

            const isVerified = (lead.customerEmail && lead.customerPhone);

            return (
              <TouchableOpacity
                onPress={() => setSelectedMatch(item)}
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: 10,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: "#ECF0F1",
                  borderLeftWidth: 4,
                  borderLeftColor: STATUS_COLORS[status] || "#7F8C8D",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                  elevation: 2,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: "#2C3E50" }}>
                        {lead.customerName || "Unknown Customer"}
                      </Text>
                      {isVerified && (
                        <Ionicons name="checkmark-circle" size={16} color="#27AE60" />
                      )}
                    </View>
                    <Text style={{ fontSize: 13, color: "#0B5E7E", fontWeight: "600", marginTop: 2 }}>
                      MATCH: {unit.year} {unit.make} {unit.model}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="time-outline" size={12} color="#95A5A6" />
                      <Text style={{ fontSize: 11, color: "#95A5A6" }}>Active {activeTime}</Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: STATUS_COLORS[status] || "#7F8C8D",
                        borderRadius: 12,
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                      }}
                    >
                      <Text style={{ color: "white", fontSize: 11, fontWeight: "600" }}>
                        {STATUS_LABELS[status] || status}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Match Score Bar */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, marginBottom: 8 }}>
                  <View style={{ flex: 1, height: 6, backgroundColor: "#ECF0F1", borderRadius: 3, overflow: "hidden" }}>
                    <View style={{ width: `${match.matchScore}%`, height: "100%", backgroundColor: match.matchScore > 80 ? "#27AE60" : match.matchScore > 50 ? "#F39C12" : "#95A5A6" }} />
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#2C3E50" }}>{match.matchScore}% Match</Text>
                </View>

                {match.matchReason && (
                  <View style={{ flexDirection: "row", gap: 4, marginTop: 2 }}>
                    <Ionicons name="bulb-outline" size={14} color="#7F8C8D" style={{ marginTop: 1 }} />
                    <Text style={{ fontSize: 12, color: "#7F8C8D", flex: 1 }} numberOfLines={2}>
                      {match.matchReason.replace(/;/g, " •")}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal visible={!!selectedMatch} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 }}>
          <ScrollView style={{ maxHeight: "90%" }}>
            <View style={{ backgroundColor: "#FFFFFF", borderRadius: 16, padding: 24 }}>
              {selectedMatch && (() => {
                const match = selectedMatch.match || selectedMatch;
                const lead = selectedMatch.lead || {};
                const unit = selectedMatch.unit || {};
                const status = match.status || "pending";
                const isVerified = (lead.customerEmail && lead.customerPhone);

                return (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <Text style={{ fontSize: 20, fontWeight: "bold", color: "#2C3E50" }}>
                        Match Analysis
                      </Text>
                      <TouchableOpacity onPress={() => { setSelectedMatch(null); setContactNotes(""); }}>
                        <Ionicons name="close" size={24} color="#7F8C8D" />
                      </TouchableOpacity>
                    </View>

                    {/* Customer Profile Card */}
                    <View style={{ backgroundColor: "#F8F9FA", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#ECF0F1" }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <Text style={{ fontWeight: "600", color: "#7F8C8D", fontSize: 12 }}>PROSPECT PROFILE</Text>
                        {isVerified && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#E8F8EF", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                            <Ionicons name="shield-checkmark" size={12} color="#27AE60" />
                            <Text style={{ fontSize: 11, color: "#27AE60", fontWeight: "600" }}>Verified Lead</Text>
                          </View>
                        )}
                      </View>

                      <Text style={{ fontSize: 20, fontWeight: "700", color: "#2C3E50" }}>{lead.customerName}</Text>

                      <View style={{ marginTop: 8, gap: 4 }}>
                        <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Ionicons name="call-outline" size={16} color="#0B5E7E" />
                          <Text style={{ color: "#0B5E7E", fontSize: 14 }}>{lead.customerPhone || "No phone provided"}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Ionicons name="mail-outline" size={16} color="#0B5E7E" />
                          <Text style={{ color: "#0B5E7E", fontSize: 14 }}>{lead.customerEmail || "No email provided"}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* The "Why" Section - Critical for Trust */}
                    <View style={{ backgroundColor: "#E8F4F8", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                      <Text style={{ fontWeight: "700", color: "#0B5E7E", marginBottom: 8, fontSize: 14 }}>WHY THIS MATCH?</Text>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
                        <View style={{ alignItems: "center" }}>
                          <Text style={{ fontSize: 24, fontWeight: "800", color: "#0B5E7E" }}>{match.matchScore}%</Text>
                          <Text style={{ fontSize: 10, color: "#0B5E7E" }}>CONFIDENCE</Text>
                        </View>
                        <View style={{ flex: 1, gap: 4 }}>
                          {/* Parse reasons into bullets */}
                          {(match.matchReason || "").split(";").map((reason: string, idx: number) => (
                            <View key={idx} style={{ flexDirection: "row", gap: 6 }}>
                              <Ionicons name="checkmark-circle" size={14} color="#27AE60" style={{ marginTop: 2 }} />
                              <Text style={{ fontSize: 13, color: "#2C3E50", flex: 1 }}>{reason.trim()}</Text>
                            </View>
                          ))}
                        </View>
                      </View>

                      <View style={{ borderTopWidth: 1, borderTopColor: "rgba(11, 94, 126, 0.1)", paddingTop: 12 }}>
                        <Text style={{ fontSize: 12, color: "#546E7A" }}>
                          Matched Unit: <Text style={{ fontWeight: "700" }}>{unit.year} {unit.make} {unit.model}</Text>
                        </Text>
                        <Text style={{ fontSize: 12, color: "#27AE60", fontWeight: "700", marginTop: 2 }}>
                          Price: ${parseFloat(unit.price || "0").toLocaleString()}
                        </Text>
                      </View>
                    </View>

                    {/* Action Section */}
                    {status !== "sold" && status !== "dismissed" && (
                      <>
                        <Text style={{ fontWeight: "600", color: "#2C3E50", marginBottom: 8 }}>
                          Sales Action
                        </Text>
                        <TextInput
                          placeholder="Add notes from your call..."
                          value={contactNotes}
                          onChangeText={setContactNotes}
                          multiline
                          style={{
                            backgroundColor: "#F8F9FA",
                            borderWidth: 1,
                            borderColor: "#ECF0F1",
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            color: "#2C3E50",
                            fontSize: 14,
                            marginBottom: 12,
                            minHeight: 80,
                          }}
                          placeholderTextColor="#9BA1A6"
                        />
                        <View style={{ gap: 8 }}>
                          <TouchableOpacity
                            onPress={() => handleStatusUpdate(match.id, "contacted")}
                            style={{ backgroundColor: "#0B5E7E", borderRadius: 8, paddingVertical: 14, alignItems: "center" }}
                          >
                            <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>Log Customer Contact</Text>
                          </TouchableOpacity>

                          <View style={{ flexDirection: "row", gap: 8 }}>
                            <TouchableOpacity
                              onPress={() => handleStatusUpdate(match.id, "sold")}
                              style={{ flex: 1, backgroundColor: "#27AE60", borderRadius: 8, paddingVertical: 12, alignItems: "center" }}
                            >
                              <Text style={{ color: "white", fontWeight: "600" }}>Mark Sold</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleStatusUpdate(match.id, "dismissed")}
                              style={{ flex: 1, backgroundColor: "#95A5A6", borderRadius: 8, paddingVertical: 12, alignItems: "center" }}
                            >
                              <Text style={{ color: "white", fontWeight: "600" }}>Dismiss</Text>
                            </TouchableOpacity>
                          </View>
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
    </ScreenContainer>
  );
}
