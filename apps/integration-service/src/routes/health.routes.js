const express = require("express");
const router = express.Router();

const { pool } = require("../services/db.service");
const { isReady: isMqttReady } = require("../services/mqtt.service");

/**
 * Liveness probe: process canlı mı?
 * Event loop ayakta ve response verebiliyorsa OK.
 * Bu endpoint dış bağımlılıklara bakmaz — sadece process crash tespiti.
 */
router.get("/health/live", (_req, res) => {
  res.json({ status: "alive", timestamp: new Date().toISOString() });
});

/**
 * Readiness probe: trafik almaya hazır mıyız?
 * DB ve MQTT bağlı değilse webhook'u kabul etsek bile outbox yazamayız
 * veya publish edemeyiz — trafik gönderilmemeli.
 *
 * Load balancer bu endpoint 503 verince container'ı havuzdan çıkarır.
 * 200'e dönünce tekrar ekler. Container restart edilmez.
 */
router.get("/health/ready", async (_req, res) => {
  const checks = {
    db: false,
    mqtt: false,
  };

  // DB check: SELECT 1 basit ping, 2sn timeout
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      checks.db = true;
    } finally {
      client.release();
    }
  } catch (err) {
    checks.db_error = err.message;
  }

  // MQTT check: client ready state flag
  checks.mqtt = isMqttReady();

  const allHealthy = checks.db && checks.mqtt;
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? "ready" : "not_ready",
    checks,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;