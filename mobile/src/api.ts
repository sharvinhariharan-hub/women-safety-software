import * as SecureStore from "expo-secure-store";
export type Config = { url: string; token: string };
export type Contact = {
  name: string;
  phone: string;
  consentConfirmed: boolean;
  channels?: ("sms" | "whatsapp")[];
};
export type Profile = {
  name: string;
  contacts: Contact[];
  policeEnabled: boolean;
};
export type Fix = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};
export type Incident = {
  id: string;
  status: "active" | "ended" | "expired";
  expiresAt: number;
  location: Fix | null;
  jobs: {
    id: string;
    name: string;
    kind: "sms" | "whatsapp" | "police";
    phase?: "sos" | "location";
    status: string;
  }[];
};
export type Status = {
  mode: "test" | "live";
  smsConfigured: boolean;
  whatsappConfigured: boolean;
  voiceEngine: "pipecat";
  voiceCallingConfigured: boolean;
  policeConfigured: boolean;
  profile: Profile | null;
  active: Incident | null;
};
export const storage = {
  async read<T>(key: string): Promise<T | null> {
    const value = await SecureStore.getItemAsync(key);
    return value ? (JSON.parse(value) as T) : null;
  },
  async write(key: string, value: unknown) {
    await SecureStore.setItemAsync(key, JSON.stringify(value), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  },
  async remove(key: string) {
    await SecureStore.deleteItemAsync(key);
  },
};
export async function api<T>(
  config: Config,
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${config.url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Request failed");
    return result as T;
  } finally {
    clearTimeout(timer);
  }
}
