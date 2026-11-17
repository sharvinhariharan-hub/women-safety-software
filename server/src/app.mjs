import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { Store, hash } from "./store.mjs";
import { providers, nearestStation } from "./providers.mjs";
import { notification, reverseGeocode } from "./notifications.mjs";

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const validText = (s, max = 80) =>
  typeof s === "string" && s.trim().length > 0 && s.trim().length <= max;
function locationValue(value) {
  if (value == null) return null;
  if (
    !Number.isFinite(value.latitude) ||
    Math.abs(value.latitude) > 90 ||
    !Number.isFinite(value.longitude) ||
    Math.abs(value.longitude) > 180 ||
    !Number.isFinite(value.accuracy) ||
    value.accuracy < 0 ||
    !Number.isFinite(value.timestamp) ||
    value.timestamp > Date.now() + 60000 ||
    value.timestamp < Date.now() - 86400000
  )
    fail(400, "Invalid or stale location");
  return {
    latitude: value.latitude,
    longitude: value.longitude,
    accuracy: value.accuracy,
    timestamp: value.timestamp,
  };
}
async function body(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 32768) fail(413, "Request too large");
  }
  try {
    return JSON.parse(data || "{}");
  } catch {
    fail(400, "Invalid JSON");
  }
}
export function createApp(config, injected = {}) {
  if (typeof config.ownerToken !== "string" || config.ownerToken.length < 32)
    throw new Error(
      "OWNER_TOKEN must contain at least 32 random characters. Run npm run setup.",
    );
  if (!["test", "live"].includes(config.mode))
    throw new Error("ALERT_MODE must be test or live.");
  const publicUrl = new URL(config.publicUrl);
  if (config.mode === "live" && publicUrl.protocol !== "https:")
    throw new Error("Live mode requires an HTTPS PUBLIC_URL.");
  const store = new Store(config.databasePath ?? ":memory:", config.dataKey);
  const transport = injected.transport ?? providers(config);
  const registry = config.registry ?? [];
  const ownerHash = Buffer.from(hash(config.ownerToken), "hex");
  const limits = new Map();
  let working = false;
  // A crash after sending but before storing the provider response must not cause duplicate texts.
  for (const job of store.jobs())
    if (job.status === "submitting")
      store.job(job.id, job.incident, job.kind, { ...job, status: "unknown" });
  const capabilities = () => ({
    mode: config.mode,
    smsConfigured: transport.smsConfigured,
    whatsappConfigured: Boolean(transport.whatsappConfigured),
    voiceEngine: "pipecat",
    voiceCallingConfigured: false,
    policeConfigured: Boolean(
      config.policeToken && registry.some((s) => s.consentConfirmed === true),
    ),
    liveLocation: "requires_device_location_updates",
  });
  function view(incident) {
    return {
      ...incident,
      shareToken: undefined,
      requestId: undefined,
      jobs: store
        .jobs(incident.id)
        .map(({ id, name, kind, phase, status, updatedAt }) => ({
          id,
          name,
          kind,
          phase,
          status,
          updatedAt,
        })),
      ...capabilities(),
    };
  }
  function addPolice(incident) {
    if (
      !config.policeToken ||
      !incident.policeEnabled ||
      store.jobs(incident.id).some((j) => j.kind === "police")
    )
      return;
    const station = nearestStation(incident.location, registry);
    if (!station) return;
    const id = randomUUID();
    store.job(id, incident.id, "police", {
      name: station.name,
      address: station.webhook,
      status: config.mode === "test" ? "test_only" : "pending",
      updatedAt: Date.now(),
      payload: {
        event: "sos",
        incidentId: incident.id,
        name: incident.name,
        location: incident.location,
        trackingUrl: `${config.publicUrl}/track#${incident.shareToken}`,
        expiresAt: incident.expiresAt,
      },
    });
  }
  function jobStatus(kind) {
    if (config.mode === "test") return "test_only";
    const configured =
      kind === "sms" ? transport.smsConfigured : transport.whatsappConfigured;
    return configured ? "pending" : "not_configured";
  }
  function addLocationNotifications(incident) {
    if (
      !incident.location ||
      incident.status !== "active" ||
      incident.expiresAt <= Date.now() ||
      (incident.mode && incident.mode !== config.mode)
    )
      return;
    const jobs = store.jobs(incident.id);
    for (const initial of jobs) {
      if (
        !["sms", "whatsapp"].includes(initial.kind) ||
        initial.phase !== "sos" ||
        initial.containsLocation !== false ||
        !["submitted", "delivered", "unknown", "test_only"].includes(
          initial.status,
        )
      )
        continue;
      if (jobs.some((job) => job.sourceJobId === initial.id)) continue;
      const id = randomUUID();
      store.job(id, incident.id, initial.kind, {
        name: initial.name,
        address: initial.address,
        phase: "location",
        sourceJobId: initial.id,
        status: jobStatus(initial.kind),
        updatedAt: Date.now(),
        ...notification(incident, config.publicUrl, "location"),
      });
    }
  }
  async function work() {
    if (working) return;
    working = true;
    try {
      const now = Date.now();
      for (const incident of store.incidents()) {
        if (now >= incident.expiresAt && incident.status === "active") {
          incident.status = "expired";
          incident.location = null;
          store.set(`incident:${incident.id}`, incident);
        }
        if (now >= incident.expiresAt + 86400000) store.purge(incident.id);
      }
      for (const incident of store.incidents())
        addLocationNotifications(incident);
      const placeLookups = new Map();
      const placeFor = (incident) => {
        if (config.mode === "test" || !incident.location || !config.geocoderUrl)
          return Promise.resolve(null);
        if (incident.location.placeName)
          return Promise.resolve(incident.location.placeName);
        const key = `${incident.id}:${incident.location.timestamp}`;
        if (!placeLookups.has(key))
          placeLookups.set(
            key,
            reverseGeocode(incident.location, config.geocoderUrl),
          );
        return placeLookups.get(key);
      };
      await Promise.allSettled(
        store.jobs().map(async (job) => {
          const incident = store.get(`incident:${job.incident}`);
          if (
            !incident ||
            incident.status !== "active" ||
            (incident.mode && incident.mode !== config.mode) ||
            incident.expiresAt <= Date.now()
          ) {
            if (job.status === "pending")
              store.job(job.id, job.incident, job.kind, {
                ...job,
                status: "canceled",
                updatedAt: Date.now(),
              });
            return;
          }
          if (
            job.status === "submitted" &&
            ["sms", "whatsapp"].includes(job.kind) &&
            job.reference &&
            now - job.updatedAt >= 30000
          ) {
            try {
              const status = await transport.smsStatus(job.reference);
              store.job(job.id, job.incident, job.kind, {
                ...job,
                status: status ?? job.status,
                updatedAt: Date.now(),
              });
            } catch {
              /* Keep last confirmed state; next poll can retry a read. */
            }
            return;
          }
          if (job.status !== "pending") return;
          if (["sms", "whatsapp"].includes(job.kind)) {
            const place = await placeFor(incident);
            const current = store.get(`incident:${job.incident}`);
            if (
              !current ||
              current.status !== "active" ||
              current.expiresAt <= Date.now()
            )
              return;
            if (
              place &&
              current.location &&
              current.location.timestamp === incident.location?.timestamp
            ) {
              current.location.placeName = place;
              store.set(`incident:${current.id}`, current);
            }
            Object.assign(
              job,
              notification(
                current,
                config.publicUrl,
                job.phase,
                current.location?.timestamp === incident.location?.timestamp
                  ? place
                  : null,
              ),
            );
          }
          store.job(job.id, job.incident, job.kind, {
            ...job,
            status: "submitting",
            updatedAt: Date.now(),
          });
          try {
            const result = await (job.kind === "sms"
              ? transport.sms(job)
              : job.kind === "whatsapp"
                ? transport.whatsapp(job)
                : transport.police(job));
            store.job(job.id, job.incident, job.kind, {
              ...job,
              ...result,
              updatedAt: Date.now(),
            });
          } catch (error) {
            store.job(job.id, job.incident, job.kind, {
              ...job,
              status: error.definitive ? "failed" : "unknown",
              updatedAt: Date.now(),
            });
          }
        }),
      );
    } finally {
      working = false;
    }
  }
  const server = createServer(async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    try {
      const url = new URL(req.url, "http://localhost"),
        path = url.pathname;
      if (req.method === "GET" && path === "/health")
        return send(200, { status: "ok" });
      if (
        req.method === "GET" &&
        ["/track", "/tracker.js", "/tracker.css"].includes(path)
      ) {
        const filename = {
          "/track": "tracker.html",
          "/tracker.js": "tracker.js",
          "/tracker.css": "tracker.css",
        }[path];
        res.writeHead(200, {
          "Content-Type": path.endsWith(".js")
            ? "text/javascript"
            : path.endsWith(".css")
              ? "text/css"
              : "text/html",
        });
        return res.end(
          readFileSync(new URL(`../public/${filename}`, import.meta.url)),
        );
      }
      const ip = req.socket.remoteAddress;
      const now = Date.now(),
        current = limits.get(ip);
      const entry =
        !current || now - current.start > 60000
          ? { start: now, count: 0 }
          : current;
      limits.set(ip, entry);
      if (++entry.count > 240)
        return send(429, { error: "Too many requests; wait a minute" });
      if (limits.size > 10000)
        for (const [key, value] of limits)
          if (now - value.start > 60000) limits.delete(key);
      if (path === "/api/shared" && req.method === "GET") {
        const token = req.headers["x-share-token"];
        if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
          fail(404, "Link unavailable");
        const tokenHash = hash(token),
          incident = store
            .incidents()
            .find((i) => hash(i.shareToken) === tokenHash);
        if (!incident) fail(404, "Link unavailable");
        if (incident.status !== "active" || incident.expiresAt <= now)
          fail(410, "Location sharing has ended or expired");
        return send(200, {
          name: incident.name,
          status: incident.status,
          location: incident.location,
          startedAt: incident.createdAt,
          expiresAt: incident.expiresAt,
          mode: incident.mode ?? config.mode,
        });
      }
      const supplied = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
      if (!timingSafeEqual(ownerHash, Buffer.from(hash(supplied), "hex")))
        fail(401, "Pair this app using the owner token");
      if (path === "/api/status" && req.method === "GET")
        return send(200, {
          ...capabilities(),
          profile: store.get("profile"),
          active:
            store
              .incidents()
              .filter((i) => i.status === "active" && i.expiresAt > now)
              .map(view)[0] ?? null,
        });
      if (path === "/api/profile" && req.method === "PUT") {
        const input = await body(req);
        if (
          !validText(input.name) ||
          !Array.isArray(input.contacts) ||
          input.contacts.length < 1 ||
          input.contacts.length > 6 ||
          typeof input.policeEnabled !== "boolean"
        )
          fail(400, "Provide a name and one to six contacts");
        const numbers = new Set();
        const contacts = input.contacts.map((c) => {
          if (
            !validText(c.name) ||
            typeof c.phone !== "string" ||
            !/^\+[1-9]\d{7,14}$/.test(c.phone) ||
            c.consentConfirmed !== true ||
            numbers.has(c.phone)
          )
            fail(
              400,
              "Contacts must be unique international numbers with confirmed consent",
            );
          const channels = c.channels ?? ["sms"];
          if (
            !Array.isArray(channels) ||
            channels.length < 1 ||
            channels.length > 2 ||
            new Set(channels).size !== channels.length ||
            channels.some((channel) => !["sms", "whatsapp"].includes(channel))
          )
            fail(400, "Select SMS, WhatsApp, or both for each contact");
          numbers.add(c.phone);
          return {
            name: c.name.trim(),
            phone: c.phone,
            consentConfirmed: true,
            channels,
          };
        });
        store.set("profile", {
          name: input.name.trim(),
          contacts,
          policeEnabled: input.policeEnabled,
        });
        return send(200, { saved: true });
      }
      if (path === "/api/incidents" && req.method === "POST") {
        const input = await body(req),
          profile = store.get("profile");
        if (!profile) fail(409, "Set up emergency contacts first");
        if (
          typeof input.requestId !== "string" ||
          !/^[a-f0-9-]{36}$/i.test(input.requestId)
        )
          fail(400, "A UUID requestId is required");
        const location = locationValue(input.location);
        const prior = store
          .incidents()
          .find(
            (i) =>
              i.requestId === input.requestId ||
              (i.status === "active" && i.expiresAt > now),
          );
        if (prior) return send(200, view(prior));
        const incident = {
          id: randomUUID(),
          requestId: input.requestId,
          shareToken: randomBytes(32).toString("hex"),
          name: profile.name,
          mode: config.mode,
          policeEnabled: profile.policeEnabled,
          status: "active",
          location,
          createdAt: now,
          expiresAt: now + 86400000,
        };
        store.transaction(() => {
          store.set(`incident:${incident.id}`, incident);
          for (const contact of profile.contacts) {
            for (const channel of contact.channels ?? ["sms"]) {
              const id = randomUUID();
              store.job(id, incident.id, channel, {
                name: contact.name,
                address: contact.phone,
                phase: "sos",
                status: jobStatus(channel),
                updatedAt: now,
                ...notification(incident, config.publicUrl),
              });
            }
          }
          addPolice(incident);
        });
        send(201, view(incident));
        void work();
        return;
      }
      const match = path.match(
        /^\/api\/incidents\/([a-f0-9-]{36})(\/location|\/end|\/voice-brief)?$/i,
      );
      if (match) {
        const incident = store.get(`incident:${match[1]}`);
        if (!incident) fail(404, "Incident unavailable");
        if (req.method === "GET" && !match[2]) return send(200, view(incident));
        if (req.method === "GET" && match[2] === "/voice-brief") {
          if (incident.status !== "active" || incident.expiresAt <= now)
            fail(410, "Sharing has ended or expired");
          return send(200, {
            incidentId: incident.id,
            name: incident.name,
            mode: incident.mode ?? config.mode,
            status: incident.status,
            location: incident.location,
            createdAt: incident.createdAt,
            expiresAt: incident.expiresAt,
            issue:
              "SOS activated; police assistance requested. The nature of the incident and people involved are unknown.",
          });
        }
        if (req.method === "POST" && match[2] === "/end") {
          incident.status = "ended";
          incident.location = null;
          store.transaction(() => {
            store.set(`incident:${incident.id}`, incident);
            for (const j of store.jobs(incident.id))
              if (j.status === "pending")
                store.job(j.id, j.incident, j.kind, {
                  ...j,
                  status: "canceled",
                  updatedAt: now,
                });
          });
          return send(200, view(incident));
        }
        if (req.method === "PUT" && match[2] === "/location") {
          if (incident.status !== "active" || incident.expiresAt <= now)
            fail(410, "Sharing has ended or expired");
          const location = locationValue(await body(req));
          if (!location) fail(400, "Location required");
          if (
            !incident.location ||
            location.timestamp > incident.location.timestamp
          )
            incident.location = location;
          store.transaction(() => {
            store.set(`incident:${incident.id}`, incident);
            addPolice(incident);
          });
          send(200, { updated: true });
          void work();
          return;
        }
      }
      fail(404, "Endpoint not found");
    } catch (error) {
      if (!res.headersSent)
        send(error.status ?? 500, {
          error: error.status
            ? error.message
            : "Server error; alert status is uncertain. Check the incident before retrying.",
        });
      else res.end();
    }
  });
  const timer = setInterval(() => {
    void work().catch(() => {});
  }, 5000);
  timer.unref();
  return {
    server,
    store,
    work,
    close: async () => {
      clearInterval(timer);
      await new Promise((resolve) => server.close(resolve));
      store.close();
    },
  };
}
