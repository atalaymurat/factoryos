const mqtt = require("mqtt");

const mqttClient = mqtt.connect(process.env.MQTT_URL, {
  // Reconnect stratejisi (mqtt.js default 1000ms iyi, elle yönetmek istersek)
  reconnectPeriod: 2000,
});

// Ready state: worker publish'ten önce bağlantının ayakta olduğunu kontrol edecek.
// Sadece 'connect' event'ine bakmak yetmez — 'close'dan sonra tekrar 'connect'
// olana kadar ready=false kalmalı.
let ready = false;

mqttClient.on("connect", () => {
  ready = true;
  console.log("MQTT connected");
});

mqttClient.on("close", () => {
  if (ready) console.warn("MQTT connection closed");
  ready = false;
});

mqttClient.on("reconnect", () => {
  console.log("MQTT reconnecting...");
});

mqttClient.on("error", (error) => {
  console.error("MQTT error:", error.message);
});

/**
 * Promise-based publish with QoS 1 and ack awaiting.
 *
 * Neden QoS 1:
 *   - QoS 0 (default) fire-and-forget: broker almadıysa bile publish başarılı görünür.
 *   - QoS 2 cluster performansını öldürür, exactly-once garantisi bizim için gereksiz
 *     çünkü subscriber tarafında idempotency zaten event.id ile sağlanacak.
 *
 * Neden ready kontrolü:
 *   - mqtt.js bağlantı yokken publish'i internal queue'ya alır, sessizce kaybedebilir
 *     veya yanlış sıralayabilir. Açıkça reject etmek worker'ın retry mantığını tetikler.
 */
function publishAsync(topic, payload) {
  return new Promise((resolve, reject) => {
    if (!ready) {
      return reject(new Error("MQTT not ready"));
    }

    const message = typeof payload === "string"
      ? payload
      : JSON.stringify(payload);

    mqttClient.publish(topic, message, { qos: 1 }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// Geriye dönük uyumluluk — henüz başka yer kullanmıyor olsa da silmeyelim,
// eski kodun kırılmasını önlemek için bırakıyoruz.
// İleride tüm publish çağrıları publishAsync'e geçince silinecek.
function publish(topic, payload) {
  mqttClient.publish(topic, JSON.stringify(payload));
}

module.exports = {
  mqttClient,
  publish,
  publishAsync,
  isReady: () => ready,
};