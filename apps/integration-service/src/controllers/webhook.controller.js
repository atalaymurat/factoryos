const { publish } = require("../services/mqtt.service");
const { query } = require("../services/db.service");
const { randomUUID } = require("crypto");

async function handleWebhook(req, res) {
  try {
    const eventId = randomUUID();
    await query(
      `INSERT INTO events (id, type, source, topic, payload, status)
       VALUES ($1, 'erp.event', 'erp', $2, $3, 'pending')`,
      [eventId, deriveTopic(req.body), req.body]
    );
    
    // NOTIFY ile worker'ı anında tetikle (opsiyonel ama şık)
    await query(`NOTIFY outbox_new`);
    
    res.json({ status: "ok", eventId });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "failed" });
  }
}

module.exports = {
  handleWebhook,
};
