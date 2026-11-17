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
  delivered: "SMS delivery confirmed",
  failed: "Delivery failed",
  unknown: "Delivery uncertain · check independently",
  not_configured: "SMS not connected",
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
  const active = status?.active ?? null;
  const activeId = active?.id,
    activeExpiresAt = active?.expiresAt;

  useEffect(() => {
    Promise.all([
      storage.read<Config>("config"),
      storage.read<boolean>("prepared"),
    ])
      .then(([c, prepared]) => {
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
    if (!config || sending.current) return;
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
    });
    return () => {
      mounted = false;
      clearInterval(interval);
      listener.remove();
    };
  }, [config, refresh]);

  useEffect(() => {
    if (!activeId || !activeExpiresAt) return;
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
      const permission = await Location.requestForegroundPermissionsAsync();
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
    if (busy || pending || active) return;
    setBusy(true);
    setError("");
    try {
      await storage.write("pending-sos", Crypto.randomUUID());
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
      await stopTracking();
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
            <Text style={s.eyebrow}>YOUR PEOPLE. ONE SIGNAL.</Text>
            <Text style={s.brand}>Women Safety</Text>
          </View>
          <Text style={s.version}>v0.1</Text>
        </View>
        <View style={s.banner}>
          <Text style={s.bannerText}>
            {!status
              ? "CONNECTING · server mode is not yet confirmed"
              : status.mode === "live"
                ? "LIVE MODE · provider delivery is shown below"
                : "TEST MODE · no texts or police alerts are sent"}
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
              Pair once using the private owner token generated by the backend.
              Never share this token with emergency contacts.
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
                <View style={s.row}>
                  <Text style={s.flex}>
                    This person agreed to receive my SOS alerts
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
              <Text style={s.flex}>Also alert a connected police partner</Text>
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
          <>
            <Text style={s.hero}>
              {active
                ? "Your SOS is active."
                : pending
                  ? "Connecting your SOS…"
                  : "Help starts with\none tap."}
            </Text>
            <Text style={s.body}>
              {active
                ? "Check the delivery status for each contact. An active SOS does not confirm that help is on the way."
                : pending
                  ? "The request is saved on this phone. Keep the app open to retry. Nobody is confirmed alerted yet."
                  : "Your selected people receive an emergency text and a private link to your latest location."}
            </Text>
            {!active ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  status?.mode === "test"
                    ? "Activate test SOS"
                    : "Activate SOS immediately"
                }
                disabled={busy || pending}
                onPress={() => void trigger()}
                style={[s.sos, (busy || pending) && s.disabled]}
              >
                <Text style={s.sosTitle}>{pending ? "SENDING" : "SOS"}</Text>
                <Text style={s.sosSubtitle}>
                  {status?.mode === "test"
                    ? "TAP TO TEST"
                    : "TAP TO SEND HELP REQUEST"}
                </Text>
              </Pressable>
            ) : null}
            {pending ? (
              <Action
                title="Stop retrying this request"
                onPress={() =>
                  Alert.alert(
                    "Stop local retries?",
                    "The server may already have received this SOS. Stopping retries does not recall messages or end an existing alert. Reconnect to check its status.",
                    [
                      { text: "Keep retrying", style: "cancel" },
                      {
                        text: "Stop retries",
                        onPress: () => {
                          void storage
                            .remove("pending-sos")
                            .then(() => {
                              setPending(false);
                              setError(
                                "Retries stopped. Reconnect to check whether the server received the SOS.",
                              );
                            })
                            .catch((e) => setError(message(e)));
                        },
                      },
                    ],
                  )
                }
                secondary
                disabled={busy}
              />
            ) : null}
            <View style={s.card}>
              <Text style={s.heading}>
                {active ? "Alert status" : "Ready check"}
              </Text>
              <Text style={s.item}>
                {status?.profile?.contacts.length ?? 0} selected emergency
                contacts
              </Text>
              <Text style={s.item}>
                SMS:{" "}
                {status?.smsConfigured ? "provider connected" : "not connected"}
              </Text>
              <Text style={s.item}>
                Police:{" "}
                {!status?.profile?.policeEnabled
                  ? "not selected"
                  : status?.policeConfigured
                    ? "partner configured; see submission status"
                    : "not connected · no agency can be alerted"}
              </Text>
              {active ? (
                <>
                  <Text style={s.item}>
                    Location:{" "}
                    {active.location
                      ? `${Math.max(0, Math.floor((now - active.location.timestamp) / 1000))} seconds old · ±${Math.round(active.location.accuracy)}m`
                      : "waiting for a fix"}
                  </Text>
                  {active.jobs.map((job) => (
                    <View key={job.id} style={s.delivery}>
                      <Text style={s.label}>
                        {job.name}
                        {job.kind === "police" ? " · police partner" : ""}
                      </Text>
                      <Text style={s.caption}>
                        {labels[job.status] ?? job.status}
                      </Text>
                    </View>
                  ))}
                  {!active.jobs.some((j) => j.kind === "police") &&
                  status?.profile?.policeEnabled ? (
                    <Text style={s.error}>
                      No police alert submitted. Waiting for location or a
                      configured station in range.
                    </Text>
                  ) : null}
                  {
                    <Action
                      title="End location sharing"
                      onPress={() =>
                        Alert.alert(
                          "End sharing?",
                          "This revokes the link. Texts already submitted cannot be recalled, and this does not cancel any emergency response.",
                          [
                            { text: "Keep sharing", style: "cancel" },
                            { text: "End sharing", onPress: () => void end() },
                          ],
                        )
                      }
                      secondary
                      disabled={busy}
                    />
                  }
                </>
              ) : (
                <>
                  {
                    <Action
                      title="Edit emergency contacts"
                      onPress={() => {
                        setProfile(status?.profile ?? emptyProfile);
                        setEditing(true);
                      }}
                      secondary
                      disabled={busy || pending}
                    />
                  }
                  {
                    <Action
                      title="Enable background location"
                      onPress={() => void backgroundPermission()}
                      secondary
                      disabled={busy || pending}
                    />
                  }
                  {
                    <Action
                      title="Server settings"
                      onPress={() => setPairing(true)}
                      secondary
                      disabled={busy || pending}
                    />
                  }
                </>
              )}
            </View>
          </>
        )}
        {notice ? <Text style={s.notice}>{notice}</Text> : null}
        <Text style={s.footer}>
          Early development release. Internet and server access are required.
          Phone shutdown, permissions, and OS restrictions can interrupt
          tracking. This app does not guarantee delivery or emergency response.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
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
  root: { flex: 1, backgroundColor: "#eef3ef" },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    backgroundColor: "#eef3ef",
  },
  page: {
    padding: 24,
    paddingTop: 64,
    paddingBottom: 48,
    maxWidth: 620,
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
  footer: { color: "#66766d", fontSize: 12, lineHeight: 20, marginTop: 8 },
});
