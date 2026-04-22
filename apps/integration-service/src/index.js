const express = require("express");
const { config } = require("./config/env");
const webhookRoutes = require("./routes/webhook.routes");
const healthRoutes = require("./routes/health.routes");
const { startWorker, stopWorker } = require("./workers/event.worker");
const { closeDb } = require("./services/db.service");
const { closeMqtt } = require("./services/mqtt.service");

const app = express();

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

// Routes
app.use("/", healthRoutes);     // /health/live, /health/ready
app.use("/", webhookRoutes);    // /webhook

app.get("/", (_req, res) => {
  res.send("FactoryOS Integration Service running");
});

const server = app.listen(config.PORT, () => {
  console.log(`Integration service running on ${config.PORT}`);
});

startWorker();

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  const forceKillTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10000);
  forceKillTimer.unref();

  try {
    await new Promise((resolve) => server.close(resolve));
    await stopWorker();
    await closeMqtt();
    await closeDb();
    console.log("Shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err.message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  shutdown("uncaughtException");
});