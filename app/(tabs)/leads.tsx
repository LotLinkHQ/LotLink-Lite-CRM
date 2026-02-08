import { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  ScrollView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";

export default function LeadsScreen() {
  const { isAuthenticated } = useDealershipAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLead, setNewLead] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    preferenceType: "model" as "model" | "features",
    preferredModel: "",
    preferredYear: "",
    maxPrice: "",
    preferredMake: "",
    preferredBedType: "",
    minLength: "",
    notes: "",
  });

  const utils = trpc.useUtils();

  const { data: leads, isLoading, refetch } = trpc.leads.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const createMutation = trpc.leads.create.useMutation({
    onSuccess: () => {
      refetch();
      setShowAddModal(false);
      setNewLead({
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        preferenceType: "model",
        preferredModel: "",
        preferredYear: "",
        maxPrice: "",
        preferredMake: "",
        preferredBedType: "",
        minLength: "",
        notes: "",
      });
    },
  });

  const deleteMutation = trpc.leads.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleDeleteLead = (id: number, name: string) => {
    const doDelete = () => deleteMutation.mutate({ id });
    if (Platform.OS === "web") {
      if (window.confirm(`Delete ${name}?`)) doDelete();
    } else {
      Alert.alert("Delete Lead", `Are you sure you want to delete ${name}?`, [
        { text: "Cancel" },
        { text: "Delete", onPress: doDelete, style: "destructive" },
      ]);
    }
  };

  const handleAddLead = () => {
    if (!newLead.customerName.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter customer name");
      } else {
        Alert.alert("Error", "Please enter customer name");
      }
      return;
    }
    const preferences: Record<string, any> = {};
    if (newLead.maxPrice) preferences.maxPrice = newLead.maxPrice;
    if (newLead.preferredMake) preferences.make = newLead.preferredMake;
    if (newLead.preferredBedType) preferences.bedType = newLead.preferredBedType;
    if (newLead.minLength) preferences.minLength = newLead.minLength;

    createMutation.mutate({
      customerName: newLead.customerName,
      customerEmail: newLead.customerEmail || null,
      customerPhone: newLead.customerPhone || null,
      preferenceType: newLead.preferenceType,
      preferredModel: newLead.preferredModel || null,
      preferredYear: newLead.preferredYear ? parseInt(newLead.preferredYear) : null,
      preferences: Object.keys(preferences).length > 0 ? preferences : null,
      notes: newLead.notes || null,
    });
  };

  const filteredLeads =
    leads?.filter((lead) =>
      lead.customerName.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#2C3E50", fontSize: 18 }}>Please log in to continue</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#0B5E7E" />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "bold", color: "#2C3E50", marginBottom: 16 }}>
          Leads
        </Text>

        <TextInput
          placeholder="Search leads..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#ECF0F1",
            borderRadius: 8,
            paddingHorizontal: 16,
            paddingVertical: 10,
            color: "#2C3E50",
            marginBottom: 12,
            fontSize: 16,
          }}
          placeholderTextColor="#7F8C8D"
        />

        <TouchableOpacity
          onPress={() => setShowAddModal(true)}
          style={{
            backgroundColor: "#0B5E7E",
            borderRadius: 8,
            paddingHorizontal: 16,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>+ Add New Lead</Text>
        </TouchableOpacity>
      </View>

      {filteredLeads.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#7F8C8D", fontSize: 16 }}>
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
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 8,
                padding: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: "#ECF0F1",
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: "#2C3E50" }}>
                    {item.customerName}
                  </Text>
                  <Text style={{ fontSize: 14, color: "#7F8C8D", marginTop: 4 }}>
                    {item.preferenceType === "model"
                      ? `${item.preferredYear || ""} ${item.preferredModel || ""}`.trim() || "Model search"
                      : "Feature-based search"}
                  </Text>
                </View>
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    borderRadius: 16,
                    backgroundColor:
                      item.status === "active"
                        ? "#27AE60"
                        : item.status === "matched"
                          ? "#F39C12"
                          : "#E74C3C",
                  }}
                >
                  <Text style={{ color: "white", fontSize: 12, fontWeight: "600", textTransform: "capitalize" }}>
                    {item.status}
                  </Text>
                </View>
              </View>

              {item.customerPhone && (
                <Text style={{ fontSize: 12, color: "#7F8C8D" }}>{item.customerPhone}</Text>
              )}
              {item.customerEmail && (
                <Text style={{ fontSize: 12, color: "#7F8C8D" }}>{item.customerEmail}</Text>
              )}
              {(item.preferences as any)?.maxPrice && (
                <Text style={{ fontSize: 12, color: "#27AE60" }}>
                  Budget: ${parseFloat((item.preferences as any).maxPrice).toLocaleString()}
                </Text>
              )}

              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <TouchableOpacity
                  onPress={() => handleDeleteLead(item.id, item.customerName)}
                  style={{
                    flex: 1,
                    backgroundColor: "#E74C3C",
                    borderRadius: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 8,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 }}>
          <ScrollView style={{ maxHeight: "80%" }}>
            <View style={{ backgroundColor: "#FFFFFF", borderRadius: 16, padding: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: "bold", color: "#2C3E50", marginBottom: 16 }}>
                Add New Lead
              </Text>

              {[
                { label: "Customer Name *", key: "customerName", placeholder: "Enter name" },
                { label: "Phone (for SMS alerts) *", key: "customerPhone", placeholder: "e.g., 555-123-4567" },
                { label: "Email", key: "customerEmail", placeholder: "Enter email" },
                { label: "Preferred Make", key: "preferredMake", placeholder: "e.g., Tiffin, Winnebago, Thor" },
                { label: "Preferred Model", key: "preferredModel", placeholder: "e.g., Allegro Bus 45OPP" },
                { label: "Preferred Year", key: "preferredYear", placeholder: "e.g., 2025", keyboard: "numeric" },
                { label: "Max Budget ($)", key: "maxPrice", placeholder: "e.g., 450000", keyboard: "numeric" },
                { label: "Min Length (ft)", key: "minLength", placeholder: "e.g., 40", keyboard: "numeric" },
                { label: "Bed Type", key: "preferredBedType", placeholder: "e.g., King, Queen" },
                { label: "Notes", key: "notes", placeholder: "Any other details or must-haves..." },
              ].map((field) => (
                <View key={field.key} style={{ marginBottom: 12 }}>
                  <Text style={{ color: "#2C3E50", fontWeight: "600", marginBottom: 6 }}>{field.label}</Text>
                  <TextInput
                    placeholder={field.placeholder}
                    value={(newLead as any)[field.key]}
                    onChangeText={(text) => setNewLead({ ...newLead, [field.key]: text })}
                    keyboardType={(field as any).keyboard === "numeric" ? "numeric" : "default"}
                    style={{
                      backgroundColor: "#F8F9FA",
                      borderWidth: 1,
                      borderColor: "#ECF0F1",
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: "#2C3E50",
                      fontSize: 16,
                    }}
                    placeholderTextColor="#9BA1A6"
                    multiline={field.key === "notes"}
                  />
                </View>
              ))}

              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => setShowAddModal(false)}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: "#ECF0F1",
                    borderRadius: 8,
                    paddingVertical: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#7F8C8D", fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddLead}
                  disabled={createMutation.isLoading}
                  style={{
                    flex: 1,
                    backgroundColor: "#0B5E7E",
                    borderRadius: 8,
                    paddingVertical: 12,
                    alignItems: "center",
                    opacity: createMutation.isLoading ? 0.7 : 1,
                  }}
                >
                  {createMutation.isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "600" }}>Save Lead</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
