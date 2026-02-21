import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What's our most expensive unit?",
  "Which units have king beds?",
  "What's in stock under $50,000?",
  "Compare our Class A motorhomes",
];

export default function AssistantScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const askMutation = trpc.ai.ask.useMutation();

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || askMutation.isLoading) return;

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
      };

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput("");

      // Build conversation history (exclude the current question)
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const result = await askMutation.mutateAsync({
          question: trimmed,
          conversationHistory: history.length > 0 ? history : undefined,
        });

        const aiMsg: Message = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: result.error || result.answer,
        };

        setMessages((prev) => [...prev, aiMsg]);
      } catch (err: any) {
        const errorMsg: Message = {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Something went wrong. Please try again.",
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    },
    [messages, askMutation]
  );

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View
        style={{
          alignSelf: isUser ? "flex-end" : "flex-start",
          maxWidth: "85%",
          marginVertical: 4,
          marginHorizontal: 12,
        }}
      >
        <View
          style={{
            backgroundColor: isUser ? "#0B5E7E" : "#FFFFFF",
            borderRadius: 16,
            borderTopRightRadius: isUser ? 4 : 16,
            borderTopLeftRadius: isUser ? 16 : 4,
            padding: 12,
            borderWidth: isUser ? 0 : 1,
            borderColor: "#ECF0F1",
          }}
        >
          <Text
            style={{
              color: isUser ? "#FFFFFF" : "#2C3E50",
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  const showWelcome = messages.length === 0 && !askMutation.isLoading;

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Header */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: "#ECF0F1",
            backgroundColor: "#FFFFFF",
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: "bold", color: "#2C3E50" }}>
            AI Assistant
          </Text>
          <Text style={{ color: "#7F8C8D", fontSize: 13, marginTop: 2 }}>
            Ask about inventory, specs, pricing, and more
          </Text>
        </View>

        {/* Messages or Welcome */}
        {showWelcome ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: 24,
              paddingBottom: 20,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 32 }}>
              <View
                style={{
                  backgroundColor: "#E8F4F8",
                  borderRadius: 40,
                  width: 80,
                  height: 80,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 36 }}>🤖</Text>
              </View>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "bold",
                  color: "#2C3E50",
                  marginBottom: 8,
                }}
              >
                How can I help?
              </Text>
              <Text
                style={{
                  color: "#7F8C8D",
                  textAlign: "center",
                  lineHeight: 20,
                }}
              >
                I know your full inventory. Ask me about specs, pricing, comparisons, or anything else.
              </Text>
            </View>

            <Text
              style={{
                color: "#7F8C8D",
                fontSize: 13,
                fontWeight: "600",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Try asking
            </Text>
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => sendMessage(s)}
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: "#ECF0F1",
                }}
              >
                <Text style={{ color: "#0B5E7E", fontSize: 15 }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            style={{ flex: 1, backgroundColor: "#F8F9FA" }}
            contentContainerStyle={{ paddingVertical: 12 }}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
            ListFooterComponent={
              askMutation.isLoading ? (
                <View
                  style={{
                    alignSelf: "flex-start",
                    marginHorizontal: 12,
                    marginVertical: 4,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: "#FFFFFF",
                      borderRadius: 16,
                      borderTopLeftRadius: 4,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: "#ECF0F1",
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <ActivityIndicator size="small" color="#0B5E7E" />
                    <Text style={{ color: "#7F8C8D", marginLeft: 10, fontSize: 14 }}>
                      Thinking...
                    </Text>
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {/* Input area */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: "#ECF0F1",
            backgroundColor: "#FFFFFF",
          }}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about inventory..."
            placeholderTextColor="#9BA1A6"
            multiline
            maxLength={2000}
            editable={!askMutation.isLoading}
            onSubmitEditing={() => sendMessage(input)}
            blurOnSubmit={false}
            style={{
              flex: 1,
              backgroundColor: "#F8F9FA",
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 10,
              fontSize: 15,
              color: "#2C3E50",
              maxHeight: 100,
              borderWidth: 1,
              borderColor: "#ECF0F1",
            }}
          />
          <TouchableOpacity
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || askMutation.isLoading}
            style={{
              marginLeft: 8,
              backgroundColor:
                input.trim() && !askMutation.isLoading ? "#0B5E7E" : "#BDC3C7",
              borderRadius: 20,
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 18 }}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
