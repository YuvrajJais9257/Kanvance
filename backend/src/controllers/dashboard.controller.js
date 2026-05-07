const DashboardService = require("../services/dashboard.service");

exports.getSummary = async (req, res, next) => {
  try {
    res.json(await DashboardService.getSummary());
  } catch (err) { next(err); }
};
