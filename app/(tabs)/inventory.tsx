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

export default function InventoryScreen() {
  const { isAuthenticated } = useDealershipAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUnit, setNewUnit] = useState({
    unitId: "",
    year: "",
    make: "",
    model: "",
    length: "",
    bedType: "",
    price: "",
    storeLocation: "",
  });

  const utils = trpc.useUtils();

  const {
    data: infiniteInventory,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.inventory.list.useInfiniteQuery(
    { limit: 20 },
    {
      enabled: isAuthenticated,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const inventoryData = infiniteInventory?.pages.flatMap((page) => page.items) || [];

  const createMutation = trpc.inventory.create.useMutation({
    onSuccess: () => {
      utils.inventory.list.invalidate();
      setShowAddModal(false);
      setNewUnit({
        unitId: "",
        year: "",
        make: "",
        model: "",
        length: "",
        bedType: "",
        price: "",
        storeLocation: "",
      });
      const msg = "Unit logged! The AI is now scanning all leads for matches and will automatically notify the Sales Manager.";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Unit Logged", msg);
      }
    },
  });

  const deleteMutation = trpc.inventory.delete.useMutation({
    onSuccess: () => utils.inventory.list.invalidate(),
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleDeleteUnit = (id: number, name: string) => {
    const doDelete = () => deleteMutation.mutate({ id });
    if (Platform.OS === "web") {
      if (window.confirm(`Delete ${name}?`)) doDelete();
    } else {
      Alert.alert("Delete Unit", `Are you sure you want to delete ${name}?`, [
        { text: "Cancel" },
        { text: "Delete", onPress: doDelete, style: "destructive" },
      ]);
    }
  };

  const handleAddUnit = () => {
    if (!newUnit.unitId.trim() || !newUnit.make.trim() || !newUnit.model.trim() || !newUnit.storeLocation.trim()) {
      const msg = "Please fill in required fields (Unit ID, Make, Model, Store Location)";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
      return;
    }
    createMutation.mutate({
      unitId: newUnit.unitId,
      year: parseInt(newUnit.year) || 2025,
      make: newUnit.make,
      model: newUnit.model,
      length: newUnit.length || null,
      bedType: newUnit.bedType || null,
      price: newUnit.price || null,
      storeLocation: newUnit.storeLocation,
      arrivalDate: new Date().toISOString(),
    });
  };

  const filteredInventory =
    inventoryData.filter(
      (unit) =>
        unit.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        unit.make.toLowerCase().includes(searchQuery.toLowerCase())
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
          Inventory
        </Text>

        <TextInput
          placeholder="Search inventory..."
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
            backgroundColor: "#E67E22",
            borderRadius: 8,
            paddingHorizontal: 16,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>+ Log Unit Arrival</Text>
        </TouchableOpacity>
      </View>

      {filteredInventory.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#7F8C8D", fontSize: 16 }}>
            {searchQuery ? "No units found" : "No inventory yet. Log a unit arrival!"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredInventory}
          keyExtractor={(item) => item.id.toString()}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() => (
            isFetchingNextPage ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator color="#0B5E7E" />
              </View>
            ) : null
          )}
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
                    {item.year} {item.make} {item.model}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#7F8C8D", marginTop: 4 }}>
                    ID: {item.unitId} | {item.storeLocation}
                  </Text>
                </View>
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    borderRadius: 16,
                    backgroundColor:
                      item.status === "in_stock"
                        ? "#27AE60"
                        : item.status === "matched"
                          ? "#F39C12"
                          : item.status === "sold"
                            ? "#E74C3C"
                            : "#7F8C8D",
                  }}
                >
                  <Text style={{ color: "white", fontSize: 12, fontWeight: "600", textTransform: "capitalize" }}>
                    {item.status.replace("_", " ")}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {item.length && (
                  <Text style={{ fontSize: 12, color: "#7F8C8D" }}>{item.length}ft</Text>
                )}
                {item.bedType && (
                  <Text style={{ fontSize: 12, color: "#7F8C8D" }}>| {item.bedType}</Text>
                )}
                {item.price && (
                  <Text style={{ fontSize: 12, color: "#27AE60", fontWeight: "600" }}>
                    ${Number(item.price).toLocaleString()}
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <TouchableOpacity
                  onPress={() => handleDeleteUnit(item.id, `${item.year} ${item.make} ${item.model}`)}
                  style={{
                    flex: 1,
                    backgroundColor: "#E74C3C",
                    borderRadius: 4,
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
                Log Unit Arrival
              </Text>

              {[
                { label: "Unit ID *", key: "unitId", placeholder: "e.g., RV-2025-001" },
                { label: "Year", key: "year", placeholder: "e.g., 2025", keyboard: "numeric" },
                { label: "Make *", key: "make", placeholder: "e.g., Tiffin" },
                { label: "Model *", key: "model", placeholder: "e.g., Allegro Bus 45OPP" },
                { label: "Length (ft)", key: "length", placeholder: "e.g., 45", keyboard: "numeric" },
                { label: "Bed Type", key: "bedType", placeholder: "e.g., King" },
                { label: "Price", key: "price", placeholder: "e.g., 450000", keyboard: "numeric" },
                { label: "Store Location *", key: "storeLocation", placeholder: "e.g., Main Store" },
              ].map((field) => (
                <View key={field.key} style={{ marginBottom: 12 }}>
                  <Text style={{ color: "#2C3E50", fontWeight: "600", marginBottom: 6 }}>{field.label}</Text>
                  <TextInput
                    placeholder={field.placeholder}
                    value={(newUnit as any)[field.key]}
                    onChangeText={(text) => setNewUnit({ ...newUnit, [field.key]: text })}
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
                  onPress={handleAddUnit}
                  disabled={createMutation.isLoading}
                  style={{
                    flex: 1,
                    backgroundColor: "#E67E22",
                    borderRadius: 8,
                    paddingVertical: 12,
                    alignItems: "center",
                    opacity: createMutation.isLoading ? 0.7 : 1,
                  }}
                >
                  {createMutation.isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "600" }}>Save Unit</Text>
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
