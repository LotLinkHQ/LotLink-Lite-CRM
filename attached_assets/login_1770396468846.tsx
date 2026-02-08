import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useRouter } from "expo-router";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";

export default function LoginScreen() {
  const router = useRouter();
  const { login, loading: authLoading } = useDealershipAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter both username and password");
      return;
    }

    const success = await login(username, password);
    if (success) {
      // Navigate to home
      router.replace("/(tabs)");
    } else {
      Alert.alert("Login Failed", "Invalid username or password");
    }
  };

  return (
    <ScreenContainer className="flex-1 bg-gradient-to-b from-primary to-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 justify-center px-6">
          {/* Logo/Header */}
          <View className="items-center mb-8">
            <View className="bg-white rounded-full w-20 h-20 items-center justify-center mb-4">
              <Text className="text-4xl">🚐</Text>
            </View>
            <Text className="text-3xl font-bold text-white mb-2">RV Sales CRM</Text>
            <Text className="text-white text-opacity-80 text-center">
              Dealership Management System
            </Text>
          </View>

          {/* Login Form */}
          <View className="bg-surface rounded-2xl p-6 shadow-lg border border-border">
            {/* Username Input */}
            <View className="mb-4">
              <Text className="text-foreground font-semibold mb-2">Username</Text>
              <TextInput
                placeholder="Enter dealership username"
                value={username}
                onChangeText={setUsername}
                editable={!authLoading}
                className="bg-background border border-border rounded-lg px-4 py-3 text-foreground"
                placeholderTextColor="#9BA1A6"
              />
            </View>

            {/* Password Input */}
            <View className="mb-6">
              <Text className="text-foreground font-semibold mb-2">Password</Text>
              <TextInput
                placeholder="Enter password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!authLoading}
                className="bg-background border border-border rounded-lg px-4 py-3 text-foreground"
                placeholderTextColor="#9BA1A6"
              />
            </View>

            {/* Login Button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={authLoading}
              className="bg-primary rounded-lg py-3 items-center active:opacity-80"
            >
              {authLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-lg">Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Test Credentials Info */}
            <View className="mt-6 bg-warning bg-opacity-10 rounded-lg p-4 border border-warning border-opacity-30">
              <Text className="text-warning font-semibold mb-2">Test Credentials</Text>
              <Text className="text-foreground text-sm mb-1">
                <Text className="font-semibold">Username:</Text> test123
              </Text>
              <Text className="text-foreground text-sm">
                <Text className="font-semibold">Password:</Text> test123
              </Text>
            </View>
          </View>

          {/* Footer Info */}
          <View className="mt-8 items-center">
            <Text className="text-white text-opacity-70 text-xs text-center">
              This is a dealership-exclusive platform.{"\n"}
              Contact your dealership manager for credentials.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
