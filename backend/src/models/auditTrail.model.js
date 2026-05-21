/**
 * auditTrail.model.js
 * Tracks all destructive actions (deletes) for compliance and auditing
 */
const pool = require("../config/db");

/**
 * Log a deletion event to the audit trail
 * @param {Object} params
 * @param {string} params.action - Action type (e.g., 'DELETE')
 * @param {string} params.entityType - Entity type ('project', 'customer')
 * @param {number} params.entityId - ID of deleted entity
 * @param {string} params.entityName - Name of deleted entity
 * @param {number} params.deletedBy - User ID who performed deletion
 * @param {Object} params.cascadeSummary - Summary of cascaded deletions
 */
exports.logDeletion = async ({ action, entityType, entityId, entityName, deletedBy, cascadeSummary }) => {
  const [result] = await pool.execute(
    `INSERT INTO audit_trail 
     (action, entity_type, entity_id, entity_name, deleted_by, cascade_summary)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      action,
      entityType,
      entityId,
      entityName,
      deletedBy,
      JSON.stringify(cascadeSummary)
    ]
  );
  return result.insertId;
};

/**
 * Get audit trail entries with optional filters
 * @param {Object} filters
 * @param {string} filters.entityType - Filter by entity type
 * @param {number} filters.deletedBy - Filter by user who deleted
 * @param {number} filters.limit - Max results (default 100)
 */
exports.getAuditLog = async ({ entityType, deletedBy, limit = 100 } = {}) => {
  let query = `
    SELECT 
      at.*,
      u.name AS deleted_by_name
    FROM audit_trail at
    LEFT JOIN users u ON u.id = at.deleted_by
    WHERE 1=1
  `;
  const params = [];

  if (entityType) {
    query += ' AND at.entity_type = ?';
    params.push(entityType);
  }

  if (deletedBy) {
    query += ' AND at.deleted_by = ?';
    params.push(deletedBy);
  }

  query += ' ORDER BY at.deleted_at DESC LIMIT ?';
  params.push(Number(limit));

  const [rows] = await pool.execute(query, params);
  
  // Parse JSON cascade_summary
  return rows.map(row => ({
    ...row,
    cascade_summary: row.cascade_summary ? JSON.parse(row.cascade_summary) : null
  }));
};

/**
 * Get audit trail for a specific entity
 */
exports.getByEntity = async (entityType, entityId) => {
  const [rows] = await pool.execute(
    `SELECT 
       at.*,
       u.name AS deleted_by_name
     FROM audit_trail at
     LEFT JOIN users u ON u.id = at.deleted_by
     WHERE at.entity_type = ? AND at.entity_id = ?
     ORDER BY at.deleted_at DESC`,
    [entityType, entityId]
  );
  
  return rows.map(row => ({
    ...row,
    cascade_summary: row.cascade_summary ? JSON.parse(row.cascade_summary) : null
  }));
};
