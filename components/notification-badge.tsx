import React from "react";
import { View, Text } from "react-native";
import { trpc } from "@/lib/trpc";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";

export function NotificationBadge() {
    const { isAuthenticated } = useDealershipAuth();
    const { data: unreadCount } = trpc.notifications.getUnreadCount.useQuery(undefined, {
        enabled: isAuthenticated,
        refetchInterval: 10000,
    });

    if (!unreadCount || unreadCount === 0) return null;

    return (
        <View
            style={{
                position: "absolute",
                right: -6,
                top: -3,
                backgroundColor: "#E74C3C",
                borderRadius: 10,
                width: 18,
                height: 18,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 2,
                borderColor: "#FFFFFF",
            }}
        >
            <Text style={{ color: "white", fontSize: 10, fontWeight: "bold" }}>
                {unreadCount > 9 ? "9+" : unreadCount}
            </Text>
        </View>
    );
}
