const express = require("express");
const router  = express.Router();
const MyTasksModel = require("../models/myTasks.model");

// GET /api/my-tasks?member_id=:id
// A-5: non-admin users can only see their own tasks
router.get("/", async (req, res, next) => {
  try {
    let memberId = req.query.member_id;

    // If no member_id provided, default to the logged-in user
    if (!memberId) {
      memberId = req.session.userId;
    }

    // Non-admin/manager users can only query their own tasks
    const role = req.session.userRole ?? "MEMBER";
    if (!["ADMIN", "MANAGER"].includes(role)) {
      memberId = req.session.userId;
    }

    const tasks = await MyTasksModel.getByMember(memberId);
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
