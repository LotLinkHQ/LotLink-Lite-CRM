import { View, Text, TouchableOpacity, ScrollView, Switch, TextInput, ActivityIndicator, Alert, Modal, Platform, StyleSheet } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { C } from "@/constants/theme";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", manager: "Manager", salesperson: "Salesperson",
};
const ROLE_COLORS: Record<string, string> = {
  admin: C.red, manager: C.amber, salesperson: C.teal,
};

export default function SettingsScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isAdmin, logout } = useDealershipAuth();

  const { data: preferences } = trpc.preferences.get.useQuery(undefined, { enabled: isAuthenticated });
  const { data: dealership, refetch: refetchDealership } = trpc.dealership.get.useQuery(undefined, { enabled: isAuthenticated });
  const { data: teamMembers, refetch: refetchTeam } = trpc.users.list.useQuery(undefined, { enabled: isAuthenticated && isAdmin });
  const { data: pendingInvites, refetch: refetchInvites } = trpc.invites.list.useQuery(undefined, { enabled: isAuthenticated && isAdmin });

  const updatePreferences = trpc.preferences.update.useMutation();
  const updateWebsite = trpc.dealership.updateWebsite.useMutation({ onSuccess: () => refetchDealership() });
  const syncInventory = trpc.dealership.syncInventory.useMutation({
    onSuccess: (data) => {
      refetchDealership();
      if (data.success) {
        Alert.alert("Sync Complete", `Found ${data.totalFound} vehicles.\n${data.newUnits} new units added.\n${data.updatedUnits} units updated.`);
      } else {
        Alert.alert("Sync Failed", "Unknown error");
      }
    },
    onError: (error) => Alert.alert("Sync Error", error.message),
  });
  const createInvite = trpc.invites.create.useMutation({
    onSuccess: (data) => {
      if (data.success) { refetchInvites(); setInviteEmail(""); setInviteRole("salesperson"); setShowInviteModal(false); }
      else showError(data.error || "Failed to send invite");
    },
  });
  const revokeInvite = trpc.invites.revoke.useMutation({ onSuccess: () => refetchInvites() });
  const resendInvite = trpc.invites.resend.useMutation({
    onSuccess: (data) => { if (data.success) showError("Invite resent (7 more days)"); },
  });
  const updateBranding = trpc.dealership.updateBranding.useMutation({ onSuccess: () => refetchDealership() });
  const updateRole = trpc.users.updateRole.useMutation({ onSuccess: () => refetchTeam() });
  const toggleActive = trpc.users.deactivate.useMutation({ onSuccess: () => refetchTeam() });

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteEdited, setWebsiteEdited] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"salesperson" | "manager" | "admin">("salesperson");
  const [brandColor, setBrandColor] = useState("");
  const [brandLogo, setBrandLogo] = useState("");

  useEffect(() => {
    if (dealership?.websiteUrl && !websiteEdited) setWebsiteUrl(dealership.websiteUrl);
    if (dealership?.branding) {
      const b = dealership.branding as any;
      if (b.primaryColor && !brandColor) setBrandColor(b.primaryColor);
      if (b.logoUrl && !brandLogo) setBrandLogo(b.logoUrl);
    }
  }, [dealership?.websiteUrl, dealership?.branding]);

  const showError = (msg: string) => Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
  const handleLogout = async () => {
    try { await logout(); } catch {}
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    } else {
      router.replace("/login");
    }
  };
  const handleSync = () => {
    if (!dealership?.websiteUrl && !websiteUrl.trim()) { Alert.alert("No Website", "Please enter your dealership website URL first."); return; }
    if (websiteEdited && websiteUrl.trim()) {
      updateWebsite.mutate({ websiteUrl: websiteUrl.trim() }, { onSuccess: () => { setWebsiteEdited(false); syncInventory.mutate(); } });
    } else { syncInventory.mutate(); }
  };

  if (!isAuthenticated) {
    return <ScreenContainer><View style={s.center}><Text style={s.centerText}>Please log in to continue</Text></View></ScreenContainer>;
  }

  const lastSynced = dealership?.lastScrapedAt ? new Date(dealership.lastScrapedAt).toLocaleString() : "Never";

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <Text style={s.screenTitle}>Settings</Text>

        {/* Profile */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Your Profile</Text>
          <View style={{ gap: 10 }}>
            {[{ label: "Name", value: user?.name }, { label: "Email", value: user?.email }, { label: "Dealership", value: user?.dealershipName }].map((row) => (
              <View key={row.label} style={s.profileRow}>
                <Text style={s.profileLabel}>{row.label}</Text>
                <Text style={s.profileValue}>{row.value || "—"}</Text>
              </View>
            ))}
            <View style={s.profileRow}>
              <Text style={s.profileLabel}>Role</Text>
              <View style={[s.roleBadge, { backgroundColor: (ROLE_COLORS[user?.role || "salesperson"] || C.teal) + "22" }]}>
                <Text style={[s.roleText, { color: ROLE_COLORS[user?.role || "salesperson"] || C.teal }]}>
                  {ROLE_LABELS[user?.role || "salesperson"]}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Branding */}
        {isAdmin && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Dealership Branding</Text>
            <Text style={s.cardSub}>Customize how your dealership appears in the app</Text>
            <Text style={s.fieldLabel}>Dealership Name</Text>
            <Text style={[s.profileValue, { marginBottom: 12 }]}>{dealership?.name || "—"}</Text>
            <Text style={s.fieldLabel}>Logo URL</Text>
            <TextInput
              value={brandLogo}
              onChangeText={setBrandLogo}
              placeholder="https://yourdealership.com/logo.png"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              style={[s.textInput, { marginBottom: 8 }]}
            />
            <Text style={s.fieldLabel}>Primary Color</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {["#1d9a9a", "#0B5E7E", "#2563eb", "#7c3aed", "#dc2626", "#059669"].map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setBrandColor(c)}
                  style={{
                    width: 32, height: 32, borderRadius: 16, backgroundColor: c,
                    borderWidth: brandColor === c ? 3 : 0, borderColor: C.white,
                  }}
                />
              ))}
            </View>
            <TouchableOpacity
              onPress={() => updateBranding.mutate({ primaryColor: brandColor || undefined, logoUrl: brandLogo || undefined })}
              disabled={updateBranding.isLoading}
              style={s.saveUrlBtn}
            >
              <Text style={s.saveUrlBtnText}>{updateBranding.isLoading ? "Saving..." : "Save Branding"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Team */}
        {isAdmin && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Team Members</Text>
              <TouchableOpacity onPress={() => setShowInviteModal(true)} style={s.inviteBtn}>
                <Text style={s.inviteBtnText}>+ Invite</Text>
              </TouchableOpacity>
            </View>
            {teamMembers && teamMembers.length > 0 ? (
              <View style={{ gap: 8 }}>
                {teamMembers.map((member: any) => (
                  <View key={member.id} style={[s.memberRow, { opacity: member.isActive ? 1 : 0.5 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.memberName}>{member.name} {member.id === user?.id ? "(You)" : ""}</Text>
                      <Text style={s.memberEmail}>{member.email}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <View style={[s.roleBadge, { backgroundColor: (ROLE_COLORS[member.role] || C.teal) + "22" }]}>
                        <Text style={[s.roleText, { color: ROLE_COLORS[member.role] || C.teal }]}>{ROLE_LABELS[member.role]}</Text>
                      </View>
                      {member.id !== user?.id && (
                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <TouchableOpacity onPress={() => {
                            const next = member.role === "salesperson" ? "manager" : member.role === "manager" ? "admin" : "salesperson";
                            updateRole.mutate({ userId: member.id, role: next });
                          }}>
                            <Text style={s.actionLink}>Change Role</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => toggleActive.mutate({ userId: member.id })}>
                            <Text style={[s.actionLink, { color: member.isActive ? C.red : C.green }]}>
                              {member.isActive ? "Deactivate" : "Activate"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={s.emptyText}>No team members yet</Text>
            )}
            {(pendingInvites || []).filter((i: any) => i.status === "pending").length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={s.sectionLabel}>Pending Invites</Text>
                {(pendingInvites || []).filter((i: any) => i.status === "pending").map((invite: any) => (
                  <View key={invite.id} style={s.inviteRow}>
                    <View>
                      <Text style={s.inviteEmail}>{invite.email}</Text>
                      <Text style={s.inviteRole}>{ROLE_LABELS[invite.role]}</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <TouchableOpacity onPress={() => resendInvite.mutate({ id: invite.id })}>
                        <Text style={[s.actionLink, { color: C.teal }]}>Resend</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => revokeInvite.mutate({ id: invite.id })}>
                        <Text style={[s.actionLink, { color: C.red }]}>Revoke</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
            {dealership?.emailDomain && (
              <View style={s.domainNote}><Text style={s.domainText}>Auto-join domain: @{dealership.emailDomain}</Text></View>
            )}
          </View>
        )}

        {/* Inventory Sync */}
        {isAdmin && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Inventory Sync</Text>
            <Text style={s.cardSub}>Enter your dealership website to auto-import inventory</Text>
            <Text style={s.fieldLabel}>Website URL</Text>
            <TextInput
              value={websiteUrl}
              onChangeText={(t) => { setWebsiteUrl(t); setWebsiteEdited(true); }}
              placeholder="https://www.yourdealership.com"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={s.textInput}
            />
            {websiteEdited && websiteUrl.trim() !== (dealership?.websiteUrl || "") && (
              <TouchableOpacity onPress={() => { updateWebsite.mutate({ websiteUrl: websiteUrl.trim() }); setWebsiteEdited(false); }} disabled={updateWebsite.isLoading} style={s.saveUrlBtn}>
                <Text style={s.saveUrlBtnText}>{updateWebsite.isLoading ? "Saving..." : "Save URL"}</Text>
              </TouchableOpacity>
            )}
            <View style={s.syncRow}>
              <Text style={s.syncLabel}>Last synced</Text>
              <Text style={s.syncValue}>{lastSynced}</Text>
            </View>
            <TouchableOpacity onPress={handleSync} disabled={syncInventory.isLoading} style={[s.syncBtn, { opacity: syncInventory.isLoading ? 0.7 : 1 }]}>
              {syncInventory.isLoading && <ActivityIndicator size="small" color={C.white} />}
              <Text style={s.syncBtnText}>{syncInventory.isLoading ? "Syncing..." : "Sync Inventory Now"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Notifications */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Notifications</Text>
          {[{ label: "Email Notifications", key: "emailNotifications" }, { label: "In-App Notifications", key: "inAppNotifications" }].map((item) => (
            <View key={item.key} style={s.switchRow}>
              <Text style={s.switchLabel}>{item.label}</Text>
              <Switch
                value={(preferences as any)?.[item.key] ?? true}
                onValueChange={(val) => updatePreferences.mutate({ [item.key]: val })}
                trackColor={{ false: C.rule, true: C.teal }}
                thumbColor={C.white}
                disabled={!isAdmin}
              />
            </View>
          ))}
          {!isAdmin && <Text style={s.adminNote}>Only admins can change notification settings</Text>}
        </View>

        {/* App Info */}
        <View style={s.card}>
          <Text style={s.cardTitle}>App Info</Text>
          <View style={s.profileRow}>
            <Text style={s.profileLabel}>Version</Text>
            <Text style={s.profileValue}>2.0.0</Text>
          </View>
        </View>

        <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
          <Text style={s.logoutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showInviteModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Invite Team Member</Text>
            <Text style={s.fieldLabel}>Email</Text>
            <TextInput
              placeholder="colleague@email.com"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[s.textInput, { marginBottom: 14 }]}
              placeholderTextColor={C.muted}
            />
            <Text style={s.fieldLabel}>Role</Text>
            <View style={s.rolePicker}>
              {(["salesperson", "manager", "admin"] as const).map((r) => (
                <TouchableOpacity key={r} onPress={() => setInviteRole(r)} style={[s.rolePickerBtn, inviteRole === r && { backgroundColor: ROLE_COLORS[r], borderColor: ROLE_COLORS[r] }]}>
                  <Text style={[s.rolePickerText, inviteRole === r && { color: C.white }]}>{ROLE_LABELS[r]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <TouchableOpacity onPress={() => setShowInviteModal(false)} style={s.cancelBtn}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (!inviteEmail.trim()) { showError("Please enter an email"); return; } createInvite.mutate({ email: inviteEmail, role: inviteRole }); }}
                disabled={createInvite.isLoading}
                style={s.sendBtn}
              >
                <Text style={s.sendBtnText}>{createInvite.isLoading ? "Sending..." : "Send Invite"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerText: { color: C.ink, fontSize: 18 },
  screenTitle: { fontSize: 24, fontWeight: "700", color: C.ink, marginBottom: 16 },
  card: { backgroundColor: C.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.rule, marginBottom: 14 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: "600", color: C.ink, marginBottom: 12 },
  cardSub: { fontSize: 12, color: C.muted, marginBottom: 10, marginTop: -8 },
  profileRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  profileLabel: { color: C.muted, fontSize: 14 },
  profileValue: { color: C.ink, fontWeight: "500", fontSize: 14 },
  roleBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  roleText: { fontWeight: "600", fontSize: 12 },
  inviteBtn: { backgroundColor: C.teal, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  inviteBtnText: { color: C.white, fontWeight: "600", fontSize: 13 },
  memberRow: { backgroundColor: C.white, borderRadius: 8, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  memberName: { fontWeight: "600", color: C.ink, fontSize: 14 },
  memberEmail: { color: C.muted, fontSize: 12, marginTop: 2 },
  actionLink: { color: C.teal, fontSize: 11, fontWeight: "600" },
  emptyText: { color: C.muted, fontSize: 13 },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: C.muted, marginBottom: 6 },
  inviteRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  inviteEmail: { color: C.ink, fontSize: 13 },
  inviteRole: { color: C.muted, fontSize: 11, marginTop: 2 },
  domainNote: { marginTop: 10, backgroundColor: C.tealLite, borderRadius: 8, padding: 10 },
  domainText: { color: C.teal, fontSize: 12 },
  fieldLabel: { color: C.ink, fontWeight: "600", fontSize: 13, marginBottom: 6 },
  textInput: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.rule,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.ink, marginBottom: 8,
  },
  saveUrlBtn: { backgroundColor: C.teal, borderRadius: 8, paddingVertical: 9, alignItems: "center", marginBottom: 8 },
  saveUrlBtnText: { color: C.white, fontWeight: "600", fontSize: 14 },
  syncRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  syncLabel: { color: C.muted, fontSize: 13 },
  syncValue: { color: C.ink, fontSize: 13 },
  syncBtn: { backgroundColor: C.green, borderRadius: 8, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  syncBtnText: { color: C.white, fontWeight: "600", fontSize: 15 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  switchLabel: { color: C.ink, fontSize: 14 },
  adminNote: { fontSize: 11, color: C.muted, marginTop: 4 },
  logoutBtn: { backgroundColor: C.red, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginBottom: 40 },
  logoutBtnText: { color: C.white, fontWeight: "600", fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", paddingHorizontal: 24 },
  modalCard: { backgroundColor: C.white, borderRadius: 16, padding: 22 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: C.ink, marginBottom: 14 },
  rolePicker: { flexDirection: "row", gap: 8, marginBottom: 16 },
  rolePickerBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule },
  rolePickerText: { color: C.ink, fontWeight: "600", fontSize: 12 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", backgroundColor: C.surface },
  cancelBtnText: { color: C.muted, fontWeight: "600" },
  sendBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", backgroundColor: C.teal },
  sendBtnText: { color: C.white, fontWeight: "600" },
});
