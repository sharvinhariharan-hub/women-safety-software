import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
if (existsSync(".env"))
  throw new Error(".env already exists; existing secrets were preserved.");
writeFileSync(
  ".env",
  `PORT=8080\nHOST=127.0.0.1\nPUBLIC_URL=http://localhost:8080\nOWNER_TOKEN=${randomBytes(32).toString("hex")}\nDATA_KEY=${randomBytes(32).toString("hex")}\nDATABASE_PATH=.data/safety.sqlite\nALERT_MODE=test\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created .env in test mode. Enter OWNER_TOKEN in the mobile setup; never publish it.",
);
