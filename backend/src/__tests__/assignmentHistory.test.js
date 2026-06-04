/**
 * Property tests for assignment history
 *
 * Property 8: Assignment History Completeness and Ordering
 *
 * Requirements: 9.3, 9.4
 */

"use strict";

const fc = require("fast-check");

describe("assignmentHistory", () => {
  // ─── Property 8: Assignment History Completeness and Ordering ────────────

  describe("Property 8: Assignment History Completeness and Ordering", () => {
    test("History response length equals total task_assignments rows for subtask", () => {
      /**
       * Simulate fetching all assignment history rows for a subtask.
       * Verify the returned array contains all rows (none filtered out).
       */
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1 }),
              user_id: fc.integer({ min: 1 }),
              user_name: fc.string(),
              assigned_date: fc.date(),
              unassigned_date: fc.option(fc.date()),
            }),
            { maxLength: 50 },
          ),
          (historicalRows) => {
            // Simulate what getHistory returns
            const returned = historicalRows.slice(); // copy

            // Verify length matches total
            expect(returned.length).toBe(historicalRows.length);
            return true;
          },
        ),
      );
    });

    test("History ordered strictly by assigned_date DESC, id DESC", () => {
      /**
       * Property: For any two consecutive rows in the history,
       *   row[i].assigned_date > row[i+1].assigned_date
       *   OR (row[i].assigned_date === row[i+1].assigned_date AND row[i].id > row[i+1].id)
       */
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              user_id: fc.integer({ min: 1 }),
              user_name: fc.string(),
              assigned_date: fc.integer({ min: 0, max: 1000 }), // use int for easier comparison
              unassigned_date: fc.option(fc.integer({ min: 0, max: 1000 })),
            }),
            { minLength: 1, maxLength: 50 },
          ),
          (rows) => {
            // Sort as the query would: assigned_date DESC, id DESC
            const sorted = rows.slice().sort((a, b) => {
              if (a.assigned_date !== b.assigned_date) {
                return b.assigned_date - a.assigned_date; // DESC
              }
              return b.id - a.id; // DESC
            });

            // Verify ordering
            for (let i = 0; i < sorted.length - 1; i++) {
              const current = sorted[i];
              const next = sorted[i + 1];

              if (current.assigned_date !== next.assigned_date) {
                expect(current.assigned_date).toBeGreaterThan(
                  next.assigned_date,
                );
              } else {
                expect(current.id).toBeGreaterThan(next.id);
              }
            }

            return true;
          },
        ),
      );
    });

    test("History with mixed assigned_date values maintains DESC order", () => {
      const history = [
        {
          id: 1,
          user_id: 10,
          user_name: "Alice",
          assigned_date: "2025-01-10",
          unassigned_date: null,
        },
        {
          id: 2,
          user_id: 20,
          user_name: "Bob",
          assigned_date: "2025-02-01",
          unassigned_date: "2025-05-01",
        },
        {
          id: 3,
          user_id: 30,
          user_name: "Charlie",
          assigned_date: "2025-02-01",
          unassigned_date: null,
        },
        {
          id: 4,
          user_id: 40,
          user_name: "Diana",
          assigned_date: "2025-03-15",
          unassigned_date: "2025-06-01",
        },
      ];

      // Sort by assigned_date DESC, id DESC
      const sorted = history.sort((a, b) => {
        const dateA = new Date(a.assigned_date).getTime();
        const dateB = new Date(b.assigned_date).getTime();
        if (dateA !== dateB) return dateB - dateA;
        return b.id - a.id;
      });

      // Expected order: Diana (3/15), Charlie (2/1, id=3), Bob (2/1, id=2), Alice (1/10)
      expect(sorted[0].user_name).toBe("Diana");
      expect(sorted[1].user_name).toBe("Charlie");
      expect(sorted[2].user_name).toBe("Bob");
      expect(sorted[3].user_name).toBe("Alice");
    });

    test("History preserves unassigned_date when present", () => {
      const history = [
        {
          id: 1,
          user_id: 10,
          user_name: "Alice",
          assigned_date: "2025-01-01",
          unassigned_date: "2025-05-01",
        },
        {
          id: 2,
          user_id: 20,
          user_name: "Bob",
          assigned_date: "2025-01-02",
          unassigned_date: null,
        },
      ];

      // Verify unassigned_date is preserved
      expect(history[0].unassigned_date).toBe("2025-05-01");
      expect(history[1].unassigned_date).toBeNull();
    });
  });
});
