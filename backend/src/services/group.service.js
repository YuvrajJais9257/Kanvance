const GroupModel = require("../models/group.model");
const assignmentService = require("./assignment.service");
const UserModel = require("../models/user.model");
const projectMemberService = require("./projectMember.service");

exports.create = (projectId, { name, position }) => {
  if (!name || !name.trim()) throw Object.assign(new Error("name is required"), { status: 400 });
  return GroupModel.create(projectId, name.trim(), position ?? 0);
};

// A-2/B-6 fix: pass only provided fields; position is optional
// Requirement 4.1–4.6: extend to support task-level assignee_id with inheritance propagation
exports.update = async (id, { name, position, assignee_id }) => {
  if (name !== undefined && !name.trim()) throw Object.assign(new Error("name is required"), { status: 400 });

  // Task 7.1: Handle assignee_id when present in request data
  if (assignee_id !== undefined) {
    // Fetch current activity_groups row to get current assignee_id and project_id
    const currentTask = await GroupModel.getById(id);
    if (!currentTask) {
      throw Object.assign(new Error("Task not found"), { status: 404 });
    }

    const currentAssigneeId = currentTask.assignee_id ?? null;
    const newAssigneeId = assignee_id ?? null;

    // If new value equals current value → no-op return (avoid re-running propagation)
    if (newAssigneeId === currentAssigneeId) {
      // Still process name/position updates if present
      const data = {};
      if (name !== undefined) data.name = name.trim();
      if (position !== undefined) data.position = position;
      if (Object.keys(data).length > 0) {
        await GroupModel.update(id, data);
      }
      return;
    }

    // Case 1: assignee_id is being set to null → clear inherited assignments
    if (newAssigneeId === null) {
      await assignmentService.clearInheritedAssignments(id);
      // Update activity_groups.assignee_id to null
      await GroupModel.update(id, { assignee_id: null });
    }
    // Case 2: assignee_id is being set to a non-null user → validate and propagate
    else {
      // Validate user exists (404)
      const user = await UserModel.getById(newAssigneeId);
      if (!user) {
        throw Object.assign(new Error("User not found"), { status: 404 });
      }

      // Validate user is Active_Member of parent project (422)
      const isActiveMember = await projectMemberService.isActiveMember(currentTask.project_id, newAssigneeId);
      if (!isActiveMember) {
        throw Object.assign(
          new Error(`User ${newAssigneeId} is not an active member of project ${currentTask.project_id}`),
          { status: 422 }
        );
      }

      // UPDATE activity_groups.assignee_id
      await GroupModel.update(id, { assignee_id: newAssigneeId });

      // Propagate task assignment to child subtasks
      await assignmentService.propagateTaskAssignment(id, newAssigneeId);
    }

    // After handling assignee_id, process name/position updates if present
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (position !== undefined) data.position = position;
    if (Object.keys(data).length > 0) {
      await GroupModel.update(id, data);
    }
  } else {
    // No assignee_id in request — proceed with existing name/position update logic
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (position !== undefined) data.position = position;
    return GroupModel.update(id, data);
  }
};

exports.remove = (id) => GroupModel.remove(id);
