import { useState, useEffect } from "react";
import { Tabs } from "expo-router";
import { Text, Platform } from "react-native";
import { C } from "@/constants/theme";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { OnboardingTutorial } from "@/components/onboarding-tutorial";

const ONBOARDING_KEY = "lotlink_onboarded";

function useFirstLaunch() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") {
      try {
        if (!localStorage.getItem(ONBOARDING_KEY)) {
          setShowOnboarding(true);
        }
      } catch {}
    }
  }, []);

  const dismiss = () => {
    setShowOnboarding(false);
    if (Platform.OS === "web") {
      try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
    }
  };

  return { showOnboarding, dismiss };
}

export default function TabLayout() {
  usePushNotifications();
  const { showOnboarding, dismiss } = useFirstLaunch();

  return (
    <>
      <OnboardingTutorial visible={showOnboarding} onComplete={dismiss} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: C.mint,
          tabBarInactiveTintColor: C.muted,
          tabBarStyle: {
            backgroundColor: C.surface,
            borderTopColor: C.rule,
            borderTopWidth: 1,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Dashboard",
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏠</Text>,
          }}
        />
        <Tabs.Screen
          name="leads"
          options={{
            title: "Leads",
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👥</Text>,
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: "Inventory",
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🚐</Text>,
          }}
        />
        <Tabs.Screen
          name="matches"
          options={{
            title: "Matches",
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🔔</Text>,
          }}
        />
        <Tabs.Screen
          name="manager"
          options={{
            title: "Manager",
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📊</Text>,
          }}
        />
        <Tabs.Screen
          name="assistant"
          options={{
            title: "AI Assistant",
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🤖</Text>,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text>,
          }}
        />
      </Tabs>
    </>
  );
}
