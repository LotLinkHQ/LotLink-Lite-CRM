import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import Constants from "expo-constants";
import { Platform } from "react-native";
import superjson from "superjson";
import type { AppRouter } from "../server/routers";

export const trpc = createTRPCReact<AppRouter>();

// Get API URL from environment or use relative path for web
function getApiUrl(): string {
  const envApiUrl = Constants.expoConfig?.extra?.apiUrl;

  // For web, use relative URL (works with same-origin server)
  if (Platform.OS === "web") {
    return "/api/trpc";
  }

  // For native apps, use the configured API URL
  if (envApiUrl) {
    return `${envApiUrl}/api/trpc`;
  }

  // Fallback for development - update this to your local IP if testing on device
  if (__DEV__) {
    return "http://localhost:5000/api/trpc";
  }

  // Production fallback - this should NEVER be hit if EAS env vars are set
  console.error("[TRPC] WARNING: No API_URL configured. Set API_URL in eas.json production env.");
  return "https://your-production-api.com/api/trpc";
}

export function createTRPCClient() {
  return trpc.createClient({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: getApiUrl(),
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: "include",
          });
        },
      }),
    ],
  });
}
