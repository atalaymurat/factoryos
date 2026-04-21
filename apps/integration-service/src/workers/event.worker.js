const { pool } = require("../services/db.service");
const { publishAsync } = require("../services/mqtt.service");
const { config } = require("../config/env");

let intervalHandle = null;
let isStopping = false;
let currentRun = null;

async function processEvents() {
  if (isStopping) return;

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
      [config.WORKER_BATCH_SIZE]
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
        const nextStatus =
          nextAttempts >= config.WORKER_MAX_ATTEMPTS ? "failed" : "pending";

        await client.query(
          `UPDATE events
           SET attempts = $2, status = $3, error_message = $4
           WHERE id = $1`,
          [event.id, nextAttempts, nextStatus, err.message]
        );

        console.error(
          `Worker publish failed (attempt ${nextAttempts}/${config.WORKER_MAX_ATTEMPTS}):`,
          event.id,
          "-",
          err.message
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("Worker loop error:", err.message);
  } finally {
    client.release();
  }
}

function startWorker() {
  // Wrapper: çalışan bir run varsa await'i takip edebilelim (stop için)
  const tick = async () => {
    currentRun = processEvents();
    try { await currentRun; } finally { currentRun = null; }
  };

  intervalHandle = setInterval(tick, config.WORKER_POLL_INTERVAL_MS);
  console.log(
    `Event worker started (poll=${config.WORKER_POLL_INTERVAL_MS}ms, batch=${config.WORKER_BATCH_SIZE}, maxAttempts=${config.WORKER_MAX_ATTEMPTS})`
  );
}

/**
 * Graceful shutdown: yeni tick'leri durdur, devam eden run'un bitmesini bekle.
 * Transaction COMMIT/ROLLBACK tamamlansın diye önemli — yoksa pending olarak
 * kalan ama aslında publish edilmiş event'ler oluşabilir.
 */
async function stopWorker() {
  isStopping = true;
  if (intervalHandle) clearInterval(intervalHandle);
  if (currentRun) {
    console.log("Worker: waiting for current batch to finish...");
    try { await currentRun; } catch (_) {}
  }
  console.log("Worker stopped");
}

module.exports = {
  startWorker,
  stopWorker,
};