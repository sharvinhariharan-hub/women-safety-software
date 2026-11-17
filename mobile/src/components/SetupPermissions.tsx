import { useEffect, useState } from "react";
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { Camera } from "expo-camera";
import { PREVIEW_MODE } from "../preview";
import { enableEvidenceAccess } from "../safety/permissions";
import { storage } from "../api";

export function SetupPermissions({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => Promise<void>;
}) {
  const [foreground, setForeground] = useState("Not allowed yet");
  const [background, setBackground] = useState("Optional · not allowed yet");
  const [evidence, setEvidence] = useState("Optional · off");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    if (PREVIEW_MODE) return;
    let mounted = true;
    const refresh = async () => {
      const [fg, bg, camera, mic, enabled] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
        Camera.getCameraPermissionsAsync(),
        Camera.getMicrophonePermissionsAsync(),
        storage.read<boolean>("evidence-enabled"),
      ]);
      const services = await Location.hasServicesEnabledAsync();
      if (!mounted) return;
      setForeground(
        fg.granted
          ? services
            ? "Allowed"
            : "Allowed · phone location services off"
          : "Not allowed",
      );
      setBackground(bg.granted ? "Allowed" : "Optional · not allowed");
      setEvidence(
        enabled && camera.granted && mic.granted
          ? "Enabled · starts only when you choose"
          : "Optional · off",
      );
      setSettings(
        !fg.canAskAgain ||
          Boolean(enabled && (!camera.canAskAgain || !mic.canAskAgain)),
      );
    };
    void refresh().catch(() => {
      if (mounted) setNotice("Could not check permissions. Try again below.");
    });
    const listener = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh().catch(() => {});
    });
    return () => {
      mounted = false;
      listener.remove();
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Permission request failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function location() {
    if (PREVIEW_MODE) {
      setForeground("Simulated · no GPS access");
      return;
    }
    const p = await Location.requestForegroundPermissionsAsync();
    setSettings(!p.canAskAgain);
    if (!p.granted) {
      setForeground("Declined · alerts can still be sent without location");
      return;
    }
    if (
      !(await Location.hasServicesEnabledAsync()) &&
      Platform.OS === "android"
    )
      await Location.enableNetworkProviderAsync();
    setForeground(
      (await Location.hasServicesEnabledAsync())
        ? "Allowed"
        : "Allowed · phone location services off",
    );
    if (!(await Location.hasServicesEnabledAsync())) {
      setSettings(true);
      setNotice(
        "Turn on your phone’s Location Services. The system controls this setting.",
      );
    }
  }
  async function backgroundLocation() {
    if (PREVIEW_MODE) {
      setBackground("Simulated · no background GPS access");
      return;
    }
    if (!(await Location.getForegroundPermissionsAsync()).granted) {
      setNotice("Allow location while using the app first.");
      return;
    }
    const p = await Location.requestBackgroundPermissionsAsync();
    setBackground(
      p.granted ? "Allowed" : "Declined · keep the app open for updates",
    );
    if (!p.canAskAgain) setSettings(true);
  }
  async function enableEvidence() {
    const result = await enableEvidenceAccess({
      preview: PREVIEW_MODE,
      camera: () => Camera.requestCameraPermissionsAsync(),
      microphone: () => Camera.requestMicrophonePermissionsAsync(),
      save: (enabled) => storage.write("evidence-enabled", enabled),
    });
    setEvidence(result.label);
    if (result.needsSettings) setSettings(true);
  }
  return (
    <View style={s.card}>
      <Text style={s.caption}>SETUP · 2 OF 2</Text>
      <Text style={s.heading}>Prepare your phone</Text>
      <Text style={s.body}>
        Choose each permission here. SOS stays available if you decline. Nothing
        is recorded during setup.
      </Text>
      <Text style={s.label}>Location during SOS</Text>
      <Text style={s.body}>{foreground}</Text>
      <Button
        label="Allow location"
        disabled={busy}
        onPress={() => void run(location)}
      />
      <Text style={s.label}>Keep sharing in the background</Text>
      <Text style={s.body}>{background}</Text>
      <Text style={s.caption}>
        Only for an active SOS. Your phone may open a system permission page.
        Location indicators and a notification may be visible.
      </Text>
      <Button
        label="Allow background sharing"
        disabled={busy}
        onPress={() => void run(backgroundLocation)}
      />
      <Text style={s.label}>Optional video evidence with audio</Text>
      <Text style={s.body}>{evidence}</Text>
      <Text style={s.caption}>
        Requests camera, then microphone. During SOS, choose Record evidence to
        start. Clips stay on this phone until you choose to export; they are not
        sent with alerts. Recording requires the app on screen.
      </Text>
      <Button
        label="Enable optional evidence"
        disabled={busy}
        onPress={() => void run(enableEvidence)}
      />
      <Button
        label="Keep evidence off"
        disabled={busy}
        onPress={() =>
          void run(async () => {
            if (!PREVIEW_MODE) await storage.write("evidence-enabled", false);
            setEvidence("Optional · off");
          })
        }
      />
      {settings && !PREVIEW_MODE ? (
        <Button
          label="Open phone permission settings"
          disabled={busy}
          onPress={() => void run(() => Linking.openSettings())}
        />
      ) : null}
      {notice ? (
        <Text accessibilityRole="alert" style={s.body}>
          {notice}
        </Text>
      ) : null}
      <Button
        label="Finish setup · open SOS"
        disabled={busy}
        onPress={() => void run(onDone)}
        primary
      />
      <Button label="Back to contacts" disabled={busy} onPress={onBack} />
    </View>
  );
}
function Button({
  label,
  onPress,
  disabled,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, primary && s.primary, disabled && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, primary && { color: "white" }]}>{label}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  card: { backgroundColor: "white", padding: 20, borderRadius: 20, gap: 12 },
  heading: { fontSize: 27, fontWeight: "700", color: "#163e35" },
  label: { fontSize: 18, fontWeight: "600", marginTop: 12, color: "#163e35" },
  body: { fontSize: 16, lineHeight: 23, color: "#344e47" },
  caption: { fontSize: 13, lineHeight: 19, color: "#52665f" },
  button: {
    minHeight: 48,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#edf3ef",
    justifyContent: "center",
  },
  primary: { backgroundColor: "#163e35" },
  buttonText: {
    textAlign: "center",
    color: "#163e35",
    fontSize: 16,
    fontWeight: "600",
  },
});
