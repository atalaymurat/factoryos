const crypto = require("crypto");

/**
 * ERPNext webhook HMAC signature doğrulama.
 *
 * ERPNext, webhook config'inde tanımlanan "secret" ile request body'sinin
 * HMAC-SHA256'sını hesaplar ve X-Frappe-Webhook-Signature header'ına koyar.
 *
 * Biz aynı hesaplamayı yaparız, eşleşirse devam, yoksa 401.
 *
 * KRİTİK: raw body üzerinden hesaplama yapılmalı. JSON.stringify(req.body)
 * formatlamayı değiştirir (boşluk, key sırası), imza tutmaz.
 * Bu yüzden express.json() middleware'i raw body'yi de yakalamalı.
 */

function verifyErpNextSignature(secret) {
  return (req, res, next) => {
    // Geliştirme/test için secret tanımsızsa auth'u atla.
    // Production'da config validation bunu zorunlu kılacak.
    if (!secret) {
      console.warn("WARN: ERPNEXT_WEBHOOK_SECRET not set, skipping auth");
      return next();
    }

    const signature = req.get("X-Frappe-Webhook-Signature");
    if (!signature) {
      console.warn("Webhook rejected: missing signature header");
      return res.status(401).json({ error: "missing signature" });
    }

    if (!req.rawBody) {
      console.error("Webhook auth: rawBody not captured (middleware order?)");
      return res.status(500).json({ error: "internal" });
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(req.rawBody)
      .digest("hex");

    // Timing-safe karşılaştırma — string == ile karşılaştırma timing attack'a açık.
    // Buffer uzunlukları eşit değilse timingSafeEqual exception atar, try/catch.
    let match = false;
    try {
      match = crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expected, "hex")
      );
    } catch (_) {
      match = false;
    }

    if (!match) {
      console.warn("Webhook rejected: signature mismatch");
      return res.status(401).json({ error: "invalid signature" });
    }

    next();
  };
}

module.exports = {
  verifyErpNextSignature,
};