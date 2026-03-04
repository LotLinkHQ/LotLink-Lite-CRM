import { useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";

export interface UserInfo {
  id: number;
  name: string;
  email: string;
  role: "salesperson" | "manager" | "admin" | "owner";
  dealershipId: number | null;
  dealershipName: string | null;
}

export function useDealershipAuth() {
  const utils = trpc.useUtils();
  const { data: me, isLoading: meLoading, error: meError } = trpc.auth.me.useQuery();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
    },
  });

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      utils.leads.list.invalidate();
      utils.inventory.list.invalidate();
    },
  });

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const result = await loginMutation.mutateAsync({ email, password });
        return result;
      } catch (err: any) {
        console.error("[Auth] Login error:", err);
        const msg = err?.message || "Login failed";
        return { success: false as const, error: msg };
      }
    },
    [loginMutation]
  );

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      try {
        const result = await signupMutation.mutateAsync({ name, email, password });
        return result;
      } catch {
        return { success: false as const, error: "Signup failed" };
      }
    },
    [signupMutation]
  );

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (err) {
      console.error("[Auth] Logout failed:", err);
    }
  }, [logoutMutation]);

  const isAuthenticated = useMemo(() => Boolean(me), [me]);
  const isLinkedToDealership = useMemo(() => Boolean(me?.dealershipId), [me]);
  const isAdmin = useMemo(() => me?.role === "admin", [me]);
  const isManager = useMemo(() => me?.role === "manager" || me?.role === "admin", [me]);
  const isOwner = useMemo(() => me?.role === "owner", [me]);

  return {
    user: me as UserInfo | null,
    loading: meLoading,
    error: loginMutation.error,
    meError,
    isAuthenticated,
    isLinkedToDealership,
    isAdmin,
    isManager,
    isOwner,
    login,
    signup,
    logout,
  };
}
