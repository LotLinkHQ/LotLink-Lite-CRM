import { useState, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Linking, Platform, Alert, StyleSheet,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { C } from "@/constants/theme";

function getStatusBadge(status: string) {
  switch (status) {
    case "new":       return { bg: "#17333d", fg: "#4db8ff", label: "New" };
    case "contacted": return { bg: "#1a2d3d", fg: "#64b5f6", label: "Contacted" };
    case "working":   return { bg: C.amberLite, fg: C.amber, label: "Working" };
    case "matched":   return { bg: "#3d2817", fg: "#ff9800", label: "Matched" };
    case "sold":      return { bg: C.greenLite, fg: C.green, label: "Sold" };
    case "lost":      return { bg: C.redLite, fg: C.red, label: "Lost" };
    default:          return { bg: C.greenLite, fg: C.green, label: status };
  }
}

function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const timerRef = useRef<any>(null);

  const start = () => {
    if (Platform.OS !== "web") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { Alert.alert("Not Supported", "Use Chrome or Edge."); return; }
    setLiveTranscript(""); transcriptRef.current = ""; setElapsed(0);
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    rec.onresult = (e: any) => {
      let final = "", interim = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      transcriptRef.current = final;
      setLiveTranscript(final + interim);
    };
    rec.onerror = () => {};
    rec.onend = () => { if (recognitionRef.current) try { rec.start(); } catch (_) {} };
    rec.start();
    recognitionRef.current = rec;
    setRecording(true);
    timerRef.current = setInterval(() => {
      setElapsed(p => { if (p >= 179) { stop(); return 180; } return p + 1; });
    }, 1000);
  };

  const stop = (): string => {
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (_) {} recognitionRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    return transcriptRef.current.trim() || liveTranscript.trim();
  };

  return { recording, elapsed, liveTranscript, start, stop };
}

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const leadId = parseInt(id || "0");
  const voice = useVoiceRecorder();

  const utils = trpc.useUtils();
  const { data: lead, isLoading } = trpc.leads.getById.useQuery(
    { id: leadId },
    { enabled: leadId > 0 }
  );

  const appendVoiceMutation = trpc.leads.appendVoiceNote.useMutation({
    onSuccess: (data: any) => {
      if (data?.error) {
        Platform.OS === "web" ? window.alert(data.error) : Alert.alert("Error", data.error);
        return;
      }
      utils.leads.getById.invalidate({ id: leadId });
      const msg = data?.summary || "Voice note added!";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Updated", msg);
    },
  });

  const handleVoiceNote = () => {
    if (voice.recording) {
      const transcript = voice.stop();
      if (transcript) {
        appendVoiceMutation.mutate({ leadId, transcript });
      }
    } else {
      voice.start();
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={s.center}><ActivityIndicator size="large" color={C.teal} /></View>
      </ScreenContainer>
    );
  }

  if (!lead) {
    return (
      <ScreenContainer>
        <View style={s.center}>
          <Text style={s.emptyText}>Lead not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const prefs = (lead.preferences as Record<string, any>) || {};
  const badge = getStatusBadge(lead.status);

  const handleCall = () => {
    if (lead.customerPhone) Linking.openURL(`tel:${lead.customerPhone}`);
  };
  const handleText = () => {
    if (lead.customerPhone) Linking.openURL(`sms:${lead.customerPhone}`);
  };
  const handleEmail = () => {
    if (lead.customerEmail) Linking.openURL(`mailto:${lead.customerEmail}`);
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={s.backRow}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Leads</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={s.headerCard}>
          <View style={s.avatarBig}>
            <Text style={s.avatarBigText}>
              {lead.customerName.trim().split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()}
            </Text>
          </View>
          <Text style={s.leadName}>{lead.customerName}</Text>
          {lead.salespersonName && (
            <Text style={s.leadSub}>Assigned to {lead.salespersonName}</Text>
          )}
          <View style={[s.badge, { backgroundColor: badge.bg }]}>
            <Text style={[s.badgeText, { color: badge.fg }]}>{badge.label}</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={s.actionsRow}>
          {lead.customerPhone && (
            <>
              <TouchableOpacity style={s.actionBtn} onPress={handleCall}>
                <Text style={s.actionIcon}>📞</Text>
                <Text style={s.actionLabel}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} onPress={handleText}>
                <Text style={s.actionIcon}>💬</Text>
                <Text style={s.actionLabel}>Text</Text>
              </TouchableOpacity>
            </>
          )}
          {lead.customerEmail && (
            <TouchableOpacity style={s.actionBtn} onPress={handleEmail}>
              <Text style={s.actionIcon}>📧</Text>
              <Text style={s.actionLabel}>Email</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Voice Note */}
        <TouchableOpacity
          style={[s.voiceNoteBtn, voice.recording && s.voiceNoteBtnActive]}
          onPress={handleVoiceNote}
          disabled={appendVoiceMutation.isPending}
        >
          <Text style={s.voiceNoteIcon}>{voice.recording ? "⏹" : appendVoiceMutation.isPending ? "⏳" : "🎙"}</Text>
          <Text style={[s.voiceNoteText, voice.recording && { color: C.red }]}>
            {voice.recording
              ? `Stop (${Math.floor(voice.elapsed / 60)}:${(voice.elapsed % 60).toString().padStart(2, "0")})`
              : appendVoiceMutation.isPending
              ? "AI Processing..."
              : "Add Voice Note"}
          </Text>
        </TouchableOpacity>
        {voice.recording && voice.liveTranscript ? (
          <View style={s.liveTranscript}>
            <Text style={s.liveTranscriptLabel}>LIVE TRANSCRIPT</Text>
            <Text style={s.liveTranscriptText} numberOfLines={3}>{voice.liveTranscript}</Text>
          </View>
        ) : null}

        {/* Contact Info */}
        <Text style={s.section}>Contact Info</Text>
        <View style={s.infoCard}>
          {lead.customerPhone && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Phone</Text>
              <Text style={s.infoValue}>{lead.customerPhone}</Text>
            </View>
          )}
          {lead.customerEmail && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Email</Text>
              <Text style={s.infoValue}>{lead.customerEmail}</Text>
            </View>
          )}
          {lead.storeLocation && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Store</Text>
              <Text style={s.infoValue}>{lead.storeLocation}</Text>
            </View>
          )}
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Created</Text>
            <Text style={s.infoValue}>{new Date(lead.createdAt).toLocaleDateString()}</Text>
          </View>
        </View>

        {/* RV Preferences */}
        <Text style={s.section}>RV Preferences</Text>
        <View style={s.infoCard}>
          {lead.preferredModel && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Model</Text>
              <Text style={s.infoValue}>{lead.preferredModel}</Text>
            </View>
          )}
          {lead.preferredYear && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Year</Text>
              <Text style={s.infoValue}>{lead.preferredYear}</Text>
            </View>
          )}
          {prefs.make && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Make</Text>
              <Text style={s.infoValue}>{prefs.make}</Text>
            </View>
          )}
          {prefs.bedType && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Bed Type</Text>
              <Text style={s.infoValue}>{prefs.bedType}</Text>
            </View>
          )}
          {prefs.minLength && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Min Length</Text>
              <Text style={s.infoValue}>{prefs.minLength} ft</Text>
            </View>
          )}
          {prefs.maxPrice && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Budget</Text>
              <Text style={[s.infoValue, { color: C.green }]}>${Number(prefs.maxPrice).toLocaleString()}</Text>
            </View>
          )}
          {prefs.downPayment && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Down Payment</Text>
              <Text style={s.infoValue}>${Number(prefs.downPayment).toLocaleString()}</Text>
            </View>
          )}
          {prefs.monthlyBudget && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Monthly</Text>
              <Text style={s.infoValue}>${Number(prefs.monthlyBudget).toLocaleString()}/mo</Text>
            </View>
          )}
        </View>

        {/* Notes */}
        {lead.notes && (
          <>
            <Text style={s.section}>Notes</Text>
            <View style={s.infoCard}>
              <Text style={s.notesText}>{lead.notes}</Text>
            </View>
          </>
        )}

        {/* Match History */}
        <MatchHistory leadId={leadId} />

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

function MatchHistory({ leadId }: { leadId: number }) {
  const { data: matches, isLoading } = trpc.matches.getByLeadId.useQuery(
    { leadId },
    { enabled: leadId > 0 }
  );

  if (isLoading) return <ActivityIndicator color={C.teal} style={{ marginTop: 20 }} />;
  if (!matches || matches.length === 0) return null;

  return (
    <>
      <Text style={s.section}>Match History</Text>
      {matches.map((m: any) => {
        const scoreColor = m.matchScore >= 80 ? C.green : m.matchScore >= 50 ? C.amber : C.muted;
        return (
          <View key={m.id} style={s.matchCard}>
            <View style={s.matchTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.matchUnit}>
                  {m.inventoryYear} {m.inventoryMake} {m.inventoryModel}
                </Text>
                <Text style={s.matchSub}>{m.status} · {new Date(m.createdAt).toLocaleDateString()}</Text>
              </View>
              <View style={[s.scoreBadge, { borderColor: scoreColor }]}>
                <Text style={[s.scoreText, { color: scoreColor }]}>{m.matchScore}%</Text>
              </View>
            </View>
            {m.matchReasons && (
              <Text style={s.matchReasons}>
                {(Array.isArray(m.matchReasons) ? m.matchReasons : []).join(" · ")}
              </Text>
            )}
          </View>
        );
      })}
    </>
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
  avatarBig:    { width: 64, height: 64, borderRadius: 32, backgroundColor: C.tealDark, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  avatarBigText:{ fontSize: 22, fontWeight: "800", color: C.mint },
  leadName:     { fontSize: 22, fontWeight: "800", color: C.ink, textAlign: "center" },
  leadSub:      { fontSize: 13, color: C.muted, marginTop: 4 },
  badge:        { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8 },
  badgeText:    { fontSize: 12, fontWeight: "700" },

  actionsRow:   { flexDirection: "row", justifyContent: "center", gap: 16, marginBottom: 20 },
  actionBtn:    { alignItems: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, minWidth: 72 },
  actionIcon:   { fontSize: 20, marginBottom: 4 },
  actionLabel:  { fontSize: 11, fontWeight: "700", color: C.ink },

  section:      { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, color: C.muted, marginTop: 20, marginBottom: 8 },
  infoCard:     { backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 12, padding: 14 },
  infoRow:      { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.rule },
  infoLabel:    { fontSize: 13, color: C.muted, fontWeight: "600" },
  infoValue:    { fontSize: 13, color: C.ink, fontWeight: "700", textAlign: "right", flexShrink: 1, maxWidth: "60%" },
  notesText:    { fontSize: 14, color: C.ink, lineHeight: 20 },

  matchCard:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 12, padding: 14, marginBottom: 8 },
  matchTop:     { flexDirection: "row", alignItems: "center" },
  matchUnit:    { fontSize: 14, fontWeight: "700", color: C.ink },
  matchSub:     { fontSize: 11, color: C.muted, marginTop: 2, textTransform: "capitalize" },
  scoreBadge:   { borderWidth: 2, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  scoreText:    { fontSize: 14, fontWeight: "800" },
  matchReasons: { fontSize: 11, color: C.muted, marginTop: 8 },
  voiceNoteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 12,
    paddingVertical: 14, marginBottom: 8,
  },
  voiceNoteBtnActive: { backgroundColor: "#2d1215", borderColor: "rgba(242,92,58,0.3)" },
  voiceNoteIcon: { fontSize: 20 },
  voiceNoteText: { fontSize: 14, fontWeight: "700", color: C.teal },
  liveTranscript: { backgroundColor: C.surface, borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.rule },
  liveTranscriptLabel: { fontSize: 9, fontWeight: "700", color: C.muted, letterSpacing: 0.5, marginBottom: 4 },
  liveTranscriptText: { fontSize: 12, color: C.ink, lineHeight: 18 },
});
