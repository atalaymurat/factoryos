import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Postgres connection — Kysely query builder + pg.Pool.
 *
 * Database interface migration'lar eklendikçe büyür (Sprint 1.4+).
 * Şimdilik boş; "SELECT 1" gibi raw query'lerle ping atılabilir.
 *
 * Pool defaults: 10 conn / 30s idle / 5s connect timeout — fabrika
 * tek instance için bolca yeterli, leak'leri zamanında kapatır.
 */

// pg ESM default export'u CJS interop ile geliyor; Pool'u öyle alıyoruz
const { Pool } = pg;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Database {}

export const pool = new Pool({
  connectionString: env.DB_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Idle client error handler — postgres düşerse pool error event emit
// eder. Listener yoksa Node uncaught olarak process'i öldürür ve
// /health/ready hiç 503 dönemeden server tamamen kaybolur. Burada
// log'layıp yutuyoruz; sonraki query yeni bir client çekmeye çalışır,
// bağlantı dönmüşse normal devam eder, dönmemişse query hata verir
// (request bazında handle edilir, process ayakta kalır).
pool.on("error", (err) => {
  logger.error({ err }, "postgres idle client error");
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});
