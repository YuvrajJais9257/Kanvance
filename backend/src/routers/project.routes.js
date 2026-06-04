const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/project.controller");
const groupCtrl = require("../controllers/group.controller");
const projectMember = require("../controllers/projectMember.controller");

router.get("/",      ctrl.getAll);
router.post("/",     ctrl.create);
router.get("/:id",   ctrl.getById);
router.put("/:id",   ctrl.update);
router.delete("/:id", ctrl.remove);

// Activity groups nested under project
router.post("/:pid/groups", groupCtrl.create);

// Project membership routes (requireAuth is applied globally; manager-level check is in the controller)
router.post("/:projectId/members",              projectMember.addMember);
router.delete("/:projectId/members/:userId",    projectMember.removeMember);
router.get("/:projectId/members",               projectMember.listMembers);
router.get("/:projectId/assignable-users",      projectMember.assignableUsers);

module.exports = router;
