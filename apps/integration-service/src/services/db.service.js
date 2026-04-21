const { Pool } = require("pg");
const { config } = require("../config/env");

const pool = new Pool({
  connectionString: config.DB_URL,
});

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function closeDb() {
  console.log("Closing PostgreSQL pool...");
  await pool.end();
}

module.exports = {
  pool,
  query,
  closeDb,
};