import { loadEnvFile } from "node:process";
import { z } from "zod";

/**
 * Environment validation — fail-fast on startup.
 *
 * Amaç: eksik veya bozuk env varsa process hiç ayağa kalkmasın.
 * Runtime'da cryptic "undefined is not a function" yerine başlangıçta
 * net hata. Production deploy yanlışsa vardiya başlamadan patlasın,
 * sahaya bozuk deploy gitmesin.
 */

// Dev'de .env dosyasını programatik yükle (Node 20.12+ native API).
// Production'da env vars container/secret manager'dan gelir, .env yoktur
// ve catch sessizce geçer. dotenv paketine ihtiyaç yok.
try {
  loadEnvFile();
} catch {
  /* .env yok — production ortamı veya dev'de henüz oluşturulmamış */
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(3001),

  // pino log seviyeleri — production'da info, dev'de debug tipik
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  // postgres://user:pass@host:5432/db — format'ı pg driver doğrular
  DB_URL: z.string().min(1, "DB_URL required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Logger henüz kurulmamış olabilir — stderr'a doğrudan yaz
  console.error("FATAL: Invalid environment configuration");
  console.error(z.prettifyError(parsed.error));
  console.error("See .env.example for reference.");
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export type Env = typeof env;
