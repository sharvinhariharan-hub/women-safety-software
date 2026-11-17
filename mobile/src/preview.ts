import type { Config, Incident, Profile, Status } from "./api";
export const PREVIEW_MODE = process.env.EXPO_PUBLIC_PREVIEW_MODE === "true";
export const PREVIEW_CONFIG: Config = {
  url: "https://offline-preview.invalid",
  token: "preview-only-not-a-real-credential",
};
let profile: Profile = {
  name: "Demo User",
  policeEnabled: false,
  contacts: Array.from({ length: 3 }, (_, i) => ({
    name: `Sample contact ${i + 1}`,
    phone: `+1202555010${i}`,
    consentConfirmed: true,
    channels: ["sms", "whatsapp"],
  })),
};
let active: Incident | null = null;
const values = new Map<string, unknown>([
  ["config", PREVIEW_CONFIG],
  ["prepared", true],
]);
export const previewStorage = {
  read<T>(key: string): T | null {
    return (values.get(key) ?? null) as T | null;
  },
  write(key: string, value: unknown) {
    values.set(key, value);
  },
  remove(key: string) {
    values.delete(key);
  },
};
/** Deliberately no fetch, sockets, phone/location APIs, or live fallback. */
export async function previewApi<T>(
  path: string,
  method: string,
  data?: unknown,
): Promise<T> {
  let result: unknown;
  if (path === "/api/status" && method === "GET") {
    const status: Status = {
      mode: "test",
      profile,
      active,
      smsConfigured: false,
      whatsappConfigured: false,
      policeConfigured: false,
      voiceEngine: "pipecat",
      voiceCallingConfigured: false,
    };
    result = status;
  } else if (path === "/api/profile" && method === "PUT") {
    profile = data as Profile;
    result = { saved: true };
  } else if (path === "/api/incidents" && method === "POST") {
    active ??= {
      id: "00000000-0000-4000-8000-000000000001",
      status: "active",
      expiresAt: Date.now() + 86400000,
      location: null,
      jobs: profile.contacts.flatMap((c, i) =>
        (c.channels ?? ["sms"]).map((kind) => ({
          id: `${i}-${kind}`,
          name: c.name,
          kind,
          phase: "sos",
          status: "test_only",
        })),
      ),
    };
    result = active;
  } else if (path === `/api/incidents/${active?.id}/end` && method === "POST") {
    result = { ...active, status: "ended" };
    active = null;
  } else {
    throw new Error("This action is unavailable in the offline preview.");
  }
  return JSON.parse(JSON.stringify(result)) as T;
}
