/**
 * Property tests for distribute.js
 *
 * Property 6: Round-Robin Distribution Formula
 * Property 7: Equal Distribution Balance
 *
 * Requirements: 8.5, 8.6
 */

"use strict";

const fc = require("fast-check");
const { computeDistribution } = require("../services/distribute");

describe("distribute.pure", () => {
  // ─── Property 6: Round-Robin Distribution Formula ────────────────────────

  describe("Property 6: Round-Robin Distribution Formula", () => {
    test("Subtask at index i is assigned to userIds[i % M]", () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 1 }), { minLength: 1, maxLength: 20 }),
          fc.array(fc.integer({ min: 100, max: 1000 }), {
            minLength: 1,
            maxLength: 10,
          }),
          (subtaskIds, userIds) => {
            // Use unique user IDs to avoid collisions
            const uniqueUserIds = [...new Set(userIds)];
            const subtasks = subtaskIds.map((id, idx) => ({
              id: idx + 1,
              position: idx,
            }));
            const distribution = computeDistribution(
              subtasks,
              uniqueUserIds,
              "round_robin",
            );

            // Verify each subtask is assigned to uniqueUserIds[index % uniqueUserIds.length]
            for (let i = 0; i < subtasks.length; i++) {
              const expectedUserId = uniqueUserIds[i % uniqueUserIds.length];
              expect(distribution.get(subtasks[i].id)).toBe(expectedUserId);
            }

            return true;
          },
        ),
      );
    });

    test("Round-robin with 3 users and 7 subtasks cycles correctly", () => {
      const subtasks = Array.from({ length: 7 }, (_, i) => ({ id: i + 1 }));
      const userIds = [100, 200, 300];

      const distribution = computeDistribution(
        subtasks,
        userIds,
        "round_robin",
      );

      expect(distribution.get(1)).toBe(100); // i=0 % 3 = 0 → userIds[0]
      expect(distribution.get(2)).toBe(200); // i=1 % 3 = 1 → userIds[1]
      expect(distribution.get(3)).toBe(300); // i=2 % 3 = 2 → userIds[2]
      expect(distribution.get(4)).toBe(100); // i=3 % 3 = 0 → userIds[0]
      expect(distribution.get(5)).toBe(200); // i=4 % 3 = 1 → userIds[1]
      expect(distribution.get(6)).toBe(300); // i=5 % 3 = 2 → userIds[2]
      expect(distribution.get(7)).toBe(100); // i=6 % 3 = 0 → userIds[0]
    });

    test("Round-robin with single user assigns all subtasks to that user", () => {
      const subtasks = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
      const userIds = [999];

      const distribution = computeDistribution(
        subtasks,
        userIds,
        "round_robin",
      );

      subtasks.forEach((st) => {
        expect(distribution.get(st.id)).toBe(999);
      });
    });
  });

  // ─── Property 7: Equal Distribution Balance ──────────────────────────────

  describe("Property 7: Equal Distribution Balance", () => {
    test("Max minus min count per user is at most 1", () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 1 }), { minLength: 1, maxLength: 50 }),
          fc.array(fc.integer({ min: 100, max: 1000 }), {
            minLength: 1,
            maxLength: 10,
          }),
          (subtaskIds, userIds) => {
            // Use unique user IDs to avoid collisions
            const uniqueUserIds = [...new Set(userIds)];
            const subtasks = subtaskIds.map((id, idx) => ({
              id: idx + 1,
              position: idx,
            }));
            const distribution = computeDistribution(
              subtasks,
              uniqueUserIds,
              "equal",
            );

            // Count assignments per user
            const counts = new Map();
            for (const userId of uniqueUserIds) {
              counts.set(userId, 0);
            }

            for (const [subtaskId, userId] of distribution.entries()) {
              counts.set(userId, (counts.get(userId) || 0) + 1);
            }

            // Get min and max counts
            const countValues = Array.from(counts.values()).filter(
              (c) => c > 0,
            );
            if (countValues.length === 0) return true;

            const minCount = Math.min(...countValues);
            const maxCount = Math.max(...countValues);

            // Verify max - min <= 1
            return maxCount - minCount <= 1;
          },
        ),
      );
    });

    test("Remainder subtasks go to lower-index users", () => {
      // 7 subtasks, 3 users: base=2, remainder=1
      // user[0] gets 3, user[1] gets 2, user[2] gets 2
      const subtasks = Array.from({ length: 7 }, (_, i) => ({ id: i + 1 }));
      const userIds = [100, 200, 300];

      const distribution = computeDistribution(subtasks, userIds, "equal");

      // Count assignments
      const counts = { 100: 0, 200: 0, 300: 0 };
      for (const [_, userId] of distribution.entries()) {
        counts[userId]++;
      }

      expect(counts[100]).toBe(3); // Gets remainder
      expect(counts[200]).toBe(2);
      expect(counts[300]).toBe(2);
    });

    test("Perfect division distributes equally", () => {
      // 6 subtasks, 3 users: each gets 2
      const subtasks = Array.from({ length: 6 }, (_, i) => ({ id: i + 1 }));
      const userIds = [100, 200, 300];

      const distribution = computeDistribution(subtasks, userIds, "equal");

      const counts = { 100: 0, 200: 0, 300: 0 };
      for (const [_, userId] of distribution.entries()) {
        counts[userId]++;
      }

      expect(counts[100]).toBe(2);
      expect(counts[200]).toBe(2);
      expect(counts[300]).toBe(2);
    });

    test("Single user gets all subtasks", () => {
      const subtasks = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
      const userIds = [999];

      const distribution = computeDistribution(subtasks, userIds, "equal");

      expect(distribution.size).toBe(10);
      for (const [_, userId] of distribution.entries()) {
        expect(userId).toBe(999);
      }
    });
  });

  // ─── Manual Distribution Tests ───────────────────────────────────────────

  describe("Manual Distribution", () => {
    test("Manual distribution uses provided assignments directly", () => {
      const assignments = [
        { subtask_id: 1, user_id: 100 },
        { subtask_id: 2, user_id: 200 },
        { subtask_id: 3, user_id: 100 },
      ];

      const distribution = computeDistribution([], [], "manual", assignments);

      expect(distribution.get(1)).toBe(100);
      expect(distribution.get(2)).toBe(200);
      expect(distribution.get(3)).toBe(100);
    });

    test("Manual with empty array returns empty map", () => {
      const distribution = computeDistribution([], [], "manual", []);
      expect(distribution.size).toBe(0);
    });

    test("Manual with null assignments returns empty map", () => {
      const distribution = computeDistribution([], [], "manual", null);
      expect(distribution.size).toBe(0);
    });
  });
});
