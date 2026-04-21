const express = require("express");
const mqtt = require("mqtt");

const app = express();
app.use(express.json());

const mqttClient = mqtt.connect(process.env.MQTT_URL);

mqttClient.on("connect", () => {
  console.log("MQTT connected");
});

app.post("/webhook", (req, res) => {
  const event = {
    type: "erp.event",
    payload: req.body,
    timestamp: new Date()
  };

  mqttClient.publish("factoryos/erp/event", JSON.stringify(event));
  console.log("Event published:", event);
  res.send({ status: "ok" });
});

app.listen(3000, () => {
  console.log("Integration service running on 3000");
});
