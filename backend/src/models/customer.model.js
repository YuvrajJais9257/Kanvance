const pool = require("../config/db");

exports.getAll = async ({ page, limit } = {}) => {
  const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
  const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 500));
  const offset   = (pageNum - 1) * limitNum;

  // Use MIN() aggregates on all non-grouped columns so the query is
  // compatible with ONLY_FULL_GROUP_BY. This also deduplicates customers
  // that share the same name, picking the earliest row for each.
  const [rows] = await pool.query(
    `SELECT MIN(id) AS id, name,
            MIN(industry)      AS industry,
            MIN(license_type)  AS license_type,
            MIN(license_count) AS license_count,
            MIN(license_expiry) AS license_expiry
     FROM customers
     GROUP BY name
     ORDER BY name
     LIMIT ${limitNum} OFFSET ${offset}`
  );
  return rows;
};

exports.getById = async (id) => {
  const [[row]] = await pool.execute(
    `SELECT * FROM customers WHERE id = ?`,
    [id]
  );
  if (!row) return null;

  // Attach projects for this customer
  const [projects] = await pool.execute(
    `SELECT p.id, p.name, p.type, p.status, p.due_date,
            u.name AS owner_name
     FROM projects p
     LEFT JOIN users u ON u.id = p.owner_id
     WHERE p.customer_id = ?
     ORDER BY p.created_at DESC`,
    [id]
  );
  row.projects = projects;
  return row;
};

exports.create = async (data) => {
  const {
    name, industry, cyberark_tenant, region,
    idp, siem, license_type, license_count, license_expiry, notes,
  } = data;
  const [result] = await pool.execute(
    `INSERT INTO customers
       (name, industry, cyberark_tenant, region, idp, siem,
        license_type, license_count, license_expiry, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name, industry ?? null, cyberark_tenant ?? null, region ?? null,
      idp ?? null, siem ?? null, license_type ?? null,
      license_count ?? null, license_expiry ?? null, notes ?? null,
    ]
  );
  return result;
};

exports.update = async (id, data) => {
  const fields = [
    "industry", "cyberark_tenant", "region", "idp", "siem",
    "license_type", "license_count", "license_expiry", "notes",
  ];
  const setClauses = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => data[f] ?? null);
  values.push(id);
  await pool.execute(`UPDATE customers SET ${setClauses} WHERE id = ?`, values);
};
