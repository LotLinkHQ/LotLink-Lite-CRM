import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useRouter } from "expo-router";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";

export default function LoginScreen() {
  const router = useRouter();
  const { login, loading: authLoading, isAuthenticated } = useDealershipAuth();

  // Auto-redirect if already authenticated (e.g. demo mode)
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, authLoading]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter both username and password");
      } else {
        Alert.alert("Error", "Please enter both username and password");
      }
      return;
    }

    setLoggingIn(true);
    const success = await login(username, password);
    setLoggingIn(false);

    if (success) {
      router.replace("/(tabs)");
    } else {
      if (Platform.OS === "web") {
        window.alert("Invalid username or password");
      } else {
        Alert.alert("Login Failed", "Invalid username or password");
      }
    }
  };

  return (
    <ScreenContainer className="flex-1">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}>
          <View style={{ alignItems: "center", marginBottom: 32 }}>
            <View
              style={{
                backgroundColor: "#0B5E7E",
                borderRadius: 40,
                width: 80,
                height: 80,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 36 }}>🚐</Text>
            </View>
            <Text style={{ fontSize: 28, fontWeight: "bold", color: "#2C3E50", marginBottom: 8 }}>
              RV Sales CRM
            </Text>
            <Text style={{ color: "#7F8C8D", textAlign: "center" }}>
              Dealership Management System
            </Text>
          </View>

          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 16,
              padding: 24,
              borderWidth: 1,
              borderColor: "#ECF0F1",
            }}
          >
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: "#2C3E50", fontWeight: "600", marginBottom: 8 }}>
                Username
              </Text>
              <TextInput
                placeholder="Enter dealership username"
                value={username}
                onChangeText={setUsername}
                editable={!loggingIn}
                style={{
                  backgroundColor: "#F8F9FA",
                  borderWidth: 1,
                  borderColor: "#ECF0F1",
                  borderRadius: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  color: "#2C3E50",
                  fontSize: 16,
                }}
                placeholderTextColor="#9BA1A6"
              />
            </View>

            <View style={{ marginBottom: 24 }}>
              <Text style={{ color: "#2C3E50", fontWeight: "600", marginBottom: 8 }}>
                Password
              </Text>
              <TextInput
                placeholder="Enter password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loggingIn}
                style={{
                  backgroundColor: "#F8F9FA",
                  borderWidth: 1,
                  borderColor: "#ECF0F1",
                  borderRadius: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  color: "#2C3E50",
                  fontSize: 16,
                }}
                placeholderTextColor="#9BA1A6"
              />
            </View>

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loggingIn}
              style={{
                backgroundColor: "#0B5E7E",
                borderRadius: 8,
                paddingVertical: 14,
                alignItems: "center",
                opacity: loggingIn ? 0.7 : 1,
              }}
            >
              {loggingIn ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: "white", fontWeight: "600", fontSize: 18 }}>Sign In</Text>
              )}
            </TouchableOpacity>

          </View>

          <View style={{ marginTop: 32, alignItems: "center" }}>
            <Text style={{ color: "#7F8C8D", fontSize: 12, textAlign: "center" }}>
              This is a dealership-exclusive platform.{"\n"}
              Contact your dealership manager for credentials.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
