import test from "node:test";
import assert from "node:assert/strict";
import { providers } from "../src/providers.mjs";
const config = {
  twilioSid: "ACtest",
  twilioToken: "private-test-secret",
  twilioFrom: "+12025550100",
  policeToken: "private-agency-secret",
};

test("SMS adapter encodes recipient and link and preserves submitted versus delivered", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(
      url,
      "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json",
    );
    assert.equal(
      options.headers.Authorization,
      "Basic " + Buffer.from("ACtest:private-test-secret").toString("base64"),
    );
    assert.equal(options.body.get("To"), "+12025550101");
    assert.equal(
      options.body.get("Body"),
      "Help https://example.test/track#private",
    );
    return new Response(
      JSON.stringify({ sid: "SM" + "a".repeat(32), status: "queued" }),
      { status: 201 },
    );
  };
  const result = await providers(config).sms({
    address: "+12025550101",
    message: "Help https://example.test/track#private",
  });
  assert.equal(result.status, "submitted");
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: "delivered" }));
  assert.equal(
    await providers(config).smsStatus(result.reference),
    "delivered",
  );
});

test("SMS adapter distinguishes a definite rejection from an ambiguous server failure", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () => new Response("{}", { status: 400 });
  await assert.rejects(
    providers(config).sms({ address: "+12025550101", message: "test" }),
    (e) => e.definitive === true,
  );
  globalThis.fetch = async () => new Response("{}", { status: 503 });
  await assert.rejects(
    providers(config).sms({ address: "+12025550101", message: "test" }),
    (e) => e.definitive === false,
  );
  globalThis.fetch = async () => new Response("{}", { status: 201 });
  await assert.rejects(
    providers(config).sms({ address: "+12025550101", message: "test" }),
    /Missing provider reference/,
  );
});

test("police adapter authenticates and deduplicates the request without claiming dispatch", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://agency.example.test/sos");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer private-agency-secret");
    assert.equal(options.headers["Idempotency-Key"], "job-id");
    assert.equal(JSON.parse(options.body).event, "sos");
    return new Response("{}", { status: 202 });
  };
  assert.deepEqual(
    await providers(config).police({
      id: "job-id",
      address: "https://agency.example.test/sos",
      payload: { event: "sos" },
    }),
    { status: "submitted" },
  );
});

test("WhatsApp uses an approved template with coordinates, map, and private link variables", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const whatsappConfig = {
    ...config,
    whatsappFrom: "whatsapp:+12025550100",
    whatsappContentSid: "HX" + "a".repeat(32),
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(options.body.get("To"), "whatsapp:+12025550101");
    assert.equal(options.body.get("From"), whatsappConfig.whatsappFrom);
    assert.equal(
      options.body.get("ContentSid"),
      whatsappConfig.whatsappContentSid,
    );
    assert.equal(options.body.has("Body"), false);
    assert.equal(
      JSON.parse(options.body.get("ContentVariables"))["3"],
      "12.970000, 77.590000",
    );
    return new Response(
      JSON.stringify({ sid: "SM" + "a".repeat(32), status: "queued" }),
      { status: 201 },
    );
  };
  const provider = providers(whatsappConfig);
  assert.equal(provider.whatsappConfigured, true);
  assert.equal(
    (
      await provider.whatsapp({
        address: "+12025550101",
        variables: { 3: "12.970000, 77.590000" },
      })
    ).status,
    "submitted",
  );
  assert.equal(providers(config).whatsappConfigured, false);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: "read" }));
  assert.equal(await provider.smsStatus("SM" + "a".repeat(32)), "delivered");
});
