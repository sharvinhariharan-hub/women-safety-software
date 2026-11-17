export function distanceKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dlat = rad(b.latitude - a.latitude),
    dlon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - Math.min(h, 1)));
}
export function nearestStation(location, registry) {
  if (!location) return null;
  return (
    registry
      .filter(
        (s) =>
          s.consentConfirmed === true &&
          typeof s.webhook === "string" &&
          s.webhook.startsWith("https://") &&
          Number.isFinite(s.latitude) &&
          Number.isFinite(s.longitude),
      )
      .map((s) => ({ ...s, distanceKm: distanceKm(location, s) }))
      .filter((s) => s.distanceKm <= (s.radiusKm ?? 25))
      .sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null
  );
}
export function providers(config) {
  const auth = Buffer.from(
    `${config.twilioSid}:${config.twilioToken}`,
  ).toString("base64");
  return {
    smsConfigured: Boolean(
      config.twilioSid && config.twilioToken && config.twilioFrom,
    ),
    async sms(job) {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilioSid)}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: job.address,
            From: config.twilioFrom,
            Body: job.message,
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) {
        const error = new Error("SMS provider rejected request");
        error.definitive =
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 408;
        throw error;
      }
      const result = await response.json();
      if (!result.sid)
        throw new Error("Missing provider reference; delivery unknown");
      return {
        status: ["failed", "undelivered", "canceled"].includes(result.status)
          ? "failed"
          : result.status === "delivered"
            ? "delivered"
            : "submitted",
        reference: result.sid,
      };
    },
    async smsStatus(reference) {
      if (!/^SM[a-f0-9]{32}$/i.test(reference)) return null;
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilioSid)}/Messages/${reference}.json`,
        {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) return null;
      const { status } = await response.json();
      return status === "delivered"
        ? "delivered"
        : ["failed", "undelivered", "canceled"].includes(status)
          ? "failed"
          : "submitted";
    },
    async police(job) {
      const response = await fetch(job.address, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.policeToken}`,
          "Idempotency-Key": job.id,
        },
        body: JSON.stringify(job.payload),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        const error = new Error("Agency endpoint rejected alert");
        error.definitive =
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 408;
        throw error;
      }
      return { status: "submitted" }; // HTTP acceptance is not police dispatch.
    },
  };
}
