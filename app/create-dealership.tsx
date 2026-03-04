import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  Alert, ScrollView, Switch, Platform, StyleSheet,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useRouter } from "expo-router";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { trpc } from "@/lib/trpc";
import { C } from "@/constants/theme";

const STEPS = ["Details", "Inventory", "Team", "Done"];

export default function CreateDealershipScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLinkedToDealership } = useDealershipAuth();
  const utils = trpc.useUtils();

  const [step, setStep] = useState(0);

  // Step 1: Details
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [registerDomain, setRegisterDomain] = useState(true);

  // Step 2: Inventory source
  const [inventorySource, setInventorySource] = useState<"website" | "manual" | null>(null);

  // Step 3: Invite team
  const [inviteEmails, setInviteEmails] = useState(["", "", ""]);

  const emailDomain = user?.email?.split("@")[1] || "";
  const showError = (msg: string) => Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);

  const createDealership = trpc.dealership.create.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        utils.auth.me.invalidate();
        setStep(3); // Show "Done" step
      } else {
        showError(data.error || "Failed to create dealership");
        setStep(0);
      }
    },
    onError: (err) => { showError(err.message); setStep(0); },
  });

  if (!isAuthenticated) { router.replace("/login"); return null; }
  if (isLinkedToDealership && step < 3) { router.replace("/(tabs)"); return null; }

  const handleNext = () => {
    if (step === 0) {
      if (!name.trim()) { showError("Please enter your dealership name"); return; }
      setStep(1);
    } else if (step === 1) {
      // Create the dealership with all collected info
      createDealership.mutate({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        registerDomain,
      });
      setStep(2); // Move to invite step (creation runs in background)
    } else if (step === 2) {
      // Done — go to app
      router.replace("/(tabs)");
    }
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={s.wrapper}>
          {/* Header */}
          <View style={s.headerBlock}>
            <View style={s.logoMark}><Text style={s.logoText}>LL</Text></View>
            <Text style={s.headerTitle}>Set Up Your Dealership</Text>
            <Text style={s.headerSub}>
              {step < 3 ? `Step ${step + 1} of 3` : "You're all set!"}
            </Text>
          </View>

          {/* Progress bar */}
          <View style={s.progressBar}>
            {STEPS.slice(0, 3).map((_, i) => (
              <View key={i} style={[s.progressDot, i <= step && s.progressDotActive]} />
            ))}
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${((step + 1) / 3) * 100}%` }]} />
          </View>

          {/* Step 1: Dealership Details */}
          {step === 0 && (
            <View style={s.formCard}>
              <Text style={s.stepTitle}>Dealership Details</Text>
              {[
                { label: "Dealership Name *", value: name, onChange: setName, placeholder: "Poulsbo RV", keyboard: "default" as const },
                { label: "Contact Email", value: email, onChange: setEmail, placeholder: "info@yourdealership.com", keyboard: "email-address" as const },
                { label: "Phone", value: phone, onChange: setPhone, placeholder: "555-0100", keyboard: "phone-pad" as const },
                { label: "Address", value: address, onChange: setAddress, placeholder: "123 Main St, City, State", keyboard: "default" as const },
                { label: "Website URL", value: websiteUrl, onChange: setWebsiteUrl, placeholder: "https://www.yourdealership.com", keyboard: "url" as const },
              ].map((field) => (
                <View key={field.label} style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>{field.label}</Text>
                  <TextInput
                    placeholder={field.placeholder}
                    value={field.value}
                    onChangeText={field.onChange}
                    keyboardType={field.keyboard}
                    autoCapitalize={field.keyboard === "email-address" || field.keyboard === "url" ? "none" : "words"}
                    style={s.fieldInput}
                    placeholderTextColor={C.muted}
                  />
                </View>
              ))}

              {emailDomain && (
                <View style={s.domainRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={s.domainLabel}>Register @{emailDomain}</Text>
                    <Text style={s.domainSub}>Team members with this domain will auto-join</Text>
                  </View>
                  <Switch
                    value={registerDomain}
                    onValueChange={setRegisterDomain}
                    trackColor={{ false: C.rule, true: C.teal }}
                    thumbColor={C.white}
                  />
                </View>
              )}

              <TouchableOpacity onPress={handleNext} style={s.nextBtn}>
                <Text style={s.nextBtnText}>Next: Inventory Setup</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step 2: Inventory Source */}
          {step === 1 && (
            <View style={s.formCard}>
              <Text style={s.stepTitle}>How will you add inventory?</Text>
              <Text style={s.stepSub}>You can always change this later in Settings</Text>

              {[
                { key: "website" as const, icon: "🌐", title: "Scrape from Website", desc: "Auto-import from your dealership website" },
                { key: "manual" as const, icon: "✏️", title: "Add Manually", desc: "Enter units one at a time or import later" },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setInventorySource(opt.key)}
                  style={[s.optionCard, inventorySource === opt.key && s.optionCardActive]}
                >
                  <Text style={s.optionIcon}>{opt.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.optionTitle}>{opt.title}</Text>
                    <Text style={s.optionDesc}>{opt.desc}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {inventorySource === "website" && websiteUrl && (
                <View style={s.scrapeNote}>
                  <Text style={s.scrapeNoteText}>
                    We'll scrape inventory from {websiteUrl} after setup
                  </Text>
                </View>
              )}

              <View style={s.btnRow}>
                <TouchableOpacity onPress={() => setStep(0)} style={s.backBtn}>
                  <Text style={s.backBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleNext}
                  disabled={createDealership.isLoading}
                  style={[s.nextBtn, { flex: 1, opacity: createDealership.isLoading ? 0.7 : 1 }]}
                >
                  {createDealership.isLoading
                    ? <ActivityIndicator color={C.white} />
                    : <Text style={s.nextBtnText}>Create & Continue</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Step 3: Invite Team */}
          {step === 2 && (
            <View style={s.formCard}>
              <Text style={s.stepTitle}>Invite Your Team</Text>
              <Text style={s.stepSub}>Add salesperson emails (optional — you can do this later)</Text>

              {inviteEmails.map((e, i) => (
                <View key={i} style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>Team member {i + 1}</Text>
                  <TextInput
                    placeholder="salesperson@email.com"
                    value={e}
                    onChangeText={(val) => {
                      const next = [...inviteEmails];
                      next[i] = val;
                      setInviteEmails(next);
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={s.fieldInput}
                    placeholderTextColor={C.muted}
                  />
                </View>
              ))}

              <TouchableOpacity
                onPress={() => setInviteEmails([...inviteEmails, ""])}
                style={s.addMore}
              >
                <Text style={s.addMoreText}>+ Add another</Text>
              </TouchableOpacity>

              <View style={s.btnRow}>
                <TouchableOpacity
                  onPress={() => router.replace("/(tabs)")}
                  style={s.skipBtn}
                >
                  <Text style={s.skipBtnText}>Skip for now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.replace("/(tabs)")}
                  style={[s.nextBtn, { flex: 1 }]}
                >
                  <Text style={s.nextBtnText}>Finish Setup</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Step 4: Done */}
          {step === 3 && (
            <View style={s.formCard}>
              <View style={{ alignItems: "center", padding: 20 }}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>🎉</Text>
                <Text style={s.stepTitle}>You're All Set!</Text>
                <Text style={[s.stepSub, { marginBottom: 24 }]}>
                  {name} is ready to go. Start capturing leads and let AI find the matches.
                </Text>
                <TouchableOpacity
                  onPress={() => router.replace("/(tabs)")}
                  style={[s.nextBtn, { width: "100%" }]}
                >
                  <Text style={s.nextBtnText}>Go to Dashboard</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  wrapper: { flex: 1, justifyContent: "center", paddingHorizontal: 8 },
  headerBlock: { alignItems: "center", marginBottom: 16 },
  logoMark: { width: 64, height: 64, borderRadius: 16, backgroundColor: C.teal, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  logoText: { color: C.mint, fontWeight: "800", fontSize: 22, letterSpacing: 1 },
  headerTitle: { fontSize: 26, fontWeight: "700", color: C.ink, marginBottom: 6 },
  headerSub: { color: C.muted, textAlign: "center", fontSize: 14 },

  progressBar: { flexDirection: "row", justifyContent: "center", gap: 12, marginBottom: 8 },
  progressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.rule },
  progressDotActive: { backgroundColor: C.teal },
  progressTrack: { height: 3, backgroundColor: C.rule, borderRadius: 2, marginBottom: 20, marginHorizontal: 20 },
  progressFill: { height: 3, backgroundColor: C.teal, borderRadius: 2 },

  formCard: { backgroundColor: C.surface, borderRadius: 16, padding: 22, borderWidth: 1, borderColor: C.rule },
  stepTitle: { fontSize: 18, fontWeight: "700", color: C.ink, marginBottom: 4 },
  stepSub: { fontSize: 13, color: C.muted, marginBottom: 16 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { color: C.ink, fontWeight: "600", marginBottom: 7, fontSize: 14 },
  fieldInput: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.rule,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: C.ink, fontSize: 15,
  },
  domainRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 20, backgroundColor: C.tealDeep, borderRadius: 10, padding: 12,
  },
  domainLabel: { color: C.ink, fontWeight: "500", fontSize: 14 },
  domainSub: { color: C.muted, fontSize: 12, marginTop: 2 },

  nextBtn: { backgroundColor: C.teal, borderRadius: 10, paddingVertical: 15, alignItems: "center" },
  nextBtnText: { color: C.white, fontWeight: "700", fontSize: 16 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 15, marginRight: 12 },
  backBtnText: { color: C.muted, fontWeight: "600", fontSize: 14 },
  skipBtn: { paddingHorizontal: 16, paddingVertical: 15, marginRight: 12 },
  skipBtnText: { color: C.muted, fontWeight: "600", fontSize: 14 },
  btnRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },

  optionCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 16, backgroundColor: C.bg, borderRadius: 12,
    borderWidth: 1, borderColor: C.rule, marginBottom: 10,
  },
  optionCardActive: { borderColor: C.teal, backgroundColor: C.teal + "15" },
  optionIcon: { fontSize: 28 },
  optionTitle: { fontSize: 15, fontWeight: "700", color: C.ink },
  optionDesc: { fontSize: 12, color: C.muted, marginTop: 2 },

  scrapeNote: { backgroundColor: C.tealDeep, borderRadius: 8, padding: 12, marginBottom: 12 },
  scrapeNoteText: { color: C.tealLite, fontSize: 12 },

  addMore: { paddingVertical: 10, alignItems: "center", marginBottom: 12 },
  addMoreText: { color: C.teal, fontWeight: "600", fontSize: 14 },
});
