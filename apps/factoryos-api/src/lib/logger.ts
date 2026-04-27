import pino from "pino";
import { env } from "../config/env.js";

/**
 * Structured logger — pino, JSON-first.
 *
 * Her zaman JSON stdout'a yazar. Dev'de okunur format için
 * `npm run dev` script'i pipe eder: `tsx watch ... | pino-pretty`.
 * Worker thread transport kullanmıyoruz — tsx watch restart'larında
 * zombi process bırakabiliyor.
 *
 * Context taşıma: child logger
 *   const log = logger.child({ wo_id, operator_id });
 *   log.info("part scanned");
 * → her log'a wo_id ve operator_id otomatik eklenir.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "factoryos-api" },
});
