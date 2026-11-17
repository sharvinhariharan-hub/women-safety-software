import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { SosButton } from "../components/SosButton";
import { PREVIEW_MODE } from "../preview";
import { createRetryAuthorization } from "../safety/hold";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import {
  api,
  Config,
  Contact,
  Incident,
  Profile,
  Status,
  storage,
} from "../api";
import {
  recordLocation,
  startTracking,
  stopTracking,
  uploadLatest,
} from "../tracking";

const blankContact = (): Contact => ({
  name: "",
  phone: "",
  consentConfirmed: false,
  channels: ["sms", "whatsapp"],
});
const emptyProfile: Profile = {
  name: "",
  contacts: [blankContact()],
  policeEnabled: false,
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Connection unavailable";
const labels: Record<string, string> = {
  test_only: "Test only · nothing sent",
  pending: "Queued on server",
  submitting: "Contacting provider",
  submitted: "Submitted · receipt not confirmed",
  delivered: "Delivery confirmed",
  failed: "Delivery failed",
  unknown: "Delivery uncertain · check independently",
  not_configured: "Channel not connected",
  canceled: "Canceled before sending",
};

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [url, setUrl] = useState("https://");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [editing, setEditing] = useState(true);
  const [pairing, setPairing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const sending = useRef(false);
  const retry = useRef(createRetryAuthorization());
  const [details, setDetails] = useState(false);
  const active = status?.active ?? null;
  const activeId = active?.id,
    activeExpiresAt = active?.expiresAt;

  useEffect(() => {
    Promise.all([
      storage.read<Config>("config"),
      storage.read<boolean>("prepared"),
      storage.read<string>("pending-sos"),
    ])
      .then(([c, prepared, savedRequest]) => {
        setPending(Boolean(savedRequest));
        if (c) {
          setConfig(c);
          setUrl(c.url);
          setToken(c.token);
          setEditing(!prepared);
        }
      })
      .catch((e) => setError(message(e)))
      .finally(() => setBooting(false));
  }, []);

  const sendPending = useCallback(async () => {
    if (!config || sending.current || !retry.current.permitted()) return;
    sending.current = true;
    try {
      const requestId = await storage.read<string>("pending-sos");
      if (!requestId) return;
      setPending(true);
      const incident = await api<Incident>(config, "/api/incidents", "POST", {
        requestId,
      });
      await storage.remove("pending-sos");
      setPending(false);
      setStatus((old) =>
        old
          ? { ...old, active: incident.status === "active" ? incident : null }
          : old,
      );
      setError("");
    } catch (e) {
      setError(
        `SOS not confirmed by server. Retrying while this app is open. ${message(e)}`,
      );
    } finally {
      sending.current = false;
    }
  }, [config]);

  const refresh = useCallback(async () => {
    if (!config) return;
    await sendPending();
    try {
      const next = await api<Status>(config, "/api/status");
      setStatus(next);
      if (!next.profile) setEditing(true);
      else await storage.write("prepared", true);
      if (!next.active && (await storage.read("session"))) await stopTracking();
      setError((old) => (old.startsWith("SOS not confirmed") ? old : ""));
      await uploadLatest().catch(() => {});
    } catch (e) {
      setError(`Server connection unavailable. ${message(e)}`);
    }
  }, [config, sendPending]);

  useEffect(() => {
    if (!config) return;
    let mounted = true;
    api<Status>(config, "/api/status")
      .then((next) => {
        if (mounted) {
          setStatus(next);
          setProfile(next.profile ?? emptyProfile);
          setEditing(!next.profile);
        }
      })
      .catch((e) => {
        if (mounted) setError(message(e));
      });
    const interval = setInterval(() => {
      if (AppState.currentState === "active") {
        setNow(Date.now());
        void refresh();
      }
    }, 5000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
      else retry.current.deny();
    });
    return () => {
      mounted = false;
      clearInterval(interval);
      listener.remove();
    };
  }, [config, refresh]);

  useEffect(() => {
    if (PREVIEW_MODE || !activeId || !activeExpiresAt) return;
    let subscription: Location.LocationSubscription | undefined,
      canceled = false;
    const start = async () => {
      const foreground = await Location.getForegroundPermissionsAsync();
      if (foreground.status !== "granted") {
        setNotice(
          "Location permission missing. Alerts can be created, but location is unavailable.",
        );
        return;
      }
      try {
        const background = await startTracking(activeId, activeExpiresAt);
        if (!canceled)
          setNotice(
            background
              ? "Background location enabled. System location indicators may remain visible."
              : "Foreground location only. Keep this app open to update your location.",
          );
      } catch {
        if (!canceled)
          setNotice(
            "Background tracking unavailable. Keep this app open for location updates.",
          );
      }
      const update = (position: Location.LocationObject) => {
        if (!canceled)
          void recordLocation(position).catch(() =>
            setNotice(
              "Latest location saved on this phone; upload not confirmed. Retrying.",
            ),
          );
      };
      const last = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
      if (last) update(last);
      const watcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        update,
      );
      if (canceled) watcher.remove();
      else subscription = watcher;
    };
    void start().catch((e) => {
      if (!canceled) setNotice(`Location unavailable: ${message(e)}`);
    });
    return () => {
      canceled = true;
      subscription?.remove();
    };
  }, [activeId, activeExpiresAt]);

  async function pair() {
    setBusy(true);
    setError("");
    try {
      const parsed = new URL(url.trim());
      if (
        !["https:", "http:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        parsed.pathname !== "/"
      )
        throw new Error(
          "Enter a server origin, such as https://safety.example.org",
        );
      const next = { url: parsed.origin, token: token.trim() };
      const result = await api<Status>(next, "/api/status");
      if (parsed.protocol !== "https:" && result.mode !== "test")
        throw new Error("Use HTTPS for a live connection");
      await storage.write("config", next);
      await storage.write("prepared", Boolean(result.profile));
      setPairing(false);
      setConfig(next);
      setStatus(result);
      setProfile(result.profile ?? emptyProfile);
      setEditing(!result.profile);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile() {
    if (!config) return;
    setBusy(true);
    setError("");
    try {
      await api(config, "/api/profile", "PUT", profile);
      await storage.write("prepared", true);
      const permission = PREVIEW_MODE
        ? { status: "granted" }
        : await Location.requestForegroundPermissionsAsync();
      setNotice(
        permission.status === "granted"
          ? "Location ready while the app is open."
          : "Location denied. SOS texts can still be submitted, without a location.",
      );
      setEditing(false);
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function backgroundPermission() {
    if (PREVIEW_MODE) {
      setNotice("Offline preview: no location permission is requested.");
      return;
    }
    try {
      Alert.alert(
        "Background location",
        "Your phone may open system settings. Allow background location to keep updating an active SOS when this app is not on screen. System indicators may be visible.",
        [
          { text: "Later", style: "cancel" },
          {
            text: "Continue",
            onPress: () => {
              void Location.requestBackgroundPermissionsAsync()
                .then((p) =>
                  setNotice(
                    p.status === "granted"
                      ? "Background location permitted. A development build is required."
                      : "Background permission denied. Keep the app open during SOS.",
                  ),
                )
                .catch((e) => setError(message(e)));
            },
          },
        ],
      );
    } catch (e) {
      setError(message(e));
    }
  }
  async function trigger() {
    if (busy || active) return;
    setBusy(true);
    setError("");
    try {
      if (!(await storage.read<string>("pending-sos")))
        await storage.write("pending-sos", Crypto.randomUUID());
      retry.current.allow();
      setPending(true);
      await sendPending();
    } catch (e) {
      setError(`SOS could not be saved: ${message(e)}`);
    } finally {
      setBusy(false);
    }
  }
  async function end() {
    if (!config || !active) return;
    setBusy(true);
    try {
      await api(config, `/api/incidents/${active.id}/end`, "POST");
      if (!PREVIEW_MODE) await stopTracking();
      retry.current.deny();
      setStatus((old) => (old ? { ...old, active: null } : old));
      setNotice(
        "Sharing ended. Existing texts cannot be recalled. This does not cancel an emergency-service response.",
      );
    } catch (e) {
      setError(`Ending sharing was not confirmed. ${message(e)}`);
    } finally {
      setBusy(false);
    }
  }
  function updateContact(index: number, changes: Partial<Contact>) {
    setProfile((p) => ({
      ...p,
      contacts: p.contacts.map((c, i) =>
        i === index ? { ...c, ...changes } : c,
      ),
    }));
  }

  if (booting)
    return (
      <View style={s.loading}>
        <ActivityIndicator color="#163e35" />
        <Text>Opening Women Safety…</Text>
      </View>
    );
  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView
        style={s.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={s.page}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.top}>
            <View>
              <Text style={s.brand}>Women Safety</Text>
            </View>
            {config && !pairing ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={editing ? "Back to SOS" : "Settings"}
                disabled={busy || Boolean(active) || pending}
                onPress={() => {
                  setProfile(status?.profile ?? emptyProfile);
                  setEditing(!editing);
                }}
                hitSlop={8}
              >
                <Text style={s.settingsLink}>
                  {editing ? "Back" : "Settings"}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <View style={s.banner}>
            <Text style={s.bannerText}>
              {PREVIEW_MODE
                ? "OFFLINE PREVIEW · NO ALERTS CAN BE SENT"
                : !status
                  ? "Connecting to your safety service…"
                  : status.mode === "live"
                    ? "Live mode"
                    : "Test mode · nothing will be sent"}
            </Text>
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          {!config || pairing ? (
            <View style={s.card}>
              <Text style={s.heading}>Connect your safety server</Text>
              <Text style={s.body}>
                Pair once using the private owner token generated by the
                backend. Never share this token with emergency contacts.
              </Text>
              <Text style={s.label}>Server URL</Text>
              <TextInput
                accessibilityLabel="Server URL"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={url}
                onChangeText={setUrl}
                style={s.input}
              />
              <Text style={s.label}>Private owner token</Text>
              <TextInput
                accessibilityLabel="Private owner token"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                value={token}
                onChangeText={setToken}
                style={s.input}
              />
              {
                <Action
                  title="Connect securely"
                  onPress={() => void pair()}
                  disabled={busy}
                />
              }
              {config ? (
                <Action
                  title="Back to SOS"
                  onPress={() => setPairing(false)}
                  secondary
                  disabled={busy}
                />
              ) : null}
            </View>
          ) : editing ? (
            <View style={s.card}>
              <Text style={s.heading}>Choose your safety circle</Text>
              <Text style={s.body}>
                Add up to six people or consenting support organisations. Use
                international phone numbers, such as +919876543210.
              </Text>
              <Text style={s.label}>Your name</Text>
              <TextInput
                accessibilityLabel="Your name"
                value={profile.name}
                maxLength={80}
                onChangeText={(name) => setProfile((p) => ({ ...p, name }))}
                style={s.input}
              />
              {profile.contacts.map((contact, i) => (
                <View style={s.contact} key={i}>
                  <Text style={s.label}>Contact {i + 1}</Text>
                  <TextInput
                    accessibilityLabel={`Contact ${i + 1} name`}
                    placeholder="Name"
                    value={contact.name}
                    maxLength={80}
                    onChangeText={(name) => updateContact(i, { name })}
                    style={s.input}
                  />
                  <TextInput
                    accessibilityLabel={`Contact ${i + 1} phone`}
                    placeholder="+ country code and number"
                    keyboardType="phone-pad"
                    value={contact.phone}
                    onChangeText={(phone) => updateContact(i, { phone })}
                    style={s.input}
                  />
                  {(["sms", "whatsapp"] as const).map((channel) => (
                    <View key={channel} style={s.row}>
                      <Text style={s.flex}>
                        {channel === "sms" ? "Send SMS" : "Send WhatsApp"}
                      </Text>
                      <Switch
                        accessibilityLabel={`Contact ${i + 1} ${channel}`}
                        value={(contact.channels ?? ["sms"]).includes(channel)}
                        onValueChange={(enabled) =>
                          updateContact(i, {
                            channels: enabled
                              ? [...(contact.channels ?? ["sms"]), channel]
                              : (contact.channels ?? ["sms"]).filter(
                                  (c) => c !== channel,
                                ),
                            ...(enabled ? { consentConfirmed: false } : {}),
                          })
                        }
                      />
                    </View>
                  ))}
                  <View style={s.row}>
                    <Text style={s.flex}>
                      This person agreed to receive SOS alerts through the
                      selected channels
                    </Text>
                    <Switch
                      accessibilityLabel={`Contact ${i + 1} consent`}
                      value={contact.consentConfirmed}
                      onValueChange={(consentConfirmed) =>
                        updateContact(i, { consentConfirmed })
                      }
                    />
                  </View>
                  {profile.contacts.length > 1 ? (
                    <Action
                      title="Remove contact"
                      onPress={() =>
                        setProfile((p) => ({
                          ...p,
                          contacts: p.contacts.filter((_, j) => j !== i),
                        }))
                      }
                      secondary
                      disabled={busy}
                    />
                  ) : null}
                </View>
              ))}
              {profile.contacts.length < 6 ? (
                <Action
                  title="+ Add another contact"
                  onPress={() =>
                    setProfile((p) => ({
                      ...p,
                      contacts: [...p.contacts, blankContact()],
                    }))
                  }
                  secondary
                  disabled={busy}
                />
              ) : null}
              <View style={s.row}>
                <Text style={s.flex}>
                  Also alert a connected police partner
                </Text>
                <Switch
                  accessibilityLabel="Alert a connected police partner"
                  value={profile.policeEnabled}
                  onValueChange={(policeEnabled) =>
                    setProfile((p) => ({ ...p, policeEnabled }))
                  }
                />
              </View>
              <Text style={s.caption}>
                Requires a consenting agency connection and location. Nearby
                stations are not automatically connected.
              </Text>
              <Text style={s.caption}>
                SMS: {status?.smsConfigured ? "configured" : "not connected"} ·
                WhatsApp:{" "}
                {status?.whatsappConfigured ? "configured" : "not connected"} ·
                Police:{" "}
                {status?.policeConfigured
                  ? "partner configured"
                  : "not connected"}
                . Telephone calls are not connected.
              </Text>
              <Action
                title="Location permissions"
                onPress={() => void backgroundPermission()}
                secondary
                disabled={busy}
              />
              <Action
                title="Server settings"
                onPress={() => setPairing(true)}
                secondary
                disabled={busy || PREVIEW_MODE}
              />
              {
                <Action
                  title="Save contacts & prepare location"
                  onPress={() => void saveProfile()}
                  disabled={busy}
                />
              }
              {status?.profile ? (
                <Action
                  title="Back to SOS"
                  onPress={() => setEditing(false)}
                  secondary
                  disabled={busy}
                />
              ) : null}
            </View>
          ) : (
            <View style={s.home}>
              <Text style={s.homeTitle}>
                {active
                  ? PREVIEW_MODE
                    ? "Practice complete"
                    : "SOS active"
                  : pending
                    ? "Unconfirmed SOS saved"
                    : "Here when you need help."}
              </Text>
              <Text style={s.homeSubtitle}>
                {active
                  ? PREVIEW_MODE
                    ? "Nothing was sent. No location was accessed."
                    : "Check delivery below. Help is not yet confirmed."
                  : pending
                    ? "Hold to resume the same request. Opening the app does not resend it."
                    : PREVIEW_MODE
                      ? "3 sample contacts · offline preview"
                      : `${status?.profile?.contacts.length ?? 0} selected contacts · SMS & WhatsApp`}
              </Text>
              {!active ? (
                <SosButton
                  onActivate={() => void trigger()}
                  disabled={busy}
                  pending={pending}
                  preview={PREVIEW_MODE || status?.mode === "test"}
                />
              ) : (
                <View style={s.activeCircle}>
                  <Text style={s.activeLabel}>
                    {PREVIEW_MODE ? "TESTED" : "ACTIVE"}
                  </Text>
                </View>
              )}
              {!PREVIEW_MODE &&
              !active &&
              status?.mode === "live" &&
              (!status.smsConfigured || !status.whatsappConfigured) ? (
                <Text style={s.error}>
                  Some delivery channels are not connected. Check Settings.
                </Text>
              ) : null}
              {active ? (
                <>
                  <Action
                    title={
                      details ? "Hide delivery status" : "View delivery status"
                    }
                    onPress={() => setDetails((v) => !v)}
                    secondary
                  />
                  {details ? (
                    <View style={s.card}>
                      <Text style={s.heading}>Delivery status</Text>
                      <Text style={s.item}>
                        Location:{" "}
                        {active.location
                          ? `${Math.max(0, Math.floor((now - active.location.timestamp) / 1000))} seconds old · ±${Math.round(active.location.accuracy)}m`
                          : PREVIEW_MODE
                            ? "not accessed in this preview"
                            : "waiting for a fix"}
                      </Text>
                      {active.jobs.map((job) => (
                        <View key={job.id} style={s.delivery}>
                          <Text style={s.label}>
                            {job.name} ·{" "}
                            {job.kind === "whatsapp"
                              ? "WhatsApp"
                              : job.kind === "police"
                                ? "police partner"
                                : "SMS"}
                          </Text>
                          <Text style={s.caption}>
                            {labels[job.status] ?? job.status}
                          </Text>
                        </View>
                      ))}
                      {!active.jobs.some((j) => j.kind === "police") &&
                      status?.profile?.policeEnabled ? (
                        <Text style={s.error}>No police alert submitted.</Text>
                      ) : null}
                    </View>
                  ) : null}
                  <Action
                    title={
                      PREVIEW_MODE ? "Back to practice" : "End location sharing"
                    }
                    onPress={() =>
                      PREVIEW_MODE
                        ? void end()
                        : Alert.alert(
                            "End sharing?",
                            "This revokes the private link. It cannot recall texts or cancel an emergency response.",
                            [
                              { text: "Keep sharing", style: "cancel" },
                              {
                                text: "End sharing",
                                onPress: () => void end(),
                              },
                            ],
                          )
                    }
                    secondary
                    disabled={busy}
                  />
                </>
              ) : null}
            </View>
          )}
          {notice && (editing || active) ? (
            <Text style={s.notice}>{notice}</Text>
          ) : null}
          <Text style={s.footer}>
            {PREVIEW_MODE
              ? "Safe to try · no calls, messages, or GPS access."
              : "Development version · delivery is not guaranteed."}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Action({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, secondary && s.secondary, disabled && s.disabled]}
    >
      <Text style={[s.buttonText, secondary && s.secondaryText]}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fafaf7" },
  settingsLink: { fontSize: 14, color: "#4a5e53", padding: 10 },
  home: { flex: 1, justifyContent: "center", gap: 14, paddingVertical: 28 },
  homeTitle: {
    fontSize: 25,
    fontWeight: "600",
    color: "#243b30",
    textAlign: "center",
    letterSpacing: -0.7,
  },
  homeSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: "#68736b",
    textAlign: "center",
  },
  activeCircle: {
    width: 260,
    aspectRatio: 1,
    borderRadius: 150,
    backgroundColor: "#e4eee7",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 28,
  },
  activeLabel: { color: "#245039", fontSize: 36, fontWeight: "700" },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    backgroundColor: "#eef3ef",
  },
  page: {
    padding: 24,
    paddingTop: 20,
    paddingBottom: 24,
    flexGrow: 1,
    maxWidth: 460,
    width: "100%",
    alignSelf: "center",
    gap: 18,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: "700",
    color: "#516a60",
  },
  brand: {
    fontSize: 27,
    fontWeight: "700",
    letterSpacing: -1,
    color: "#173b32",
    marginTop: 7,
  },
  version: { color: "#5c7168" },
  banner: { backgroundColor: "#dce9df", borderRadius: 8, padding: 13 },
  bannerText: { color: "#234938", fontSize: 12, fontWeight: "700" },
  hero: {
    fontSize: 42,
    letterSpacing: -1.6,
    lineHeight: 46,
    fontWeight: "700",
    color: "#193c33",
    marginTop: 14,
  },
  body: { fontSize: 16, lineHeight: 25, color: "#50675e" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 22,
    gap: 14,
    borderWidth: 1,
    borderColor: "#d6e0d9",
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: "#193c33",
    letterSpacing: -0.5,
  },
  label: { fontSize: 14, fontWeight: "600", color: "#25483c" },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#c5d3cb",
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#183b32",
    backgroundColor: "#fbfcfb",
    fontSize: 16,
  },
  button: {
    minHeight: 48,
    padding: 14,
    backgroundColor: "#1c4a3c",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: { backgroundColor: "#edf3ee" },
  buttonText: { fontWeight: "700", color: "#fff", fontSize: 14 },
  secondaryText: { color: "#1c4a3c" },
  disabled: { opacity: 0.5 },
  sos: {
    width: "84%",
    aspectRatio: 1,
    maxWidth: 280,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ab303e",
    borderRadius: 150,
    marginVertical: 22,
    borderWidth: 12,
    borderColor: "#e9cdd0",
    gap: 6,
  },
  sosTitle: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 48,
    letterSpacing: 2,
  },
  sosSubtitle: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1,
  },
  contact: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: "#e0e8e1",
    gap: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1, color: "#3b584b", fontSize: 14, lineHeight: 21 },
  caption: { color: "#5a6c63", fontSize: 13, lineHeight: 20 },
  item: { color: "#375647", lineHeight: 22, fontSize: 14 },
  delivery: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: "#e4ebe6",
    gap: 4,
  },
  error: {
    color: "#9d2637",
    backgroundColor: "#fcebee",
    padding: 14,
    borderRadius: 8,
    fontSize: 14,
    lineHeight: 22,
  },
  notice: { color: "#345746", fontSize: 13, lineHeight: 21 },
  footer: {
    color: "#707971",
    fontSize: 11,
    lineHeight: 18,
    textAlign: "center",
  },
});
