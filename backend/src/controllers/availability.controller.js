const AvailabilityModel = require("../models/availability.model");

/**
 * GET /api/availability
 * Returns all users with their current availability status.
 * Only id, name, status are returned — no sensitive fields.
 */
exports.getAll = async (req, res, next) => {
  try {
    const statuses = await AvailabilityModel.getAll();
    res.json(statuses);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/availability
 * Updates the session user's own availability status.
 * Body: { status: string }
 * Returns 400 on invalid status value.
 * Returns 403 if body contains a userId that differs from the session user.
 */
exports.updateOwn = async (req, res, next) => {
  try {
    const sessionUserId = req.session.userId;
    const { status, userId: bodyUserId } = req.body;

    // Reject attempts to update another user's status
    if (bodyUserId !== undefined && Number(bodyUserId) !== Number(sessionUserId)) {
      return res.status(403).json({ error: "You can only update your own status" });
    }

    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }

    // setStatus throws with err.status = 400 if value is invalid
    await AvailabilityModel.setStatus(sessionUserId, status);

    const updated = await AvailabilityModel.getOne(sessionUserId);
    res.json(updated);
  } catch (err) {
    // Propagate validation errors as 400
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};
