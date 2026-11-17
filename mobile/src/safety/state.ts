import type { Incident, Status } from "../api";

/** An accepted SOS must be visible even if the earlier status request failed. */
export function withAcceptedIncident(
  previous: Status | null,
  incident: Incident,
): Status {
  return {
    ...(previous ?? {
      mode: incident.mode ?? "test",
      smsConfigured: false,
      whatsappConfigured: false,
      policeConfigured: false,
      voiceEngine: "pipecat",
      voiceCallingConfigured: false,
      profile: null,
    }),
    active: incident.status === "active" ? incident : null,
  };
}
