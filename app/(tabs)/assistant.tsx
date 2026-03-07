import React, { useState, useRef, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { C } from "@/constants/theme";

// Simple markdown renderer for AI messages
function renderMarkdown(text: string) {
  return text.split("\n").map((line, i) => {
    // Headers
    if (line.startsWith("### ")) return <Text key={i} style={{ fontWeight: "700", fontSize: 15, color: C.teal, marginTop: 6, marginBottom: 2 }}>{processInline(line.slice(4))}</Text>;
    if (line.startsWith("## ")) return <Text key={i} style={{ fontWeight: "700", fontSize: 16, color: C.teal, marginTop: 8, marginBottom: 2 }}>{processInline(line.slice(3))}</Text>;
    if (line.startsWith("# ")) return <Text key={i} style={{ fontWeight: "700", fontSize: 18, color: C.teal, marginTop: 8, marginBottom: 2 }}>{processInline(line.slice(2))}</Text>;
    // Bullets
    if (line.startsWith("- ") || line.startsWith("* ")) return <Text key={i} style={{ color: C.ink, lineHeight: 20 }}>  • {processInline(line.slice(2))}</Text>;
    // Numbered lists
    const numMatch = line.match(/^(\d+)\.\s/);
    if (numMatch) return <Text key={i} style={{ color: C.ink, lineHeight: 20 }}>  {numMatch[1]}. {processInline(line.slice(numMatch[0].length))}</Text>;
    // Empty line
    if (!line.trim()) return <Text key={i} style={{ height: 6 }}>{""}</Text>;
    // Regular line
    return <Text key={i} style={{ color: C.ink, lineHeight: 20 }}>{processInline(line)}</Text>;
  });
}

function processInline(text: string): React.ReactNode {
  // Handle **bold**, *italic*, `code`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code
    const codeMatch = remaining.match(/`(.+?)`/);
    // Italic
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+?)\*(?!\*)/);

    // Find earliest match
    let earliest: { type: string; match: RegExpMatchArray; idx: number } | null = null;
    if (boldMatch && boldMatch.index !== undefined) earliest = { type: "bold", match: boldMatch, idx: boldMatch.index };
    if (codeMatch && codeMatch.index !== undefined && (!earliest || codeMatch.index < earliest.idx)) earliest = { type: "code", match: codeMatch, idx: codeMatch.index };
    if (italicMatch && italicMatch.index !== undefined && (!earliest || italicMatch.index < earliest.idx)) earliest = { type: "italic", match: italicMatch, idx: italicMatch.index };

    if (!earliest) {
      parts.push(remaining);
      break;
    }

    if (earliest.idx > 0) parts.push(remaining.slice(0, earliest.idx));
    if (earliest.type === "bold") parts.push(<Text key={key++} style={{ fontWeight: "700", color: C.teal }}>{earliest.match[1]}</Text>);
    else if (earliest.type === "code") parts.push(<Text key={key++} style={{ fontFamily: Platform.OS === "web" ? "monospace" : undefined, backgroundColor: "#0a1a1a", paddingHorizontal: 4, borderRadius: 3, color: C.mint }}>{earliest.match[1]}</Text>);
    else if (earliest.type === "italic") parts.push(<Text key={key++} style={{ fontStyle: "italic" }}>{earliest.match[1]}</Text>);

    remaining = remaining.slice(earliest.idx + earliest.match[0].length);
  }
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

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

      const userMsg: Message = { id: `user-${Date.now()}`, role: "user", content: trimmed };
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput("");

      try {
        const result = await askMutation.mutateAsync({
          question: trimmed,
          conversationHistory: history.length > 0 ? history : undefined,
        });
        setMessages((prev) => [...prev, { id: `ai-${Date.now()}`, role: "assistant", content: result.error || result.answer }]);
      } catch {
        setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: "Something went wrong. Please try again." }]);
      }
    },
    [messages, askMutation]
  );

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View style={[s.msgWrap, { alignSelf: isUser ? "flex-end" : "flex-start" }]}>
        <View style={[s.msgBubble, isUser ? s.msgUser : s.msgAI]}>
          {isUser ? (
            <Text style={[s.msgText, { color: C.white }]}>{item.content}</Text>
          ) : (
            <View>{renderMarkdown(item.content)}</View>
          )}
        </View>
      </View>
    );
  };

  const showWelcome = messages.length === 0 && !askMutation.isLoading;

  return (
    <ScreenContainer>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.aiIcon}>
            <Text style={{ fontSize: 22 }}>🤖</Text>
          </View>
          <View>
            <Text style={s.headerTitle}>AI Assistant</Text>
            <Text style={s.headerSub}>Ask about inventory, specs, pricing, and more</Text>
          </View>
        </View>

        {showWelcome ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.welcomeContainer}>
            <View style={s.welcomeCenter}>
              <View style={s.welcomeIcon}>
                <Text style={{ fontSize: 36 }}>🤖</Text>
              </View>
              <Text style={s.welcomeTitle}>How can I help?</Text>
              <Text style={s.welcomeSub}>I know your full inventory. Ask me about specs, pricing, comparisons, or anything else.</Text>
            </View>

            <Text style={s.suggestLabel}>TRY ASKING</Text>
            {SUGGESTIONS.map((s_) => (
              <TouchableOpacity key={s_} onPress={() => sendMessage(s_)} style={s.suggestItem}>
                <Text style={s.suggestText}>{s_}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            style={s.messageList}
            contentContainerStyle={{ paddingVertical: 12 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              askMutation.isLoading ? (
                <View style={[s.msgWrap, { alignSelf: "flex-start" }]}>
                  <View style={[s.msgBubble, s.msgAI, { flexDirection: "row", alignItems: "center" }]}>
                    <ActivityIndicator size="small" color={C.teal} />
                    <Text style={[s.msgText, { color: C.muted, marginLeft: 10 }]}>Thinking...</Text>
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {/* Input */}
        <View style={s.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about inventory..."
            placeholderTextColor={C.muted}
            multiline
            maxLength={2000}
            editable={!askMutation.isLoading}
            onSubmitEditing={() => sendMessage(input)}
            blurOnSubmit={false}
            style={s.textInput}
          />
          <TouchableOpacity
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || askMutation.isLoading}
            style={[s.sendBtn, { backgroundColor: input.trim() && !askMutation.isLoading ? C.teal : C.rule }]}
          >
            <Text style={{ color: C.white, fontSize: 18, fontWeight: "600" }}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.rule, marginBottom: 4,
  },
  aiIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.tealLite, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: C.ink },
  headerSub: { fontSize: 13, color: C.muted, marginTop: 1 },
  welcomeContainer: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 8, paddingBottom: 20 },
  welcomeCenter: { alignItems: "center", marginBottom: 28 },
  welcomeIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.tealLite, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  welcomeTitle: { fontSize: 20, fontWeight: "700", color: C.ink, marginBottom: 8 },
  welcomeSub: { color: C.muted, textAlign: "center", lineHeight: 20 },
  suggestLabel: { color: C.muted, fontSize: 12, fontWeight: "600", marginBottom: 8, letterSpacing: 0.8 },
  suggestItem: { backgroundColor: C.surface, borderRadius: 10, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: C.rule },
  suggestText: { color: C.teal, fontSize: 15 },
  messageList: { flex: 1, backgroundColor: C.bg },
  msgWrap: { maxWidth: "85%", marginVertical: 4, marginHorizontal: 12 },
  msgBubble: { borderRadius: 16, padding: 12 },
  msgUser: { backgroundColor: C.teal, borderTopRightRadius: 4 },
  msgAI: { backgroundColor: C.surface, borderTopLeftRadius: 4, borderWidth: 1, borderColor: C.rule },
  msgText: { fontSize: 15, lineHeight: 22 },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: C.rule, backgroundColor: C.surface,
  },
  textInput: {
    flex: 1, backgroundColor: C.white, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: C.ink, maxHeight: 100, borderWidth: 1, borderColor: C.rule,
  },
  sendBtn: { marginLeft: 8, borderRadius: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
