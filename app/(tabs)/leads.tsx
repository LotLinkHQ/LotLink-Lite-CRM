import { useState, useRef } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform, Modal, ScrollView, StyleSheet,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { router as navRouter } from "expo-router";
import { C } from "@/constants/theme";

// ── Quick-add tile data ──────────────────────────────────────────────
const QUICK_TEMPLATES = [
  { label: "Class A",        emoji: "🚌", type: "features" as const, note: "Looking for a Class A motorhome" },
  { label: "Class C",        emoji: "🚐", type: "features" as const, note: "Looking for a Class C motorhome" },
  { label: "5th Wheel",      emoji: "🏕️", type: "features" as const, note: "Looking for a 5th wheel" },
  { label: "Travel Trailer", emoji: "🏠", type: "features" as const, note: "Looking for a travel trailer" },
  { label: "Specific Model", emoji: "🎯", type: "model"    as const, note: "" },
  { label: "Custom Lead",    emoji: "✏️", type: "features" as const, note: "" },
];

const EMPTY_LEAD = {
  customerName:     "",
  customerEmail:    "",
  customerPhone:    "",
  preferenceType:   "model" as "model" | "features",
  preferredModel:   "",
  preferredYear:    "",
  maxPrice:         "",
  downPayment:      "",
  monthlyBudget:    "",
  preferredMake:    "",
  preferredBedType: "",
  minLength:        "",
  notes:            "",
  _newStatus:       "" as string,
};

function getInitials(name: string) {
  return name.trim().split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() || "?";
}

const LEAD_STATUSES = ["new", "contacted", "working", "matched", "sold", "lost"] as const;

function getStatusBadge(status: string) {
  switch (status) {
    case "new":       return { bg: "#17333d", fg: "#4db8ff", label: "New" };
    case "contacted": return { bg: "#1a2d3d", fg: "#64b5f6", label: "Contacted" };
    case "working":   return { bg: C.amberLite, fg: C.amber,  label: "Working" };
    case "matched":   return { bg: "#3d2817",  fg: "#ff9800", label: "Matched" };
    case "sold":      return { bg: C.greenLite, fg: C.green,  label: "Sold" };
    case "lost":      return { bg: C.redLite,   fg: C.red,    label: "Lost" };
    case "inactive":  return { bg: C.redLite,   fg: C.red,    label: "Closed" };
    default:          return { bg: C.greenLite, fg: C.green,  label: "Active" };
  }
}

// ── Lead card ────────────────────────────────────────────────────────
function LeadCard({ item, onDelete, onEdit, onPress }: { item: any; onDelete: () => void; onEdit: () => void; onPress: () => void }) {
  const badge = getStatusBadge(item.status);
  const initials = getInitials(item.customerName);
  const prefs = (item.preferences as any) || {};
  const cashBudget = prefs.maxPrice;
  const down = prefs.downPayment;
  const monthly = prefs.monthlyBudget;
  const subtitle =
    item.preferenceType === "model"
      ? `${item.preferredYear || ""} ${(prefs.make || "")} ${item.preferredModel || ""}`.trim() || "Model search"
      : "Feature-based search";

  return (
    <TouchableOpacity style={s.leadCard} onPress={onPress} activeOpacity={0.7}>
      <View style={s.leadCardTop}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.leadName} numberOfLines={1}>{item.customerName}</Text>
          <Text style={s.leadMeta} numberOfLines={1}>{subtitle}</Text>
          {item.salespersonName ? (
            <Text style={s.leadSalesPerson}>via {item.salespersonName}</Text>
          ) : null}
        </View>
        <View style={[s.tempBadge, { backgroundColor: badge.bg }]}>
          <Text style={[s.tempBadgeText, { color: badge.fg }]}>{badge.label}</Text>
        </View>
      </View>
      <View style={s.contactRow}>
        {item.customerPhone ? (
          <Text style={s.contactChip}>📱 {item.customerPhone}</Text>
        ) : null}
        {cashBudget ? (
          <Text style={s.budgetChip}>💰 ${parseFloat(cashBudget).toLocaleString()}</Text>
        ) : null}
        {down ? (
          <Text style={s.financeChip}>⬇ ${parseFloat(down).toLocaleString()} down</Text>
        ) : null}
        {monthly ? (
          <Text style={s.financeChip}>📅 ${parseFloat(monthly).toLocaleString()}/mo</Text>
        ) : null}
      </View>
      <View style={s.cardActions}>
        <TouchableOpacity style={s.editBtn} onPress={onEdit}>
          <Text style={s.editBtnText}>Edit / Update</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.deleteBtn} onPress={onDelete}>
          <Text style={s.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ── Form field ───────────────────────────────────────────────────────
function FormField({
  label, value, onChange, placeholder, numeric, multiline
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  placeholder?: string; numeric?: boolean; multiline?: boolean;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        keyboardType={numeric ? "numeric" : "default"}
        multiline={multiline}
        style={[s.fieldInput, multiline && { minHeight: 80, paddingTop: 10, textAlignVertical: "top" }]}
      />
    </View>
  );
}

// ── CSV parser (handles quoted fields with commas) ───────────────────
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

// ── Voice note (web-only MediaRecorder) ──────────────────────────────
function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const timerRef = useRef<any>(null);

  const start = () => {
    if (Platform.OS !== "web") { Alert.alert("Web Only", "Voice requires a web browser."); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { Alert.alert("Not Supported", "Use Chrome or Edge for voice recording."); return; }

    setLiveTranscript("");
    transcriptRef.current = "";
    setElapsed(0);

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

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

  return { recording, transcribing, elapsed, liveTranscript, start, stop };
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════
export default function LeadsScreen() {
  const { isAuthenticated } = useDealershipAuth();
  const [searchQuery, setSearchQuery]   = useState("");
  const [refreshing, setRefreshing]     = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLead, setEditingLead]   = useState<any>(null);
  const [newLead, setNewLead]           = useState(EMPTY_LEAD);
  const [csvStatus, setCsvStatus]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const voice = useVoiceRecorder();

  const utils = trpc.useUtils();

  const {
    data: leadsData, isLoading, refetch,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = trpc.leads.list.useInfiniteQuery(
    { limit: 25, status: statusFilter || undefined },
    { enabled: isAuthenticated, getNextPageParam: (p) => p.nextCursor }
  );

  const leads = leadsData?.pages.flatMap((p) => p.items) || [];

  const [addAnother, setAddAnother] = useState(false);
  const createMutation = trpc.leads.create.useMutation({
    onSuccess: () => {
      utils.leads.list.invalidate();
      if (addAnother) {
        setNewLead(EMPTY_LEAD);
        setAddAnother(false);
        const msg = "Lead saved! Add another.";
        Platform.OS === "web" ? window.alert(msg) : Alert.alert("Saved", msg);
      } else {
        closeModal();
      }
    },
  });
  const updateMutation = trpc.leads.update.useMutation({
    onSuccess: () => { utils.leads.list.invalidate(); closeModal(); },
  });
  const deleteMutation = trpc.leads.delete.useMutation({
    onSuccess: () => utils.leads.list.invalidate(),
  });
  const extractMutation = trpc.leads.extractFromPhoto.useMutation({
    onSuccess: (data) => {
      if (data.error) {
        const msg = data.error;
        Platform.OS === "web" ? window.alert(msg) : Alert.alert("Extraction Error", msg);
        return;
      }
      const d = data.data;
      setNewLead(prev => ({
        ...prev,
        customerName:     d.customerName || prev.customerName,
        customerPhone:    d.customerPhone || prev.customerPhone,
        customerEmail:    d.customerEmail || prev.customerEmail,
        preferredMake:    d.preferredMake || prev.preferredMake,
        preferredModel:   d.preferredModel || prev.preferredModel,
        preferredYear:    d.preferredYear || prev.preferredYear,
        preferredBedType: d.bedType || prev.preferredBedType,
        minLength:        d.minLength || prev.minLength,
        maxPrice:         d.budget || prev.maxPrice,
        notes:            d.notes ? (prev.notes ? prev.notes + "\n" + d.notes : d.notes) : prev.notes,
        preferenceType:   d.preferredModel ? "model" : (d.rvType ? "features" : prev.preferenceType),
      }));
    },
    onError: (e) => {
      const msg = `Photo extraction failed: ${e.message}`;
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
    },
  });
  const voiceExtractMutation = trpc.leads.extractFromVoice.useMutation({
    onSuccess: (data) => {
      if (data.error) {
        Platform.OS === "web" ? window.alert(data.error) : Alert.alert("Error", data.error);
        return;
      }
      const d = data.data;
      setNewLead(prev => ({
        ...prev,
        customerName:     d.customerName || prev.customerName,
        customerPhone:    d.customerPhone || prev.customerPhone,
        customerEmail:    d.customerEmail || prev.customerEmail,
        preferredMake:    d.preferredMake || prev.preferredMake,
        preferredModel:   d.preferredModel || prev.preferredModel,
        preferredYear:    d.preferredYear || prev.preferredYear,
        preferredBedType: d.bedType || prev.preferredBedType,
        minLength:        d.minLength || prev.minLength,
        maxPrice:         d.budget || prev.maxPrice,
        notes:            d.notes ? (prev.notes ? prev.notes + "\n" + d.notes : d.notes) : prev.notes,
        preferenceType:   d.preferredModel ? "model" : (d.rvType ? "features" : prev.preferenceType),
      }));
      const msg = "Voice note processed! Review the extracted fields.";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Extracted", msg);
    },
    onError: (e) => {
      Platform.OS === "web" ? window.alert(e.message) : Alert.alert("Error", e.message);
    },
  });
  const importCsvMutation = trpc.leads.importCsv.useMutation({
    onSuccess: (data) => {
      utils.leads.list.invalidate();
      const parts = [`${data.imported} imported`];
      if (data.skipped) parts.push(`${data.skipped} duplicates skipped`);
      if (data.failed) parts.push(`${data.failed} errors`);
      setCsvStatus(parts.join(", "));
      setTimeout(() => setCsvStatus(null), 4000);
    },
    onError: (e) => { setCsvStatus(`Error: ${e.message}`); setTimeout(() => setCsvStatus(null), 4000); },
  });

  const closeModal = () => { setShowAddModal(false); setEditingLead(null); setNewLead(EMPTY_LEAD); };
  const setField  = (key: keyof typeof EMPTY_LEAD) => (val: string) =>
    setNewLead(prev => ({ ...prev, [key]: val }));

  const handleRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  const handleLoadMore = () => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); };

  const handleDeleteLead = (id: number, name: string) => {
    const doDelete = () => deleteMutation.mutate({ id });
    if (Platform.OS === "web") {
      if (window.confirm(`Delete ${name}?`)) doDelete();
    } else {
      Alert.alert("Delete Lead", `Delete ${name}?`, [
        { text: "Cancel" },
        { text: "Delete", onPress: doDelete, style: "destructive" },
      ]);
    }
  };

  const openEdit = (lead: any) => {
    const prefs = (lead.preferences as any) || {};
    setNewLead({
      customerName:     lead.customerName || "",
      customerEmail:    lead.customerEmail || "",
      customerPhone:    lead.customerPhone || "",
      preferenceType:   lead.preferenceType || "model",
      preferredModel:   lead.preferredModel || "",
      preferredYear:    lead.preferredYear ? String(lead.preferredYear) : "",
      maxPrice:         prefs.maxPrice || "",
      downPayment:      prefs.downPayment || "",
      monthlyBudget:    prefs.monthlyBudget || "",
      preferredMake:    prefs.make || "",
      preferredBedType: prefs.bedType || "",
      minLength:        prefs.minLength || "",
      notes:            lead.notes || "",
      _newStatus:       "",
    });
    setEditingLead(lead);
    setShowAddModal(true);
  };

  const openTemplate = (t: typeof QUICK_TEMPLATES[number]) => {
    setNewLead({ ...EMPTY_LEAD, preferenceType: t.type, notes: t.note });
    setEditingLead(null);
    setShowAddModal(true);
  };

  const handlePhotoCapture = () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.capture = "environment";
      input.onchange = async (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          const mediaType = file.type === "image/png" ? "image/png" as const
            : file.type === "image/webp" ? "image/webp" as const
            : "image/jpeg" as const;
          extractMutation.mutate({ imageBase64: base64, mediaType });
        };
        reader.readAsDataURL(file);
      };
      input.click();
    } else {
      Alert.alert("Coming Soon", "Photo capture on mobile is coming in a future update. Use the web version for now.");
    }
  };

  const handleSaveAndAnother = () => { setAddAnother(true); handleSave(true); };
  const handleSave = (keepOpen?: boolean) => {
    if (keepOpen) setAddAnother(true);
    if (!newLead.customerName.trim()) {
      if (Platform.OS === "web") window.alert("Please enter customer name");
      else Alert.alert("Error", "Please enter customer name");
      return;
    }
    const preferences: Record<string, any> = {};
    if (newLead.maxPrice)        preferences.maxPrice      = newLead.maxPrice;
    if (newLead.downPayment)     preferences.downPayment   = newLead.downPayment;
    if (newLead.monthlyBudget)   preferences.monthlyBudget = newLead.monthlyBudget;
    if (newLead.preferredMake)   preferences.make          = newLead.preferredMake;
    if (newLead.preferredBedType)preferences.bedType       = newLead.preferredBedType;
    if (newLead.minLength)       preferences.minLength     = newLead.minLength;

    if (editingLead) {
      updateMutation.mutate({
        id: editingLead.id,
        customerName:    newLead.customerName,
        customerEmail:   newLead.customerEmail   || null,
        customerPhone:   newLead.customerPhone   || null,
        preferences:     Object.keys(preferences).length ? preferences : null,
        notes:           newLead.notes           || null,
        ...(newLead._newStatus && newLead._newStatus !== editingLead.status
          ? { status: newLead._newStatus as any }
          : {}),
      });
    } else {
      createMutation.mutate({
        customerName:    newLead.customerName,
        customerEmail:   newLead.customerEmail   || null,
        customerPhone:   newLead.customerPhone   || null,
        preferenceType:  newLead.preferenceType,
        preferredModel:  newLead.preferredModel  || null,
        preferredYear:   newLead.preferredYear   ? parseInt(newLead.preferredYear) : null,
        preferences:     Object.keys(preferences).length ? preferences : null,
        notes:           newLead.notes           || null,
      });
    }
  };

  const handleVoiceNote = () => {
    if (voice.recording) {
      const transcript = voice.stop();
      if (transcript) {
        // Send to AI for structured extraction
        voiceExtractMutation.mutate({ transcript });
      }
    } else {
      voice.start();
    }
  };

  const handleCsvImport = () => {
    if (Platform.OS !== "web") {
      Alert.alert("Web Only", "CSV import is only available in the web browser.");
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
      if (!rows.length) { setCsvStatus("No valid rows found. Check file format."); setTimeout(() => setCsvStatus(null), 4000); return; }
      const mapped = rows.map(row => ({
        customerName:   row.customername || row.customer_name || row.name || "",
        customerPhone:  row.phone || row.customerphone || row.customer_phone || null,
        customerEmail:  row.email || row.customeremail || row.customer_email || null,
        preferredMake:  row.make || row.preferredmake || row.preferred_make || null,
        preferredModel: row.model || row.preferredmodel || row.preferred_model || null,
        preferredYear:  row.year || row.preferredyear ? parseInt(row.year || row.preferredyear || "") || null : null,
        maxPrice:       row.maxprice || row.max_price || row.budget || row.price || null,
        notes:          row.notes || row.note || null,
      })).filter(r => r.customerName.trim().length > 0);
      if (!mapped.length) { setCsvStatus("No rows with customer names found."); setTimeout(() => setCsvStatus(null), 4000); return; }
      setCsvStatus(`Importing ${mapped.length} leads...`);
      importCsvMutation.mutate({ rows: mapped as any });
    };
    input.click();
  };

  const filtered = leads.filter(l => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return l.customerName.toLowerCase().includes(q) ||
      (l.customerPhone || "").toLowerCase().includes(q) ||
      (l.customerEmail || "").toLowerCase().includes(q);
  });

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View style={s.centerBox}>
          <Text style={s.gateText}>Please log in to continue</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={C.teal} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerInner}>
          <View style={s.headerLogo}>
            <Text style={s.headerLogoText}>LL</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerEyebrow}>LotLink CRM</Text>
            <Text style={s.headerTitle}>Leads <Text style={s.headerMint}>Pipeline</Text></Text>
          </View>
          <TouchableOpacity style={s.addFab} onPress={() => { setEditingLead(null); setNewLead(EMPTY_LEAD); setShowAddModal(true); }}>
            <Text style={s.addFabText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Templates */}
      <View style={s.sectionLabel}>
        <Text style={s.sectionLabelText}>Quick Add</Text>
      </View>
      <View style={s.templateGrid}>
        {QUICK_TEMPLATES.map(t => (
          <TouchableOpacity key={t.label} style={s.templateTile} onPress={() => openTemplate(t)}>
            <Text style={s.templateEmoji}>{t.emoji}</Text>
            <Text style={s.templateLabel}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* CSV Import */}
      <View style={s.csvRow}>
        <TouchableOpacity onPress={handleCsvImport} disabled={importCsvMutation.isLoading} style={s.csvBtn}>
          {importCsvMutation.isLoading
            ? <ActivityIndicator size="small" color={C.teal} />
            : <Text style={s.csvBtnText}>Import Leads from CSV</Text>
          }
        </TouchableOpacity>
        {csvStatus && <Text style={[s.csvStatus, { color: csvStatus.startsWith("Imported") ? C.green : csvStatus.startsWith("Error") ? C.red : C.muted }]}>{csvStatus}</Text>}
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          placeholder="Search leads..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={s.searchInput}
          placeholderTextColor={C.muted}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Text style={{ color: C.muted, fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Status Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
        <TouchableOpacity
          style={[s.filterChip, !statusFilter && s.filterChipActive]}
          onPress={() => setStatusFilter(null)}
        >
          <Text style={[s.filterChipText, !statusFilter && s.filterChipTextActive]}>All</Text>
        </TouchableOpacity>
        {LEAD_STATUSES.map(st => {
          const badge = getStatusBadge(st);
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

      {/* Count */}
      <View style={s.sectionLabel}>
        <Text style={s.sectionLabelText}>
          {filtered.length} Lead{filtered.length !== 1 ? "s" : ""}
          {hasNextPage ? " (scroll for more)" : ""}
        </Text>
      </View>

      {/* List */}
      {filtered.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>🚐</Text>
          <Text style={s.emptyTitle}>
            {searchQuery ? "No leads match that search" : "No leads yet"}
          </Text>
          <Text style={s.emptySubtitle}>
            {searchQuery ? "Try a different name" : "Tap a tile above or use + to add your first lead"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id.toString()}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <LeadCard
              item={item}
              onPress={() => navRouter.push(`/lead/${item.id}` as any)}
              onEdit={() => openEdit(item)}
              onDelete={() => handleDeleteLead(item.id, item.customerName)}
            />
          )}
          ListFooterComponent={() => (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              {isFetchingNextPage ? (
                <ActivityIndicator color={C.teal} />
              ) : hasNextPage ? (
                <TouchableOpacity
                  onPress={() => fetchNextPage()}
                  style={{ backgroundColor: C.teal, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 }}
                >
                  <Text style={{ color: C.white, fontWeight: "700" }}>Load More Leads</Text>
                </TouchableOpacity>
              ) : leads.length > 20 ? (
                <Text style={{ color: C.muted, fontSize: 13 }}>All {leads.length} leads loaded</Text>
              ) : null}
            </View>
          )}
        />
      )}

      {/* ── Add / Edit Lead Modal ─────────────────────────────────── */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalEyebrow}>LotLink CRM</Text>
                <Text style={s.modalTitle}>{editingLead ? "Edit" : "Add"} <Text style={{ color: C.mint }}>Lead</Text></Text>
              </View>
              <TouchableOpacity style={s.modalClose} onPress={closeModal}>
                <Text style={{ color: C.white, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
            >
              {!editingLead && (
                <TouchableOpacity
                  style={[s.scanBtn, extractMutation.isLoading && { opacity: 0.6 }]}
                  onPress={handlePhotoCapture}
                  disabled={extractMutation.isLoading}
                >
                  {extractMutation.isLoading
                    ? <><ActivityIndicator size="small" color={C.teal} /><Text style={s.scanBtnText}>Extracting info...</Text></>
                    : <><Text style={{ fontSize: 20 }}>📸</Text><Text style={s.scanBtnText}>Scan Notes / Business Card</Text></>
                  }
                </TouchableOpacity>
              )}

              <Text style={s.formSection}>Contact Info</Text>
              <FormField label="Full Name *"   value={newLead.customerName}  onChange={setField("customerName")}  placeholder="e.g. Dave Kowalski" />
              <FormField label="Phone"         value={newLead.customerPhone} onChange={setField("customerPhone")} placeholder="(360) 555-0100" />
              <FormField label="Email"         value={newLead.customerEmail} onChange={setField("customerEmail")} placeholder="dave@email.com" />

              <Text style={s.formSection}>RV Preferences</Text>
              <FormField label="Preferred Make"  value={newLead.preferredMake}    onChange={setField("preferredMake")}    placeholder="e.g. Tiffin, Winnebago, Thor" />
              <FormField label="Preferred Model" value={newLead.preferredModel}   onChange={setField("preferredModel")}   placeholder="e.g. Allegro Bus 45OPP" />
              <FormField label="Preferred Year"  value={newLead.preferredYear}    onChange={setField("preferredYear")}    placeholder="e.g. 2025" numeric />
              <FormField label="Min Length (ft)" value={newLead.minLength}        onChange={setField("minLength")}        placeholder="e.g. 32" numeric />
              <FormField label="Bed Type"        value={newLead.preferredBedType} onChange={setField("preferredBedType")} placeholder="e.g. King, Queen" />

              <Text style={s.formSection}>Budget</Text>
              <FormField label="Cash Budget ($)" value={newLead.maxPrice} onChange={setField("maxPrice")} placeholder="e.g. 120000" numeric />

              <Text style={s.formSection}>Finance</Text>
              <View style={s.financeRow}>
                <View style={s.financeHalf}>
                  <Text style={s.fieldLabel}>Down Payment ($)</Text>
                  <TextInput
                    value={newLead.downPayment}
                    onChangeText={setField("downPayment")}
                    placeholder="e.g. 20000"
                    placeholderTextColor={C.muted}
                    keyboardType="numeric"
                    style={s.fieldInput}
                  />
                </View>
                <View style={s.financeHalf}>
                  <Text style={s.fieldLabel}>Monthly Budget ($)</Text>
                  <TextInput
                    value={newLead.monthlyBudget}
                    onChangeText={setField("monthlyBudget")}
                    placeholder="e.g. 1500"
                    placeholderTextColor={C.muted}
                    keyboardType="numeric"
                    style={s.fieldInput}
                  />
                </View>
              </View>

              <Text style={s.formSection}>Notes</Text>
              <FormField
                label="Salesperson Notes"
                value={newLead.notes}
                onChange={setField("notes")}
                placeholder="Any must-haves, concerns, or details..."
                multiline
              />

              <TouchableOpacity
                style={[s.voiceBtn, voice.recording && s.voiceBtnActive]}
                onPress={handleVoiceNote}
                disabled={voiceExtractMutation.isPending}
              >
                <Text style={s.voiceBtnIcon}>{voice.recording ? "⏹" : voiceExtractMutation.isPending ? "⏳" : "🎙"}</Text>
                <Text style={[s.voiceBtnText, voice.recording && { color: C.red }]}>
                  {voice.recording
                    ? `Stop Recording (${Math.floor(voice.elapsed / 60)}:${(voice.elapsed % 60).toString().padStart(2, "0")})`
                    : voiceExtractMutation.isPending
                    ? "AI Extracting..."
                    : "Voice-to-Lead"}
                </Text>
              </TouchableOpacity>
              {voice.recording && voice.liveTranscript ? (
                <View style={s.liveTranscript}>
                  <Text style={s.liveTranscriptLabel}>LIVE TRANSCRIPT</Text>
                  <Text style={s.liveTranscriptText} numberOfLines={3}>{voice.liveTranscript}</Text>
                </View>
              ) : null}

              {editingLead && (
                <>
                  <Text style={s.formSection}>Status</Text>
                  <View style={s.statusRow}>
                    {LEAD_STATUSES.map(st => {
                      const badge = getStatusBadge(st);
                      const active = (editingLead.status === st && !newLead._newStatus) || newLead._newStatus === st;
                      return (
                        <TouchableOpacity
                          key={st}
                          style={[s.statusPill, active && { backgroundColor: badge.bg, borderColor: badge.fg }]}
                          onPress={() => setNewLead(prev => ({ ...prev, _newStatus: st }))}
                        >
                          <Text style={[s.statusPillText, active && { color: badge.fg }]}>{badge.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <View style={s.modalActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeModal}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, (createMutation.isLoading || updateMutation.isLoading) && { opacity: 0.6 }]}
                  onPress={() => handleSave()}
                  disabled={createMutation.isLoading || updateMutation.isLoading}
                >
                  {(createMutation.isLoading || updateMutation.isLoading)
                    ? <ActivityIndicator color={C.white} />
                    : <Text style={s.saveBtnText}>{editingLead ? "Update Lead" : "Save Lead + Match"}</Text>
                  }
                </TouchableOpacity>
              </View>
              {!editingLead && (
                <TouchableOpacity
                  style={[s.addAnotherBtn, createMutation.isLoading && { opacity: 0.6 }]}
                  onPress={handleSaveAndAnother}
                  disabled={createMutation.isLoading}
                >
                  <Text style={s.addAnotherBtnText}>Save + Add Another</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  centerBox:       { flex: 1, alignItems: "center", justifyContent: "center" },
  gateText:        { color: C.muted, fontSize: 16, fontWeight: "600" },

  header:          { backgroundColor: C.tealDeep, marginHorizontal: -16, marginTop: -16, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 22 },
  headerInner:     { flexDirection: "row", alignItems: "center", gap: 12 },
  headerLogo:      { width: 36, height: 36, borderRadius: 10, backgroundColor: C.mint, alignItems: "center", justifyContent: "center" },
  headerLogoText:  { fontSize: 13, fontWeight: "800", color: C.tealDeep, letterSpacing: -0.5 },
  headerEyebrow:   { fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 1 },
  headerTitle:     { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  headerMint:      { color: C.mint },
  addFab:          { width: 36, height: 36, borderRadius: 10, backgroundColor: C.mint, alignItems: "center", justifyContent: "center" },
  addFabText:      { fontSize: 22, fontWeight: "800", color: C.tealDeep, marginTop: -1 },

  sectionLabel:    { paddingHorizontal: 0, marginTop: 14, marginBottom: 6 },
  sectionLabelText:{ fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, color: C.muted },

  templateGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 2 },
  templateTile:    { width: "31%", flexGrow: 1, flexBasis: "30%", backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 8, alignItems: "center" },
  templateEmoji:   { fontSize: 24, marginBottom: 4 },
  templateLabel:   { fontSize: 11, fontWeight: "700", color: C.ink, textAlign: "center" },

  searchWrap:      { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 12, marginTop: 12, marginBottom: 2, paddingHorizontal: 12, height: 44 },
  searchIcon:      { fontSize: 15, marginRight: 6 },
  searchInput:     { flex: 1, fontSize: 14, fontWeight: "600", color: C.ink },

  leadCard:        { backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 14, padding: 14, marginBottom: 8 },
  leadCardTop:     { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  avatar:          { width: 40, height: 40, borderRadius: 20, backgroundColor: C.tealDark, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText:      { fontSize: 14, fontWeight: "800", color: C.mint },
  leadName:        { fontSize: 15, fontWeight: "800", color: C.ink, letterSpacing: -0.2 },
  leadMeta:        { fontSize: 11, color: C.muted, marginTop: 1 },
  leadSalesPerson: { fontSize: 10, color: C.muted, marginTop: 1 },
  tempBadge:       { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  tempBadgeText:   { fontSize: 11, fontWeight: "700" },
  contactRow:      { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  contactChip:     { fontSize: 11, fontWeight: "600", color: C.muted, backgroundColor: C.surfaceLit, borderWidth: 1, borderColor: C.rule, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  budgetChip:      { fontSize: 11, fontWeight: "700", color: C.green, backgroundColor: C.greenLite, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  financeChip:     { fontSize: 11, fontWeight: "700", color: C.amber, backgroundColor: C.amberLite, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  cardActions:     { flexDirection: "row", gap: 8 },
  editBtn:         { flex: 1, backgroundColor: C.surfaceLit, borderWidth: 1, borderColor: C.rule, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  editBtnText:     { fontSize: 12, fontWeight: "700", color: C.tealLite },
  deleteBtn:       { backgroundColor: C.redLite, borderWidth: 1, borderColor: "rgba(242,92,58,0.2)", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, alignItems: "center" },
  deleteBtnText:   { fontSize: 12, fontWeight: "700", color: C.red },

  csvRow:          { marginTop: 10, marginBottom: 4 },
  csvBtn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderStyle: "dashed", borderRadius: 10, paddingVertical: 10 },
  csvBtnText:      { fontSize: 13, fontWeight: "700", color: C.teal },
  csvStatus:       { fontSize: 12, fontWeight: "600", textAlign: "center", marginTop: 6 },

  filterRow:       { marginTop: 10, marginBottom: 2, maxHeight: 36 },
  filterChip:      { borderWidth: 1, borderColor: C.rule, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.surface },
  filterChipActive:{ backgroundColor: C.tealDark, borderColor: C.teal },
  filterChipText:  { fontSize: 11, fontWeight: "700", color: C.muted },
  filterChipTextActive: { color: C.mint },

  statusRow:       { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  statusPill:      { borderWidth: 1, borderColor: C.rule, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.surface },
  statusPillText:  { fontSize: 11, fontWeight: "700", color: C.muted },

  addAnotherBtn:     { marginTop: 8, borderWidth: 1, borderColor: C.teal, borderStyle: "dashed", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  addAnotherBtnText: { fontSize: 13, fontWeight: "700", color: C.teal },

  scanBtn:           { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.teal, borderRadius: 12, paddingVertical: 12, marginBottom: 8 },
  scanBtnText:       { fontSize: 14, fontWeight: "700", color: C.teal },

  emptyBox:        { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon:       { fontSize: 48, marginBottom: 12 },
  emptyTitle:      { fontSize: 16, fontWeight: "800", color: C.ink, textAlign: "center", marginBottom: 6 },
  emptySubtitle:   { fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 18 },

  modalOverlay:    { flex: 1, backgroundColor: "rgba(5,15,15,0.85)", justifyContent: "flex-end" },
  modalSheet:      { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", flex: 1 },
  modalHeader:     { backgroundColor: C.tealDeep, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalEyebrow:    { fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 2 },
  modalTitle:      { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  modalClose:      { width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },

  formSection:     { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, color: C.muted, marginTop: 16, marginBottom: 8 },
  fieldWrap:       { marginBottom: 10 },
  fieldLabel:      { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7, color: C.muted, marginBottom: 4 },
  fieldInput:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontWeight: "600", color: C.ink },

  financeRow:      { flexDirection: "row", gap: 10 },
  financeHalf:     { flex: 1, marginBottom: 10 },

  voiceBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.rule, borderRadius: 12, paddingVertical: 14, marginTop: 8 },
  voiceBtnActive:  { backgroundColor: C.redLite, borderColor: "rgba(242,92,58,0.3)" },
  voiceBtnIcon:    { fontSize: 22 },
  voiceBtnText:    { fontSize: 14, fontWeight: "700", color: C.teal },
  liveTranscript:      { backgroundColor: C.surface, borderRadius: 8, padding: 10, marginTop: 6, borderWidth: 1, borderColor: C.rule },
  liveTranscriptLabel: { fontSize: 9, fontWeight: "700", color: C.muted, letterSpacing: 0.5, marginBottom: 4 },
  liveTranscriptText:  { fontSize: 12, color: C.ink, lineHeight: 18 },

  modalActions:    { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn:       { flex: 1, borderWidth: 1, borderColor: C.rule, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: C.surface },
  cancelBtnText:   { color: C.muted, fontWeight: "700", fontSize: 14 },
  saveBtn:         { flex: 2, backgroundColor: C.teal, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  saveBtnText:     { color: C.white, fontWeight: "800", fontSize: 15, letterSpacing: -0.2 },
});
