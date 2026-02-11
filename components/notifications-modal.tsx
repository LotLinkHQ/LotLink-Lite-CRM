import React from "react";
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
} from "react-native";
import { trpc } from "@/lib/trpc";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { Ionicons } from "@expo/vector-icons";

interface NotificationsModalProps {
    visible: boolean;
    onClose: () => void;
}

export function NotificationsModal({ visible, onClose }: NotificationsModalProps) {
    const { isAuthenticated } = useDealershipAuth();
    const utils = trpc.useUtils();

    const { data: notifications, isLoading } = trpc.notifications.list.useQuery(
        { limit: 20 },
        { enabled: isAuthenticated && visible }
    );

    const markReadMutation = trpc.notifications.markAsRead.useMutation({
        onSuccess: () => {
            utils.notifications.getUnreadCount.invalidate();
            utils.notifications.list.invalidate();
        },
    });

    const handleNotificationPress = (id: number) => {
        markReadMutation.mutate({ id });
    };

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View
                style={{
                    flex: 1,
                    backgroundColor: "rgba(0,0,0,0.5)",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 20,
                }}
            >
                <View
                    style={{
                        backgroundColor: "#FFFFFF",
                        borderRadius: 16,
                        width: "100%",
                        maxHeight: "70%",
                        padding: 20,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.25,
                        shadowRadius: 4,
                        elevation: 5,
                    }}
                >
                    <View
                        style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 16,
                            borderBottomWidth: 1,
                            borderBottomColor: "#ECF0F1",
                            paddingBottom: 10,
                        }}
                    >
                        <Text style={{ fontSize: 18, fontWeight: "bold", color: "#2C3E50" }}>
                            Notifications
                        </Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color="#7F8C8D" />
                        </TouchableOpacity>
                    </View>

                    {isLoading ? (
                        <ActivityIndicator size="large" color="#0B5E7E" style={{ margin: 20 }} />
                    ) : !notifications || notifications.length === 0 ? (
                        <View style={{ alignItems: "center", padding: 40 }}>
                            <Text style={{ color: "#7F8C8D", textAlign: "center" }}>
                                No notifications yet.
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={notifications}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    onPress={() => handleNotificationPress(item.id)}
                                    style={{
                                        backgroundColor: item.isRead ? "#FFFFFF" : "#F0F7FF",
                                        padding: 12,
                                        borderRadius: 8,
                                        marginBottom: 8,
                                        borderLeftWidth: item.isRead ? 0 : 4,
                                        borderLeftColor: "#3498DB",
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontSize: 14,
                                            fontWeight: "700",
                                            color: "#2C3E50",
                                            marginBottom: 4,
                                        }}
                                    >
                                        {item.title}
                                    </Text>
                                    <Text style={{ fontSize: 13, color: "#7F8C8D" }}>{item.message}</Text>
                                </TouchableOpacity>
                            )}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}
