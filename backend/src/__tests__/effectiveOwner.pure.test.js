/**
 * Property tests for effectiveOwner.js
 *
 * Property 2: Effective_Owner Priority Chain
 * Property 10: Role Validation Rejects All Non-Valid Roles
 *
 * Requirements: 2.3, 5.1, 5.2, 5.3, 10.1, 10.2
 */

"use strict";

const fc = require("fast-check");
const {
  resolveEffectiveOwner,
  validateRole,
  sortMembers,
} = require("../services/effectiveOwner");

describe("effectiveOwner.pure", () => {
  // ─── Property 2: Effective Owner Priority Chain ───────────────────────────

  describe("Property 2: Effective Owner Priority Chain", () => {
    test("Case 1: Active assignment takes priority over task and project", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          fc.string(),
          fc.integer({ min: 1, max: 10000 }),
          (assigneeId, assigneeName, otherId) => {
            const result = resolveEffectiveOwner(
              { userId: assigneeId, userName: assigneeName }, // Active assignment
              otherId, // Task assignee (ignored)
              otherId, // Project owner (ignored)
            );

            return (
              result.effectiveOwnerId === assigneeId &&
              result.effectiveOwnerName === assigneeName &&
              result.inherited === false
            );
          },
        ),
      );
    });

    test("Case 2: Task assignee takes priority over project owner (no active assignment)", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          fc.string(),
          fc.integer({ min: 1, max: 10000 }),
          (taskAssigneeId, taskAssigneeName, projectOwnerId) => {
            const result = resolveEffectiveOwner(
              null, // No active assignment
              taskAssigneeId, // Task assignee (takes priority)
              projectOwnerId, // Project owner (ignored)
              taskAssigneeName,
            );

            return (
              result.effectiveOwnerId === taskAssigneeId &&
              result.effectiveOwnerName === taskAssigneeName &&
              result.inherited === true
            );
          },
        ),
      );
    });

    test("Case 3: Project owner is fallback (no active assignment or task assignee)", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          fc.string(),
          (projectOwnerId, projectOwnerName) => {
            const result = resolveEffectiveOwner(
              null, // No active assignment
              null, // No task assignee
              projectOwnerId, // Project owner (fallback)
              undefined,
              projectOwnerName,
            );

            return (
              result.effectiveOwnerId === projectOwnerId &&
              result.effectiveOwnerName === projectOwnerName &&
              result.inherited === true
            );
          },
        ),
      );
    });

    test("Case 4: Null owner when all three are absent", () => {
      const result = resolveEffectiveOwner(null, null, null);

      expect(result.effectiveOwnerId).toBeNull();
      expect(result.effectiveOwnerName).toBeNull();
      expect(result.inherited).toBeNull();
    });

    test("Active assignment with missing userName still returns correct id", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10000 }), (assigneeId) => {
          const result = resolveEffectiveOwner(
            { userId: assigneeId, userName: undefined }, // No userName
            null,
            null,
          );

          return (
            result.effectiveOwnerId === assigneeId &&
            result.effectiveOwnerName === null &&
            result.inherited === false
          );
        }),
      );
    });
  });

  // ─── Property 10: Role Validation ─────────────────────────────────────────

  describe("Property 10: Role Validation Rejects All Non-Valid Roles", () => {
    test("Valid roles return null (no error)", () => {
      const validRoles = ["member", "lead", "contributor"];

      validRoles.forEach((role) => {
        const result = validateRole(role);
        expect(result).toBeNull();
      });
    });

    test("Any string not in {member, lead, contributor} returns an error string", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          // Filter out the three valid values
          if (["member", "lead", "contributor"].includes(input)) {
            return true; // Skip valid values
          }

          const result = validateRole(input);
          return typeof result === "string" && result.length > 0;
        }),
      );
    });

    test('Invalid roles like "admin", "owner", "viewer" are rejected', () => {
      const invalidRoles = ["admin", "owner", "viewer", "editor", "guest", ""];

      invalidRoles.forEach((role) => {
        const result = validateRole(role);
        expect(result).not.toBeNull();
        expect(typeof result).toBe("string");
      });
    });
  });

  // ─── Member Sorting Tests ────────────────────────────────────────────────

  describe("Member List Ordering", () => {
    test("Active members come before former members", () => {
      const members = [
        {
          id: 1,
          user_id: 1,
          user_name: "Alice",
          joined_date: "2025-01-01",
          left_date: null,
        },
        {
          id: 2,
          user_id: 2,
          user_name: "Bob",
          joined_date: "2025-01-05",
          left_date: "2025-06-01",
        },
        {
          id: 3,
          user_id: 3,
          user_name: "Charlie",
          joined_date: "2025-02-01",
          left_date: null,
        },
        {
          id: 4,
          user_id: 4,
          user_name: "Diana",
          joined_date: "2024-12-01",
          left_date: "2025-05-01",
        },
      ];

      const sorted = sortMembers(members);

      // Active members (Alice, Charlie) should be first
      expect(sorted[0].user_name).toBe("Alice");
      expect(sorted[1].user_name).toBe("Charlie");
      // Former members (Diana, Bob) should be last
      expect(sorted[2].user_name).toBe("Diana");
      expect(sorted[3].user_name).toBe("Bob");
    });

    test("Active members are sorted by joined_date ASC", () => {
      const members = [
        {
          id: 1,
          user_id: 1,
          user_name: "Alice",
          joined_date: "2025-03-01",
          left_date: null,
        },
        {
          id: 2,
          user_id: 2,
          user_name: "Bob",
          joined_date: "2025-01-01",
          left_date: null,
        },
        {
          id: 3,
          user_id: 3,
          user_name: "Charlie",
          joined_date: "2025-02-01",
          left_date: null,
        },
      ];

      const sorted = sortMembers(members);

      expect(sorted[0].user_name).toBe("Bob");
      expect(sorted[1].user_name).toBe("Charlie");
      expect(sorted[2].user_name).toBe("Alice");
    });

    test("Former members are sorted by joined_date ASC", () => {
      const members = [
        {
          id: 1,
          user_id: 1,
          user_name: "Alice",
          joined_date: "2025-03-01",
          left_date: "2025-06-01",
        },
        {
          id: 2,
          user_id: 2,
          user_name: "Bob",
          joined_date: "2025-01-01",
          left_date: "2025-05-01",
        },
        {
          id: 3,
          user_id: 3,
          user_name: "Charlie",
          joined_date: "2025-02-01",
          left_date: "2025-04-01",
        },
      ];

      const sorted = sortMembers(members);

      expect(sorted[0].user_name).toBe("Bob");
      expect(sorted[1].user_name).toBe("Charlie");
      expect(sorted[2].user_name).toBe("Alice");
    });
  });
});
