const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT) || 3306,  // Railway uses non-standard port
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  // Railway/cloud DBs often need SSL
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

module.exports = pool;
