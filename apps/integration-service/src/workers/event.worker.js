const { pool } = require("../services/db.service");
const { publishAsync, isReady } = require("../services/mqtt.service");

// Retry tükenince event 'failed' olur. Bu noktadan sonra manuel müdahale gerekir
// (DLQ dashboard, admin endpoint vs. — Faz 2 işi).
const MAX_ATTEMPTS = 5;

// Her polling döngüsünde worker kaç event claim'leyecek.
// Çok yüksek: tek worker uzun süre lock tutar, diğer worker'lar bekler.
// Çok düşük: throughput düşer.
// 10 iyi bir başlangıç; metrik gelince ayarlarız.
const BATCH_SIZE = 10;

/**
 * Outbox worker — pending event'leri claim'leyip MQTT'ye publish eder.
 *
 * Concurrency modeli:
 *   - FOR UPDATE SKIP LOCKED: iki worker aynı satırı pickup etmez. Birinin lock
 *     aldığı satırları diğeri "skip" eder, pending'ler arasından sonrakini alır.
 *   - Transaction scope: SELECT → publish → UPDATE hepsi tek transaction'da.
 *     Publish sırasında process ölürse satır tekrar pending'e dönüyor (rollback),
 *     başka worker pickup edebiliyor.
 *
 * Retry modeli:
 *   - Publish başarısız olursa attempts++ ve status='pending' kalır → bir sonraki
 *     polling'de tekrar denenir.
 *   - attempts >= MAX_ATTEMPTS olduğunda status='failed' olur, ring'den çıkar.
 */
async function processEvents() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
      SELECT id, topic, type, payload, attempts
      FROM events
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
      `,
      [BATCH_SIZE]
    );

    if (rows.length === 0) {
      await client.query("COMMIT");
      return;
    }

    for (const event of rows) {
      try {
        await publishAsync(event.topic, {
          id: event.id,
          type: event.type,
          payload: event.payload,
        });

        await client.query(
          `UPDATE events
           SET status = 'published', published_at = NOW()
           WHERE id = $1`,
          [event.id]
        );

        console.log("Worker published:", event.id, "→", event.topic);
      } catch (err) {
        const nextAttempts = event.attempts + 1;
        const nextStatus = nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending";

        await client.query(
          `UPDATE events
           SET attempts = $2,
               status = $3,
               error_message = $4
           WHERE id = $1`,
          [event.id, nextAttempts, nextStatus, err.message]
        );

        console.error(
          `Worker publish failed (attempt ${nextAttempts}/${MAX_ATTEMPTS}):`,
          event.id,
          "-",
          err.message
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    // Transaction bazlı hata (connection koptu, deadlock vs.)
    // Satırlar rollback olur, sonraki polling'de tekrar denenir.
    try {
      await client.query("ROLLBACK");
    } catch (_) { /* connection zaten ölü olabilir */ }
    console.error("Worker loop error:", err.message);
  } finally {
    client.release();
  }
}

/**
 * 5 saniyede bir polling.
 * Adım 5'te LISTEN/NOTIFY eklenince bu sadece fallback olacak (30sn'ye çekebiliriz).
 */
function startWorker() {
  setInterval(processEvents, 5000);
  console.log("Event worker started");
}

module.exports = {
  startWorker,
};