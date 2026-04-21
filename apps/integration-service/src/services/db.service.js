const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DB_URL,
});

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query,
};