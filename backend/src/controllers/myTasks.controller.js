const MyTasksModel = require("../models/myTasks.model");

exports.getByMember = async (req, res, next) => {
  try {
    const memberId = req.query.member_id;
    if (!memberId) {
      return res.status(400).json({ error: "member_id query param is required" });
    }
    res.json(await MyTasksModel.getByMember(memberId));
  } catch (err) {
    next(err);
  }
};
