import { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Platform, StyleSheet,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { C } from "@/constants/theme";

function getInitials(name: string) {
  return name.trim().split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function getRoleBadge(role: string) {
  if (role === "admin") return { bg: C.amberLite, fg: C.amber };
  if (role === "manager") return { bg: C.tealLite, fg: C.teal };
  return { bg: C.greenLite, fg: C.green };
}

export default function UsersScreen() {
  const utils = trpc.useUtils();
  const [filterDealershipId, setFilterDealershipId] = useState<number | undefined>(undefined);

  const { data: users, isLoading } = trpc.owner.users.list.useQuery(
    filterDealershipId ? { dealershipId: filterDealershipId } : undefined
  );
  const { data: dealerships } = trpc.owner.dealerships.list.useQuery();

  const updateRoleMutation = trpc.owner.users.updateRole.useMutation({
    onSuccess: () => utils.owner.users.list.invalidate(),
  });

  const deactivateMutation = trpc.owner.users.deactivate.useMutation({
    onSuccess: () => utils.owner.users.list.invalidate(),
  });

  const showError = (msg: string) => {
    if (Platform.OS === "web") window.alert(msg);
    else Alert.alert("Error", msg);
  };

  const handleToggleActive = (userId: number, name: string, isActive: boolean) => {
    const action = isActive ? "Deactivate" : "Activate";
    const doIt = () => deactivateMutation.mutate({ userId });
    if (Platform.OS === "web") {
      if (window.confirm(`${action} ${name}?`)) doIt();
    } else {
      Alert.alert(action, `${action} ${name}?`, [
        { text: "Cancel" },
        { text: action, onPress: doIt, style: isActive ? "destructive" : "default" },
      ]);
    }
  };

  const cycleRole = (userId: number, currentRole: string) => {
    const roles = ["salesperson", "manager", "admin"] as const;
    const idx = roles.indexOf(currentRole as any);
    const nextRole = roles[(idx + 1) % roles.length];
    updateRoleMutation.mutate({ userId, role: nextRole });
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={s.centerBox}><ActivityIndicator size="large" color={C.teal} /></View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerInner}>
          <View style={s.headerLogo}><Text style={s.headerLogoText}>LL</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerEyebrow}>LotLink Owner Portal</Text>
            <Text style={s.headerTitle}>All <Text style={{ color: C.mint }}>Users</Text></Text>
          </View>
        </View>
      </View>

      {/* Filter */}
      <View style={s.filterRow}>
        <TouchableOpacity
          style={[s.filterChip, !filterDealershipId && s.filterChipActive]}
          onPress={() => setFilterDealershipId(undefined)}
        >
          <Text style={[s.filterChipText, !filterDealershipId && s.filterChipTextActive]}>All</Text>
        </TouchableOpacity>
        {(dealerships || []).map((d) => (
          <TouchableOpacity
            key={d.id}
            style={[s.filterChip, filterDealershipId === d.id && s.filterChipActive]}
            onPress={() => setFilterDealershipId(d.id)}
          >
            <Text style={[s.filterChipText, filterDealershipId === d.id && s.filterChipTextActive]} numberOfLines={1}>
              {d.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Count */}
      <View style={s.sectionLabel}>
        <Text style={s.sectionLabelText}>{users?.length || 0} User{(users?.length || 0) !== 1 ? "s" : ""}</Text>
      </View>

      {/* List */}
      <FlatList
        data={users || []}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => {
          const badge = getRoleBadge(item.role);
          return (
            <View style={[s.card, !item.isActive && { opacity: 0.5 }]}>
              <View style={s.cardTop}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{getInitials(item.name)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.cardEmail} numberOfLines={1}>{item.email}</Text>
                  {item.dealershipName && (
                    <Text style={s.cardDealer} numberOfLines={1}>{item.dealershipName}</Text>
                  )}
                </View>
                <TouchableOpacity style={[s.roleBadge, { backgroundColor: badge.bg }]} onPress={() => cycleRole(item.id, item.role)}>
                  <Text style={[s.roleBadgeText, { color: badge.fg }]}>{item.role}</Text>
                </TouchableOpacity>
              </View>

              <View style={s.cardBottom}>
                <Text style={s.metaText}>
                  {item.lastSignedIn
                    ? `Last login: ${new Date(item.lastSignedIn).toLocaleDateString()}`
                    : "Never logged in"}
                </Text>
                <TouchableOpacity
                  style={[s.toggleBtn, !item.isActive && { backgroundColor: C.greenLite }]}
                  onPress={() => handleToggleActive(item.id, item.name, item.isActive)}
                >
                  <Text style={[s.toggleBtnText, !item.isActive && { color: C.green }]}>
                    {item.isActive ? "Deactivate" : "Activate"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>👥</Text>
            <Text style={s.emptyTitle}>No users found</Text>
          </View>
        }
      />
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

  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, paddingTop: 12 },
  filterChip: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.rule, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  filterChipActive: { backgroundColor: C.teal, borderColor: C.teal },
  filterChipText: { fontSize: 11, fontWeight: "700", color: C.muted },
  filterChipTextActive: { color: C.white },

  sectionLabel: { paddingHorizontal: 14, marginTop: 12, marginBottom: 8 },
  sectionLabelText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, color: C.muted },

  card: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.rule, borderRadius: 14, marginHorizontal: 14, marginBottom: 8, padding: 14 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.tealLite, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 14, fontWeight: "800", color: C.teal },
  cardName: { fontSize: 15, fontWeight: "800", color: C.ink, letterSpacing: -0.2 },
  cardEmail: { fontSize: 11, color: C.muted, marginTop: 1 },
  cardDealer: { fontSize: 10, color: C.tealMid, marginTop: 1, fontWeight: "600" },

  roleBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  roleBadgeText: { fontSize: 10, fontWeight: "700", textTransform: "capitalize" },

  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaText: { fontSize: 10, color: C.muted },
  toggleBtn: { backgroundColor: C.redLite, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  toggleBtnText: { fontSize: 10, fontWeight: "700", color: C.red },

  emptyBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.ink, textAlign: "center" },
});
