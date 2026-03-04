import React from "react";
import {
  View, Text, Modal, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet,
} from "react-native";
import { trpc } from "@/lib/trpc";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { Ionicons } from "@expo/vector-icons";
import { C } from "@/constants/theme";

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
}

function getNotifIcon(title: string): { name: string; color: string } {
  if (title.includes("CRITICAL")) return { name: "alert-circle", color: C.red };
  if (title.includes("Escalation")) return { name: "warning", color: C.amber };
  if (title.includes("Reminder")) return { name: "time", color: C.amber };
  if (title.includes("Match")) return { name: "flash", color: C.teal };
  if (title.includes("Voice")) return { name: "mic", color: "#7c3aed" };
  return { name: "notifications", color: C.tealMid };
}

function timeAgo(date: string | Date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationsModal({ visible, onClose }: NotificationsModalProps) {
  const { isAuthenticated } = useDealershipAuth();
  const utils = trpc.useUtils();

  const { data: notifications, isLoading } = trpc.notifications.list.useQuery(
    { limit: 50 },
    { enabled: isAuthenticated && visible }
  );

  const markReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.getUnreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const markAllMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.getUnreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const unreadCount = notifications?.filter((n: any) => !n.isRead).length || 0;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.modal}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Notifications</Text>
              {unreadCount > 0 && (
                <Text style={s.subtitle}>{unreadCount} unread</Text>
              )}
            </View>
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={() => markAllMutation.mutate()}
                style={s.markAllBtn}
              >
                <Text style={s.markAllText}>Mark all read</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={22} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* List */}
          {isLoading ? (
            <ActivityIndicator size="large" color={C.teal} style={{ margin: 40 }} />
          ) : !notifications || notifications.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>🔕</Text>
              <Text style={s.emptyText}>No notifications yet</Text>
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(item) => item.id.toString()}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const icon = getNotifIcon(item.title);
                return (
                  <TouchableOpacity
                    onPress={() => {
                      if (!item.isRead) markReadMutation.mutate({ id: item.id });
                    }}
                    style={[s.notifItem, !item.isRead && s.notifUnread]}
                  >
                    <View style={[s.notifIcon, { backgroundColor: icon.color + "20" }]}>
                      <Ionicons name={icon.name as any} size={18} color={icon.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.notifTitle}>{item.title}</Text>
                      <Text style={s.notifMessage} numberOfLines={2}>{item.message}</Text>
                      <Text style={s.notifTime}>{timeAgo(item.createdAt)}</Text>
                    </View>
                    {!item.isRead && <View style={s.unreadDot} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(5,15,15,0.85)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: "80%", paddingBottom: 30,
  },
  header: {
    flexDirection: "row", alignItems: "center", padding: 20,
    borderBottomWidth: 1, borderBottomColor: C.rule,
  },
  title: { fontSize: 20, fontWeight: "700", color: C.ink },
  subtitle: { fontSize: 12, color: C.muted, marginTop: 2 },
  markAllBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.surface, borderRadius: 8, marginRight: 12 },
  markAllText: { fontSize: 12, color: C.teal, fontWeight: "600" },
  closeBtn: { padding: 4 },
  empty: { alignItems: "center", padding: 60 },
  emptyText: { color: C.muted, fontSize: 14 },
  notifItem: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: C.rule,
  },
  notifUnread: { backgroundColor: C.surface },
  notifIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  notifTitle: { fontSize: 14, fontWeight: "700", color: C.ink, marginBottom: 2 },
  notifMessage: { fontSize: 13, color: C.muted, lineHeight: 18 },
  notifTime: { fontSize: 11, color: C.muted, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.teal, marginTop: 6 },
});
