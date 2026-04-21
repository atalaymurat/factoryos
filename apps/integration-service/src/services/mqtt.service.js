const mqtt = require("mqtt");

const mqttClient = mqtt.connect(process.env.MQTT_URL);

mqttClient.on("connect", () => {
  console.log("MQTT connected");
});

mqttClient.on("error", (error) => {
  console.error("MQTT error:", error.message);
});

function publish(topic, payload) {
  mqttClient.publish(topic, JSON.stringify(payload));
}

module.exports = {
  mqttClient,
  publish,
};