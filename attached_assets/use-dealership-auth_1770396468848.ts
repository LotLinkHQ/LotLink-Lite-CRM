import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface DealershipSession {
  dealershipId: number;
  username: string;
  loginTime: string;
}

export function useDealershipAuth() {
  const [session, setSession] = useState<DealershipSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Check if dealership is logged in
  const checkSession = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const sessionData = await AsyncStorage.getItem("dealershipSession");
      if (sessionData) {
        const parsedSession = JSON.parse(sessionData) as DealershipSession;
        setSession(parsedSession);
      } else {
        setSession(null);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to check session");
      console.error("[DealershipAuth] checkSession error:", error);
      setError(error);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Login dealership
  const login = useCallback(async (username: string, password: string) => {
    try {
      setLoading(true);
      setError(null);

      // Simple client-side validation for now
      // In production, this would call your backend API
      if (username === "test123" && password === "test123") {
        const newSession: DealershipSession = {
          dealershipId: 1,
          username: username,
          loginTime: new Date().toISOString(),
        };

        await AsyncStorage.setItem("dealershipSession", JSON.stringify(newSession));
        setSession(newSession);
        return true;
      } else {
        throw new Error("Invalid username or password");
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Login failed");
      console.error("[DealershipAuth] login error:", error);
      setError(error);
      setSession(null);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Logout dealership
  const logout = useCallback(async () => {
    try {
      await AsyncStorage.removeItem("dealershipSession");
      setSession(null);
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Logout failed");
      console.error("[DealershipAuth] logout error:", error);
      setError(error);
    }
  }, []);

  const isAuthenticated = useMemo(() => Boolean(session), [session]);

  // Check session on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return {
    session,
    loading,
    error,
    isAuthenticated,
    login,
    logout,
    checkSession,
  };
}
