import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "@/constants/theme";

interface ScreenContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function ScreenContainer({ children, className = "" }: ScreenContainerProps) {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: C.bg }}
      edges={["top", "left", "right"]}
    >
      <View style={{ flex: 1, padding: 16 }} className={className}>
        {children}
      </View>
    </SafeAreaView>
  );
}
