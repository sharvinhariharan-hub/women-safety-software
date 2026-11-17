import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.mjs";
import { Store } from "../src/store.mjs";
import { nearestStation, providers } from "../src/providers.mjs";
const token = "a".repeat(64),
  key = "b".repeat(64);
const config = {
  ownerToken: token,
  dataKey: key,
  publicUrl: "https://safety.example.test",
  mode: "test",
};
const profile = {
  name: "Test Person",
  contacts: [
    { name: "Contact", phone: "+12025550101", consentConfirmed: true },
  ],
  policeEnabled: true,
};
const fix = (extra = {}) => ({
  latitude: 12.97,
  longitude: 77.59,
  accuracy: 10,
  timestamp: Date.now(),
  ...extra,
});
async function fixture(t, overrides = {}, transport) {
  const app = createApp(
    { ...config, ...overrides },
    transport ? { transport } : {},
  );
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  async function request(
    path,
    method = "GET",
    body,
    authorization = token,
    extraHeaders = {},
  ) {
    const response = await fetch(origin + path, {
      method,
      headers: {
        Authorization: `Bearer ${authorization}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      data: await response.json(),
      headers: response.headers,
    };
  }
  const save = (value = profile) => request("/api/profile", "PUT", value);
  const trigger = (value = {}) =>
    request("/api/incidents", "POST", { requestId: randomUUID(), ...value });
  return { ...app, request, save, trigger, origin };
}
async function settled(app) {
  for (let i = 0; i < 100; i++) {
    await app.work();
    if (
      !app.store
        .jobs()
        .some((j) => ["pending", "submitting"].includes(j.status))
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Outbox did not settle");
}

test("owner authentication is required and share routes do not expose profile", async (t) => {
  const a = await fixture(t);
  assert.equal(
    (await a.request("/api/status", "GET", undefined, "wrong")).status,
    401,
  );
  assert.equal((await a.request("/api/shared")).status, 404);
  assert.equal((await a.request("/api/status")).data.profile, null);
});
test("profile validates six unique consenting international contacts", async (t) => {
  const a = await fixture(t);
  assert.equal((await a.save()).status, 200);
  for (const contacts of [
    [],
    Array(7).fill(profile.contacts[0]),
    [{ ...profile.contacts[0], phone: "123" }],
    [{ ...profile.contacts[0], consentConfirmed: false }],
    Array(2).fill(profile.contacts[0]),
  ])
    assert.equal((await a.save({ ...profile, contacts })).status, 400);
});
test("SOS is created without GPS and test mode sends nothing", async (t) => {
  let sent = 0;
  const a = await fixture(
    t,
    {},
    {
      smsConfigured: true,
      sms: async () => {
        sent++;
      },
    },
  );
  await a.save();
  const r = await a.trigger();
  await settled(a);
  assert.equal(r.status, 201);
  assert.equal(r.data.location, null);
  assert.equal(r.data.jobs[0].status, "test_only");
  assert.equal(sent, 0);
  assert.equal(r.data.shareToken, undefined);
  assert.equal(r.data.jobs[0].address, undefined);
});
test("SOS requires setup and a valid idempotency key", async (t) => {
  const a = await fixture(t);
  assert.equal((await a.trigger()).status, 409);
  await a.save();
  assert.equal((await a.trigger({ requestId: "invalid" })).status, 400);
});
test("simultaneous retried SOS requests create one incident and one outbox", async (t) => {
  const a = await fixture(t);
  await a.save();
  const requestId = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 6 }, () => a.trigger({ requestId })),
  );
  assert.equal(new Set(results.map((r) => r.data.id)).size, 1);
  assert.equal(a.store.incidents().length, 1);
  assert.equal(a.store.jobs().length, 1);
  assert.equal((await a.trigger()).data.id, results[0].data.id);
});
test("private link reads latest location and has no contact list", async (t) => {
  const a = await fixture(t);
  await a.save();
  const r = await a.trigger();
  const incident = a.store.get(`incident:${r.data.id}`);
  assert.equal(
    (await a.request(`/api/incidents/${r.data.id}/location`, "PUT", fix()))
      .status,
    200,
  );
  const shared = await a.request("/api/shared", "GET", undefined, "", {
    "X-Share-Token": incident.shareToken,
  });
  assert.equal(shared.status, 200);
  assert.equal(shared.data.location.latitude, 12.97);
  assert.equal(shared.data.contacts, undefined);
  assert.equal(shared.headers.get("referrer-policy"), "no-referrer");
  assert.equal(shared.headers.get("cache-control"), "no-store");
});
test("invalid, future and stale locations are rejected; older fixes cannot overwrite newer ones", async (t) => {
  const a = await fixture(t);
  await a.save();
  const r = await a.trigger();
  const path = `/api/incidents/${r.data.id}/location`;
  for (const bad of [
    fix({ latitude: 91 }),
    fix({ timestamp: Date.now() + 100000 }),
    fix({ timestamp: 1 }),
    fix({ accuracy: -1 }),
    {},
  ])
    assert.equal((await a.request(path, "PUT", bad)).status, 400);
  const latest = fix();
  await a.request(path, "PUT", latest);
  await a.request(
    path,
    "PUT",
    fix({ latitude: 10, timestamp: latest.timestamp - 10000 }),
  );
  assert.equal(
    (await a.request(`/api/incidents/${r.data.id}`)).data.location.latitude,
    latest.latitude,
  );
});
test("ending sharing revokes the link and rejects further updates", async (t) => {
  const a = await fixture(t);
  await a.save();
  const r = await a.trigger();
  const incident = a.store.get(`incident:${r.data.id}`);
  await a.request(`/api/incidents/${r.data.id}/end`, "POST");
  assert.equal(
    (
      await a.request("/api/shared", "GET", undefined, "", {
        "X-Share-Token": incident.shareToken,
      })
    ).status,
    410,
  );
  assert.equal(
    (await a.request(`/api/incidents/${r.data.id}/location`, "PUT", fix()))
      .status,
    410,
  );
  assert.equal((await a.request("/api/status")).data.active, null);
});
test("expired links fail closed even before the cleanup worker runs", async (t) => {
  const a = await fixture(t);
  await a.save();
  const r = await a.trigger();
  const i = a.store.get(`incident:${r.data.id}`);
  i.expiresAt = Date.now() - 1;
  a.store.set(`incident:${i.id}`, i);
  assert.equal(
    (
      await a.request("/api/shared", "GET", undefined, "", {
        "X-Share-Token": i.shareToken,
      })
    ).status,
    410,
  );
  await a.work();
  assert.equal(a.store.get(`incident:${i.id}`).status, "expired");
});
test("six contact jobs start concurrently and provider acceptance is not delivery", async (t) => {
  let starts = 0,
    release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const a = await fixture(
    t,
    { mode: "live" },
    {
      smsConfigured: true,
      sms: async () => {
        starts++;
        if (starts === 6) release();
        await barrier;
        return { status: "submitted", reference: "provider-reference" };
      },
    },
  );
  await a.save({
    ...profile,
    contacts: Array.from({ length: 6 }, (_, i) => ({
      name: `Contact ${i}`,
      phone: `+1202555010${i}`,
      consentConfirmed: true,
    })),
  });
  await a.trigger();
  await settled(a);
  assert.equal(starts, 6);
  assert.ok(a.store.jobs().every((j) => j.status === "submitted"));
});
test("one failed contact does not prevent another receiving its submission", async (t) => {
  const a = await fixture(
    t,
    { mode: "live" },
    {
      smsConfigured: true,
      sms: async (job) => {
        if (job.address.endsWith("1"))
          throw Object.assign(new Error("Rejected"), { definitive: true });
        return { status: "submitted" };
      },
    },
  );
  await a.save({
    ...profile,
    contacts: [
      profile.contacts[0],
      { name: "Other", phone: "+12025550102", consentConfirmed: true },
    ],
  });
  await a.trigger();
  await settled(a);
  assert.deepEqual(
    a.store
      .jobs()
      .map((j) => j.status)
      .sort(),
    ["failed", "submitted"],
  );
});
test("uncertain provider outcomes are not retried and duplicated", async (t) => {
  let attempts = 0;
  const a = await fixture(
    t,
    { mode: "live" },
    {
      smsConfigured: true,
      sms: async () => {
        attempts++;
        throw new Error("Connection lost after send");
      },
    },
  );
  await a.save();
  await a.trigger();
  await settled(a);
  await a.work();
  assert.equal(attempts, 1);
  assert.equal(a.store.jobs()[0].status, "unknown");
});
test("unconfigured live SMS is explicitly not_configured", async (t) => {
  const a = await fixture(t, { mode: "live" });
  await a.save();
  const r = await a.trigger();
  assert.equal(r.data.jobs[0].status, "not_configured");
});
test("police jobs require consent, opt-in, nearby location, and configured endpoint", async (t) => {
  const station = {
    name: "Test partner",
    latitude: 12.971,
    longitude: 77.59,
    webhook: "https://agency.example.test/sos",
    consentConfirmed: true,
  };
  let police = 0;
  const a = await fixture(
    t,
    { mode: "live", policeToken: "agency-token", registry: [station] },
    {
      smsConfigured: false,
      police: async (job) => {
        police++;
        assert.ok(job.payload.trackingUrl.includes("/track#"));
        return { status: "submitted" };
      },
    },
  );
  await a.save();
  const r = await a.trigger();
  assert.equal(a.store.jobs().filter((j) => j.kind === "police").length, 0);
  await a.request(`/api/incidents/${r.data.id}/location`, "PUT", fix());
  await settled(a);
  await a.request(`/api/incidents/${r.data.id}/location`, "PUT", fix());
  await a.work();
  assert.equal(police, 1);
  assert.equal(
    a.store.jobs().find((j) => j.kind === "police").status,
    "submitted",
  );
  assert.equal(
    nearestStation(fix(), [{ ...station, consentConfirmed: false }]),
    null,
  );
  assert.equal(nearestStation(fix(), [{ ...station, latitude: 60 }]), null);
});
test("police opt-out is honored even with a connected partner", async (t) => {
  const a = await fixture(t, {
    policeToken: "test",
    registry: [
      {
        name: "Test",
        latitude: 12.97,
        longitude: 77.59,
        webhook: "https://agency.example.test",
        consentConfirmed: true,
      },
    ],
  });
  await a.save({ ...profile, policeEnabled: false });
  await a.trigger({ location: fix() });
  assert.equal(a.store.jobs().filter((j) => j.kind === "police").length, 0);
});
test("database payloads are encrypted and durable across restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "safety-test-")),
    path = join(dir, "db.sqlite");
  try {
    const s = new Store(path, key);
    s.set("profile", profile);
    s.close();
    assert.equal(
      readFileSync(path).includes(Buffer.from("Test Person")),
      false,
    );
    const reopened = new Store(path, key);
    assert.deepEqual(reopened.get("profile"), profile);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("crash recovery marks in-flight sends uncertain instead of repeating them", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "safety-restart-")),
    path = join(dir, "db.sqlite");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const s = new Store(path, key);
  s.job("job", "incident", "sms", { status: "submitting" });
  s.close();
  const a = await fixture(t, { databasePath: path });
  assert.equal(a.store.jobs()[0].status, "unknown");
});
test("old incidents and their outbox are removed after the retention window", async (t) => {
  const a = await fixture(t);
  await a.save();
  const r = await a.trigger();
  const i = a.store.get(`incident:${r.data.id}`);
  i.expiresAt = Date.now() - 86400001;
  a.store.set(`incident:${i.id}`, i);
  await a.work();
  assert.equal(a.store.incidents().length, 0);
  assert.equal(a.store.jobs().length, 0);
});
test("server refuses weak keys, unknown modes, and HTTP in live mode", () => {
  assert.throws(() => createApp({ ...config, ownerToken: "weak" }));
  assert.throws(() => createApp({ ...config, dataKey: "weak" }));
  assert.throws(() => createApp({ ...config, mode: "silent" }));
  assert.throws(() =>
    createApp({ ...config, mode: "live", publicUrl: "http://localhost" }),
  );
});
