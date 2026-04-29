import express from "express";
import { sql } from "kysely";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { db, pool } from "./db/client.js";
import { importContractRouter } from "./routes/import-contract.js";

const app = express();

// IMOS export'u 5-10MB seviyesinde JSON body olabiliyor; 16MB güvenli üst sınır.
// Üstüne çıkan istek 413 alır — saha gerçeği: tek WO bu sınırı aşmaz.
app.use(express.json({ limit: "16mb" }));

app.get("/", (_req, res) => {
  res.json({ service: "factoryos-api", status: "ok" });
});

app.use(importContractRouter);

// Liveness — process ayakta mı? Sadece event loop sağlığını söyler.
// DB veya dış bağımlılık kontrolü YOK; orchestrator container'ı
// gereksiz yere yeniden başlatmasın diye.
app.get("/health/live", (_req, res) => {
  res.json({ status: "alive" });
});

// Readiness — trafik almaya hazır mı? DB ping başarısızsa 503.
// 1s timeout: vardiya başında DB yavaşsa orchestrator beklesin
// ama sonsuz takılıp kalmasın.
const READY_DB_TIMEOUT_MS = 1_000;

app.get("/health/ready", async (_req, res) => {
  try {
    await Promise.race([
      sql`SELECT 1`.execute(db),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("db_ping_timeout")),
          READY_DB_TIMEOUT_MS,
        ),
      ),
    ]);
    res.json({ status: "ready" });
  } catch (err) {
    logger.warn({ err }, "readiness check failed");
    res.status(503).json({ status: "not_ready", reason: "db_unreachable" });
  }
});

async function start() {
  // Startup ping — DB ulaşılamazsa server hiç ayağa kalkmasın.
  // Üretime bozuk konfigürasyonla çıkmamak için fail-fast.
  try {
    await sql`SELECT 1`.execute(db);
    logger.info("postgres connection ok");
  } catch (err) {
    logger.fatal({ err }, "postgres connection failed");
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, nodeEnv: env.NODE_ENV },
      "factoryos-api listening",
    );
  });

  // Graceful shutdown — SIGTERM (docker stop) ve SIGINT (Ctrl+C).
  // Sıra: önce yeni HTTP'yi reddet ve sürmekte olan istekler bitsin,
  // SONRA pool kapansın. Tersine yaparsak ortadaki istek "pool ended"
  // hatası alır, operatör boş ekran görür.
  const SHUTDOWN_FORCE_TIMEOUT_MS = 10_000;
  let shuttingDown = false;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutdown initiated");

    // Emniyet ağı: drain takılırsa container'ı sonsuza kadar bloklamayalım.
    // unref() ile bu timer event loop'u canlı tutmaz.
    const forceExit = setTimeout(() => {
      logger.error("graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_FORCE_TIMEOUT_MS);
    forceExit.unref();

    server.close(async (err) => {
      if (err) logger.error({ err }, "http server close failed");
      try {
        await pool.end();
        logger.info("postgres pool closed");
      } catch (poolErr) {
        logger.error({ err: poolErr }, "pool close failed");
      }
      logger.info("shutdown complete");
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
