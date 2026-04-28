import pino from "pino";
import { env } from "../config/env.js";

/**
 * Structured logger — pino, JSON-first.
 *
 * 12-factor app: log akışı stderr'a (fd 2) yazılır; stdout business çıktısı
 * için saklı kalır. Bu sayede dev-cli gibi araçlar JSON output'u doğrudan
 * pipe/redirect edebilir, log satırları karışmaz.
 *
 * Dev'de okunur format için `npm run dev` script'i `2>&1` ile stderr'i de
 * pino-pretty'e yönlendirir. Worker thread transport kullanmıyoruz — tsx
 * watch restart'larında zombi process bırakabiliyor.
 *
 * Context taşıma: child logger
 *   const log = logger.child({ wo_id, operator_id });
 *   log.info("part scanned");
 * → her log'a wo_id ve operator_id otomatik eklenir.
 */
export const logger = pino(
  {
    level: env.LOG_LEVEL,
    base: { service: "factoryos-api" },
  },
  pino.destination(2),
);
