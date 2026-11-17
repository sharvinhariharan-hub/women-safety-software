import { readFileSync } from "node:fs";
import { createApp } from "./app.mjs";
const env = process.env;
const app = createApp({
  ownerToken: env.OWNER_TOKEN,
  dataKey: env.DATA_KEY,
  databasePath: env.DATABASE_PATH ?? ".data/safety.sqlite",
  publicUrl: (env.PUBLIC_URL ?? "http://localhost:8080").replace(/\/$/, ""),
  mode: env.ALERT_MODE ?? "test",
  twilioSid: env.TWILIO_ACCOUNT_SID,
  twilioToken: env.TWILIO_AUTH_TOKEN,
  twilioFrom: env.TWILIO_FROM,
  policeToken: env.POLICE_WEBHOOK_TOKEN,
  registry: env.POLICE_REGISTRY_PATH
    ? JSON.parse(readFileSync(env.POLICE_REGISTRY_PATH, "utf8"))
    : [],
});
app.server.listen(Number(env.PORT ?? 8080), env.HOST ?? "127.0.0.1", () =>
  console.log(
    `Women Safety backend listening on port ${env.PORT ?? 8080}; mode=${env.ALERT_MODE ?? "test"}. No alert contents are logged.`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
