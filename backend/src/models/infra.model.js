const pool = require("../config/db");

exports.getByCustomer = async (customerId) => {
  const [rows] = await pool.execute(
    "SELECT * FROM infra_servers WHERE customer_id = ? ORDER BY hostname",
    [customerId]
  );
  return rows;
};

// ── Get infra linked to a specific entity (with inheritance) ──
// P-3 fix: pre-fetch parent ids to avoid correlated subqueries
exports.getByEntity = async (entityType, entityId) => {
  let sql;
  const params = [];

  if (entityType === "subtask") {
    const [[ids]] = await pool.execute(
      `SELECT s.group_id, ag.project_id
       FROM subtasks s JOIN activity_groups ag ON ag.id = s.group_id
       WHERE s.id = ?`,
      [entityId]
    );
    if (!ids) return [];

    sql = `
      SELECT i.*, 'subtask' AS source, 'direct' AS scope
      FROM infra_servers i
      JOIN infra_links il ON il.infra_id = i.id
      WHERE il.entity_type = 'subtask' AND il.entity_id = ?

      UNION

      SELECT i.*, 'group' AS source, 'inherited' AS scope
      FROM infra_servers i
      JOIN infra_links il ON il.infra_id = i.id
      WHERE il.entity_type = 'group' AND il.entity_id = ?

      UNION

      SELECT i.*, 'project' AS source, 'inherited' AS scope
      FROM infra_servers i
      JOIN infra_links il ON il.infra_id = i.id
      WHERE il.entity_type = 'project' AND il.entity_id = ?
    `;
    params.push(entityId, ids.group_id, ids.project_id);

  } else if (entityType === "group") {
    const [[ids]] = await pool.execute(
      "SELECT project_id FROM activity_groups WHERE id = ?",
      [entityId]
    );
    if (!ids) return [];

    sql = `
      SELECT i.*, 'group' AS source, 'direct' AS scope
      FROM infra_servers i
      JOIN infra_links il ON il.infra_id = i.id
      WHERE il.entity_type = 'group' AND il.entity_id = ?

      UNION

      SELECT i.*, 'project' AS source, 'inherited' AS scope
      FROM infra_servers i
      JOIN infra_links il ON il.infra_id = i.id
      WHERE il.entity_type = 'project' AND il.entity_id = ?
    `;
    params.push(entityId, ids.project_id);

  } else {
    sql = `
      SELECT i.*, 'project' AS source, 'direct' AS scope
      FROM infra_servers i
      JOIN infra_links il ON il.infra_id = i.id
      WHERE il.entity_type = 'project' AND il.entity_id = ?
    `;
    params.push(entityId);
  }

  const [rows] = await pool.execute(sql, params);
  return rows;
};

// ── Get all infra for a customer (for the attach picker) ──────
exports.getPickerInfra = async (customerId) => {
  const [rows] = await pool.execute(
    `SELECT id, hostname, role, environment, ip_address
     FROM infra_servers WHERE customer_id = ? ORDER BY hostname`,
    [customerId]
  );
  return rows;
};

// ── Link infra to an entity ───────────────────────────────────
exports.link = async (infraId, entityType, entityId) => {
  const [result] = await pool.execute(
    `INSERT IGNORE INTO infra_links (infra_id, entity_type, entity_id)
     VALUES (?, ?, ?)`,
    [infraId, entityType, entityId]
  );
  return result;
};

// ── Unlink infra from an entity ───────────────────────────────
exports.unlink = async (infraId, entityType, entityId) => {
  await pool.execute(
    `DELETE FROM infra_links
     WHERE infra_id = ? AND entity_type = ? AND entity_id = ?`,
    [infraId, entityType, entityId]
  );
};

exports.create = async (customerId, data) => {
  const { hostname, ip_address, os, role, environment, notes } = data;
  const [result] = await pool.execute(
    `INSERT INTO infra_servers (customer_id, hostname, ip_address, os, role, environment, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      customerId, hostname,
      ip_address ?? null, os ?? null,
      role ?? "Other", environment ?? "Production",
      notes ?? null,
    ]
  );
  return result;
};

exports.remove = async (id) => {
  await pool.execute("DELETE FROM infra_servers WHERE id = ?", [id]);
};
