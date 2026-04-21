const express = require("express");
const router = express.Router();

const { handleWebhook } = require("../controllers/webhook.controller");
const { verifyErpNextSignature } = require("../middleware/auth");
const { config } = require("../config/env");

router.post(
  "/webhook",
  verifyErpNextSignature(config.ERPNEXT_WEBHOOK_SECRET),
  handleWebhook
);

module.exports = router;