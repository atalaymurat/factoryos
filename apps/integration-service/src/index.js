const express = require("express");
const webhookRoutes = require("./routes/webhook.routes");
const { startWorker } = require("./workers/event.worker");

const app = express();

app.use(express.json());

// routes
app.use("/", webhookRoutes);

app.get("/", (req, res) => {
  res.send("FactoryOS Integration Service running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Integration service running on ${PORT}`);
});

startWorker();