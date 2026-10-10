import { DurableObject } from 'cloudflare:workers';

const today = () => new Date().toISOString().slice(0, 10); // UTC date, e.g. "2026-09-25"

export type Limits = { perInstall: number; perIp: number; cap: number };

// One global instance holds all counters, so updates are serialized and the global cap is exact.
// ponytail: tokens are added after the Groq call, so concurrent in-flight requests can overshoot the cap
// by about one batch each; reserve an estimate up front if that ever matters.
export class Limiter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS tokens (day TEXT PRIMARY KEY, used INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS installs (
        day TEXT, install_id TEXT, requests INTEGER NOT NULL,
        PRIMARY KEY (day, install_id)
      );
      CREATE TABLE IF NOT EXISTS salts (day TEXT PRIMARY KEY, salt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ips (
        day TEXT, ip_hash TEXT, requests INTEGER NOT NULL,
        PRIMARY KEY (day, ip_hash)
      );
    `);
  }

  // Counts the request against the install and the IP if every limit allows it. Counted even if Groq later fails.
  // Install IDs are self-generated, so a script can rotate them; the per-IP limit is what stops one
  // person from draining the global cap. Tradeoff: students behind one campus IP share its limit.
  async reserve(installId: string, ip: string, limits: Limits): Promise<boolean> {
    const sql = this.ctx.storage.sql;
    const day = today();
    for (const table of ['tokens', 'installs', 'salts', 'ips']) sql.exec(`DELETE FROM ${table} WHERE day < ?`, day);

    // The raw IP is never stored: only SHA-256(daily random salt + IP). Yesterday's salt is deleted
    // above, so yesterday's hashes can't be matched back to an IP by trying every address.
    sql.exec('INSERT OR IGNORE INTO salts (day, salt) VALUES (?, ?)', day, crypto.randomUUID());
    const salt = sql.exec<{ salt: string }>('SELECT salt FROM salts WHERE day = ?', day).one().salt;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ip));
    const ipHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

    // Everything below is synchronous, so no other request can interleave between check and increment.
    const used = sql.exec<{ used: number }>('SELECT used FROM tokens WHERE day = ?', day).toArray()[0]?.used ?? 0;
    if (used >= limits.cap) return false;

    const installRequests =
      sql.exec<{ requests: number }>('SELECT requests FROM installs WHERE day = ? AND install_id = ?', day, installId)
        .toArray()[0]?.requests ?? 0;
    if (installRequests >= limits.perInstall) return false;

    const ipRequests =
      sql.exec<{ requests: number }>('SELECT requests FROM ips WHERE day = ? AND ip_hash = ?', day, ipHash)
        .toArray()[0]?.requests ?? 0;
    if (ipRequests >= limits.perIp) return false;

    sql.exec(
      `INSERT INTO installs (day, install_id, requests) VALUES (?, ?, 1)
       ON CONFLICT (day, install_id) DO UPDATE SET requests = requests + 1`,
      day, installId,
    );
    sql.exec(
      `INSERT INTO ips (day, ip_hash, requests) VALUES (?, ?, 1)
       ON CONFLICT (day, ip_hash) DO UPDATE SET requests = requests + 1`,
      day, ipHash,
    );
    return true;
  }

  addTokens(n: number): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO tokens (day, used) VALUES (?, ?)
       ON CONFLICT (day) DO UPDATE SET used = used + excluded.used`,
      today(), n,
    );
  }
}
