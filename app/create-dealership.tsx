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

export default function CreateDealershipScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLinkedToDealership } = useDealershipAuth();
  const utils = trpc.useUtils();

  const createDealership = trpc.dealership.create.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        utils.auth.me.invalidate();
        router.replace("/(tabs)");
      } else {
        showError(data.error || "Failed to create dealership");
      }
    },
    onError: (err) => showError(err.message),
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [registerDomain, setRegisterDomain] = useState(true);

  const emailDomain = user?.email?.split("@")[1] || "";

  const showError = (msg: string) => Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);

  if (!isAuthenticated) { router.replace("/login"); return null; }
  if (isLinkedToDealership) { router.replace("/(tabs)"); return null; }

  const handleCreate = () => {
    if (!name.trim()) { showError("Please enter your dealership name"); return; }
    createDealership.mutate({
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      registerDomain,
    });
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={s.wrapper}>
          <View style={s.headerBlock}>
            <View style={s.logoMark}>
              <Text style={s.logoText}>LL</Text>
            </View>
            <Text style={s.headerTitle}>Set Up Your Dealership</Text>
            <Text style={s.headerSub}>Create your dealership profile to get started</Text>
          </View>

          <View style={s.formCard}>
            {[
              { label: "Dealership Name *", value: name, onChange: setName, placeholder: "Poulsbo RV", keyboard: "default" as const },
              { label: "Contact Email", value: email, onChange: setEmail, placeholder: "info@yourdealership.com", keyboard: "email-address" as const },
              { label: "Phone", value: phone, onChange: setPhone, placeholder: "555-0100", keyboard: "phone-pad" as const },
              { label: "Address", value: address, onChange: setAddress, placeholder: "123 Main St, City, State", keyboard: "default" as const },
            ].map((field) => (
              <View key={field.label} style={s.fieldGroup}>
                <Text style={s.fieldLabel}>{field.label}</Text>
                <TextInput
                  placeholder={field.placeholder}
                  value={field.value}
                  onChangeText={field.onChange}
                  editable={!createDealership.isLoading}
                  keyboardType={field.keyboard}
                  autoCapitalize={field.keyboard === "email-address" ? "none" : "words"}
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

            <TouchableOpacity
              onPress={handleCreate}
              disabled={createDealership.isLoading}
              style={[s.createBtn, { opacity: createDealership.isLoading ? 0.7 : 1 }]}
            >
              {createDealership.isLoading
                ? <ActivityIndicator color={C.white} />
                : <Text style={s.createBtnText}>Create Dealership</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  wrapper: { flex: 1, justifyContent: "center", paddingHorizontal: 8 },
  headerBlock: { alignItems: "center", marginBottom: 28 },
  logoMark: { width: 64, height: 64, borderRadius: 16, backgroundColor: C.teal, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  logoText: { color: C.mint, fontWeight: "800", fontSize: 22, letterSpacing: 1 },
  headerTitle: { fontSize: 26, fontWeight: "700", color: C.ink, marginBottom: 6 },
  headerSub: { color: C.muted, textAlign: "center", fontSize: 14 },
  formCard: { backgroundColor: C.surface, borderRadius: 16, padding: 22, borderWidth: 1, borderColor: C.rule },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { color: C.ink, fontWeight: "600", marginBottom: 7, fontSize: 14 },
  fieldInput: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.rule,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: C.ink, fontSize: 15,
  },
  domainRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 20, backgroundColor: C.tealLite, borderRadius: 10, padding: 12,
  },
  domainLabel: { color: C.ink, fontWeight: "500", fontSize: 14 },
  domainSub: { color: C.muted, fontSize: 12, marginTop: 2 },
  createBtn: { backgroundColor: C.teal, borderRadius: 10, paddingVertical: 15, alignItems: "center" },
  createBtnText: { color: C.white, fontWeight: "700", fontSize: 17 },
});
