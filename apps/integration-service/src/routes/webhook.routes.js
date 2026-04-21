const express = require("express");
const router = express.Router();

const { handleWebhook } = require("../controllers/webhook.controller");

router.post("/webhook", handleWebhook);

module.exports = router;