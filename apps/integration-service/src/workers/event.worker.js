const { query } = require("../services/db.service");
const { publish } = require("../services/mqtt.service");

async function processEvents() {
  try {
    // pending eventleri çek
    const res = await query(
      `SELECT * FROM events WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10`
    );

    for (const event of res.rows) {
      try {
        // publish
        publish(event.topic, {
          id: event.id,
          type: event.type,
          payload: event.payload,
        });

        // success update
        await query(
          `UPDATE events SET status = 'published', published_at = NOW() WHERE id = $1`,
          [event.id]
        );

        console.log("Worker published:", event.id);
      } catch (err) {
        // fail update
        await query(
          `UPDATE events SET status = 'failed', error_message = $2 WHERE id = $1`,
          [event.id, err.message]
        );

        console.error("Worker failed:", event.id);
      }
    }
  } catch (err) {
    console.error("Worker loop error:", err.message);
  }
}

// her 5 saniyede çalış
function startWorker() {
  setInterval(processEvents, 5000);
  console.log("Event worker started");
}

module.exports = {
  startWorker,
};