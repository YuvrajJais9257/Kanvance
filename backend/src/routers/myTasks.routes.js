const express = require("express");
const router  = express.Router();
const MyTasksModel = require("../models/myTasks.model");

// GET /api/my-tasks?member_id=:id
// Access rules:
//  - ADMIN / MANAGER: can query any member's tasks
//  - MEMBER: can only query their own tasks, or tasks of members
//    who share a project with them (enforced in the model layer)
router.get("/", async (req, res, next) => {
  try {
    const requestingUserId = req.session.userId;
    const requestingRole   = req.session.userRole ?? "MEMBER";

    let memberId = req.query.member_id;

    // If no member_id provided, default to the logged-in user
    if (!memberId) {
      memberId = requestingUserId;
    }

    // Non-privileged users can only query their own tasks directly;
    // cross-member visibility is enforced inside the model via project membership.
    if (!["ADMIN", "LEAD", "MANAGER"].includes(requestingRole)) {
      memberId = requestingUserId;
    }

    const tasks = await MyTasksModel.getByMember(memberId, requestingUserId, requestingRole);
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
