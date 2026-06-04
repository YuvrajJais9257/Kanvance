'use strict';

/**
 * timesheetAutofill.service.js
 *
 * Main orchestrator for the Excel Timesheet Auto-Fill pipeline.
 *
 * Coordinates:
 *   1. Config loading (exits code 1 on error)
 *   2. Per-employee activity retrieval from DB
 *   3. Per-date DayActivity assembly
 *   4. Column C/D/E generation via timesheetContent.service
 *   5. Insert/update/skip logic via upsertTimesheetRow
 *   6. Confirmation reset when contributing tasks reopen
 *   7. Run log writing via runLogger
 *   8. Dry-run mode (compute + log, NO writes)
 *
 * Requirements: 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 8.1, 8.2, 8.3, 8.4, 8.8,
 *               12.1, 12.2, 12.3, 13.1, 13.4, 14.1, 14.2, 14.3, 14.4
 */

const { loadConfig } = require('../utils/configLoader');
const {
  getEmployeeActivity,
  getTimesheetRows,
  upsertTimesheetRow,
  resetConfirmationForTask,
} = require('../models/timesheetAutofill.model');
const {
  generateColumnC,
  generateColumnD,
  deriveColumnE,
} = require('./timesheetContent.service');
const { appendRunLog, createRunLogEntry } = require('../utils/runLogger');

// ─────────────────────────────────────────────────────────────────────────────
// Day-detection helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the given YYYY-MM-DD date falls on a Saturday (6) or Sunday (0).
 * @param {string} dateStr — YYYY-MM-DD
 * @returns {boolean}
 */
function isWeekend(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sunday, 6 = Saturday
  return dow === 0 || dow === 6;
}

/**
 * Returns true if the given date appears in config.public_holidays.
 * @param {string} dateStr — YYYY-MM-DD
 * @param {object} config — validated config object
 * @returns {boolean}
 */
function isPublicHoliday(dateStr, config) {
  const holidays = config.public_holidays || [];
  return holidays.includes(dateStr);
}

/**
 * Returns true if the given date appears in config.restricted_holidays.
 * @param {string} dateStr — YYYY-MM-DD
 * @param {object} config — validated config object
 * @returns {boolean}
 */
function isRestrictedHoliday(dateStr, config) {
  const holidays = config.restricted_holidays || [];
  return holidays.includes(dateStr);
}

/**
 * Returns true when the total logged hours for the day are less than half
 * of the configured work-day duration.
 *
 * Work-day duration = (work_day.end - work_day.start) in hours.
 * Half-day threshold = work-day duration / 2.
 *
 * @param {string} _userId — user ID (unused; time logs are already pre-filtered)
 * @param {string} _dateStr — YYYY-MM-DD (unused; logs already scoped to date)
 * @param {TimeLogEntry[]} timeLogs — logs for this employee on this date
 * @param {object} config — validated config object
 * @returns {boolean}
 */
function isHalfDay(_userId, _dateStr, timeLogs, config) {
  if (!timeLogs || timeLogs.length === 0) return false;

  const { start, end } = config.work_day;
  const workDayMinutes = _timeToMinutes(end) - _timeToMinutes(start);
  const halfDayMinutes = workDayMinutes / 2;

  // Sum up hours from time logs — each log has a `hours` field (from DB) or
  // we compute from startTime/endTime when hours is absent.
  let totalLoggedMinutes = 0;
  for (const log of timeLogs) {
    if (log.hours != null) {
      totalLoggedMinutes += log.hours * 60;
    } else if (log.startTime && log.endTime) {
      totalLoggedMinutes += _timeToMinutes(log.endTime) - _timeToMinutes(log.startTime);
    }
  }

  return totalLoggedMinutes < halfDayMinutes;
}

/**
 * Parses an HH:MM string into total minutes from midnight.
 * @param {string} hhmm
 * @returns {number}
 */
function _timeToMinutes(hhmm) {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Date enumeration helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns an array of YYYY-MM-DD strings for every calendar date in [fromDate, toDate].
 * @param {string} fromDate — YYYY-MM-DD (inclusive)
 * @param {string} toDate   — YYYY-MM-DD (inclusive)
 * @returns {string[]}
 */
function _enumerateDates(fromDate, toDate) {
  const dates = [];
  const cursor = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);

  while (cursor <= end) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cursor.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Returns the day-of-week name for a YYYY-MM-DD string.
 * @param {string} dateStr
 * @returns {string} e.g. "Monday"
 */
function _dayOfWeek(dateStr) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const d = new Date(`${dateStr}T00:00:00Z`);
  return days[d.getUTCDay()];
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity filtering helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filters time logs to only those matching the given YYYY-MM-DD date.
 * The time_log.date field is stored as YYYY-MM-DD in the DB.
 *
 * @param {object[]} allTimeLogs
 * @param {string} dateStr — YYYY-MM-DD
 * @returns {object[]}
 */
function _timeLogsForDate(allTimeLogs, dateStr) {
  return allTimeLogs.filter((log) => {
    const logDate =
      log.date instanceof Date
        ? _utcDateToYMD(log.date)
        : String(log.date).slice(0, 10);
    return logDate === dateStr;
  });
}

/**
 * Converts a JS Date to YYYY-MM-DD using UTC components.
 * @param {Date} d
 * @returns {string}
 */
function _utcDateToYMD(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Filters tasks to those "active" on the given date.
 *
 * A task (activity_group with subtasks) is active on a date when:
 *  - At least one subtask has closedAt === dateStr, OR
 *  - At least one time log for that date references the task.
 *
 * Tasks with a future closedAt (relative to today) are excluded entirely (Req 13.4).
 *
 * @param {object[]} tasks — from getEmployeeActivity
 * @param {string} dateStr — YYYY-MM-DD
 * @param {object[]} dateTimeLogs — already-filtered time logs for this date
 * @param {string} runDate — today's date YYYY-MM-DD (for future closedAt check)
 * @returns {{ activeTasks: object[], futureTasks: object[] }}
 *   activeTasks — tasks active on dateStr (future-closed ones excluded)
 *   futureTasks — tasks excluded due to future closedAt
 */
function _tasksForDate(tasks, dateStr, dateTimeLogs, runDate) {
  const activeTasks = [];
  const futureTasks = [];

  // Build a Set of (taskTitle, projectName) pairs referenced by time logs for this date
  // to detect task activity via time logs
  const taskRefsByTimeLogs = new Set(
    dateTimeLogs.map((tl) => `${tl.project_name}|${tl.activity_group}`)
  );

  for (const task of tasks) {
    // Determine the "effective" closedAt for the task-level entry.
    // Since tasks correspond to activity_groups, we look at their subtasks.
    // If any subtask has a future closedAt, exclude that subtask (and warn).
    const subtasksForDate = [];
    let taskHasFutureClose = false;

    for (const subtask of task.subtasks || []) {
      if (subtask.closedAt) {
        const closedDateStr = subtask.closedAt instanceof Date
          ? _utcDateToYMD(subtask.closedAt)
          : String(subtask.closedAt).slice(0, 10);

        if (closedDateStr > runDate) {
          // Future closedAt — skip this subtask for current run (Req 13.4)
          taskHasFutureClose = true;
          continue;
        }

        if (closedDateStr === dateStr) {
          subtasksForDate.push(subtask);
        }
      }
    }

    // Check if task is active via time logs (by project_name + activity_group match)
    const taskKey = `${task.projectName}|${task.taskTitle}`;
    const activeViaTimeLogs = taskRefsByTimeLogs.has(taskKey);

    // Include task if: subtasks closed on this date OR active via time logs
    if (subtasksForDate.length > 0 || activeViaTimeLogs) {
      // Build a task entry scoped to this date
      const taskEntry = {
        taskId:       task.taskId,
        taskTitle:    task.taskTitle,
        projectId:    task.projectId,
        projectName:  task.projectName,
        isOrphan:     task.isOrphan,
        // Use subtask status to derive task-level status for the day
        status:       _deriveTaskStatusFromSubtasks(task.subtasks || []),
        closedAt:     dateStr, // proxy: active on this date
        estimatedHours: null,
        subtasks:     (task.subtasks || []).map((st) => ({
          subtaskId: st.subtaskId,
          title:     st.title,
          status:    st.status,
          closedAt:  st.closedAt instanceof Date
            ? _utcDateToYMD(st.closedAt)
            : (st.closedAt ? String(st.closedAt).slice(0, 10) : null),
        })),
      };
      activeTasks.push(taskEntry);
    }

    if (taskHasFutureClose) {
      futureTasks.push(task);
    }
  }

  return { activeTasks, futureTasks };
}

/**
 * Derives a unified task status from its subtask statuses.
 * If all subtasks are Done/Closed → 'Done', else → 'In Progress'.
 * @param {object[]} subtasks
 * @returns {string}
 */
function _deriveTaskStatusFromSubtasks(subtasks) {
  if (!subtasks || subtasks.length === 0) return 'In Progress';
  const allDone = subtasks.every(
    (st) => st.status === 'Done' || st.status === 'Closed' || st.status === 'closed' || st.status === 'done'
  );
  return allDone ? 'Done' : 'In Progress';
}

/**
 * Converts DB time log rows to the TimeLogEntry shape expected by the content engine.
 *
 * DB time_log columns: id, employee_id, project_name, activity_group, subtask_name,
 *                      date, hours, source
 * TimeLogEntry needs: taskId, taskTitle, projectId, projectName, startTime, endTime,
 *                     note, isAfterHours
 *
 * Since the DB time_logs table stores only `date` and `hours` (not startTime/endTime),
 * we synthesise a startTime/endTime from the work_day config for content generation.
 * Logs without explicit times are placed at work_day.start consecutively.
 *
 * @param {object[]} rawTimeLogs — DB rows for one date
 * @param {object} config — validated config
 * @returns {import('./timesheetContent.service').TimeLogEntry[]}
 */
function _mapTimeLogsToContentShape(rawTimeLogs, config) {
  if (!rawTimeLogs || rawTimeLogs.length === 0) return [];

  const { start: dayStart, end: dayEnd } = config.work_day;
  const dayStartMin = _timeToMinutes(dayStart);
  const dayEndMin   = _timeToMinutes(dayEnd);
  const totalDayMin = dayEndMin - dayStartMin;

  let cursor = dayStartMin;

  return rawTimeLogs.map((log) => {
    const durationMin = log.hours != null
      ? Math.round(log.hours * 60)
      : Math.round(totalDayMin / rawTimeLogs.length);

    const startMin = cursor;
    const endMin   = Math.min(cursor + durationMin, dayEndMin);
    cursor = endMin;

    const startTime = _minutesToHHMM(startMin);
    const endTime   = _minutesToHHMM(endMin);

    const isAfterHours = endMin > dayEndMin || startMin >= dayEndMin;

    return {
      taskId:      null, // DB time_logs don't have a task_id FK to activity_groups
      taskTitle:   log.activity_group || log.subtask_name || 'Work',
      projectId:   null,
      projectName: log.project_name || '',
      startTime,
      endTime,
      note:        null,
      isAfterHours,
      hours:       log.hours,
    };
  });
}

/**
 * Converts total minutes to HH:MM string.
 * @param {number} minutes
 * @returns {string}
 */
function _minutesToHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Extracts source task IDs (comma-separated) from active tasks.
 * Only includes non-null taskIds.
 *
 * @param {object[]} activeTasks
 * @returns {string|null}
 */
function _buildSourceTaskIds(activeTasks) {
  const ids = activeTasks
    .map((t) => t.taskId)
    .filter((id) => id != null)
    .map(String);
  return ids.length > 0 ? ids.join(',') : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirmed-row reset detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects tasks that were previously marked Done (i.e., contributed to a confirmed row
 * via source_task_ids) but are now open again. Calls resetConfirmationForTask for each.
 *
 * Logic:
 *   - Gather all taskIds that appear in source_task_ids of confirmed rows.
 *   - Cross-reference against current task statuses from activity.
 *   - Any task that is now open/in-progress but appears in a confirmed row's
 *     source_task_ids has been reopened → reset.
 *
 * @param {object[]} existingRows — from getTimesheetRows
 * @param {object[]} allTasks — from getEmployeeActivity
 * @param {boolean} dryRun
 * @returns {Promise<object[]>} warnings generated
 */
async function _detectAndResetReopenedTasks(existingRows, allTasks, dryRun) {
  const warnings = [];

  // Build a map of taskId → current status
  const taskStatusMap = new Map();
  for (const task of allTasks) {
    if (task.taskId != null) {
      taskStatusMap.set(String(task.taskId), task.status || 'In Progress');
    }
    for (const subtask of task.subtasks || []) {
      if (subtask.subtaskId != null) {
        taskStatusMap.set(String(subtask.subtaskId), subtask.status || 'In Progress');
      }
    }
  }

  // Collect all taskIds referenced by confirmed rows
  const confirmedTaskIds = new Set();
  for (const row of existingRows) {
    if (row.is_confirmed && row.source_task_ids) {
      for (const id of String(row.source_task_ids).split(',')) {
        const trimmed = id.trim();
        if (trimmed) confirmedTaskIds.add(trimmed);
      }
    }
  }

  // Check which of those tasks are now open/in-progress
  const closedStatuses = new Set(['done', 'closed']);

  for (const taskId of confirmedTaskIds) {
    const status = taskStatusMap.get(taskId);
    if (status == null) continue; // task no longer in range — skip

    const isClosed = closedStatuses.has((status || '').toLowerCase());
    if (!isClosed) {
      // Task was reopened — reset confirmation on rows that reference it (Req 8.8)
      if (!dryRun) {
        await resetConfirmationForTask(Number(taskId));
      }
      warnings.push({
        type: 'confirmed_skip',
        detail: `Task ID ${taskId} (status: ${status}) was reopened; reset is_confirmed on rows referencing it.`,
      });
    }
  }

  return warnings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the full auto-fill pipeline for all employees in the config.
 *
 * @param {object} options
 * @param {string}  options.configPath — path to timesheet_config.yaml
 * @param {string}  options.fromDate   — YYYY-MM-DD (inclusive start)
 * @param {string}  options.toDate     — YYYY-MM-DD (inclusive end)
 * @param {boolean} [options.dryRun]   — if true: compute+log, NO writes/mutations
 * @returns {Promise<{
 *   rows_added: number,
 *   rows_updated: number,
 *   rows_skipped: number,
 *   warnings: Array<{ type: string, detail: string }>
 * }>}
 */
async function runAutofill({ configPath, fromDate, toDate, dryRun = false }) {
  const logPrefix = dryRun ? '[DRY RUN] ' : '';

  // ── 1. Load config ──────────────────────────────────────────────────────
  // loadConfig calls process.exit(1) on error, so no try/catch needed here.
  const config = loadConfig(configPath);

  // Override dry_run from options (CLI flag takes precedence over config file)
  const isDryRun = dryRun || config.dry_run === true;

  // Today's date (YYYY-MM-DD) — used for future closedAt detection (Req 13.4)
  const today = _utcDateToYMD(new Date());

  const globalStats = {
    rows_added:   0,
    rows_updated: 0,
    rows_skipped: 0,
    warnings:     [],
  };

  const dates = _enumerateDates(fromDate, toDate);

  // ── 2. Iterate over each employee in config.employee_mapping ────────────
  for (const empMapping of config.employee_mapping) {
    const userId    = empMapping.db_user_id;
    const sheetName = empMapping.sheet_name;

    const logEntry = createRunLogEntry(sheetName, { from: fromDate, to: toDate }, isDryRun);
    const perEmpWarnings = [];

    console.log(`${logPrefix}[timesheetAutofill] Processing employee: ${sheetName} (userId=${userId})`);

    try {
      // ── 2a. Fetch employee activity ─────────────────────────────────────
      const activity = await getEmployeeActivity(userId, fromDate, toDate);
      const { tasks: allTasks, timeLogs: allTimeLogs } = activity;

      // ── 2b. Collect orphan warnings (Req 3.4) ──────────────────────────
      for (const task of allTasks) {
        if (task.isOrphan) {
          perEmpWarnings.push({
            type: 'orphan_subtask',
            detail: `Orphan task/subtask found: taskTitle="${task.taskTitle}" ` +
                    `(taskId=${task.taskId ?? 'null'}, projectId=${task.projectId ?? 'null'})`,
          });
        }
      }

      // ── 2c. Get existing DB rows for skip/update logic ──────────────────
      const existingRows = await getTimesheetRows(userId, fromDate, toDate);

      // Build a map: date → existing row (for fast lookup)
      const existingRowByDate = new Map();
      for (const row of existingRows) {
        const rowDate =
          row.logged_date instanceof Date
            ? _utcDateToYMD(row.logged_date)
            : String(row.logged_date).slice(0, 10);
        existingRowByDate.set(rowDate, row);
      }

      // ── 2d. Detect reopened tasks and reset confirmation ────────────────
      const resetWarnings = await _detectAndResetReopenedTasks(
        existingRows,
        allTasks,
        isDryRun
      );
      perEmpWarnings.push(...resetWarnings);

      // ── 2e. Iterate over each calendar date in [fromDate, toDate] ───────
      for (const dateStr of dates) {
        const dayTimeLogs     = _timeLogsForDate(allTimeLogs, dateStr);
        const { activeTasks, futureTasks } = _tasksForDate(
          allTasks,
          dateStr,
          dayTimeLogs,
          today
        );

        // Warn about future-closedAt tasks (Req 13.4)
        for (const ft of futureTasks) {
          perEmpWarnings.push({
            type: 'future_closed_at',
            detail: `Task "${ft.taskTitle}" (taskId=${ft.taskId}) excluded from run: ` +
                    `one or more subtasks have a future closedAt date.`,
          });
        }

        // Assemble DayActivity
        const contentTimeLogs = _mapTimeLogsToContentShape(dayTimeLogs, config);

        const dayActivity = {
          date:               dateStr,
          dayOfWeek:          _dayOfWeek(dateStr),
          isWeekend:          isWeekend(dateStr),
          isPublicHoliday:    isPublicHoliday(dateStr, config),
          isRestrictedHoliday: isRestrictedHoliday(dateStr, config),
          isLeave:            false, // TODO: extend if leave table is available
          isHalfDay:          isHalfDay(userId, dateStr, dayTimeLogs, config),
          timeLogs:           contentTimeLogs,
          tasks:              activeTasks,
        };

        // Generate content
        const columnC = generateColumnC(dayActivity, config);
        const columnD = generateColumnD(dayActivity);
        const columnE = deriveColumnE(dayActivity, config);

        const sourceTaskIds = _buildSourceTaskIds(activeTasks);

        // ── Skip/insert/update logic ────────────────────────────────────
        const existing = existingRowByDate.get(dateStr);

        if (existing) {
          if (existing.is_confirmed) {
            // Confirmed row — skip entirely (Req 8.3)
            console.log(
              `${logPrefix}[timesheetAutofill] SKIP (confirmed): ${sheetName} / ${dateStr}`
            );
            perEmpWarnings.push({
              type:   'confirmed_skip',
              detail: `Confirmed row skipped for ${sheetName} on ${dateStr} (rowId=${existing.id})`,
            });
            logEntry.rows_skipped++;
            continue;
          }
          // Unconfirmed — update C/D/E
          if (isDryRun) {
            console.log(
              `${logPrefix}[timesheetAutofill] DRY-RUN UPDATE: ${sheetName} / ${dateStr} — ` +
              `C="${columnC.slice(0, 60)}" D="${columnD.slice(0, 60)}" E="${columnE}"`
            );
            logEntry.rows_updated++;
          } else {
            const result = await upsertTimesheetRow({
              userId,
              date:          dateStr,
              columnC,
              columnD,
              columnE,
              sourceTaskIds,
            });
            if (result.updated) {
              logEntry.rows_updated++;
              console.log(
                `${logPrefix}[timesheetAutofill] UPDATED: ${sheetName} / ${dateStr}`
              );
            } else if (result.skipped) {
              // Became confirmed between SELECT and UPDATE (race condition)
              logEntry.rows_skipped++;
              perEmpWarnings.push({
                type:   'confirmed_skip',
                detail: `Row for ${sheetName} on ${dateStr} was confirmed mid-run and was skipped.`,
              });
            }
          }
        } else {
          // No existing row — insert
          if (isDryRun) {
            console.log(
              `${logPrefix}[timesheetAutofill] DRY-RUN INSERT: ${sheetName} / ${dateStr} — ` +
              `C="${columnC.slice(0, 60)}" D="${columnD.slice(0, 60)}" E="${columnE}"`
            );
            logEntry.rows_added++;
          } else {
            const result = await upsertTimesheetRow({
              userId,
              date:          dateStr,
              columnC,
              columnD,
              columnE,
              sourceTaskIds,
            });
            if (result.inserted) {
              logEntry.rows_added++;
              console.log(
                `${logPrefix}[timesheetAutofill] INSERTED: ${sheetName} / ${dateStr}`
              );
            } else if (result.skipped) {
              logEntry.rows_skipped++;
              perEmpWarnings.push({
                type:   'confirmed_skip',
                detail: `Row for ${sheetName} on ${dateStr} was confirmed mid-run and was skipped.`,
              });
            }
          }
        }
      } // end date loop

      // Accumulate per-employee stats into global stats
      globalStats.rows_added   += logEntry.rows_added;
      globalStats.rows_updated += logEntry.rows_updated;
      globalStats.rows_skipped += logEntry.rows_skipped;
      globalStats.warnings.push(...perEmpWarnings);

      // Populate and write the run log entry for this employee (Req 12.1, 12.3)
      logEntry.rows_added   = logEntry.rows_added;
      logEntry.rows_updated = logEntry.rows_updated;
      logEntry.rows_skipped = logEntry.rows_skipped;
      logEntry.warnings     = perEmpWarnings;

      appendRunLog(logEntry, config.log_file_path, isDryRun);

    } catch (err) {
      // Per-employee error: log and continue with remaining employees (exit code 2 path)
      console.error(
        `${logPrefix}[timesheetAutofill] ERROR processing employee ${sheetName} ` +
        `(userId=${userId}): ${err.message}`
      );
      globalStats.warnings.push({
        type:   'orphan_subtask', // re-using existing warning type for now; could be 'error'
        detail: `Employee ${sheetName} (userId=${userId}) failed: ${err.message}`,
      });
    }
  } // end employee loop

  return {
    rows_added:   globalStats.rows_added,
    rows_updated: globalStats.rows_updated,
    rows_skipped: globalStats.rows_skipped,
    warnings:     globalStats.warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  runAutofill,
  // Export helpers for unit testing
  isWeekend,
  isPublicHoliday,
  isRestrictedHoliday,
  isHalfDay,
  _enumerateDates,
  _dayOfWeek,
  _timeLogsForDate,
  _tasksForDate,
  _mapTimeLogsToContentShape,
  _buildSourceTaskIds,
  _detectAndResetReopenedTasks,
};
