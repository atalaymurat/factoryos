const { publish } = require("../services/mqtt.service");
const { query } = require("../services/db.service");
const { randomUUID } = require("crypto");

async function handleWebhook(req, res) {
  try {
    const eventId = randomUUID();

    const event = {
      id: eventId,
      type: "erp.event",
      source: "erp",
      topic: "factoryos/erp/event",
      payload: req.body,
      status: "pending",
      timestamp: new Date(),
    };

    // 1. DB insert
    await query(
      `
      INSERT INTO events (id, type, source, topic, payload, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        event.id,
        event.type,
        event.source,
        event.topic,
        event.payload,
        event.status,
      ]
    );

    // 2. MQTT publish
    publish(event.topic, event);

    // 3. status update
    await query(
      `
      UPDATE events
      SET status = 'published', published_at = NOW()
      WHERE id = $1
      `,
      [event.id]
    );

    console.log("Event stored & published:", eventId);

    res.send({ status: "ok", eventId });
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).send({ error: "failed" });
  }
}

module.exports = {
  handleWebhook,
};
