import { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

export interface DealershipInfo {
  id: number;
  username: string;
  name: string;
}

export function useDealershipAuth() {
  const utils = trpc.useUtils();
  const { data: me, isLoading: meLoading, error: meError } = trpc.auth.me.useQuery();

  const loginMutation = trpc.auth.login.useMutation({
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
    async (username: string, password: string) => {
      try {
        const result = await loginMutation.mutateAsync({ username, password });
        return result.success;
      } catch {
        return false;
      }
    },
    [loginMutation]
  );

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (err) {
      console.error("[Auth] Logout failed:", err);
    }
  }, [logoutMutation]);

  const isAuthenticated = useMemo(() => Boolean(me), [me]);

  return {
    user: me as DealershipInfo | null,
    loading: meLoading,
    error: loginMutation.error,
    meError,
    isAuthenticated,
    login,
    logout,
  };
}
