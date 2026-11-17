import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { CameraView, Camera } from "expo-camera";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api, Config, Status, storage } from "../api";
import { evidenceFormat } from "../safety/evidence";
import { PREVIEW_MODE } from "../preview";

type Clip = { uri: string; name: string };
export default function Evidence() {
  const camera = useRef<CameraView>(null);
  const recording = useRef(false);
  const mounted = useRef(true);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [notice, setNotice] = useState("");
  function reload() {
    if (PREVIEW_MODE || Platform.OS === "web") return;
    const folder = new Directory(Paths.document, "evidence");
    if (!folder.exists) return;
    const saved = folder
      .list()
      .filter(
        (f): f is File => f instanceof File && /\.(mp4|mov)$/i.test(f.name),
      );
    setClips(
      saved
        .map((f) => ({ uri: f.uri, name: f.name }))
        .sort((a, b) => b.name.localeCompare(a.name)),
    );
  }
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve()
      .then(() => {
        if (mounted.current) reload();
      })
      .catch(() => {
        if (mounted.current) setNotice("Could not read saved recordings.");
      });
    const listener = AppState.addEventListener("change", (s) => {
      if (s !== "active") {
        if (recording.current) camera.current?.stopRecording();
        else {
          setOpen(false);
          setReady(false);
        }
      }
    });
    return () => {
      mounted.current = false;
      listener.remove();
    };
  }, []);
  async function prepare() {
    if (PREVIEW_MODE) {
      setNotice(
        "Preview only: camera and microphone stay off. No recording was made.",
      );
      return;
    }
    if (Platform.OS === "web") {
      setNotice("Evidence capture requires the installed Android or iOS app.");
      return;
    }
    setBusy(true);
    try {
      if (!(await storage.read<boolean>("evidence-enabled")))
        throw new Error(
          "Enable optional evidence in Settings → Permissions & evidence first.",
        );
      const [cam, mic] = await Promise.all([
        Camera.getCameraPermissionsAsync(),
        Camera.getMicrophonePermissionsAsync(),
      ]);
      if (!cam.granted || !mic.granted)
        throw new Error(
          "Camera or microphone permission is missing. Return to Permissions & evidence to allow access.",
        );
      const config = await storage.read<Config>("config");
      if (!config) throw new Error("Connect your safety service first.");
      const status = await api<Status>(config, "/api/status");
      if (!status.active)
        throw new Error(
          "Recording is available during an active SOS. Saved clips remain accessible below.",
        );
      setNotice("");
      setReady(false);
      setOpen(true);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Camera unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (PREVIEW_MODE || !camera.current || !ready || recording.current) return;
    recording.current = true;
    setCapturing(true);
    setNotice("Recording video and audio · maximum 2 minutes");
    try {
      const result = await camera.current.recordAsync({
        maxDuration: 120,
        maxFileSize: 50 * 1024 * 1024,
      });
      if (!result?.uri) throw new Error("No recording was returned.");
      const folder = new Directory(Paths.document, "evidence");
      folder.create({ intermediates: true, idempotent: true });
      const file = new File(result.uri);
      const format = evidenceFormat(result.uri);
      const target = new File(folder, `SOS-${Date.now()}.${format.extension}`);
      file.copy(target);
      if (mounted.current) {
        reload();
        setNotice(
          "Saved on this phone only. Export a copy if you want to keep it elsewhere. Uninstalling the app deletes its recordings.",
        );
      }
      file.delete();
    } catch (e) {
      if (mounted.current)
        setNotice(
          `Recording could not be saved: ${e instanceof Error ? e.message : "unknown error"}`,
        );
    } finally {
      recording.current = false;
      if (mounted.current) {
        setCapturing(false);
        setOpen(false);
        setReady(false);
      }
    }
  }
  async function exportClip(uri: string) {
    if (PREVIEW_MODE) return;
    try {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("Sharing is not available on this device.");
      const { mimeType, UTI } = evidenceFormat(uri);
      await Sharing.shareAsync(uri, { mimeType, UTI });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Export failed");
    }
  }
  function removeClip(clip: Clip) {
    Alert.alert(
      "Delete recording?",
      "This permanently deletes the clip from this app.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (PREVIEW_MODE) return;
            try {
              new File(clip.uri).delete();
              reload();
            } catch {
              setNotice("Could not delete recording.");
            }
          },
        },
      ],
    );
  }
  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.heading}>Optional evidence</Text>
        <Text style={s.body}>
          Video with audio, saved on this phone. No automatic upload. Recording
          uses the visible camera and stops when you leave the app. It does not
          change your SOS alerts.
        </Text>
        {PREVIEW_MODE ? (
          <Text style={s.body}>
            OFFLINE PREVIEW · no camera or microphone access
          </Text>
        ) : null}
        {open ? (
          <>
            <View style={s.camera}>
              <CameraView
                ref={camera}
                style={{ flex: 1 }}
                facing="back"
                mode="video"
                videoQuality="720p"
                mute={false}
                onCameraReady={() => setReady(true)}
                onMountError={(e) => {
                  setNotice(e.message);
                  setOpen(false);
                }}
              />
            </View>
            <Button
              label={
                capturing
                  ? "Stop & save recording"
                  : "Start recording video & audio"
              }
              disabled={!ready}
              onPress={() => {
                if (recording.current) camera.current?.stopRecording();
                else void start();
              }}
            />
            {!capturing ? (
              <Button label="Close camera" onPress={() => setOpen(false)} />
            ) : null}
          </>
        ) : (
          <Button
            label="Record evidence during SOS"
            disabled={busy}
            onPress={() => void prepare()}
          />
        )}
        {notice ? (
          <Text accessibilityRole="alert" style={s.body}>
            {notice}
          </Text>
        ) : null}
        <Text style={s.label}>Saved recordings ({clips.length})</Text>
        {clips.length === 0 ? (
          <Text style={s.body}>No recordings saved.</Text>
        ) : null}
        {clips.map((clip) => (
          <View key={clip.uri} style={s.clip}>
            <Text style={s.body}>
              {new Date(Number(clip.name.slice(4, -4))).toLocaleString()}
            </Text>
            <Button
              label="Export recording"
              onPress={() => void exportClip(clip.uri)}
            />
            <Button label="Delete recording" onPress={() => removeClip(clip)} />
          </View>
        ))}
        {!PREVIEW_MODE ? (
          <Button
            label="Open phone permission settings"
            disabled={capturing}
            onPress={() => void Linking.openSettings()}
          />
        ) : null}
        <Button
          label="Back to SOS"
          disabled={capturing}
          onPress={() => router.back()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
function Button({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, disabled && { opacity: 0.4 }]}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f7f3" },
  page: {
    padding: 24,
    gap: 16,
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
  },
  heading: { fontSize: 28, fontWeight: "700", color: "#163e35" },
  label: { fontSize: 19, fontWeight: "600", color: "#163e35" },
  body: { fontSize: 16, lineHeight: 23, color: "#344e47" },
  camera: { height: 320, overflow: "hidden", borderRadius: 16 },
  button: {
    minHeight: 48,
    padding: 16,
    backgroundColor: "#163e35",
    borderRadius: 12,
    justifyContent: "center",
  },
  buttonText: {
    color: "white",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
  },
  clip: { gap: 10, padding: 16, backgroundColor: "white", borderRadius: 12 },
});
