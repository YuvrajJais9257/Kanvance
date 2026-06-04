'use strict';

/**
 * timesheetContent.service.js
 *
 * Pure functions for generating Excel timesheet cell content.
 * No DB calls, no file I/O — takes structured DayActivity data and returns strings.
 *
 * Exported functions:
 *   sanitizeCell(text)
 *   truncateToLimit(text, limit)
 *   formatTimeBlock(start, end, title, flags)
 *   generateColumnC(dayActivity, config)
 *   generateColumnD(dayActivity)
 *   deriveColumnE(dayActivity, config)
 */

// ── Constants ─────────────────────────────────────────────────────────────

/** Excel cell character limit */
const EXCEL_CELL_LIMIT = 32767;

/** Unicode Cc (control) and Cf (format) character ranges to strip */
// Cc: U+0000–U+001F (excluding U+000A LINE FEED and U+000D CARRIAGE RETURN,
//     which are meaningful line separators in Excel multi-line cells),
//     U+007F–U+009F
// Cf: U+00AD, U+0600–U+0605, U+061C, U+06DD, U+070F, U+0890–U+0891,
//     U+08E2, U+180E, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064,
//     U+2066–U+206F, U+FEFF, U+FFF9–U+FFFB, U+110BD, U+110CD,
//     U+13430–U+1343F, U+1BCA0–U+1BCA3, U+1D173–U+1D17A,
//     U+E0001, U+E0020–U+E007F
// Note: U+000A (\n) and U+000D (\r) are excluded because they are valid
// line separators used in multi-line Excel cell content.
const CC_CF_REGEX = /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890-\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]/gu;

// ── sanitizeCell ──────────────────────────────────────────────────────────

/**
 * Strips Unicode Cc (control) and Cf (format) characters from a string.
 * All other characters are preserved unchanged.
 *
 * @param {string} text - Input string (may be null/undefined).
 * @returns {string} Sanitized string.
 */
function sanitizeCell(text) {
  if (text == null) return '';
  return String(text).replace(CC_CF_REGEX, '');
}

// ── truncateToLimit ───────────────────────────────────────────────────────

/**
 * Truncates text at the last complete line before `limit` characters,
 * then appends `[truncated]`.
 *
 * A "line" is any segment separated by `\n`. The function finds the last
 * newline position such that everything up to (and including) that newline
 * plus `[truncated]` fits within `limit` characters.
 *
 * If the text is at or below `limit`, it is returned unchanged.
 *
 * @param {string} text  - Input string.
 * @param {number} limit - Maximum character count (inclusive).
 * @returns {string} Possibly truncated string.
 */
function truncateToLimit(text, limit) {
  if (text == null) return '';
  const str = String(text);
  if (str.length <= limit) return str;

  const suffix = '[truncated]';
  const maxContent = limit - suffix.length;

  if (maxContent <= 0) {
    // Edge case: limit is so small we can only fit the suffix (or less)
    return suffix.slice(0, limit);
  }

  // Find the last newline at or before maxContent
  const candidate = str.slice(0, maxContent);
  const lastNewline = candidate.lastIndexOf('\n');

  if (lastNewline === -1) {
    // No newline found — truncate at maxContent boundary
    return candidate + suffix;
  }

  // Include everything up to and including the last newline, then append suffix
  return str.slice(0, lastNewline + 1) + suffix;
}

// ── formatTimeBlock ───────────────────────────────────────────────────────

/**
 * Formats a time block string.
 *
 * @param {string} start  - Start time in HH:MM format.
 * @param {string} end    - End time in HH:MM format.
 * @param {string} title  - Task/block title.
 * @param {object} [flags]
 * @param {boolean} [flags.afterHours=false]  - Append `(after hours)` suffix.
 * @param {boolean} [flags.estimated=false]   - Append `(estimated)` suffix.
 * @returns {string} Formatted time block, e.g. `09:00 - 10:00: My Task (after hours)`.
 */
function formatTimeBlock(start, end, title, flags = {}) {
  const { afterHours = false, estimated = false } = flags;
  let line = `${start} - ${end}: ${title}`;
  if (afterHours) line += ' (after hours)';
  if (estimated) line += ' (estimated)';
  return line;
}

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * Parses an HH:MM string into total minutes since midnight.
 * @param {string} hhmm
 * @returns {number}
 */
function _toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Converts total minutes since midnight to HH:MM string.
 * @param {number} minutes
 * @returns {string}
 */
function _fromMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Groups an array of time log entries by projectId.
 * Returns a Map<projectId, { projectName, logs[] }> preserving insertion order.
 * @param {TimeLogEntry[]} timeLogs
 * @returns {Map<number, { projectName: string, logs: TimeLogEntry[] }>}
 */
function _groupByProject(timeLogs) {
  const map = new Map();
  for (const log of timeLogs) {
    if (!map.has(log.projectId)) {
      map.set(log.projectId, { projectName: log.projectName, logs: [] });
    }
    map.get(log.projectId).logs.push(log);
  }
  return map;
}

/**
 * Sorts time log entries chronologically by startTime (HH:MM).
 * @param {TimeLogEntry[]} logs
 * @returns {TimeLogEntry[]}
 */
function _sortByStartTime(logs) {
  return [...logs].sort((a, b) => _toMinutes(a.startTime) - _toMinutes(b.startTime));
}

/**
 * Inserts a lunch block into a flat list of time block strings in chronological order.
 * The lunch block is inserted between the last block that ends before lunch start
 * and the first block that starts at or after lunch end.
 *
 * @param {Array<{ startMinutes: number, endMinutes: number, line: string }>} blocks
 * @param {{ start: string, end: string, label: string }} lunchConfig
 * @returns {string[]} Lines with lunch inserted in order.
 */
function _insertLunchInOrder(blocks, lunchConfig) {
  const lunchStart = _toMinutes(lunchConfig.start);
  const lunchEnd = _toMinutes(lunchConfig.end);
  const lunchLine = formatTimeBlock(lunchConfig.start, lunchConfig.end, lunchConfig.label);

  // Find insertion index: insert after all blocks that start before lunchStart
  let insertIdx = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].startMinutes < lunchStart) {
      insertIdx = i + 1;
    }
  }

  const lines = blocks.map((b) => b.line);
  lines.splice(insertIdx, 0, lunchLine);
  return lines;
}

/**
 * Distributes tasks proportionally across the work day based on estimated hours.
 * Returns an array of time block strings with `(estimated)` suffix.
 *
 * @param {TaskEntry[]} tasks
 * @param {{ start: string, end: string }} workDay
 * @returns {Array<{ startMinutes: number, endMinutes: number, line: string }>}
 */
function _distributeEstimated(tasks, workDay) {
  const dayStart = _toMinutes(workDay.start);
  const dayEnd = _toMinutes(workDay.end);
  const totalDayMinutes = dayEnd - dayStart;

  const totalEstimated = tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
  const blocks = [];
  let cursor = dayStart;

  for (const task of tasks) {
    const proportion = totalEstimated > 0
      ? (task.estimatedHours || 0) / totalEstimated
      : 1 / tasks.length;
    const durationMinutes = Math.round(proportion * totalDayMinutes);
    const blockEnd = Math.min(cursor + durationMinutes, dayEnd);

    blocks.push({
      startMinutes: cursor,
      endMinutes: blockEnd,
      line: formatTimeBlock(
        _fromMinutes(cursor),
        _fromMinutes(blockEnd),
        task.taskTitle,
        { estimated: true }
      ),
    });

    cursor = blockEnd;
    if (cursor >= dayEnd) break;
  }

  return blocks;
}

// ── generateColumnC ───────────────────────────────────────────────────────

/**
 * Generates the Column C (Topic Learned / Schedule) cell content for a single day.
 *
 * Logic (in priority order):
 *  1. Weekend → return '' (blank)
 *  2. Public holiday → return 'Public Holiday'
 *  3. Restricted holiday → return 'Restricted Holiday'
 *  4. Leave (full day) → return 'Leave'
 *  5. Half-day leave → prepend 'Half Day Leave' then generate schedule for worked half
 *  6. Time logs exist → chronological, project-grouped time blocks with lunch + final review
 *  7. No time logs, estimated hours exist → estimated distribution with lunch + final review
 *  8. Neither → plain title list (no timestamps)
 *
 * @param {DayActivity} dayActivity
 * @param {TimesheetConfig} config
 * @returns {string}
 */
function generateColumnC(dayActivity, config) {
  const {
    isWeekend,
    isPublicHoliday,
    isRestrictedHoliday,
    isLeave,
    isHalfDay,
    timeLogs = [],
    tasks = [],
  } = dayActivity;

  // 1. Weekend — all columns blank
  if (isWeekend) return '';

  // 2. Public holiday
  if (isPublicHoliday) return 'Public Holiday';

  // 3. Restricted holiday
  if (isRestrictedHoliday) return 'Restricted Holiday';

  // 4. Full-day leave
  if (isLeave && !isHalfDay) return 'Leave';

  // Determine if any task was closed today (needed for final review block)
  const hasClosedTasks = tasks.some(
    (t) => t.status === 'Done' || t.status === 'Closed' || t.status === 'closed' || t.status === 'done'
  );

  // 5. Half-day leave — prepend label, then generate schedule for worked half
  let halfDayPrefix = '';
  if (isLeave && isHalfDay) {
    halfDayPrefix = 'Half Day Leave\n';
  }

  // 6. Time logs exist — build chronological, project-grouped blocks
  if (timeLogs.length > 0) {
    const lines = _buildTimeLogBlocks(timeLogs, config, hasClosedTasks);
    const result = halfDayPrefix + lines;
    return truncateToLimit(result, EXCEL_CELL_LIMIT);
  }

  // 7. No time logs — check for estimated hours
  const tasksWithEstimates = tasks.filter((t) => t.estimatedHours != null && t.estimatedHours > 0);
  if (tasksWithEstimates.length > 0) {
    const lines = _buildEstimatedBlocks(tasksWithEstimates, config, hasClosedTasks);
    const result = halfDayPrefix + lines;
    return truncateToLimit(result, EXCEL_CELL_LIMIT);
  }

  // 8. Neither time logs nor estimated hours — plain title list
  if (tasks.length > 0) {
    const titleLines = tasks.map((t) => sanitizeCell(t.taskTitle)).join('\n');
    const result = halfDayPrefix + titleLines;
    return truncateToLimit(result, EXCEL_CELL_LIMIT);
  }

  // No activity at all
  return halfDayPrefix ? halfDayPrefix.trim() : '';
}

/**
 * Builds time-log-based Column C content (project-grouped, chronological).
 * @param {TimeLogEntry[]} timeLogs
 * @param {TimesheetConfig} config
 * @param {boolean} hasClosedTasks
 * @returns {string}
 */
function _buildTimeLogBlocks(timeLogs, config, hasClosedTasks) {
  const { work_day, lunch_block, final_review_block } = config;

  // Sort all logs chronologically
  const sorted = _sortByStartTime(timeLogs);

  // Group by project (preserving first-seen order)
  const projectGroups = _groupByProject(sorted);

  // Build flat list of blocks with metadata for lunch insertion
  const allBlocks = [];
  const groupLines = [];

  for (const [, { projectName: _pn, logs }] of projectGroups) {
    const projectBlockLines = [];
    for (const log of logs) {
      const isAfterHours = _toMinutes(log.endTime) > _toMinutes(work_day.end) ||
                           _toMinutes(log.startTime) >= _toMinutes(work_day.end);
      const line = formatTimeBlock(log.startTime, log.endTime, log.taskTitle, {
        afterHours: log.isAfterHours || isAfterHours,
      });
      projectBlockLines.push(line);
      allBlocks.push({
        startMinutes: _toMinutes(log.startTime),
        endMinutes: _toMinutes(log.endTime),
        line,
      });
    }
    groupLines.push(projectBlockLines.join('\n'));
  }

  // Insert lunch block in chronological order across all blocks
  const linesWithLunch = _insertLunchInOrder(allBlocks, lunch_block);

  // Now we need to re-group: rebuild the output with project groups separated by blank lines,
  // but with the lunch block inserted in the correct chronological position.
  // Strategy: build a merged output that respects both grouping and lunch ordering.
  const output = _mergeGroupsWithLunch(projectGroups, lunch_block, work_day, hasClosedTasks, final_review_block);
  return output;
}

/**
 * Merges project groups with the lunch block inserted chronologically.
 * Project groups are separated by blank lines.
 *
 * @param {Map<number, { projectName: string, logs: TimeLogEntry[] }>} projectGroups
 * @param {{ start: string, end: string, label: string }} lunchConfig
 * @param {{ start: string, end: string }} workDay
 * @param {boolean} hasClosedTasks
 * @param {{ label: string }} finalReviewBlock
 * @returns {string}
 */
function _mergeGroupsWithLunch(projectGroups, lunchConfig, workDay, hasClosedTasks, finalReviewBlock) {
  const lunchStartMin = _toMinutes(lunchConfig.start);
  const lunchEndMin = _toMinutes(lunchConfig.end);
  const lunchLine = formatTimeBlock(lunchConfig.start, lunchConfig.end, lunchConfig.label);

  // Build an ordered list of segments: each segment is either a project group or the lunch block
  // We determine where lunch fits by comparing its start time against the time ranges of each group.

  // Collect all groups as ordered segments with their time range
  const segments = [];
  for (const [, { logs }] of projectGroups) {
    const sortedLogs = _sortByStartTime(logs);
    const groupStart = _toMinutes(sortedLogs[0].startTime);
    const groupEnd = _toMinutes(sortedLogs[sortedLogs.length - 1].endTime);
    segments.push({ type: 'project', logs: sortedLogs, groupStart, groupEnd });
  }

  // Insert lunch segment in the correct position
  let lunchInserted = false;
  const finalSegments = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Insert lunch before this segment if lunch starts before this segment's start
    // and lunch hasn't been inserted yet
    if (!lunchInserted && lunchStartMin <= seg.groupStart) {
      finalSegments.push({ type: 'lunch' });
      lunchInserted = true;
    }

    finalSegments.push(seg);
  }

  // If lunch wasn't inserted yet (all project groups end before lunch), append it
  if (!lunchInserted) {
    finalSegments.push({ type: 'lunch' });
  }

  // Render segments
  const parts = [];
  for (const seg of finalSegments) {
    if (seg.type === 'lunch') {
      parts.push(lunchLine);
    } else {
      // Project group: render each log as a time block
      const blockLines = seg.logs.map((log) => {
        const isAfterHours = log.isAfterHours ||
          _toMinutes(log.startTime) >= _toMinutes(workDay.end) ||
          _toMinutes(log.endTime) > _toMinutes(workDay.end);
        return formatTimeBlock(log.startTime, log.endTime, log.taskTitle, { afterHours: isAfterHours });
      });
      parts.push(blockLines.join('\n'));
    }
  }

  // Append final review block if any tasks were closed
  if (hasClosedTasks) {
    parts.push(formatTimeBlock(workDay.end, workDay.end, finalReviewBlock.label));
  }

  // Join project groups with blank lines; lunch block is a standalone line
  // We need to join with blank lines between project groups, but lunch is inline
  return _joinSegmentsWithBlanks(finalSegments, parts, workDay, hasClosedTasks, finalReviewBlock);
}

/**
 * Joins rendered segment parts with blank lines between project groups.
 * Lunch block is treated as a separator (no extra blank line around it).
 *
 * @param {Array} finalSegments
 * @param {string[]} parts
 * @param {{ start: string, end: string }} workDay
 * @param {boolean} hasClosedTasks
 * @param {{ label: string }} finalReviewBlock
 * @returns {string}
 */
function _joinSegmentsWithBlanks(finalSegments, parts, workDay, hasClosedTasks, finalReviewBlock) {
  // Rebuild: project groups separated by blank lines, lunch inline
  const outputLines = [];

  for (let i = 0; i < finalSegments.length; i++) {
    const seg = finalSegments[i];
    const part = parts[i];

    if (i > 0) {
      const prev = finalSegments[i - 1];
      // Add blank line between two project groups
      if (prev.type === 'project' && seg.type === 'project') {
        outputLines.push('');
      }
    }

    outputLines.push(part);
  }

  // Append final review block
  if (hasClosedTasks) {
    outputLines.push('');
    outputLines.push(formatTimeBlock(workDay.end, workDay.end, finalReviewBlock.label));
  }

  return outputLines.join('\n');
}

/**
 * Builds estimated-distribution-based Column C content.
 * @param {TaskEntry[]} tasks
 * @param {TimesheetConfig} config
 * @param {boolean} hasClosedTasks
 * @returns {string}
 */
function _buildEstimatedBlocks(tasks, config, hasClosedTasks) {
  const { work_day, lunch_block, final_review_block } = config;

  // Group tasks by project
  const projectMap = new Map();
  for (const task of tasks) {
    if (!projectMap.has(task.projectId)) {
      projectMap.set(task.projectId, { projectName: task.projectName, tasks: [] });
    }
    projectMap.get(task.projectId).tasks.push(task);
  }

  // Distribute all tasks proportionally across the work day
  const allTasks = tasks; // flat list for distribution
  const blocks = _distributeEstimated(allTasks, work_day);

  // Insert lunch in order
  const linesWithLunch = _insertLunchInOrder(blocks, lunch_block);

  // Group the estimated blocks by project with blank line separators
  // Since we distributed across all tasks, we need to re-associate blocks with projects
  const outputParts = [];
  let blockIdx = 0;
  let lunchInserted = false;
  const lunchStartMin = _toMinutes(lunch_block.start);

  for (const [, { tasks: projTasks }] of projectMap) {
    const projLines = [];
    for (const task of projTasks) {
      if (blockIdx < blocks.length) {
        // Insert lunch before this block if needed
        if (!lunchInserted && blocks[blockIdx].startMinutes >= lunchStartMin) {
          // Lunch goes before this block
          lunchInserted = true;
          // We'll handle lunch insertion at the join step
        }
        projLines.push(blocks[blockIdx].line);
        blockIdx++;
      }
    }
    if (projLines.length > 0) {
      outputParts.push(projLines.join('\n'));
    }
  }

  // Build final output with lunch inserted
  const lunchLine = formatTimeBlock(lunch_block.start, lunch_block.end, lunch_block.label);
  const finalLines = [];

  // Re-insert lunch in the correct position among project group parts
  // For simplicity with estimated blocks, insert lunch between groups based on time
  let lunchPlaced = false;
  for (let i = 0; i < outputParts.length; i++) {
    if (i > 0) finalLines.push(''); // blank line between groups
    finalLines.push(outputParts[i]);
  }

  // Insert lunch at the correct position
  // Find where lunch fits chronologically in the flat block list
  let lunchPos = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].startMinutes < lunchStartMin) {
      lunchPos = i + 1;
    }
  }

  // Rebuild with lunch inserted at lunchPos in the flat block list
  const flatLines = [];
  for (let i = 0; i < blocks.length; i++) {
    if (i === lunchPos) flatLines.push(lunchLine);
    flatLines.push(blocks[i].line);
  }
  if (lunchPos >= blocks.length) flatLines.push(lunchLine);

  if (hasClosedTasks) {
    flatLines.push('');
    flatLines.push(formatTimeBlock(work_day.end, work_day.end, final_review_block.label));
  }

  return flatLines.join('\n');
}

// ── generateColumnD ───────────────────────────────────────────────────────

/**
 * Generates the Column D (Key Points / Accomplishments) cell content for a single day.
 *
 * Builds bullet points for closed tasks with subtask indentation.
 * Prefixes with project name when task title is duplicated across projects.
 * Sanitizes and truncates to Excel cell limit.
 *
 * @param {DayActivity} dayActivity
 * @returns {string}
 */
function generateColumnD(dayActivity) {
  const { isWeekend, isPublicHoliday, isRestrictedHoliday, isLeave, isHalfDay, tasks = [] } = dayActivity;

  // Special days — no accomplishments
  if (isWeekend) return '';
  if (isPublicHoliday) return '';
  if (isRestrictedHoliday) return '';
  if (isLeave && !isHalfDay) return '';

  // Filter to closed tasks only
  const closedTasks = tasks.filter(
    (t) => t.status === 'Done' || t.status === 'Closed' || t.status === 'closed' || t.status === 'done'
  );

  if (closedTasks.length === 0) return '';

  // Detect duplicate task titles across different projects
  const titleProjectMap = new Map(); // title → Set of projectIds
  for (const task of closedTasks) {
    const title = task.taskTitle;
    if (!titleProjectMap.has(title)) {
      titleProjectMap.set(title, new Set());
    }
    titleProjectMap.get(title).add(task.projectId);
  }

  const lines = [];

  for (const task of closedTasks) {
    const isDuplicate = titleProjectMap.get(task.taskTitle).size > 1;
    const taskLabel = isDuplicate
      ? `${sanitizeCell(task.projectName)}: ${sanitizeCell(task.taskTitle)}`
      : sanitizeCell(task.taskTitle);

    lines.push(`• ${taskLabel}`);

    // Subtasks — indented with dash
    if (task.subtasks && task.subtasks.length > 0) {
      for (const subtask of task.subtasks) {
        lines.push(`  - ${sanitizeCell(subtask.title)}`);
      }
    }
  }

  const result = lines.join('\n');
  return truncateToLimit(sanitizeCell(result), EXCEL_CELL_LIMIT);
}

// ── deriveColumnE ─────────────────────────────────────────────────────────

/**
 * Derives the Column E (Status) value for a single day.
 *
 * Rules (in priority order):
 *  1. Weekend → blank
 *  2. Public holiday / restricted holiday / full-day leave → blank
 *  3. Half-day: → 'Progress' if any task open, 'Complete' if all closed
 *  4. All tasks closed → 'Complete'
 *  5. At least one task open/in-progress → 'Progress'
 *  6. Time logs exist but zero tasks closed → 'Incomplete'
 *  7. No activity → blank
 *
 * @param {DayActivity} dayActivity
 * @param {TimesheetConfig} config
 * @returns {string} 'Complete' | 'Progress' | 'Incomplete' | ''
 */
function deriveColumnE(dayActivity, config) {
  const {
    isWeekend,
    isPublicHoliday,
    isRestrictedHoliday,
    isLeave,
    isHalfDay,
    timeLogs = [],
    tasks = [],
  } = dayActivity;

  // 1. Weekend
  if (isWeekend) return '';

  // 2. Special days (no task activity context)
  if (isPublicHoliday) return '';
  if (isRestrictedHoliday) return '';
  if (isLeave && !isHalfDay) return '';

  const closedStatuses = new Set(['done', 'closed']);
  const openStatuses = new Set(['open', 'in progress', 'in_progress', 'not started', 'blocked', 'in testing']);

  const closedTasks = tasks.filter((t) => closedStatuses.has((t.status || '').toLowerCase()));
  const openTasks = tasks.filter((t) => openStatuses.has((t.status || '').toLowerCase()));

  // 3. Half-day logic
  if (isHalfDay) {
    if (openTasks.length > 0) return 'Progress';
    if (closedTasks.length > 0) return 'Complete';
    // Half-day with time logs but no tasks
    if (timeLogs.length > 0) return 'Incomplete';
    return '';
  }

  // 4. All tasks closed (and at least one task exists)
  if (tasks.length > 0 && openTasks.length === 0 && closedTasks.length > 0) {
    return 'Complete';
  }

  // 5. At least one open/in-progress task
  if (openTasks.length > 0) return 'Progress';

  // 6. Time logs exist but no closed tasks
  if (timeLogs.length > 0 && closedTasks.length === 0) return 'Incomplete';

  // 7. No activity
  return '';
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  sanitizeCell,
  truncateToLimit,
  formatTimeBlock,
  generateColumnC,
  generateColumnD,
  deriveColumnE,
};
