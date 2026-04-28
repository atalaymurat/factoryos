import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import type { DB } from "./types.generated.js";

/**
 * Postgres connection — Kysely query builder + pg.Pool.
 *
 * Tipler `types.generated.ts`'den geliyor (kysely-codegen). Migration
 * ekledikten sonra `npm run db:types` ile yenile. Tek doğru kaynak DB.
 *
 * Pool defaults: 10 conn / 30s idle / 5s connect timeout — fabrika
 * tek instance için bolca yeterli, leak'leri zamanında kapatır.
 */

// pg ESM default export'u CJS interop ile geliyor; Pool'u öyle alıyoruz
const { Pool } = pg;

export type Database = DB;

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

// Her yeni connection için search_path'i mes,public olarak set et.
// Bu sayede uygulama kodunda `db.selectFrom("parts")` yazılabilir,
// her seferinde "mes." prefix'i tekrar etmek zorunda kalınmaz.
// public.events (integration-service outbox) gerektiğinde
// "public.events" olarak qualified yazılır — search_path'te zaten
// public olduğu için fallback olarak çözülür ama açık yazmak okunur.
// node-pg-migrate kendi pool'unu kullanır, etkilenmez.
pool.on("connect", (client) => {
  client.query("SET search_path = mes, public");
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});
