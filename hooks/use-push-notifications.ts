import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { trpc } from "@/lib/trpc";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";

/**
 * Hook that monitors for new in-app notifications and fires
 * browser Web Notifications with "YOU'VE GOT A MATCH!!" alerts.
 */
export function usePushNotifications() {
  const { isAuthenticated } = useDealershipAuth();
  const lastCountRef = useRef<number | null>(null);
  const permissionRef = useRef<string>("default");

  const { data: unreadCount } = trpc.notifications.getUnreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 8000,
  });

  const { data: notifications } = trpc.notifications.list.useQuery(
    { limit: 3 },
    { enabled: isAuthenticated, refetchInterval: 8000 }
  );

  // Request browser notification permission on mount
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!("Notification" in window)) return;

    if (Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        permissionRef.current = perm;
      });
    } else {
      permissionRef.current = Notification.permission;
    }
  }, []);

  // Fire notification when unread count increases
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!("Notification" in window)) return;
    if (unreadCount === undefined) return;

    const currentCount = unreadCount as number;

    // First load — just set the baseline
    if (lastCountRef.current === null) {
      lastCountRef.current = currentCount;
      return;
    }

    // New notifications arrived
    if (currentCount > lastCountRef.current) {
      const newest = notifications?.[0];
      if (newest && permissionRef.current === "granted") {
        try {
          const title = newest.title?.includes("Match")
            ? "YOU'VE GOT A MATCH!!"
            : newest.title || "LotLink Notification";

          new Notification(title, {
            body: newest.message || "You have a new notification in LotLink.",
            icon: "/favicon.ico",
            tag: `lotlink-${newest.id}`,
            requireInteraction: true,
          });
        } catch (_) {
          // Notifications blocked or unavailable
        }
      }
    }

    lastCountRef.current = currentCount;
  }, [unreadCount, notifications]);
}
