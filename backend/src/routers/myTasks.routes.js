const express = require("express");
const router  = express.Router();
const MyTasksModel = require("../models/myTasks.model");
const pool = require("../config/db");

// GET /api/my-tasks?member_id=:id
// Access rules:
//  - ADMIN / MASTER_ADMIN: can query any member's tasks
//  - MANAGER / LEAD: can query their own tasks + members on shared projects only
//  - MEMBER: can only query their own tasks
router.get("/", async (req, res, next) => {
  try {
    const requestingUserId = req.session.userId;
    const requestingRole   = req.session.userRole ?? "MEMBER";

    let memberId = req.query.member_id
      ? Number(req.query.member_id)
      : requestingUserId;

    // MEMBERs are always scoped to themselves
    if (!["ADMIN", "MASTER_ADMIN", "LEAD", "MANAGER"].includes(requestingRole)) {
      memberId = requestingUserId;
    }

    // MANAGERs and LEADs can only view members on shared projects, not arbitrary users
    if (["MANAGER", "LEAD"].includes(requestingRole) && memberId !== requestingUserId) {
      const [[allowed]] = await pool.execute(
        `SELECT 1
         FROM users u
         WHERE u.id = ?
           AND u.deleted_at IS NULL
           AND u.status != 'disabled'
           AND EXISTS (
             SELECT 1 FROM projects p
             WHERE (
               p.owner_id = ?
               OR EXISTS (
                 SELECT 1 FROM task_assignments ta_mgr
                 JOIN subtasks s_mgr ON s_mgr.id = ta_mgr.subtask_id
                 JOIN activity_groups ag_mgr ON ag_mgr.id = s_mgr.group_id
                 WHERE ag_mgr.project_id = p.id
                   AND ta_mgr.user_id = ?
                   AND ta_mgr.unassigned_date IS NULL
               )
             )
             AND (
               p.owner_id = u.id
               OR EXISTS (
                 SELECT 1 FROM subtasks s2
                 JOIN activity_groups ag2 ON ag2.id = s2.group_id
                 WHERE ag2.project_id = p.id AND s2.assignee_id = u.id
               )
               OR EXISTS (
                 SELECT 1 FROM task_assignments ta2
                 JOIN subtasks s3 ON s3.id = ta2.subtask_id
                 JOIN activity_groups ag3 ON ag3.id = s3.group_id
                 WHERE ag3.project_id = p.id
                   AND ta2.user_id = u.id
                   AND ta2.unassigned_date IS NULL
               )
             )
           )
         LIMIT 1`,
        [memberId, requestingUserId, requestingUserId]
      );
      if (!allowed) {
        return res.status(403).json({
          error: "You can only view tasks for members on your shared projects",
        });
      }
    }

    const tasks = await MyTasksModel.getByMember(memberId, requestingUserId, requestingRole);
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
