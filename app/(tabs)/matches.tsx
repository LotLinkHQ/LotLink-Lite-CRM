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
          Matches
        </Text>
        <Text style={{ color: "#7F8C8D", fontSize: 14, marginBottom: 16 }}>
          AI-matched leads to inventory - Sales Manager is automatically notified via Email/SMS
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <View style={{ flex: 1, backgroundColor: "#FEF3E2", borderRadius: 8, padding: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: "#F39C12" }}>{pendingCount}</Text>
            <Text style={{ fontSize: 11, color: "#7F8C8D" }}>Pending</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "#E8F4FD", borderRadius: 8, padding: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: "#3498DB" }}>{notifiedCount}</Text>
            <Text style={{ fontSize: 11, color: "#7F8C8D" }}>Manager Alerts</Text>
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
          }}
        >
          {scanning ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color="white" size="small" />
              <Text style={{ color: "white", fontWeight: "600" }}>Scanning All Inventory...</Text>
            </View>
          ) : (
            <Text style={{ color: "white", fontWeight: "600" }}>Run Full Match Scan</Text>
          )}
        </TouchableOpacity>
      </View>

      {matchesList.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>🔍</Text>
          <Text style={{ color: "#7F8C8D", fontSize: 16, textAlign: "center" }}>
            No matches yet. Add leads and inventory - the system will alert the Sales Manager (joanthan@lotlink.io) automatically!
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
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#2C3E50" }}>
                      {lead.customerName || "Unknown Customer"}
                    </Text>
                    <Text style={{ fontSize: 13, color: "#0B5E7E", fontWeight: "500", marginTop: 2 }}>
                      {unit.year} {unit.make} {unit.model}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View
                      style={{
                        backgroundColor: "#E8F4F8",
                        borderRadius: 12,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#0B5E7E" }}>
                        {match.matchScore}%
                      </Text>
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

                {match.matchReason && (
                  <Text style={{ fontSize: 12, color: "#7F8C8D", marginTop: 4 }} numberOfLines={2}>
                    {match.matchReason}
                  </Text>
                )}

                <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                  {lead.customerPhone && (
                    <Text style={{ fontSize: 12, color: "#7F8C8D" }}>
                      {lead.customerPhone}
                    </Text>
                  )}
                  {match.notificationSentAt && (
                    <Text style={{ fontSize: 12, color: "#3498DB" }}>
                      SMS sent {new Date(match.notificationSentAt).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal visible={!!selectedMatch} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 }}>
          <ScrollView style={{ maxHeight: "85%" }}>
            <View style={{ backgroundColor: "#FFFFFF", borderRadius: 16, padding: 24 }}>
              {selectedMatch && (() => {
                const match = selectedMatch.match || selectedMatch;
                const lead = selectedMatch.lead || {};
                const unit = selectedMatch.unit || {};
                const status = match.status || "pending";

                return (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <Text style={{ fontSize: 20, fontWeight: "bold", color: "#2C3E50" }}>
                        Match Details
                      </Text>
                      <TouchableOpacity onPress={() => { setSelectedMatch(null); setContactNotes(""); }}>
                        <Text style={{ fontSize: 24, color: "#7F8C8D" }}>x</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ backgroundColor: "#F8F9FA", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <Text style={{ fontWeight: "600", color: "#2C3E50", marginBottom: 4 }}>Customer</Text>
                      <Text style={{ fontSize: 18, fontWeight: "700", color: "#0B5E7E" }}>{lead.customerName}</Text>
                      {lead.customerPhone && (
                        <Text style={{ color: "#7F8C8D", marginTop: 2 }}>{lead.customerPhone}</Text>
                      )}
                      {lead.customerEmail && (
                        <Text style={{ color: "#7F8C8D", marginTop: 2 }}>{lead.customerEmail}</Text>
                      )}
                      {lead.preferredModel && (
                        <Text style={{ color: "#7F8C8D", marginTop: 4 }}>
                          Wanted: {lead.preferredYear ? `${lead.preferredYear} ` : ""}{lead.preferredModel}
                        </Text>
                      )}
                    </View>

                    <View style={{ backgroundColor: "#F8F9FA", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <Text style={{ fontWeight: "600", color: "#2C3E50", marginBottom: 4 }}>Matched Unit</Text>
                      <Text style={{ fontSize: 16, fontWeight: "600", color: "#27AE60" }}>
                        {unit.year} {unit.make} {unit.model}
                      </Text>
                      <Text style={{ color: "#7F8C8D", marginTop: 2 }}>ID: {unit.unitId}</Text>
                      {unit.price && (
                        <Text style={{ color: "#27AE60", fontWeight: "600", marginTop: 2 }}>
                          ${parseFloat(unit.price).toLocaleString()}
                        </Text>
                      )}
                      <Text style={{ color: "#7F8C8D", marginTop: 2 }}>{unit.storeLocation}</Text>
                    </View>

                    <View style={{ backgroundColor: "#E8F4F8", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <Text style={{ fontWeight: "600", color: "#0B5E7E", marginBottom: 4 }}>
                        Match Score: {match.matchScore}%
                      </Text>
                      <Text style={{ color: "#7F8C8D", fontSize: 13 }}>{match.matchReason}</Text>
                    </View>

                    <View style={{ backgroundColor: "#F8F9FA", borderRadius: 8, padding: 12, marginBottom: 16 }}>
                      <Text style={{ fontWeight: "600", color: "#2C3E50", marginBottom: 4 }}>Notification Status</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ backgroundColor: STATUS_COLORS[status], borderRadius: 8, width: 10, height: 10 }} />
                        <Text style={{ color: "#2C3E50" }}>{STATUS_LABELS[status]}</Text>
                      </View>
                      {match.notificationSentAt && (
                        <Text style={{ color: "#7F8C8D", fontSize: 12, marginTop: 4 }}>
                          SMS sent: {new Date(match.notificationSentAt).toLocaleString()}
                        </Text>
                      )}
                      {match.customerContactedAt && (
                        <Text style={{ color: "#7F8C8D", fontSize: 12, marginTop: 2 }}>
                          Contacted: {new Date(match.customerContactedAt).toLocaleString()}
                        </Text>
                      )}
                      {match.contactNotes && (
                        <Text style={{ color: "#7F8C8D", fontSize: 12, marginTop: 2 }}>
                          Notes: {match.contactNotes}
                        </Text>
                      )}
                    </View>

                    {status !== "sold" && status !== "dismissed" && (
                      <>
                        <Text style={{ fontWeight: "600", color: "#2C3E50", marginBottom: 8 }}>
                          Update Status
                        </Text>
                        <TextInput
                          placeholder="Add contact notes (optional)..."
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
                            minHeight: 60,
                          }}
                          placeholderTextColor="#9BA1A6"
                        />
                        <View style={{ gap: 8 }}>
                          {status === "pending" && (
                            <TouchableOpacity
                              onPress={() => handleStatusUpdate(match.id, "notified")}
                              style={{ backgroundColor: "#3498DB", borderRadius: 8, paddingVertical: 12, alignItems: "center" }}
                            >
                              <Text style={{ color: "white", fontWeight: "600" }}>Mark as Notified</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => handleStatusUpdate(match.id, "contacted")}
                            style={{ backgroundColor: "#9B59B6", borderRadius: 8, paddingVertical: 12, alignItems: "center" }}
                          >
                            <Text style={{ color: "white", fontWeight: "600" }}>Mark as Contacted</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleStatusUpdate(match.id, "sold")}
                            style={{ backgroundColor: "#27AE60", borderRadius: 8, paddingVertical: 12, alignItems: "center" }}
                          >
                            <Text style={{ color: "white", fontWeight: "600" }}>Mark as Sold</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleStatusUpdate(match.id, "dismissed")}
                            style={{ backgroundColor: "#95A5A6", borderRadius: 8, paddingVertical: 12, alignItems: "center" }}
                          >
                            <Text style={{ color: "white", fontWeight: "600" }}>Dismiss Match</Text>
                          </TouchableOpacity>
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
