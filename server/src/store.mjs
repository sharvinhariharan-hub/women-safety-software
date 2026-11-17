import { DatabaseSync } from "node:sqlite";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

export const hash = (value) => createHash("sha256").update(value).digest("hex");
export class Store {
  constructor(path, key) {
    if (!/^[a-f0-9]{64}$/i.test(key ?? ""))
      throw new Error("DATA_KEY must be 32 random bytes encoded as hex.");
    this.key = Buffer.from(key, "hex");
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, incident TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL);
    `);
  }
  seal(value) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
  }
  open(value) {
    const b = Buffer.from(value, "base64"),
      decipher = createDecipheriv("aes-256-gcm", this.key, b.subarray(0, 12));
    decipher.setAuthTag(b.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(b.subarray(28)),
        decipher.final(),
      ]).toString(),
    );
  }
  get(id) {
    const row = this.db.prepare("SELECT value FROM records WHERE id=?").get(id);
    return row ? this.open(row.value) : null;
  }
  set(id, value) {
    this.db
      .prepare("INSERT OR REPLACE INTO records VALUES (?,?)")
      .run(id, this.seal(value));
  }
  incidents() {
    return this.db
      .prepare("SELECT value FROM records WHERE id LIKE 'incident:%'")
      .all()
      .map((row) => this.open(row.value));
  }
  job(id, incident, kind, value) {
    this.db
      .prepare("INSERT OR REPLACE INTO jobs VALUES (?,?,?,?)")
      .run(id, incident, kind, this.seal(value));
  }
  jobs(incident) {
    return this.db
      .prepare(
        `SELECT id,incident,kind,value FROM jobs ${incident ? "WHERE incident=?" : ""}`,
      )
      .all(...(incident ? [incident] : []))
      .map((row) => ({
        ...this.open(row.value),
        id: row.id,
        incident: row.incident,
        kind: row.kind,
      }));
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  purge(id) {
    this.db.prepare("DELETE FROM jobs WHERE incident=?").run(id);
    this.db.prepare("DELETE FROM records WHERE id=?").run(`incident:${id}`);
  }
  close() {
    this.db.close();
  }
}
