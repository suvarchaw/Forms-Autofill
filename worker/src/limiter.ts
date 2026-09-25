import { DurableObject } from 'cloudflare:workers';

const today = () => new Date().toISOString().slice(0, 10); // UTC date, e.g. "2026-09-25"

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
    `);
  }

  // Counts the request against the install if both limits allow it. Counted even if Groq later fails.
  reserve(installId: string, perInstall: number, cap: number): boolean {
    const sql = this.ctx.storage.sql;
    const day = today();
    sql.exec('DELETE FROM tokens WHERE day < ?', day);
    sql.exec('DELETE FROM installs WHERE day < ?', day);

    const used = sql.exec<{ used: number }>('SELECT used FROM tokens WHERE day = ?', day).toArray()[0]?.used ?? 0;
    if (used >= cap) return false;

    const requests =
      sql.exec<{ requests: number }>('SELECT requests FROM installs WHERE day = ? AND install_id = ?', day, installId)
        .toArray()[0]?.requests ?? 0;
    if (requests >= perInstall) return false;

    sql.exec(
      `INSERT INTO installs (day, install_id, requests) VALUES (?, ?, 1)
       ON CONFLICT (day, install_id) DO UPDATE SET requests = requests + 1`,
      day, installId,
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
