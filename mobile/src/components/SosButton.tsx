import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { createHold } from "../safety/hold";

export function SosButton({
  onActivate,
  disabled,
  pending,
  preview,
}: {
  onActivate: () => void;
  disabled: boolean;
  pending: boolean;
  preview: boolean;
}) {
  const [holding, setHolding] = useState(false);
  const callback = useRef(onActivate);
  const gate = useRef<ReturnType<typeof createHold> | null>(null);
  useEffect(() => {
    callback.current = onActivate;
  }, [onActivate]);
  useEffect(() => {
    gate.current = createHold(() => {
      setHolding(false);
      callback.current();
    });
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        gate.current?.cancel();
        setHolding(false);
      }
    });
    return () => {
      gate.current?.cancel();
      listener.remove();
    };
  }, []);
  useEffect(() => {
    if (disabled) gate.current?.cancel();
  }, [disabled]);
  const start = () => {
    if (!disabled) {
      setHolding(true);
      gate.current?.start();
    }
  };
  const cancel = () => {
    gate.current?.cancel();
    setHolding(false);
  };
  return (
    <View style={s.container}>
      <Pressable
        testID="sos-button"
        accessibilityRole="button"
        accessibilityLabel={
          preview
            ? "Hold two seconds to simulate SOS. No alerts will be sent."
            : "Hold two seconds to send SOS"
        }
        accessibilityHint="A short tap does nothing. Release before two seconds to cancel."
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={start}
        onPressOut={cancel}
        accessibilityActions={[
          {
            name: "activate",
            label: preview ? "Simulate SOS without sending alerts" : "Send SOS",
          },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "activate" && !disabled) {
            gate.current?.cancel();
            callback.current();
          }
        }}
        style={[s.button, holding && s.holding, disabled && s.disabled]}
      >
        <Text style={s.label}>{pending ? "RESUME" : "SOS"}</Text>
        <Text style={s.hint}>
          {disabled
            ? "PLEASE WAIT"
            : holding
              ? "KEEP HOLDING…"
              : "HOLD FOR 2 SECONDS"}
        </Text>
      </Pressable>
      <Text style={s.helper}>
        {holding
          ? "Release now to cancel."
          : preview
            ? "Try it safely. Nothing will be sent."
            : "A short tap will not send an alert."}
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  container: { alignItems: "center", gap: 24, paddingVertical: 28 },
  button: {
    width: "100%",
    maxWidth: 310,
    aspectRatio: 1,
    borderRadius: 200,
    backgroundColor: "#ad273b",
    borderWidth: 10,
    borderColor: "#f3dce0",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  holding: { backgroundColor: "#821b2b", borderColor: "#c56a78" },
  disabled: { opacity: 0.5 },
  label: {
    fontSize: 64,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 2,
  },
  hint: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 1.5,
  },
  helper: {
    textAlign: "center",
    color: "#666b68",
    fontSize: 13,
    lineHeight: 20,
  },
});
