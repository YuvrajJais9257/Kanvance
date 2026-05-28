/**
 * userGroup.service.js
 *
 * Business logic for user access groups.
 */
const UserGroupModel = require("../models/userGroup.model");
const UserModel      = require("../models/user.model");

const VALID_PRIVILEGE_LEVELS = ["MASTER_ADMIN", "ADMIN", "MANAGER", "MEMBER"];

function bad(msg) { return Object.assign(new Error(msg), { status: 400 }); }
function notFound() { return Object.assign(new Error("Group not found"), { status: 404 }); }

exports.getAll = () => UserGroupModel.getAll();

exports.getById = async (id) => {
  const group = await UserGroupModel.getById(id);
  if (!group) throw notFound();
  return group;
};

exports.getMembers = (groupId) => UserGroupModel.getMembers(groupId);

exports.create = async ({ name, privilege_level, description }) => {
  if (!name || !name.trim()) throw bad("name is required");
  if (privilege_level && !VALID_PRIVILEGE_LEVELS.includes(privilege_level)) {
    throw bad(`privilege_level must be one of: ${VALID_PRIVILEGE_LEVELS.join(", ")}`);
  }
  // MASTER_ADMIN group can only be created once
  if (privilege_level === "MASTER_ADMIN") {
    const all = await UserGroupModel.getAll();
    if (all.some((g) => g.privilege_level === "MASTER_ADMIN")) {
      throw Object.assign(new Error("A MASTER_ADMIN group already exists"), { status: 409 });
    }
  }
  if (await UserGroupModel.nameExists(name.trim())) {
    throw Object.assign(new Error("A group with this name already exists"), { status: 409 });
  }
  const id = await UserGroupModel.create({
    name: name.trim(),
    privilege_level: privilege_level ?? "MEMBER",
    description: description?.trim() ?? null,
  });
  return UserGroupModel.getById(id);
};

exports.update = async (id, data) => {
  const existing = await UserGroupModel.getById(id);
  if (!existing) throw notFound();

  // Cannot change privilege_level of MASTER_ADMIN group
  if (existing.privilege_level === "MASTER_ADMIN" && data.privilege_level && data.privilege_level !== "MASTER_ADMIN") {
    throw Object.assign(new Error("Cannot change the privilege level of the MASTER_ADMIN group"), { status: 403 });
  }
  if (data.privilege_level && !VALID_PRIVILEGE_LEVELS.includes(data.privilege_level)) {
    throw bad(`privilege_level must be one of: ${VALID_PRIVILEGE_LEVELS.join(", ")}`);
  }
  if (data.name && await UserGroupModel.nameExists(data.name.trim(), id)) {
    throw Object.assign(new Error("A group with this name already exists"), { status: 409 });
  }

  await UserGroupModel.update(id, {
    name:            data.name?.trim(),
    privilege_level: data.privilege_level,
    description:     data.description,
  });

  // If privilege_level changed, sync role on all members and bump role_version
  // so their active sessions pick up the new privilege level immediately.
  if (data.privilege_level && data.privilege_level !== existing.privilege_level) {
    await UserGroupModel.syncAllMembersRole(id, data.privilege_level);
  }

  return UserGroupModel.getById(id);
};

exports.remove = async (id) => {
  const existing = await UserGroupModel.getById(id);
  if (!existing) throw notFound();
  if (existing.privilege_level === "MASTER_ADMIN") {
    throw Object.assign(new Error("Cannot delete the MASTER_ADMIN group"), { status: 403 });
  }
  await UserGroupModel.remove(id);
  return { deleted: true, id: Number(id) };
};

exports.assignUser = async (userId, groupId) => {
  const group = await UserGroupModel.getById(groupId);
  if (!group) throw notFound();
  await UserGroupModel.assignUser(userId, groupId);
  // Sync the user's role to match the group's privilege_level — group is the
  // single source of truth for access level. Also bumps role_version so the
  // active session picks up the change on the very next request.
  await UserModel.update(userId, { role: group.privilege_level });
  await UserModel.bumpRoleVersion(userId);
  return { assigned: true };
};
