import { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "expo-router";

export default function LeadsScreen() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Query leads
  const { data: leads, isLoading, refetch } = trpc.leads.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Delete mutation
  const deleteMutation = trpc.leads.delete.useMutation({
    onSuccess: () => {
      refetch();
      Alert.alert("Success", "Lead deleted");
    },
    onError: (error) => {
      Alert.alert("Error", error.message);
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleDeleteLead = (id: number, name: string) => {
    Alert.alert("Delete Lead", `Are you sure you want to delete ${name}?`, [
      { text: "Cancel", onPress: () => {} },
      {
        text: "Delete",
        onPress: () => deleteMutation.mutate({ id }),
        style: "destructive",
      },
    ]);
  };

  const filteredLeads =
    leads?.filter((lead) =>
      lead.customerName.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  if (!isAuthenticated) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text className="text-foreground text-lg">Please log in to continue</Text>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color="#0B5E7E" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View className="mb-4">
        <Text className="text-2xl font-bold text-foreground mb-4">Leads</Text>

        {/* Search Bar */}
        <TextInput
          placeholder="Search leads..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          className="bg-surface border border-border rounded-lg px-4 py-2 text-foreground mb-4"
          placeholderTextColor="#7F8C8D"
        />

        {/* Add Lead Button */}
        <TouchableOpacity
          onPress={() => router.push("/leads/add")}
          className="bg-primary rounded-lg px-4 py-3 items-center active:opacity-80"
        >
          <Text className="text-white font-semibold">+ Add New Lead</Text>
        </TouchableOpacity>
      </View>

      {/* Leads List */}
      {filteredLeads.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted text-base">
            {searchQuery ? "No leads found" : "No leads yet. Add one to get started!"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredLeads}
          keyExtractor={(item) => item.id.toString()}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/leads/${item.id}`)}
              className="bg-surface rounded-lg p-4 mb-3 border border-border active:opacity-70"
            >
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1">
                  <Text className="text-lg font-semibold text-foreground">
                    {item.customerName}
                  </Text>
                  <Text className="text-sm text-muted mt-1">
                    {item.preferenceType === "model"
                      ? `${item.preferredYear} ${item.preferredModel}`
                      : "Feature-based search"}
                  </Text>
                </View>
                <View
                  className={`px-3 py-1 rounded-full ${
                    item.status === "active"
                      ? "bg-success"
                      : item.status === "matched"
                        ? "bg-warning"
                        : "bg-error"
                  }`}
                >
                  <Text className="text-white text-xs font-semibold capitalize">
                    {item.status}
                  </Text>
                </View>
              </View>

              {item.customerEmail && (
                <Text className="text-xs text-muted">{item.customerEmail}</Text>
              )}

              {item.customerPhone && (
                <Text className="text-xs text-muted">{item.customerPhone}</Text>
              )}

              {/* Action Buttons */}
              <View className="flex-row gap-2 mt-3">
                <TouchableOpacity
                  onPress={() => router.push(`/leads/${item.id}/edit`)}
                  className="flex-1 bg-primary rounded px-2 py-2 items-center"
                >
                  <Text className="text-white text-xs font-semibold">Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteLead(item.id, item.customerName)}
                  className="flex-1 bg-error rounded px-2 py-2 items-center"
                >
                  <Text className="text-white text-xs font-semibold">Delete</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </ScreenContainer>
  );
}
