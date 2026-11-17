import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { api, Config, Fix, storage } from "./api";
export const TASK = "women-safety-active-sos";
type Session = { incidentId: string; expiresAt: number };
export function fix(value: Location.LocationObject): Fix {
  return {
    latitude: value.coords.latitude,
    longitude: value.coords.longitude,
    accuracy: value.coords.accuracy ?? 9999,
    timestamp: value.timestamp,
  };
}
export async function uploadLatest() {
  const [config, session, position] = await Promise.all([
    storage.read<Config>("config"),
    storage.read<Session>("session"),
    storage.read<Fix>("latest-fix"),
  ]);
  if (!config || !session || !position) return;
  if (session.expiresAt <= Date.now()) {
    await stopTracking();
    return;
  }
  await api(
    config,
    `/api/incidents/${session.incidentId}/location`,
    "PUT",
    position,
  );
}
export async function recordLocation(value: Location.LocationObject) {
  if (!(await storage.read<Session>("session"))) return;
  await storage.write("latest-fix", fix(value));
  await uploadLatest();
}
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  TASK,
  async ({ data, error }) => {
    if (error || !data?.locations.length) return;
    try {
      await recordLocation(data.locations[data.locations.length - 1]);
    } catch {
      /* Persist latest fix; retry on next update or foreground sync. */
    }
  },
);
export async function startTracking(
  incidentId: string,
  expiresAt: number,
): Promise<boolean> {
  await storage.write("session", { incidentId, expiresAt });
  const permission = await Location.getBackgroundPermissionsAsync();
  if (
    permission.status !== "granted" ||
    !(await TaskManager.isAvailableAsync())
  )
    return false;
  if (!(await Location.hasStartedLocationUpdatesAsync(TASK)))
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "SOS location sharing active",
        notificationBody:
          "Your selected contacts can view your latest location.",
      },
    });
  return true;
}
export async function stopTracking() {
  await storage.remove("session");
  await storage.remove("latest-fix");
  if (await Location.hasStartedLocationUpdatesAsync(TASK))
    await Location.stopLocationUpdatesAsync(TASK);
}
