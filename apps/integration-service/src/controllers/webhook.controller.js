const { query } = require("../services/db.service");
const { randomUUID } = require("crypto");

/**
 * ERPNext webhook handler.
 * Outbox pattern: event'i sadece DB'ye yazar, MQTT publish işini worker yapar.
 * 
 * Neden?
 *   - MQTT broker down olsa bile event PG'de durur, kaybolmaz.
 *   - Webhook response hızlı döner (ERPNext retry etmez).
 *   - Publish sorumluluğu tek yerde (worker) — duplicate üretilmez.
 */
async function handleWebhook(req, res) {
  try {
    const body = req.body;

    // 1. Idempotency key: ERPNext aynı webhook'u retry ederse DB seviyesinde sessiz yutulur.
    //    Format: doctype:name:modified (ERPNext payload'ında bunlar standart olmalı).
    //    Yoksa random UUID düşer — duplicate koruması devre dışı, ama uygulama yine çalışır.
    const idempotencyKey = deriveIdempotencyKey(body);

    // 2. Topic: tek '/erp/event' yerine doctype'a göre dallanıyor — UNS mantığı.
    const topic = deriveTopic(body);

    const eventId = randomUUID();

    // 3. Tek sorumluluk: sadece INSERT. Publish ve UPDATE worker'ın işi.
    //    ON CONFLICT ile idempotency — aynı key 2. kez gelirse sessiz yutulur.
    const result = await query(
      `
      INSERT INTO events (id, type, source, topic, payload, status, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
      `,
      [
        eventId,
        "erp.event",
        "erp",
        topic,
        body,
        idempotencyKey,
      ]
    );

    // 4. INSERT gerçekten yeni satır yarattı mı, yoksa duplicate mı?
    if (result.rowCount === 0) {
      console.log("Duplicate webhook ignored:", idempotencyKey);
      return res.json({ status: "duplicate", idempotencyKey });
    }

    console.log("Event queued:", eventId, "→", topic);
    res.json({ status: "queued", eventId });

  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).json({ error: "failed" });
  }
}

/**
 * ERPNext webhook payload'ından MQTT topic türet.
 * Örn: { doctype: 'Work Order', name: 'WO-001' } → 'factoryos/erp/work_order/event'
 *
 * ERPNext standart webhook'u 'event' alanı göndermez (sadece doctype + data).
 * İleride event_type (created/updated/cancelled) için webhook URL'ini
 * '/webhook/work_order/created' şeklinde parametrize edebiliriz.
 */
function deriveTopic(body) {
  const doctype = (body?.doctype || "unknown")
    .toLowerCase()
    .replace(/\s+/g, "_");
  return `factoryos/erp/${doctype}/event`;
}

/**
 * Idempotency key: ERPNext'in aynı event'i retry etmesini bloklamak için.
 * doctype + name + modified timestamp kombinasyonu her güncelleme için unique.
 *
 * modified yoksa null döneriz — UNIQUE constraint NULL'da duplicate'e izin verir.
 * Bu durumda idempotency kapalı olur ama uygulama çalışmaya devam eder.
 */
function deriveIdempotencyKey(body) {
  if (!body?.doctype || !body?.name) return null;
  const modified = body.modified || "unknown";
  return `${body.doctype}:${body.name}:${modified}`;
}

module.exports = {
  handleWebhook,
};