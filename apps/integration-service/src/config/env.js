/**
 * Environment variable validation.
 *
 * Amaç: fail-fast. Eksik env varsa process daha başlamadan ölsün,
 * runtime'da cryptic "undefined is not a function" yerine açık hata.
 *
 * 3rd party paket (envalid, zod) kullanmıyoruz — 1 dosya, 20 satır iş.
 * Dependency'yi hak etmiyor.
 */

const required = [
  "DB_URL",
  "MQTT_URL",
];

const optional = {
  PORT: "3000",
  LOG_LEVEL: "info",
  WORKER_POLL_INTERVAL_MS: "5000",
  WORKER_BATCH_SIZE: "10",
  WORKER_MAX_ATTEMPTS: "5",
};

function loadConfig() {
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      "FATAL: Missing required environment variables:",
      missing.join(", ")
    );
    console.error("See config/env/.env.example for reference.");
    process.exit(1);
  }

  // Optional'ları default ile doldur
  const config = {
    DB_URL: process.env.DB_URL,
    MQTT_URL: process.env.MQTT_URL,
    PORT: parseInt(process.env.PORT || optional.PORT, 10),
    LOG_LEVEL: process.env.LOG_LEVEL || optional.LOG_LEVEL,
    WORKER_POLL_INTERVAL_MS: parseInt(
      process.env.WORKER_POLL_INTERVAL_MS || optional.WORKER_POLL_INTERVAL_MS,
      10
    ),
    WORKER_BATCH_SIZE: parseInt(
      process.env.WORKER_BATCH_SIZE || optional.WORKER_BATCH_SIZE,
      10
    ),
    WORKER_MAX_ATTEMPTS: parseInt(
      process.env.WORKER_MAX_ATTEMPTS || optional.WORKER_MAX_ATTEMPTS,
      10
    ),
  };

  // Sanity check — parse sonrası NaN'lar
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "number" && Number.isNaN(value)) {
      console.error(`FATAL: Invalid numeric env: ${key}=${process.env[key]}`);
      process.exit(1);
    }
  }

  return Object.freeze(config);
}

module.exports = {
  config: loadConfig(),
};