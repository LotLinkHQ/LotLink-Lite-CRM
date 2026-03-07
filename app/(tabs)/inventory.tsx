import { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform, Modal, ScrollView, StyleSheet,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { router as navRouter } from "expo-router";
import { C } from "@/constants/theme";

const INV_STATUSES = ["in_stock", "matched", "hold", "sold", "removed"] as const;

function getInvBadge(status: string) {
  switch (status) {
    case "in_stock": return { bg: C.greenLite, fg: C.green, label: "In Stock" };
    case "matched":  return { bg: C.amberLite, fg: C.amber, label: "Matched" };
    case "hold":     return { bg: "#3d2817",   fg: "#ff9800", label: "Hold" };
    case "sold":     return { bg: C.redLite,   fg: C.red,   label: "Sold" };
    case "removed":  return { bg: C.redLite,   fg: C.red,   label: "Removed" };
    case "pending":  return { bg: "#17333d",   fg: "#4db8ff", label: "Pending" };
    default:         return { bg: C.greenLite, fg: C.green, label: status };
  }
}

const STATUS_COLORS: Record<string, string> = {
  in_stock: C.green,
  matched: C.amber,
  hold: "#ff9800",
  sold: C.red,
  removed: C.red,
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current.trim()); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return row;
  }).filter(row => Object.values(row).some(v => v));
}

export default function InventoryScreen() {
  const { isAuthenticated } = useDealershipAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [newUnit, setNewUnit] = useState({
    unitId: "", vin: "", year: "", make: "", model: "",
    length: "", weight: "", bedType: "", price: "", storeLocation: "",
    bathrooms: "", slideOutCount: "", fuelType: "",
  });

  const utils = trpc.useUtils();

  const { data: infiniteInventory, isLoading, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.inventory.list.useInfiniteQuery(
      { limit: 20 },
      { enabled: isAuthenticated, getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

  const inventoryData = infiniteInventory?.pages.flatMap((page) => page.items) || [];

  const createMutation = trpc.inventory.create.useMutation({
    onSuccess: () => {
      utils.inventory.list.invalidate();
      setShowAddModal(false);
      setNewUnit({ unitId: "", vin: "", year: "", make: "", model: "", length: "", weight: "", bedType: "", price: "", storeLocation: "", bathrooms: "", slideOutCount: "", fuelType: "" });
      const msg = "Unit logged! The AI is now scanning all leads for matches and will automatically notify the Sales Manager.";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Unit Logged", msg);
    },
  });

  const deleteMutation = trpc.inventory.delete.useMutation({
    onSuccess: () => utils.inventory.list.invalidate(),
  });
  const importCsvMutation = trpc.inventory.importCsv.useMutation({
    onSuccess: (data) => {
      utils.inventory.list.invalidate();
      setCsvStatus(`✓ Imported ${data.imported} unit${data.imported !== 1 ? "s" : ""}`);
      setTimeout(() => setCsvStatus(null), 4000);
    },
    onError: (e) => { setCsvStatus(`✗ ${e.message}`); setTimeout(() => setCsvStatus(null), 4000); },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleDeleteUnit = (id: number, name: string) => {
    const doDelete = () => deleteMutation.mutate({ id });
    Platform.OS === "web"
      ? window.confirm(`Delete ${name}?`) && doDelete()
      : Alert.alert("Delete Unit", `Are you sure you want to delete ${name}?`, [
          { text: "Cancel" }, { text: "Delete", onPress: doDelete, style: "destructive" },
        ]);
  };

  const handleCsvImport = () => {
    if (Platform.OS !== "web") {
      Alert.alert("Web Only", "CSV import is only available on the web version.");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const text = await file.text();
      const rows = parseCSV(text);
      const mapped = rows.map(row => ({
        unitId: row.unit_id || row.unitid || row.vin || row.stock || row.stock_number || "",
        year: parseInt(row.year || row.model_year || "0") || 2025,
        make: row.make || row.manufacturer || "",
        model: row.model || row.model_name || "",
        length: row.length || row.length_ft || null,
        bedType: row.bed_type || row.bedtype || row.bed || null,
        price: row.price || row.msrp || row.sale_price || null,
        storeLocation: row.store_location || row.location || row.lot || row.store || "Main Store",
      })).filter(r => r.unitId && r.make && r.model);
      if (mapped.length === 0) {
        setCsvStatus("✗ No valid rows found. Check headers: unit_id, year, make, model, store_location");
        setTimeout(() => setCsvStatus(null), 5000);
        return;
      }
      importCsvMutation.mutate({ rows: mapped });
    };
    input.click();
  };

  const handleAddUnit = () => {
    if (!newUnit.unitId.trim() || !newUnit.make.trim() || !newUnit.model.trim() || !newUnit.storeLocation.trim()) {
      const msg = "Please fill in required fields (Unit ID, Make, Model, Store Location)";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
      return;
    }
    createMutation.mutate({
      unitId: newUnit.unitId, vin: newUnit.vin || null,
      year: parseInt(newUnit.year) || 2025,
      make: newUnit.make, model: newUnit.model,
      length: newUnit.length || null, weight: newUnit.weight || null,
      bedType: newUnit.bedType || null,
      bathrooms: newUnit.bathrooms || null,
      price: newUnit.price || null, storeLocation: newUnit.storeLocation,
      arrivalDate: new Date().toISOString(),
    });
  };

  const filteredInventory = inventoryData.filter((unit) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      unit.model.toLowerCase().includes(q) ||
      unit.make.toLowerCase().includes(q) ||
      unit.unitId.toLowerCase().includes(q) ||
      (unit.vin || "").toLowerCase().includes(q) ||
      String(unit.year).includes(q);
    const matchesStatus = !statusFilter || unit.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View style={s.center}><Text style={s.centerText}>Please log in to continue</Text></View>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={s.center}><ActivityIndicator size="large" color={C.teal} /></View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={s.topBar}>
        <Text style={s.screenTitle}>Inventory</Text>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={s.addBtn}>
          <Text style={s.addBtnText}>+ Log Unit</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        placeholder="Search inventory..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={s.searchInput}
        placeholderTextColor={C.muted}
      />

      <View style={s.csvRow}>
        <TouchableOpacity onPress={handleCsvImport} disabled={importCsvMutation.isLoading} style={s.csvBtn}>
          {importCsvMutation.isLoading
            ? <ActivityIndicator size="small" color={C.teal} />
            : <Text style={s.csvBtnText}>Import CSV</Text>}
        </TouchableOpacity>
        {csvStatus && <Text style={s.csvStatus}>{csvStatus}</Text>}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
        <TouchableOpacity
          style={[s.filterChip, !statusFilter && s.filterChipActive]}
          onPress={() => setStatusFilter(null)}
        >
          <Text style={[s.filterChipText, !statusFilter && s.filterChipTextActive]}>All</Text>
        </TouchableOpacity>
        {INV_STATUSES.map(st => {
          const badge = getInvBadge(st);
          const active = statusFilter === st;
          return (
            <TouchableOpacity
              key={st}
              style={[s.filterChip, active && { backgroundColor: badge.bg, borderColor: badge.fg }]}
              onPress={() => setStatusFilter(active ? null : st)}
            >
              <Text style={[s.filterChipText, active && { color: badge.fg }]}>{badge.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {filteredInventory.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>{searchQuery ? "No units found" : "No inventory yet. Log a unit arrival!"}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredInventory}
          keyExtractor={(item) => item.id.toString()}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={() => isFetchingNextPage ? <ActivityIndicator color={C.teal} style={{ paddingVertical: 20 }} /> : null}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.unitCard} onPress={() => navRouter.push(`/inventory/${item.id}` as any)} activeOpacity={0.7}>
              <View style={s.unitTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.unitName}>{item.year} {item.make} {item.model}</Text>
                  <Text style={s.unitSub}>ID: {item.unitId} · {item.storeLocation}</Text>
                  {item.status === "hold" && item.holdCustomerName && (
                    <Text style={[s.unitSub, { color: "#ff9800" }]}>HOLD — {item.holdCustomerName}</Text>
                  )}
                </View>
                {(() => {
                  const badge = getInvBadge(item.status);
                  return (
                    <View style={[s.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[s.statusText, { color: badge.fg }]}>{badge.label}</Text>
                    </View>
                  );
                })()}
              </View>

              <View style={s.unitMeta}>
                {item.length && <Text style={s.metaChip}>{item.length}ft</Text>}
                {item.bedType && <Text style={s.metaChip}>{item.bedType}</Text>}
                {item.price ? (
                  <Text style={[s.metaChip, { color: C.green, fontWeight: "700" }]}>
                    ${Number(item.price).toLocaleString()}
                  </Text>
                ) : (
                  <Text style={[s.metaChip, { color: C.amber, fontWeight: "700" }]}>
                    Price TBD
                  </Text>
                )}
              </View>

              <TouchableOpacity
                onPress={() => handleDeleteUnit(item.id, `${item.year} ${item.make} ${item.model}`)}
                style={s.deleteBtn}
              >
                <Text style={s.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <ScrollView style={{ maxHeight: "85%" }}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>Log Unit Arrival</Text>

              {[
                { label: "Unit ID *", key: "unitId", placeholder: "e.g., RV-2025-001" },
                { label: "VIN", key: "vin", placeholder: "e.g., 1FDXE4FS5KDA12345" },
                { label: "Year", key: "year", placeholder: "e.g., 2025", keyboard: "numeric" },
                { label: "Make *", key: "make", placeholder: "e.g., Tiffin" },
                { label: "Model *", key: "model", placeholder: "e.g., Allegro Bus 45OPP" },
                { label: "Length (ft)", key: "length", placeholder: "e.g., 45", keyboard: "numeric" },
                { label: "Weight (lbs)", key: "weight", placeholder: "e.g., 24000", keyboard: "numeric" },
                { label: "Bed Type", key: "bedType", placeholder: "e.g., King" },
                { label: "Bathrooms", key: "bathrooms", placeholder: "e.g., 1.5", keyboard: "numeric" },
                { label: "Slide-Outs", key: "slideOutCount", placeholder: "e.g., 3", keyboard: "numeric" },
                { label: "Fuel Type", key: "fuelType", placeholder: "e.g., Diesel" },
                { label: "Price", key: "price", placeholder: "e.g., 450000", keyboard: "numeric" },
                { label: "Store Location *", key: "storeLocation", placeholder: "e.g., Main Store" },
              ].map((field) => (
                <View key={field.key} style={{ marginBottom: 12 }}>
                  <Text style={s.fieldLabel}>{field.label}</Text>
                  <TextInput
                    placeholder={field.placeholder}
                    value={(newUnit as any)[field.key]}
                    onChangeText={(text) => setNewUnit({ ...newUnit, [field.key]: text })}
                    keyboardType={(field as any).keyboard === "numeric" ? "numeric" : "default"}
                    style={s.fieldInput}
                    placeholderTextColor={C.muted}
                  />
                </View>
              ))}

              <View style={s.modalBtns}>
                <TouchableOpacity onPress={() => setShowAddModal(false)} style={s.cancelBtn}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddUnit} disabled={createMutation.isLoading} style={[s.saveBtn, { opacity: createMutation.isLoading ? 0.7 : 1 }]}>
                  {createMutation.isLoading ? <ActivityIndicator color={C.white} /> : <Text style={s.saveBtnText}>Save Unit</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerText: { color: C.ink, fontSize: 18 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  screenTitle: { fontSize: 24, fontWeight: "700", color: C.ink },
  addBtn: { backgroundColor: C.teal, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: C.white, fontWeight: "600", fontSize: 14 },
  searchInput: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, color: C.ink, fontSize: 15, marginBottom: 12,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: C.muted, fontSize: 16 },
  unitCard: { backgroundColor: C.surface, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.rule },
  unitTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  unitName: { fontSize: 16, fontWeight: "600", color: C.ink },
  unitSub: { fontSize: 12, color: C.muted, marginTop: 3 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { color: C.white, fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  unitMeta: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  metaChip: { fontSize: 12, color: C.muted },
  deleteBtn: { marginTop: 10, backgroundColor: C.redLite, borderRadius: 6, paddingVertical: 7, alignItems: "center" },
  deleteBtnText: { color: C.red, fontSize: 12, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(5,15,15,0.85)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: C.bg, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.rule },
  modalTitle: { fontSize: 20, fontWeight: "700", color: C.ink, marginBottom: 16 },
  fieldLabel: { color: C.muted, fontWeight: "600", marginBottom: 6, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.7 },
  fieldInput: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 15,
  },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: C.rule, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  cancelBtnText: { color: C.muted, fontWeight: "600" },
  saveBtn: { flex: 1, backgroundColor: C.teal, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  saveBtnText: { color: C.white, fontWeight: "600" },
  csvRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  csvBtn: { borderWidth: 1, borderColor: C.teal, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, minWidth: 110, alignItems: "center" },
  csvBtnText: { color: C.teal, fontWeight: "600", fontSize: 14 },
  csvStatus: { flex: 1, fontSize: 13, color: C.muted },

  filterRow:       { marginBottom: 10, maxHeight: 36 },
  filterChip:      { borderWidth: 1, borderColor: C.rule, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.surface },
  filterChipActive:{ backgroundColor: C.tealDark, borderColor: C.teal },
  filterChipText:  { fontSize: 11, fontWeight: "700", color: C.muted },
  filterChipTextActive: { color: C.mint },
});
