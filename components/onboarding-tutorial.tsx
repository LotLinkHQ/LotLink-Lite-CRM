import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { C } from "@/constants/theme";

const SLIDES = [
  {
    icon: "🎙",
    title: "Capture Leads with Your Voice",
    body: "Tap the mic button, describe the customer, and AI extracts the lead details automatically. No typing required.",
  },
  {
    icon: "🔔",
    title: "AI Finds Matches Instantly",
    body: "When matching inventory arrives, you'll get a notification. AI never forgets a customer — even months later.",
  },
  {
    icon: "💰",
    title: "That's It. Go Sell.",
    body: "Follow up on matches, close deals, and let AI handle the busywork. Your only job is to build relationships.",
  },
];

interface OnboardingTutorialProps {
  visible: boolean;
  onComplete: () => void;
}

export function OnboardingTutorial({ visible, onComplete }: OnboardingTutorialProps) {
  const [slide, setSlide] = useState(0);

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={s.overlay}>
        <View style={s.card}>
          {/* Dots */}
          <View style={s.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[s.dot, i === slide && s.dotActive]} />
            ))}
          </View>

          {/* Content */}
          <Text style={s.icon}>{SLIDES[slide].icon}</Text>
          <Text style={s.title}>{SLIDES[slide].title}</Text>
          <Text style={s.body}>{SLIDES[slide].body}</Text>

          {/* Buttons */}
          <View style={s.actions}>
            {slide < SLIDES.length - 1 ? (
              <>
                <TouchableOpacity onPress={onComplete} style={s.skipBtn}>
                  <Text style={s.skipText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSlide(slide + 1)} style={s.nextBtn}>
                  <Text style={s.nextText}>Next</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity onPress={onComplete} style={[s.nextBtn, { flex: 1 }]}>
                <Text style={s.nextText}>Get Started</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(5,15,15,0.9)", justifyContent: "center", alignItems: "center", padding: 24 },
  card: {
    backgroundColor: C.surface, borderRadius: 20, padding: 32,
    width: "100%", maxWidth: 400, alignItems: "center",
    borderWidth: 1, borderColor: C.rule,
  },
  dots: { flexDirection: "row", gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.rule },
  dotActive: { backgroundColor: C.teal, width: 24 },
  icon: { fontSize: 64, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "800", color: C.ink, textAlign: "center", marginBottom: 12 },
  body: { fontSize: 15, color: C.muted, textAlign: "center", lineHeight: 22, marginBottom: 32 },
  actions: { flexDirection: "row", gap: 12, width: "100%" },
  skipBtn: { paddingHorizontal: 20, paddingVertical: 14 },
  skipText: { color: C.muted, fontWeight: "600", fontSize: 15 },
  nextBtn: { backgroundColor: C.teal, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28, alignItems: "center", flex: 1 },
  nextText: { color: C.white, fontWeight: "700", fontSize: 16 },
});
