const pool = require("../config/db");
const fs = require("fs");
const path = require("path");

exports.runSeed = async (req, res, next) => {
  try {
    const seedPath = path.join(__dirname, "../../seed.sql");
    const sql = fs.readFileSync(seedPath, "utf8");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    for (const stmt of statements) {
      await pool.execute(stmt);
    }

    res.json({ message: "Seed data inserted successfully" });
  } catch (err) {
    next(err);
  }
};
