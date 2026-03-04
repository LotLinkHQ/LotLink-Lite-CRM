import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { C } from "@/constants/theme";

function getInvBadge(status: string) {
  switch (status) {
    case "in_stock": return { bg: C.greenLite, fg: C.green, label: "In Stock" };
    case "matched":  return { bg: C.amberLite, fg: C.amber, label: "Matched" };
    case "hold":     return { bg: "#3d2817",   fg: "#ff9800", label: "Hold" };
    case "sold":     return { bg: C.redLite,   fg: C.red,   label: "Sold" };
    case "removed":  return { bg: C.redLite,   fg: C.red,   label: "Removed" };
    default:         return { bg: C.greenLite, fg: C.green, label: status };
  }
}

export default function InventoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = parseInt(id || "0");

  const { data: item, isLoading } = trpc.inventory.getById.useQuery(
    { id: itemId },
    { enabled: itemId > 0 }
  );

  const { data: matches } = trpc.matches.getByInventoryId.useQuery(
    { inventoryId: itemId },
    { enabled: itemId > 0 }
  );

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={s.center}><ActivityIndicator size="large" color={C.teal} /></View>
      </ScreenContainer>
    );
  }

  if (!item) {
    return (
      <ScreenContainer>
        <View style={s.center}>
          <Text style={s.emptyText}>Unit not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const badge = getInvBadge(item.status);
  const amenities = (item.amenities as string[]) || [];
  const matchCount = matches?.length || 0;

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.back()} style={s.backRow}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Inventory</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={s.headerCard}>
          <Text style={s.unitTitle}>{item.year} {item.make} {item.model}</Text>
          <View style={[s.badge, { backgroundColor: badge.bg }]}>
            <Text style={[s.badgeText, { color: badge.fg }]}>{badge.label}</Text>
          </View>
          {item.status === "hold" && item.holdCustomerName && (
            <Text style={s.holdInfo}>HOLD — {item.holdCustomerName}</Text>
          )}
          {item.price && (
            <Text style={s.priceText}>${Number(item.price).toLocaleString()}</Text>
          )}
        </View>

        {/* Match Indicator */}
        {matchCount > 0 && (
          <View style={s.matchIndicator}>
            <Text style={s.matchIndicatorText}>
              {matchCount} lead{matchCount !== 1 ? "s" : ""} match this unit
            </Text>
          </View>
        )}

        {/* Identification */}
        <Text style={s.section}>Identification</Text>
        <View style={s.infoCard}>
          <InfoRow label="Stock #" value={item.unitId} />
          {item.vin && <InfoRow label="VIN" value={item.vin} />}
          <InfoRow label="Location" value={item.storeLocation} />
          <InfoRow label="Arrived" value={new Date(item.arrivalDate).toLocaleDateString()} />
        </View>

        {/* Specs */}
        <Text style={s.section}>Specifications</Text>
        <View style={s.infoCard}>
          <InfoRow label="Year" value={String(item.year)} />
          <InfoRow label="Make" value={item.make} />
          <InfoRow label="Model" value={item.model} />
          {item.length && <InfoRow label="Length" value={`${item.length} ft`} />}
          {item.weight && <InfoRow label="Weight" value={`${Number(item.weight).toLocaleString()} lbs`} />}
          {item.bedType && <InfoRow label="Bed Type" value={item.bedType} />}
          {item.bedCount && <InfoRow label="Beds" value={String(item.bedCount)} />}
          {item.bathrooms && <InfoRow label="Bathrooms" value={String(item.bathrooms)} />}
          {item.slideOutCount && <InfoRow label="Slide-Outs" value={String(item.slideOutCount)} />}
          {item.fuelType && <InfoRow label="Fuel" value={item.fuelType} />}
          {item.horsepower && <InfoRow label="Horsepower" value={String(item.horsepower)} />}
        </View>

        {/* Amenities */}
        {amenities.length > 0 && (
          <>
            <Text style={s.section}>Amenities</Text>
            <View style={s.chipGrid}>
              {amenities.map((a: string, i: number) => (
                <View key={i} style={s.amenityChip}>
                  <Text style={s.amenityText}>{a}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Matching Leads */}
        {matchCount > 0 && (
          <>
            <Text style={s.section}>Matching Leads ({matchCount})</Text>
            {(matches || []).map((m: any) => {
              const scoreColor = m.matchScore >= 80 ? C.green : m.matchScore >= 50 ? C.amber : C.muted;
              return (
                <View key={m.id} style={s.matchCard}>
                  <View style={s.matchTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.matchName}>{m.leadName || "Lead #" + m.leadId}</Text>
                      <Text style={s.matchSub}>{m.status} · {new Date(m.createdAt).toLocaleDateString()}</Text>
                    </View>
                    <View style={[s.scoreBadge, { borderColor: scoreColor }]}>
                      <Text style={[s.scoreText, { color: scoreColor }]}>{m.matchScore}%</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center:       { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText:    { color: C.muted, fontSize: 16, marginBottom: 16 },
  backBtn:      { backgroundColor: C.teal, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  backBtnText:  { color: C.white, fontWeight: "700" },

  backRow:      { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backArrow:    { fontSize: 20, color: C.teal, fontWeight: "700" },
  backLabel:    { fontSize: 14, color: C.teal, fontWeight: "600" },

  headerCard:   { alignItems: "center", marginBottom: 20 },
  unitTitle:    { fontSize: 22, fontWeight: "800", color: C.ink, textAlign: "center" },
  badge:        { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8 },
  badgeText:    { fontSize: 12, fontWeight: "700" },
  holdInfo:     { fontSize: 13, color: "#ff9800", fontWeight: "700", marginTop: 4 },
  priceText:    { fontSize: 24, fontWeight: "800", color: C.green, marginTop: 8 },

  matchIndicator:     { backgroundColor: C.amberLite, borderRadius: 10, padding: 12, marginBottom: 16, alignItems: "center" },
  matchIndicatorText: { color: C.amber, fontWeight: "700", fontSize: 14 },

  section:      { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, color: C.muted, marginTop: 20, marginBottom: 8 },
  infoCard:     { backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 12, padding: 14 },
  infoRow:      { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.rule },
  infoLabel:    { fontSize: 13, color: C.muted, fontWeight: "600" },
  infoValue:    { fontSize: 13, color: C.ink, fontWeight: "700", textAlign: "right", flexShrink: 1, maxWidth: "60%" },

  chipGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  amenityChip:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  amenityText:  { fontSize: 11, fontWeight: "600", color: C.ink },

  matchCard:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 12, padding: 14, marginBottom: 8 },
  matchTop:     { flexDirection: "row", alignItems: "center" },
  matchName:    { fontSize: 14, fontWeight: "700", color: C.ink },
  matchSub:     { fontSize: 11, color: C.muted, marginTop: 2, textTransform: "capitalize" },
  scoreBadge:   { borderWidth: 2, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  scoreText:    { fontSize: 14, fontWeight: "800" },
});
