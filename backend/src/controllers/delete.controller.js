/**
 * delete.controller.js
 * Hard delete operations for projects and customers (admin-only)
 * All deletes are transactional with full cascade and audit logging
 */
const pool = require("../config/db");
const AuditTrailModel = require("../models/auditTrail.model");
const NotificationModel = require("../models/notification.model");

/**
 * DELETE /api/projects/:id
 * Hard delete a project with full cascade
 * Admin-only, requires exact name confirmation from frontend
 */
exports.deleteProject = async (req, res, next) => {
  const projectId = req.params.id;
  const userId = req.session.userId;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Get project details for audit and verification
    const [[project]] = await connection.execute(
      'SELECT id, name, customer_id FROM projects WHERE id = ?',
      [projectId]
    );

    if (!project) {
      await connection.rollback();
      return res.status(404).json({ error: "Project not found" });
    }

    // 2. Count entities that will be cascade deleted
    const [[{ groupCount }]] = await connection.execute(
      'SELECT COUNT(*) as groupCount FROM activity_groups WHERE project_id = ?',
      [projectId]
    );

    const [[{ subtaskCount }]] = await connection.execute(
      `SELECT COUNT(*) as subtaskCount FROM subtasks s
       JOIN activity_groups ag ON ag.id = s.group_id
       WHERE ag.project_id = ?`,
      [projectId]
    );

    const [[{ activityLogCount }]] = await connection.execute(
      'SELECT COUNT(*) as activityLogCount FROM activity_logs WHERE project_id = ?',
      [projectId]
    );

    const [[{ documentLinkCount }]] = await connection.execute(
      `SELECT COUNT(*) as documentLinkCount FROM document_links 
       WHERE entity_type = 'project' AND entity_id = ?
          OR entity_type = 'group' AND entity_id IN (
            SELECT id FROM activity_groups WHERE project_id = ?
          )
          OR entity_type = 'subtask' AND entity_id IN (
            SELECT s.id FROM subtasks s
            JOIN activity_groups ag ON ag.id = s.group_id
            WHERE ag.project_id = ?
          )`,
      [projectId, projectId, projectId]
    );

    const [[{ infraLinkCount }]] = await connection.execute(
      `SELECT COUNT(*) as infraLinkCount FROM infra_links 
       WHERE entity_type = 'project' AND entity_id = ?
          OR entity_type = 'group' AND entity_id IN (
            SELECT id FROM activity_groups WHERE project_id = ?
          )
          OR entity_type = 'subtask' AND entity_id IN (
            SELECT s.id FROM subtasks s
            JOIN activity_groups ag ON ag.id = s.group_id
            WHERE ag.project_id = ?
          )`,
      [projectId, projectId, projectId]
    );

    // 3. Dismiss all notifications for this project
    await connection.execute(
      'DELETE FROM notifications WHERE project_id = ?',
      [projectId]
    );

    // 4. Delete project (CASCADE handles activity_groups, subtasks, activity_logs, etc.)
    await connection.execute('DELETE FROM projects WHERE id = ?', [projectId]);

    // 5. Log to audit trail
    await connection.execute(
      `INSERT INTO audit_trail 
       (action, entity_type, entity_id, entity_name, deleted_by, cascade_summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'DELETE',
        'project',
        projectId,
        project.name,
        userId,
        JSON.stringify({
          groups_removed: groupCount,
          subtasks_removed: subtaskCount,
          activity_logs_removed: activityLogCount,
          document_links_removed: documentLinkCount,
          infra_links_removed: infraLinkCount,
          assignments_freed: subtaskCount // All subtasks had potential assignments
        })
      ]
    );

    await connection.commit();

    res.json({
      success: true,
      message: `Project "${project.name}" has been permanently deleted`,
      cascade_summary: {
        groups_removed: groupCount,
        subtasks_removed: subtaskCount,
        activity_logs_removed: activityLogCount,
        document_links_removed: documentLinkCount,
        infra_links_removed: infraLinkCount
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Project deletion error:', error);
    next(error);
  } finally {
    connection.release();
  }
};

/**
 * DELETE /api/customers/:id
 * Hard delete a customer with ALL projects and full cascade
 * Admin-only, requires exact name confirmation from frontend
 */
exports.deleteCustomer = async (req, res, next) => {
  const customerId = req.params.id;
  const userId = req.session.userId;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Get customer details for audit
    const [[customer]] = await connection.execute(
      'SELECT id, name FROM customers WHERE id = ?',
      [customerId]
    );

    if (!customer) {
      await connection.rollback();
      return res.status(404).json({ error: "Customer not found" });
    }

    // 2. Get all projects under this customer
    const [projects] = await connection.execute(
      'SELECT id, name FROM projects WHERE customer_id = ?',
      [customerId]
    );

    // 3. Count all entities that will be cascade deleted
    const [[{ totalGroups }]] = await connection.execute(
      `SELECT COUNT(*) as totalGroups FROM activity_groups ag
       JOIN projects p ON p.id = ag.project_id
       WHERE p.customer_id = ?`,
      [customerId]
    );

    const [[{ totalSubtasks }]] = await connection.execute(
      `SELECT COUNT(*) as totalSubtasks FROM subtasks s
       JOIN activity_groups ag ON ag.id = s.group_id
       JOIN projects p ON p.id = ag.project_id
       WHERE p.customer_id = ?`,
      [customerId]
    );

    const [[{ totalActivityLogs }]] = await connection.execute(
      `SELECT COUNT(*) as totalActivityLogs FROM activity_logs al
       JOIN projects p ON p.id = al.project_id
       WHERE p.customer_id = ?`,
      [customerId]
    );

    const [[{ totalContacts }]] = await connection.execute(
      'SELECT COUNT(*) as totalContacts FROM contacts WHERE customer_id = ?',
      [customerId]
    );

    const [[{ totalDocuments }]] = await connection.execute(
      'SELECT COUNT(*) as totalDocuments FROM documents WHERE customer_id = ?',
      [customerId]
    );

    const [[{ totalInfraServers }]] = await connection.execute(
      'SELECT COUNT(*) as totalInfraServers FROM infra_servers WHERE customer_id = ?',
      [customerId]
    );

    // 4. Dismiss all notifications for all projects under this customer
    await connection.execute(
      `DELETE FROM notifications WHERE project_id IN (
        SELECT id FROM projects WHERE customer_id = ?
      )`,
      [customerId]
    );

    // 5. Delete customer (CASCADE handles projects, contacts, documents, infra, etc.)
    await connection.execute('DELETE FROM customers WHERE id = ?', [customerId]);

    // 6. Log to audit trail
    await connection.execute(
      `INSERT INTO audit_trail 
       (action, entity_type, entity_id, entity_name, deleted_by, cascade_summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'DELETE',
        'customer',
        customerId,
        customer.name,
        userId,
        JSON.stringify({
          projects_removed: projects.length,
          groups_removed: totalGroups,
          subtasks_removed: totalSubtasks,
          activity_logs_removed: totalActivityLogs,
          contacts_removed: totalContacts,
          documents_removed: totalDocuments,
          infra_servers_removed: totalInfraServers,
          assignments_freed: totalSubtasks
        })
      ]
    );

    await connection.commit();

    res.json({
      success: true,
      message: `Customer "${customer.name}" and all ${projects.length} project(s) have been permanently deleted`,
      cascade_summary: {
        projects_removed: projects.length,
        groups_removed: totalGroups,
        subtasks_removed: totalSubtasks,
        activity_logs_removed: totalActivityLogs,
        contacts_removed: totalContacts,
        documents_removed: totalDocuments,
        infra_servers_removed: totalInfraServers
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Customer deletion error:', error);
    next(error);
  } finally {
    connection.release();
  }
};

/**
 * GET /api/audit-trail
 * Get audit trail entries (admin-only)
 */
exports.getAuditTrail = async (req, res, next) => {
  try {
    const { entity_type, limit } = req.query;
    
    const entries = await AuditTrailModel.getAuditLog({
      entityType: entity_type,
      limit: limit ? Number(limit) : 100
    });

    res.json(entries);
  } catch (error) {
    next(error);
  }
};
