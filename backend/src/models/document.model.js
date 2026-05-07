const pool = require("../config/db");

// ── Get documents for a customer ─────────────────────────────
exports.getByCustomer = async (customerId) => {
  const [rows] = await pool.execute(
    "SELECT * FROM documents WHERE customer_id = ? ORDER BY created_at DESC",
    [customerId]
  );
  return rows;
};

// ── Get documents linked to a specific entity (with inheritance) ──
// P-3 fix: pre-fetch parent ids to avoid correlated subqueries in UNION branches
exports.getByEntity = async (entityType, entityId) => {
  let sql;
  const params = [];

  if (entityType === "subtask") {
    // Pre-fetch group_id and project_id in one query
    const [[ids]] = await pool.execute(
      `SELECT s.group_id, ag.project_id
       FROM subtasks s JOIN activity_groups ag ON ag.id = s.group_id
       WHERE s.id = ?`,
      [entityId]
    );
    if (!ids) return [];

    sql = `
      SELECT d.*, 'subtask' AS source, 'direct' AS scope
      FROM documents d
      JOIN document_links dl ON dl.document_id = d.id
      WHERE dl.entity_type = 'subtask' AND dl.entity_id = ?

      UNION

      SELECT d.*, 'group' AS source, 'inherited' AS scope
      FROM documents d
      JOIN document_links dl ON dl.document_id = d.id
      WHERE dl.entity_type = 'group' AND dl.entity_id = ?

      UNION

      SELECT d.*, 'project' AS source, 'inherited' AS scope
      FROM documents d
      JOIN document_links dl ON dl.document_id = d.id
      WHERE dl.entity_type = 'project' AND dl.entity_id = ?

      ORDER BY scope ASC, source ASC
    `;
    params.push(entityId, ids.group_id, ids.project_id);

  } else if (entityType === "group") {
    // Pre-fetch project_id
    const [[ids]] = await pool.execute(
      "SELECT project_id FROM activity_groups WHERE id = ?",
      [entityId]
    );
    if (!ids) return [];

    sql = `
      SELECT d.*, 'group' AS source, 'direct' AS scope
      FROM documents d
      JOIN document_links dl ON dl.document_id = d.id
      WHERE dl.entity_type = 'group' AND dl.entity_id = ?

      UNION

      SELECT d.*, 'project' AS source, 'inherited' AS scope
      FROM documents d
      JOIN document_links dl ON dl.document_id = d.id
      WHERE dl.entity_type = 'project' AND dl.entity_id = ?

      ORDER BY scope ASC, source ASC
    `;
    params.push(entityId, ids.project_id);

  } else {
    sql = `
      SELECT d.*, 'project' AS source, 'direct' AS scope
      FROM documents d
      JOIN document_links dl ON dl.document_id = d.id
      WHERE dl.entity_type = 'project' AND dl.entity_id = ?
      ORDER BY d.name ASC
    `;
    params.push(entityId);
  }

  const [rows] = await pool.execute(sql, params);
  return rows;
};

// ── Get all documents for a customer (for the attach picker) ──
exports.getPickerDocs = async (customerId) => {
  const [rows] = await pool.execute(
    `SELECT id, name, type, status, link FROM documents
     WHERE customer_id = ?
     ORDER BY name ASC`,
    [customerId]
  );
  return rows;
};

// ── Create document ───────────────────────────────────────────
exports.create = async (customerId, data) => {
  const { name, type, status, link, notes } = data;
  const [result] = await pool.execute(
    `INSERT INTO documents (customer_id, name, type, status, link, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      customerId, name,
      type ?? "Other",
      status ?? "Draft",
      link ?? null,
      notes ?? null,
    ]
  );
  return result;
};

// ── Link a document to an entity ──────────────────────────────
exports.link = async (documentId, entityType, entityId) => {
  const [result] = await pool.execute(
    `INSERT IGNORE INTO document_links (document_id, entity_type, entity_id)
     VALUES (?, ?, ?)`,
    [documentId, entityType, entityId]
  );
  return result;
};

// ── Unlink a document from an entity ─────────────────────────
exports.unlink = async (documentId, entityType, entityId) => {
  await pool.execute(
    `DELETE FROM document_links
     WHERE document_id = ? AND entity_type = ? AND entity_id = ?`,
    [documentId, entityType, entityId]
  );
};

// ── Delete document ───────────────────────────────────────────
exports.remove = async (id) => {
  await pool.execute("DELETE FROM documents WHERE id = ?", [id]);
};

// ── Get single document by id (for file deletion) ─────────────
exports.getById = async (id) => {
  const [[row]] = await pool.execute(
    "SELECT id, name, link FROM documents WHERE id = ?",
    [id]
  );
  return row ?? null;
};
