import { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "@/constants/theme";

const MAX_DURATION = 180; // 3 minutes

interface VoiceRecorderProps {
  onTranscriptReady: (transcript: string) => void;
  onCancel?: () => void;
  compact?: boolean;
}

export function VoiceRecorder({ onTranscriptReady, onCancel, compact }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const transcriptRef = useRef("");

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const startRecording = useCallback(() => {
    if (Platform.OS !== "web") {
      setError("Voice recording requires a web browser with speech recognition.");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition not supported. Use Chrome or Edge.");
      return;
    }

    setError("");
    setTranscript("");
    transcriptRef.current = "";
    setElapsed(0);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      transcriptRef.current = final;
      setTranscript(final + interim);
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech") {
        setError(`Speech error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording (browser may stop after silence)
      if (recognitionRef.current) {
        try { recognition.start(); } catch (_) {}
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);

    // Timer
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev >= MAX_DURATION - 1) {
          stopRecording();
          return MAX_DURATION;
        }
        return prev + 1;
      });
    }, 1000);
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const handleToggle = () => {
    if (isRecording) {
      stopRecording();
      // Submit transcript
      const finalTranscript = transcriptRef.current.trim() || transcript.trim();
      if (finalTranscript) {
        onTranscriptReady(finalTranscript);
      }
    } else {
      startRecording();
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (compact) {
    return (
      <TouchableOpacity onPress={handleToggle} style={[cs.compactBtn, isRecording && cs.compactRecording]}>
        <Ionicons name={isRecording ? "stop" : "mic"} size={20} color={isRecording ? C.red : C.white} />
        {isRecording && <Text style={cs.compactTime}>{formatTime(elapsed)}</Text>}
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.container}>
      {error ? (
        <Text style={s.errorText}>{error}</Text>
      ) : null}

      {/* Mic button */}
      <Animated.View style={{ transform: [{ scale: isRecording ? pulseAnim : 1 }] }}>
        <TouchableOpacity onPress={handleToggle} style={[s.micBtn, isRecording && s.micBtnActive]}>
          <Ionicons name={isRecording ? "stop" : "mic"} size={40} color={C.white} />
        </TouchableOpacity>
      </Animated.View>

      {/* Status */}
      {isRecording ? (
        <View style={s.statusArea}>
          <View style={s.recordingDot} />
          <Text style={s.recordingText}>Recording... {formatTime(elapsed)}</Text>
          <Text style={s.maxText}>(max {Math.floor(MAX_DURATION / 60)} min)</Text>
        </View>
      ) : (
        <Text style={s.helpText}>Tap to start recording</Text>
      )}

      {/* Live transcript preview */}
      {transcript ? (
        <View style={s.transcriptPreview}>
          <Text style={s.transcriptLabel}>Live transcript:</Text>
          <Text style={s.transcriptText} numberOfLines={4}>{transcript}</Text>
        </View>
      ) : null}

      {onCancel && (
        <TouchableOpacity onPress={onCancel} style={s.cancelBtn}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { alignItems: "center", paddingVertical: 24 },
  micBtn: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: C.teal,
    alignItems: "center", justifyContent: "center",
    shadowColor: C.teal, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12,
    elevation: 8,
  },
  micBtnActive: { backgroundColor: C.red },
  statusArea: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.red },
  recordingText: { fontSize: 16, fontWeight: "700", color: C.red },
  maxText: { fontSize: 12, color: C.muted },
  helpText: { fontSize: 14, color: C.muted, marginTop: 12 },
  errorText: { color: C.red, fontSize: 13, marginBottom: 12, textAlign: "center" },
  transcriptPreview: {
    marginTop: 16, backgroundColor: C.surface, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: C.rule, width: "100%",
  },
  transcriptLabel: { fontSize: 10, fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  transcriptText: { fontSize: 13, color: C.ink, lineHeight: 20 },
  cancelBtn: { marginTop: 16, padding: 10 },
  cancelText: { color: C.muted, fontSize: 14, fontWeight: "600" },
});

const cs = StyleSheet.create({
  compactBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: C.teal,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4,
  },
  compactRecording: { backgroundColor: C.red, width: "auto", paddingHorizontal: 14 },
  compactTime: { color: C.white, fontSize: 12, fontWeight: "700" },
});
