import { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform, Modal, ScrollView, StyleSheet,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { C } from "@/constants/theme";

const EMPTY_DEALERSHIP = {
  name: "", email: "", phone: "", address: "", websiteUrl: "", emailDomain: "",
};

const EMPTY_USER = {
  name: "", email: "", password: "", role: "manager" as "salesperson" | "manager" | "admin",
};

const EMPTY_IMPORT = { items: "" };

function FormField({ label, value, onChange, placeholder, multiline }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; multiline?: boolean;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={C.rule} multiline={multiline}
        style={[s.fieldInput, multiline && { minHeight: 80, paddingTop: 10 }]}
      />
    </View>
  );
}

export default function DealershipsScreen() {
  const utils = trpc.useUtils();
  const { data: dealerships, isLoading } = trpc.owner.dealerships.list.useQuery();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDealership, setNewDealership] = useState(EMPTY_DEALERSHIP);

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [addUserDealershipId, setAddUserDealershipId] = useState<number | null>(null);
  const [newUser, setNewUser] = useState(EMPTY_USER);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importDealershipId, setImportDealershipId] = useState<number | null>(null);
  const [importData, setImportData] = useState(EMPTY_IMPORT);

  const [expandedId, setExpandedId] = useState<number | null>(null);

  const createMutation = trpc.owner.dealerships.create.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        utils.owner.dealerships.list.invalidate();
        utils.owner.dashboard.invalidate();
        setShowCreateModal(false);
        setNewDealership(EMPTY_DEALERSHIP);
      } else {
        showError(data.error || "Failed to create dealership");
      }
    },
  });

  const createUserMutation = trpc.owner.users.create.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        utils.owner.dealerships.list.invalidate();
        utils.owner.users.list.invalidate();
        setShowAddUserModal(false);
        setNewUser(EMPTY_USER);
      } else {
        showError(data.error || "Failed to create user");
      }
    },
  });

  const importMutation = trpc.owner.inventory.import.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        utils.owner.dealerships.list.invalidate();
        utils.owner.dashboard.invalidate();
        setShowImportModal(false);
        setImportData(EMPTY_IMPORT);
        showInfo(`Imported ${data.imported} items`);
      }
    },
    onError: (err) => showError(err.message),
  });

  const showError = (msg: string) => {
    if (Platform.OS === "web") window.alert(msg);
    else Alert.alert("Error", msg);
  };

  const showInfo = (msg: string) => {
    if (Platform.OS === "web") window.alert(msg);
    else Alert.alert("Success", msg);
  };

  const handleCreate = () => {
    if (!newDealership.name.trim()) { showError("Name is required"); return; }
    createMutation.mutate({
      name: newDealership.name,
      email: newDealership.email || undefined,
      phone: newDealership.phone || undefined,
      address: newDealership.address || undefined,
      websiteUrl: newDealership.websiteUrl || undefined,
      emailDomain: newDealership.emailDomain || undefined,
    });
  };

  const handleAddUser = () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      showError("Name, email, and password are required");
      return;
    }
    if (!addUserDealershipId) return;
    createUserMutation.mutate({
      name: newUser.name,
      email: newUser.email,
      password: newUser.password,
      dealershipId: addUserDealershipId,
      role: newUser.role,
    });
  };

  const handleImport = () => {
    if (!importDealershipId) return;
    try {
      const parsed = JSON.parse(importData.items);
      if (!Array.isArray(parsed)) { showError("Must be a JSON array"); return; }
      importMutation.mutate({ dealershipId: importDealershipId, items: parsed });
    } catch {
      showError("Invalid JSON. Paste a valid JSON array of inventory items.");
    }
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
            <Text style={s.headerTitle}>Manage <Text style={{ color: C.mint }}>Dealerships</Text></Text>
          </View>
          <TouchableOpacity style={s.addFab} onPress={() => setShowCreateModal(true)}>
            <Text style={s.addFabText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Count */}
      <View style={s.sectionLabel}>
        <Text style={s.sectionLabelText}>{dealerships?.length || 0} Dealership{(dealerships?.length || 0) !== 1 ? "s" : ""}</Text>
      </View>

      {/* List */}
      <FlatList
        data={dealerships || []}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => {
          const expanded = expandedId === item.id;
          return (
            <View style={s.card}>
              <TouchableOpacity onPress={() => setExpandedId(expanded ? null : item.id)}>
                <View style={s.cardHeader}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{item.name}</Text>
                    <Text style={s.cardMeta}>
                      {item.stats.users} users  {item.stats.leads} leads  {item.stats.inventory} units
                    </Text>
                  </View>
                  <Text style={{ color: C.muted, fontSize: 14 }}>{expanded ? "▲" : "▼"}</Text>
                </View>
              </TouchableOpacity>

              {expanded && (
                <View style={s.expandedSection}>
                  {item.email && <Text style={s.detailText}>{item.email}</Text>}
                  {item.phone && <Text style={s.detailText}>{item.phone}</Text>}
                  {item.emailDomain && <Text style={s.detailText}>Domain: {item.emailDomain}</Text>}

                  <View style={s.actionRow}>
                    <TouchableOpacity
                      style={s.actionBtn}
                      onPress={() => { setAddUserDealershipId(item.id); setNewUser(EMPTY_USER); setShowAddUserModal(true); }}
                    >
                      <Text style={s.actionBtnText}>+ Add User</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: C.tealMid }]}
                      onPress={() => { setImportDealershipId(item.id); setImportData(EMPTY_IMPORT); setShowImportModal(true); }}
                    >
                      <Text style={s.actionBtnText}>Import Inventory</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>🏢</Text>
            <Text style={s.emptyTitle}>No dealerships yet</Text>
            <Text style={s.emptySubtitle}>Tap + to create your first dealership</Text>
          </View>
        }
      />

      {/* Create Dealership Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalEyebrow}>LotLink Owner</Text>
                <Text style={s.modalTitle}>Create <Text style={{ color: C.mint }}>Dealership</Text></Text>
              </View>
              <TouchableOpacity style={s.modalClose} onPress={() => setShowCreateModal(false)}>
                <Text style={{ color: C.white, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <FormField label="Name *" value={newDealership.name} onChange={(v) => setNewDealership({ ...newDealership, name: v })} placeholder="Acme RV Sales" />
              <FormField label="Email" value={newDealership.email} onChange={(v) => setNewDealership({ ...newDealership, email: v })} placeholder="info@acmerv.com" />
              <FormField label="Phone" value={newDealership.phone} onChange={(v) => setNewDealership({ ...newDealership, phone: v })} placeholder="(555) 123-4567" />
              <FormField label="Address" value={newDealership.address} onChange={(v) => setNewDealership({ ...newDealership, address: v })} placeholder="123 Main St, City, ST" />
              <FormField label="Website URL" value={newDealership.websiteUrl} onChange={(v) => setNewDealership({ ...newDealership, websiteUrl: v })} placeholder="https://acmerv.com" />
              <FormField label="Email Domain" value={newDealership.emailDomain} onChange={(v) => setNewDealership({ ...newDealership, emailDomain: v })} placeholder="acmerv.com" />
              <View style={s.modalActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCreateModal(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.saveBtn, createMutation.isLoading && { opacity: 0.6 }]} onPress={handleCreate} disabled={createMutation.isLoading}>
                  {createMutation.isLoading ? <ActivityIndicator color={C.white} /> : <Text style={s.saveBtnText}>Create</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add User Modal */}
      <Modal visible={showAddUserModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalEyebrow}>LotLink Owner</Text>
                <Text style={s.modalTitle}>Add <Text style={{ color: C.mint }}>User</Text></Text>
              </View>
              <TouchableOpacity style={s.modalClose} onPress={() => setShowAddUserModal(false)}>
                <Text style={{ color: C.white, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <FormField label="Full Name *" value={newUser.name} onChange={(v) => setNewUser({ ...newUser, name: v })} placeholder="Jane Smith" />
              <FormField label="Email *" value={newUser.email} onChange={(v) => setNewUser({ ...newUser, email: v })} placeholder="jane@dealership.com" />
              <FormField label="Password *" value={newUser.password} onChange={(v) => setNewUser({ ...newUser, password: v })} placeholder="Min 8 characters" />

              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>Role</Text>
                <View style={s.roleRow}>
                  {(["salesperson", "manager", "admin"] as const).map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[s.roleChip, newUser.role === r && s.roleChipActive]}
                      onPress={() => setNewUser({ ...newUser, role: r })}
                    >
                      <Text style={[s.roleChipText, newUser.role === r && s.roleChipTextActive]}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={s.modalActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAddUserModal(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.saveBtn, createUserMutation.isLoading && { opacity: 0.6 }]} onPress={handleAddUser} disabled={createUserMutation.isLoading}>
                  {createUserMutation.isLoading ? <ActivityIndicator color={C.white} /> : <Text style={s.saveBtnText}>Add User</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Import Inventory Modal */}
      <Modal visible={showImportModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalEyebrow}>LotLink Owner</Text>
                <Text style={s.modalTitle}>Import <Text style={{ color: C.mint }}>Inventory</Text></Text>
              </View>
              <TouchableOpacity style={s.modalClose} onPress={() => setShowImportModal(false)}>
                <Text style={{ color: C.white, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <Text style={s.importHint}>
                Paste a JSON array of inventory items. Each item needs: unitId, year, make, model, storeLocation, arrivalDate.
              </Text>
              <FormField
                label="JSON Data *"
                value={importData.items}
                onChange={(v) => setImportData({ items: v })}
                placeholder={`[{"unitId":"RV-001","year":2025,"make":"Tiffin","model":"Allegro Bus","storeLocation":"Main","arrivalDate":"2025-01-01"}]`}
                multiline
              />
              <View style={s.modalActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowImportModal(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.saveBtn, importMutation.isLoading && { opacity: 0.6 }]} onPress={handleImport} disabled={importMutation.isLoading}>
                  {importMutation.isLoading ? <ActivityIndicator color={C.white} /> : <Text style={s.saveBtnText}>Import</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  addFab: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.mint, alignItems: "center", justifyContent: "center" },
  addFabText: { fontSize: 22, fontWeight: "800", color: C.tealDeep, marginTop: -1 },

  sectionLabel: { paddingHorizontal: 14, marginTop: 14, marginBottom: 8 },
  sectionLabelText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, color: C.muted },

  card: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.rule, borderRadius: 14, marginHorizontal: 14, marginBottom: 8, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.tealLite, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "800", color: C.teal },
  cardTitle: { fontSize: 15, fontWeight: "800", color: C.ink, letterSpacing: -0.2 },
  cardMeta: { fontSize: 11, color: C.muted, marginTop: 2 },

  expandedSection: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: C.rule, paddingTop: 10 },
  detailText: { fontSize: 12, color: C.muted, marginBottom: 4 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, backgroundColor: C.teal, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  actionBtnText: { color: C.white, fontSize: 12, fontWeight: "700" },

  emptyBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.ink, textAlign: "center", marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: C.muted, textAlign: "center" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(9,46,46,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", flex: 1 },
  modalHeader: { backgroundColor: C.tealDeep, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalEyebrow: { fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 2 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  modalClose: { width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },

  fieldWrap: { marginBottom: 10 },
  fieldLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7, color: C.muted, marginBottom: 4 },
  fieldInput: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.rule, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontWeight: "600", color: C.ink },

  roleRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  roleChip: { flex: 1, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.rule, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  roleChipActive: { backgroundColor: C.teal, borderColor: C.teal },
  roleChipText: { fontSize: 12, fontWeight: "700", color: C.muted },
  roleChipTextActive: { color: C.white },

  importHint: { fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 18 },

  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: C.rule, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: C.surface },
  cancelBtnText: { color: C.muted, fontWeight: "700", fontSize: 14 },
  saveBtn: { flex: 2, backgroundColor: C.teal, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { color: C.white, fontWeight: "800", fontSize: 15, letterSpacing: -0.2 },
});
