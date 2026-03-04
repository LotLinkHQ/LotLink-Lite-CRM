import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  StyleSheet,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useRouter } from "expo-router";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { C } from "@/constants/theme";

export default function SignupScreen() {
  const router = useRouter();
  const { signup } = useDealershipAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const showError = (msg: string) => {
    if (Platform.OS === "web") {
      window.alert(msg);
    } else {
      Alert.alert("Error", msg);
    }
  };

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      showError("Please fill in all fields");
      return;
    }
    if (password !== confirmPassword) {
      showError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      showError("Password must be at least 8 characters");
      return;
    }

    setSubmitting(true);
    const result = await signup(name, email, password);
    setSubmitting(false);

    if (result.success) {
      if (result.needsDealership) {
        router.replace("/create-dealership" as any);
      } else {
        router.replace("/(tabs)");
      }
    } else {
      showError(result.error || "Signup failed");
    }
  };

  return (
    <ScreenContainer className="flex-1">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Header bar */}
        <View style={s.header}>
          <View style={s.headerLogo}>
            <Text style={s.headerLogoText}>LL</Text>
          </View>
          <Text style={s.headerTitle}>LotLink</Text>
        </View>

        <View style={s.body}>
          {/* Branding */}
          <View style={s.brandBox}>
            <Text style={s.brandTitle}>
              Create <Text style={s.brandMint}>Account</Text>
            </Text>
            <Text style={s.brandSubtitle}>Use your work email to connect with your dealership</Text>
          </View>

          {/* Form Card */}
          <View style={s.card}>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Full Name</Text>
              <TextInput
                placeholder="Jane Smith"
                value={name}
                onChangeText={setName}
                editable={!submitting}
                autoComplete="name"
                style={s.fieldInput}
                placeholderTextColor={C.muted}
              />
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Work Email</Text>
              <TextInput
                placeholder="jane@yourdealership.com"
                value={email}
                onChangeText={setEmail}
                editable={!submitting}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                style={s.fieldInput}
                placeholderTextColor={C.muted}
              />
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Password</Text>
              <TextInput
                placeholder="At least 8 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!submitting}
                style={s.fieldInput}
                placeholderTextColor={C.muted}
              />
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Confirm Password</Text>
              <TextInput
                placeholder="Repeat password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                editable={!submitting}
                style={s.fieldInput}
                placeholderTextColor={C.muted}
              />
            </View>

            <TouchableOpacity
              onPress={handleSignup}
              disabled={submitting}
              style={[s.signUpBtn, submitting && { opacity: 0.6 }]}
            >
              {submitting ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={s.signUpBtnText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Login link */}
          <View style={s.footer}>
            <TouchableOpacity onPress={() => router.push("/login")}>
              <Text style={s.footerLink}>Already have an account? <Text style={{ fontWeight: "800" }}>Sign in</Text></Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  header: { backgroundColor: C.tealDeep, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 16 },
  headerLogo: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.mint, alignItems: "center", justifyContent: "center" },
  headerLogoText: { fontSize: 12, fontWeight: "800", color: C.tealDeep, letterSpacing: -0.5 },
  headerTitle: { fontSize: 16, fontWeight: "800", color: C.white, letterSpacing: -0.3 },

  body: { flex: 1, justifyContent: "center", paddingHorizontal: 24, paddingBottom: 40 },

  brandBox: { alignItems: "center", marginBottom: 28 },
  brandTitle: { fontSize: 28, fontWeight: "800", color: C.ink, letterSpacing: -0.5 },
  brandMint: { color: C.teal },
  brandSubtitle: { color: C.muted, fontSize: 14, marginTop: 4, textAlign: "center" },

  card: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.rule, borderRadius: 16, padding: 20 },

  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7, color: C.muted, marginBottom: 6 },
  fieldInput: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.rule, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontWeight: "600", color: C.ink },

  signUpBtn: { backgroundColor: C.teal, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  signUpBtnText: { color: C.white, fontWeight: "800", fontSize: 16, letterSpacing: -0.2 },

  footer: { marginTop: 24, alignItems: "center" },
  footerLink: { color: C.teal, fontWeight: "600", fontSize: 13 },
});
