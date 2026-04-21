const mqtt = require("mqtt");
const { config } = require("../config/env");

const mqttClient = mqtt.connect(config.MQTT_URL, {
  reconnectPeriod: 2000,
});

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

function publishAsync(topic, payload) {
  return new Promise((resolve, reject) => {
    if (!ready) return reject(new Error("MQTT not ready"));
    const message =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    mqttClient.publish(topic, message, { qos: 1 }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function publish(topic, payload) {
  mqttClient.publish(topic, JSON.stringify(payload));
}

/**
 * Graceful close: in-flight publish'lerin ack'ini bekle, sonra disconnect.
 * force=false (default) buffer'ı flush eder.
 */
function closeMqtt() {
  return new Promise((resolve) => {
    console.log("Closing MQTT connection...");
    mqttClient.end(false, {}, () => resolve());
  });
}

module.exports = {
  mqttClient,
  publish,
  publishAsync,
  closeMqtt,
  isReady: () => ready,
};