// Alma+ Custom Tasks by Juho Lee and Beomgyu Kim: https://github.com/juholee10/alma-plus
// Included with the authors' permission.

const STORAGE_KEY = "almaPlusCustomTasks";

// Settings from the toolbar menu (popup.html). materials.js uses these too.
const SETTINGS_KEY = "almaPlusSettings";
const DEFAULT_SETTINGS = {
  tasksTodo: true,        // your tasks on the To Do page
  tasksClass: true,       // your tasks on class pages
  toolbarExtras: true,    // Export / Back up / Restore / Show next to "+ Add my own task"
  calendarButtons: true,  // Google Calendar button on assignments
  attachments: true,      // "Attached files" in assignment and task popups
  clips: true,            // paperclip counts on rows
  notes: true,            // "My notes" on Alma assignments
};
let settings = { ...DEFAULT_SETTINGS };
async function loadSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  settings = { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
  return settings;
}
function tasksOnThisPage() {
  return isClassPage() ? settings.tasksClass : settings.tasksTodo;
}
const BACKUP_FORMAT = "alma-plus-task-backup";

let bodyObserver = null;
let debounceTimer = null;
let activeFilter = "all";

async function loadTasks() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function saveTasks(tasks) {
  await chrome.storage.local.set({ [STORAGE_KEY]: tasks });
}

async function addTask(task) {
  const tasks = await loadTasks();
  tasks.push({ id: crypto.randomUUID(), completed: false, priority: "normal", ...task });
  await saveTasks(tasks);
}

async function updateTask(updatedTask) {
  const tasks = await loadTasks();
  await saveTasks(tasks.map((task) => task.id === updatedTask.id ? updatedTask : task));
}

async function deleteTask(id) {
  const tasks = await loadTasks();
  await saveTasks(tasks.filter((t) => t.id !== id));
  // Its attached files go too (materials.js).
  if (typeof removeOwnerAttachments === "function") await removeOwnerAttachments("__tasks__", id);
}

async function setTaskCompleted(id, completed) {
  const tasks = await loadTasks();
  await saveTasks(tasks.map((task) => task.id === id ? { ...task, completed } : task));
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
}

function normalizeTask(task) {
  if (!task || typeof task !== "object" || Array.isArray(task)) return null;
  if (typeof task.id !== "string" || !task.id.trim()) return null;
  if (typeof task.name !== "string" || !task.name.trim()) return null;
  if (typeof task.due !== "string" || !isValidDate(task.due)) return null;
  if (task.category !== undefined && typeof task.category !== "string") return null;
  if (task.notes !== undefined && typeof task.notes !== "string") return null;
  if (task.completed !== undefined && typeof task.completed !== "boolean") return null;
  if (task.priority !== undefined && !["low", "normal", "high"].includes(task.priority)) return null;
  if (task.end !== undefined && task.end !== "" && (typeof task.end !== "string" || !isValidDate(task.end) || task.end < task.due)) return null;
  return {
    id: task.id,
    name: task.name.trim(),
    category: task.category?.trim() || "",
    due: task.due,
    notes: task.notes?.trim() || "",
    completed: task.completed ?? false,
    priority: task.priority || "normal",
    end: task.end || "",
  };
}

function findAssignmentsTable() {
  const byClass = document.querySelector("table.upcoming-assignments");
  if (byClass) return byClass;
  // On class pages, tasks only go in the Upcoming list, never in Past.
  if (isClassPage()) return null;

  const tables = document.querySelectorAll("table");
  for (const table of tables) {
    const headerText = (
      table.querySelector("thead")?.textContent ||
      table.rows[0]?.textContent ||
      ""
    ).toLowerCase();
    if (headerText.includes("due") && headerText.includes("assignment")) {
      return table;
    }
  }
  return null;
}

function getTbody(table) {
  return table.tBodies[0] || table;
}

// alma sorts rows client-side and marks the active th with sort-asc/sort-desc.
// follow that so custom rows land in the right spot when sorted by name.
function getActiveSort(table) {
  const sortableThs = [...table.querySelectorAll("thead th[data-sortable]")];
  const activeIndex = sortableThs.findIndex(
    (th) => th.classList.contains("sort-asc") || th.classList.contains("sort-desc")
  );
  if (activeIndex === -1) {
    return { columnIndex: 0, numeric: true, direction: 1 };
  }
  const th = sortableThs[activeIndex];
  return {
    columnIndex: [...th.parentElement.children].indexOf(th),
    numeric: th.dataset.sortable === "numeric",
    direction: th.classList.contains("sort-desc") ? -1 : 1,
  };
}

function getCellSortValue(row, columnIndex) {
  const cell = row.cells[columnIndex];
  return cell?.getAttribute("data-sortable-val") ?? cell?.textContent.trim() ?? "";
}

function compareSortValues(a, b, numeric) {
  if (numeric) return parseFloat(a) - parseFloat(b);
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

// due cells have a unix timestamp in data-sortable-val; the visible text
// ("Sep 17") has no year, so the fallback picks the closest one
function parseAlmaDueCellDate(cell) {
  const ts = parseInt(cell?.getAttribute("data-sortable-val"), 10);
  if (!Number.isNaN(ts)) return new Date(ts * 1000);

  const text = cell?.textContent.trim();
  if (!text) return null;
  const now = new Date();
  const candidates = [-1, 0, 1]
    .map((offset) => new Date(`${text} ${now.getFullYear() + offset}`))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (!candidates.length) return null;
  return candidates.reduce((best, d) =>
    Math.abs(d - now) < Math.abs(best - now) ? d : best
  );
}

// YYYYMMDD in local time
function toCalendarDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function nextDay(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d;
}

// the name is in the last column; alma adds a submit column before it
// The name column is last on the To Do page but second on class pages
// (which add Status, Grade, Points... after it), so find it by its header.
function getNameColumnIndex(table) {
  const ths = [...(table?.querySelectorAll("thead th") || [])];
  return ths.findIndex((th) => th.classList.contains("name") || /assignment name/i.test(th.textContent));
}

function getNameCell(row) {
  const index = getNameColumnIndex(row.closest("table"));
  if (index > 0 && row.cells[index]) return row.cells[index];
  return row.cells.length > 1 ? row.cells[row.cells.length - 1] : null;
}

// Class pages show only that class's own tasks.
function isClassPage() {
  return /^\/home\/class\//.test(location.pathname);
}

function currentClassName() {
  return document.querySelector("header.class-header h3")?.textContent.trim() || "";
}

function taskBelongsHere(task) {
  if (!isClassPage()) return true;
  const here = currentClassName().toLowerCase();
  return Boolean(here) && (task.category || "").trim().toLowerCase() === here;
}

// name cell is <small>Class</small> Assignment name in alma's rows; custom rows keep their task
function getRowAssignment(row) {
  const dueCell = row.cells[0];
  const nameCell = getNameCell(row);
  if (!dueCell || !nameCell) return null;

  const due = parseAlmaDueCellDate(dueCell);
  if (!due) return null;

  const custom = row.dataset.almaPlusRow === "true";
  const task = custom ? row._almaPlusTask : null;

  let name, category;
  if (task) {
    name = task.name;
    category = task.category || "";
  } else {
    category = nameCell.querySelector("small")?.textContent.trim() || "";
    name = [...nameCell.childNodes]
      .filter((n) => !(n.nodeType === Node.ELEMENT_NODE && n.matches("small, button")))
      .map((n) => n.textContent)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() || category;
  }
  if (!name) return null;

  const link = nameCell.querySelector("a[href*='/home/assignment/']")?.href || "";
  return {
    uid: row.dataset.almaPlusId || `${toCalendarDate(due)}-${category}-${name}`,
    name,
    category,
    due,
    link,
    end: task?.end && task.end > task.due ? new Date(task.end + "T00:00:00") : due,
    custom,
    notes: task?.notes || "",
  };
}

function getAllAssignments(table) {
  return [...getTbody(table).rows].map(getRowAssignment).filter(Boolean);
}

function buildEventTitle(a) {
  return a.category ? `${a.name} (${a.category})` : a.name;
}

function buildEventDetails(a) {
  const source = a.custom ? "Personal task added via Alma+" : "Assignment from Alma";
  const details = [source, a.notes, a.link].filter(Boolean);
  return details.join("\n");
}

function buildGoogleCalendarUrl(a) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: buildEventTitle(a),
    dates: `${toCalendarDate(a.due)}/${toCalendarDate(nextDay(a.end))}`,
    details: buildEventDetails(a),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function buildCalendarButton(row) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "alma-plus-cal-btn";
  const icon = document.createElement("img");
  icon.src = chrome.runtime.getURL("google-calendar.svg");
  icon.alt = "";
  icon.width = 18;
  icon.height = 18;
  btn.appendChild(icon);
  btn.title = "Add to Google Calendar";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const assignment = getRowAssignment(row);
    if (assignment) window.open(buildGoogleCalendarUrl(assignment), "_blank", "noopener");
  });
  return btn;
}

function ensureCalendarButtons(tbody) {
  if (!settings.calendarButtons) return;
  for (const row of tbody.rows) {
    const nameCell = getNameCell(row);
    if (!nameCell || nameCell.querySelector(".alma-plus-cal-btn")) continue;
    if (!getRowAssignment(row)) continue;
    // In custom rows the icon goes right after the name, as in Alma's rows.
    const title = nameCell.querySelector(".alma-plus-title");
    if (title) title.after(buildCalendarButton(row));
    else nameCell.appendChild(buildCalendarButton(row));
  }
}

function escapeIcsText(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// ics lines max out at 75 octets, continuations start with a space
function foldIcsLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = "";
  let currentBytes = 0;
  for (const ch of line) {
    const chBytes = new TextEncoder().encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + chBytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += chBytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function buildIcs(assignments) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Alma+//Custom Tasks//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Alma",
  ];
  for (const a of assignments) {
    // stable uid so re-importing updates instead of duplicating
    const uid = `${a.uid}`.replace(/[^\w.-]+/g, "-") + "@alma-plus";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toCalendarDate(a.due)}`,
      `DTEND;VALUE=DATE:${toCalendarDate(nextDay(a.end))}`,
      `SUMMARY:${escapeIcsText(buildEventTitle(a))}`,
      `DESCRIPTION:${escapeIcsText(buildEventDetails(a))}`,
      ...(a.link ? [`URL:${a.link}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

function exportIcs() {
  const table = findAssignmentsTable();
  if (!table) return;
  const assignments = getAllAssignments(table);
  if (!assignments.length) {
    alert("No assignments found to export.");
    return;
  }

  const blob = new Blob([buildIcs(assignments)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `alma-assignments-${toCalendarDate(new Date())}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Built the same way as Alma's own rows: "Nov / 09" in the shaded due cell, a small
// bold class line, and the name at normal size. Alma's stylesheet does the rest.
function buildCustomRow(task, columnCount, nameIndex = -1, templateRow = null, statusIndex = -1) {
  const row = document.createElement("tr");
  row.dataset.almaPlusRow = "true";
  row.dataset.almaPlusId = task.id;
  const completed = Boolean(task.completed);
  const priorityValue = ["low", "high"].includes(task.priority) ? task.priority : "normal";
  row._almaPlusTask = { ...task, completed, priority: priorityValue };

  const dueDate = new Date(task.due + "T00:00:00");

  const dueCell = document.createElement("td");
  dueCell.dataset.sortableVal = String(Math.floor(dueDate.getTime() / 1000));
  const month = (d) => d.toLocaleDateString("en-US", { month: "short" });
  const day = (d) => String(d.getDate()).padStart(2, "0");
  const endDate = task.end && task.end > task.due ? new Date(task.end + "T00:00:00") : null;
  if (!endDate) {
    dueCell.append(month(dueDate), document.createElement("br"), day(dueDate));
  } else if (month(endDate) === month(dueDate) && endDate.getFullYear() === dueDate.getFullYear()) {
    dueCell.append(month(dueDate), document.createElement("br"), `${day(dueDate)}–${day(endDate)}`);
  } else {
    dueCell.append(`${month(dueDate)} ${day(dueDate)} –`, document.createElement("br"), `${month(endDate)} ${day(endDate)}`);
  }

  const nameCell = document.createElement("td");
  nameCell.className = "alma-plus-name-cell";
  nameCell.dataset.sortableVal = task.name;

  const classLine = document.createElement("small");
  classLine.className = "alma-plus-class";
  // On a class page the class is the whole page, so say "My task" (Alma shows the category there).
  classLine.textContent = isClassPage() ? "My task" : task.category || "My task";

  const title = document.createElement("a");
  title.href = "#";
  title.className = "alma-plus-title";
  if (completed) title.classList.add("alma-plus-completed-title");
  title.textContent = task.name;
  title.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openDetails(row._almaPlusTask);
  });

  nameCell.append(classLine, title);
  // Filled in below; sits on the right of the class line so the row stays Alma's height.

  // Like Alma's rows, the description only shows in the details popup.
  if (priorityValue !== "normal") {
    const metadata = document.createElement("small");
    metadata.className = "alma-plus-metadata";
    if (priorityValue === "high") metadata.classList.add("alma-plus-priority-high");
    metadata.textContent = `${priorityValue[0].toUpperCase()}${priorityValue.slice(1)} priority`;
    nameCell.appendChild(metadata);
  }

  const actions = document.createElement("small");
  actions.className = "alma-plus-task-actions";

  const actionLink = (text, label, onClick) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.setAttribute("aria-label", label);
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await onClick();
    });
    return btn;
  };

  actions.append(
    actionLink(completed ? "Undo" : "Done", `Mark ${task.name} ${completed ? "not done" : "done"}`, async () => {
      await setTaskCompleted(task.id, !completed);
      renderCustomRows();
    }),
    actionLink("Edit", `Edit ${task.name}`, () => openModal(task)),
    actionLink("Remove", `Remove ${task.name}`, async () => {
      await deleteTask(task.id);
      renderCustomRows();
    })
  );
  nameCell.prepend(actions);
  if (completed) row.classList.add("alma-plus-completed-row");

  // Same cell classes as Alma's rows in this table (class pages use "due" and "name").
  const nameAt = nameIndex > 0 ? nameIndex : columnCount - 1;
  if (templateRow?.cells[0]?.classList.contains("due")) dueCell.classList.add("due");
  if (templateRow?.cells[nameAt]?.classList.contains("name")) nameCell.classList.add("name");
  for (let i = 0; i < columnCount; i++) {
    row.appendChild(i === 0 ? dueCell : i === nameAt ? nameCell : document.createElement("td"));
  }
  // The Past table has a Status column: Alma's green check if you marked the task
  // done, otherwise left empty (never "Missing").
  if (statusIndex > 0 && row.cells[statusIndex]) {
    const statusCell = row.cells[statusIndex];
    if (templateRow?.cells[statusIndex]?.classList.contains("status")) statusCell.classList.add("status");
    statusCell.style.textAlign = "center";
    statusCell.dataset.sortableVal = completed ? "0" : "1";
    if (completed) {
      const icon = document.createElement("i");
      icon.className = "fa fa-check green";
      icon.title = "Done";
      statusCell.appendChild(icon);
    }
  }

  return row;
}

// A task is past once its last day (end date, or due date) is before today.
function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isPastTask(task) {
  const last = task.end && task.end > task.due ? task.end : task.due;
  return last < todayString();
}

function getStatusColumnIndex(table) {
  const ths = [...(table?.querySelectorAll("thead th") || [])];
  return ths.findIndex((th) => th.classList.contains("status") || /^status$/i.test(th.textContent.trim()));
}

// Where tasks show:
//   To Do page: upcoming and not done -> Upcoming Assignments. Done, or past
//     its date -> off the To Do page.
//   Class page: upcoming and not done -> Upcoming list. Done, or past its
//     date -> Past Assignments (with a check if done). Undo brings it back.
// Past tasks never go to Missing; marking them done isn't needed.
function taskPlacements(tasks) {
  const upcomingTable = findAssignmentsTable();
  const finished = (t) => t.completed || isPastTask(t);
  const upcoming = tasks.filter((t) => !finished(t));
  const past = tasks.filter(finished);
  const placements = [];
  if (isClassPage()) {
    const pastTable = document.querySelector(".student-assignments table.assignment-grades");
    if (upcomingTable) placements.push({ table: upcomingTable, tasks: upcoming });
    if (pastTable) placements.push({ table: pastTable, tasks: past });
  } else if (upcomingTable) {
    placements.push({ table: upcomingTable, tasks: upcoming });
  }
  return placements;
}

function placeRows(table, tasks, withCalendar) {
  const tbody = getTbody(table);
  const sort = getActiveSort(table);
  const nameIndex = getNameColumnIndex(table);
  const statusIndex = getStatusColumnIndex(table);
  const existingRows = [...tbody.querySelectorAll("tr:not([data-alma-plus-row])")];
  const columnCount =
    existingRows[0]?.cells.length ||
    table.querySelector("thead tr")?.cells.length ||
    2;

  for (const task of tasks) {
    const row = buildCustomRow(task, columnCount, nameIndex, existingRows[0], statusIndex);
    const rowValue = getCellSortValue(row, sort.columnIndex);
    const target = existingRows.find((r) => {
      const cmp = compareSortValues(rowValue, getCellSortValue(r, sort.columnIndex), sort.numeric);
      return cmp * sort.direction < 0;
    });
    if (target) target.before(row);
    else tbody.appendChild(row);
  }
  // Calendar buttons only in Upcoming lists, as before (not in Past or Missing).
  if (withCalendar) ensureCalendarButtons(tbody);
}

async function renderCustomRows() {
  const upcomingTable = findAssignmentsTable();
  const tasks = tasksOnThisPage() ? (await loadTasks()).filter(taskBelongsHere) : [];

  bodyObserver?.disconnect();
  try {
    document.querySelectorAll("tr[data-alma-plus-row]").forEach((el) => el.remove());
    for (const { table, tasks: here } of taskPlacements(tasks)) placeRows(table, here, table === upcomingTable);
    if (upcomingTable) applyAssignmentFilter(getTbody(upcomingTable));
    // Paperclip counts on task rows (materials.js).
    if (typeof refreshAttachmentClips === "function") refreshAttachmentClips();
  } finally {
    bodyObserver?.observe(document.body, { childList: true, subtree: true });
  }
}

function buildAddButton() {
  const btn = document.createElement("button");
  btn.id = "alma-plus-add-btn";
  btn.type = "button";
  btn.textContent = "+ Add my own task";
  btn.addEventListener("click", () => openModal());
  return btn;
}

function buildExportButton() {
  const btn = document.createElement("button");
  btn.id = "alma-plus-export-btn";
  btn.type = "button";
  btn.textContent = "Export to calendar (.ics)";
  btn.title = "Download all assignments as a calendar file you can import into Google Calendar";
  btn.addEventListener("click", exportIcs);
  return btn;
}

function buildBackupButton() {
  const btn = document.createElement("button");
  btn.id = "alma-plus-backup-btn";
  btn.type = "button";
  btn.textContent = "Back up tasks";
  btn.title = "Download your custom tasks as a JSON backup";
  btn.addEventListener("click", exportTaskBackup);
  return btn;
}

function buildImportButton() {
  const btn = document.createElement("button");
  btn.id = "alma-plus-import-btn";
  btn.type = "button";
  btn.textContent = "Restore tasks";
  btn.title = "Import custom tasks from a JSON backup";
  btn.addEventListener("click", () => document.getElementById("alma-plus-import-input").click());
  return btn;
}

function buildFilter() {
  const label = document.createElement("label");
  label.id = "alma-plus-filter-label";
  label.textContent = "Show: ";
  const select = document.createElement("select");
  select.id = "alma-plus-filter";
  for (const [value, text] of [
    ["all", "All assignments"],
    ["today", "Due today"],
    ["week", "Due this week"],
    ["overdue", "Overdue"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  }
  select.value = activeFilter;
  select.addEventListener("change", () => {
    activeFilter = select.value;
    const table = findAssignmentsTable();
    if (table) applyAssignmentFilter(getTbody(table));
  });
  label.appendChild(select);
  return label;
}

function applyAssignmentFilter(tbody) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  for (const row of tbody.rows) {
    const assignment = getRowAssignment(row);
    if (!assignment) continue;
    const dayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const start = dayOf(assignment.due);
    const end = dayOf(assignment.end);
    const show = activeFilter === "all" ||
      (activeFilter === "today" && start <= today && end >= today) ||
      (activeFilter === "week" && start < weekEnd && end >= weekStart) ||
      (activeFilter === "overdue" && end < today);
    row.hidden = !show;
  }
}

async function exportTaskBackup() {
  const tasks = await loadTasks();
  const backup = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `alma-plus-tasks-${toCalendarDate(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importTaskBackup(file) {
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch (error) {
    alert(`Could not read the backup file: ${error.message}`);
    return;
  }

  if (!backup || backup.format !== BACKUP_FORMAT || backup.version !== 1 || !Array.isArray(backup.tasks)) {
    alert("This is not a supported Alma+ task backup.");
    return;
  }

  const importedTasks = backup.tasks.map(normalizeTask);
  if (importedTasks.some((task) => !task)) {
    alert("The backup contains an invalid task. No tasks were imported.");
    return;
  }

  const currentTasks = await loadTasks();
  const ids = new Set(currentTasks.map((task) => task.id));
  const mergedTasks = [...currentTasks];
  for (const task of importedTasks) {
    const id = ids.has(task.id) ? crypto.randomUUID() : task.id;
    ids.add(id);
    mergedTasks.push({ ...task, id });
  }
  await saveTasks(mergedTasks);
  alert(`Restored ${importedTasks.length} task${importedTasks.length === 1 ? "" : "s"}. Existing tasks were kept.`);
  renderCustomRows();
}

function buildImportInput() {
  const input = document.createElement("input");
  input.id = "alma-plus-import-input";
  input.type = "file";
  input.accept = "application/json,.json";
  input.hidden = true;
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (file) await importTaskBackup(file);
    input.value = "";
  });
  return input;
}

function ensureAddButton() {
  if (!tasksOnThisPage()) return;
  const table = findAssignmentsTable();
  if (table && !document.getElementById("alma-plus-add-btn")) {
    const toolbar = document.createElement("div");
    toolbar.id = "alma-plus-toolbar";
    toolbar.appendChild(buildAddButton());
    if (!settings.toolbarExtras) {
      table.before(toolbar);
      return;
    }
    toolbar.appendChild(buildExportButton());
    toolbar.appendChild(buildBackupButton());
    toolbar.appendChild(buildImportButton());
    toolbar.appendChild(buildFilter());
    table.before(toolbar);
    table.before(buildImportInput());
  }
}

// While one of our windows is open the page behind it stays still, as with
// Alma's own popups (they set overflow: hidden on the body the same way).
let scrollLocks = 0;
let savedBodyOverflow = "";
function lockPageScroll() {
  if (scrollLocks++ === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}
function unlockPageScroll() {
  if (scrollLocks > 0 && --scrollLocks === 0) {
    document.body.style.overflow = savedBodyOverflow;
  }
}

// Alma's Classes page lists every class with its teacher ("Bai, Samuel").
// Fetched once per page load and used for the popup's "Class • Teacher" line
// and for class name suggestions in the add-task window.
let classesPromise = null;
function getClasses() {
  if (!classesPromise) {
    classesPromise = fetch("/home/schedule", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return [...doc.querySelectorAll("table.current-classes tr.result-set-item")].map((tr) => {
          const link = tr.querySelector("th.name a");
          const raw = tr.querySelector("td.teacher")?.textContent.replace(/\s+/g, " ").trim() || "";
          // "Bai, Samuel" -> "Samuel Bai", the way Alma's popup shows it
          const [last, first] = raw.split(", ");
          return {
            name: link?.textContent.trim() || "",
            url: (link?.getAttribute("href") || "").split("?")[0],
            teacher: first ? `${first} ${last}` : raw,
            messageUrl: tr.querySelector("td.teacher a.send-msg")?.getAttribute("href") || "",
          };
        }).filter((c) => c.name);
      })
      .catch(() => []);
  }
  return classesPromise;
}

function findClass(classes, name) {
  const key = (name || "").trim().toLowerCase();
  return key ? classes.find((c) => c.name.toLowerCase() === key) : undefined;
}

function openModal(existingTask = null) {
  if (document.getElementById("alma-plus-modal-overlay")) return;

  // Built like Alma's own form windows (New Message): dark header bar with a
  // close button, gray rounded boxes with bold field labels, Cancel + green button.
  const overlay = document.createElement("div");
  overlay.id = "alma-plus-modal-overlay";

  const modal = document.createElement("div");
  modal.id = "alma-plus-modal";
  modal.className = "alma-message-modal alma-modal alma-modal-base yui3-widget yui3-panel alma-plus-form";
  modal.setAttribute("role", "dialog");
  modal.innerHTML = `
    <div class="yui3-panel-content yui3-widget-stdmod">
      <div class="yui3-widget-hd"><span class="alma-plus-form-title">Add Task</span><span class="yui3-widget-buttons"><button type="button" class="yui3-button yui3-button-close" id="alma-plus-close">Close</button></span></div>
      <div class="yui3-widget-bd">
        <form class="pure-form" novalidate>
          <section class="container pure-form-stacked">
            <div class="section">
              <label class="section-label" for="alma-plus-input-name">Task Name:</label>
              <input type="text" class="pure-input-1" id="alma-plus-input-name" placeholder="e.g. Study for chem quiz">
            </div>
            <div class="section">
              <label class="section-label" for="alma-plus-input-category">Class:</label>
              <input type="text" class="pure-input-1" id="alma-plus-input-category" list="alma-plus-class-list" autocomplete="off" placeholder="e.g. P4 Algebra 1">
              <datalist id="alma-plus-class-list"></datalist>
            </div>
          </section>
          <section class="container pure-form-stacked message-container">
            <div class="section">
              <label class="section-label" for="alma-plus-input-notes">Description:</label>
              <textarea class="pure-input-1" id="alma-plus-input-notes" rows="5" placeholder="Details, instructions, links..."></textarea>
            </div>
            <div class="section">
              <label class="section-label" for="alma-plus-input-priority">Priority:</label>
              <select class="pure-input-1" id="alma-plus-input-priority">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div class="section">
              <label class="section-label" for="alma-plus-input-date">Due Date:</label>
              <input type="date" class="pure-input-1" id="alma-plus-input-date">
            </div>
            <div class="section">
              <label class="section-label" for="alma-plus-input-end">End Date:</label>
              <p class="helper">Only for tasks that last more than one day.</p>
              <input type="date" class="pure-input-1" id="alma-plus-input-end">
            </div>
          </section>
          <div class="buttons">
            <button type="button" id="alma-plus-cancel" class="pure-button pure-button-link">Cancel</button>
            <button type="submit" id="alma-plus-save" class="pure-button pure-button-primary">Add</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.append(overlay, modal);
  lockPageScroll();
  const closeOnEscape = (e) => {
    if (e.key === "Escape") closeModal();
  };
  const closeModal = () => {
    overlay.remove();
    modal.remove();
    document.removeEventListener("keydown", closeOnEscape);
    unlockPageScroll();
  };
  document.addEventListener("keydown", closeOnEscape);
  modal.querySelector("#alma-plus-close").addEventListener("click", closeModal);

  modal.querySelector(".alma-plus-form-title").textContent = existingTask ? "Edit Task" : "Add Task";
  modal.querySelector("#alma-plus-save").textContent = existingTask ? "Save" : "Add";
  modal.querySelector("#alma-plus-input-name").value = existingTask?.name || "";
  modal.querySelector("#alma-plus-input-category").value =
    existingTask?.category || (isClassPage() ? currentClassName() : "");
  getClasses().then((classes) => {
    const list = modal.querySelector("#alma-plus-class-list");
    for (const c of classes) {
      const option = document.createElement("option");
      option.value = c.name;
      list.appendChild(option);
    }
  });
  modal.querySelector("#alma-plus-input-notes").value = existingTask?.notes || "";
  modal.querySelector("#alma-plus-input-priority").value = existingTask?.priority || "normal";
  modal.querySelector("#alma-plus-input-date").value = existingTask?.due || "";
  modal.querySelector("#alma-plus-input-end").value = existingTask?.end || "";

  overlay.addEventListener("click", closeModal);
  modal.querySelector("#alma-plus-cancel").addEventListener("click", closeModal);
  modal.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = modal.querySelector("#alma-plus-input-name").value.trim();
    const category = modal.querySelector("#alma-plus-input-category").value.trim();
    const notes = modal.querySelector("#alma-plus-input-notes").value.trim();
    const priority = modal.querySelector("#alma-plus-input-priority").value;
    const due = modal.querySelector("#alma-plus-input-date").value;
    let end = modal.querySelector("#alma-plus-input-end").value;

    if (!name || !due || !isValidDate(due)) {
      alert("Please enter a task name and a valid due date.");
      return;
    }
    if (end && (!isValidDate(end) || end < due)) {
      alert("The end date has to be on or after the due date.");
      return;
    }
    if (end === due) end = "";

    const task = {
      ...(existingTask || {}),
      name,
      category,
      notes,
      priority,
      due,
      end,
    };
    if (existingTask) await updateTask(task);
    else await addTask(task);
    closeModal();
    renderCustomRows();
  });

  modal.querySelector("#alma-plus-input-name").focus();
}

// The details popup reuses the classes of Alma's own "Assignment Details" popup,
// so Alma's stylesheet gives it the same header bar, fonts and spacing.
function formatShortDate(value) {
  const d = new Date(value + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

function closeDetails() {
  const panel = document.getElementById("alma-plus-details");
  if (!panel) return;
  document.getElementById("alma-plus-details-overlay")?.remove();
  panel.remove();
  unlockPageScroll();
  document.removeEventListener("keydown", closeDetailsOnEscape);
}

function closeDetailsOnEscape(e) {
  if (e.key === "Escape") closeDetails();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Description paragraph like Alma's: keeps line breaks and makes web links clickable.
function buildDescription(text) {
  const p = el("p", "alma-plus-details-notes");
  const urlPattern = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/g;
  let last = 0;
  for (const match of text.matchAll(urlPattern)) {
    p.append(text.slice(last, match.index));
    const a = el("a", "", match[0]);
    a.href = match[0];
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    p.appendChild(a);
    last = match.index + match[0].length;
  }
  p.append(text.slice(last));
  return p;
}

function openDetails(task) {
  closeDetails();
  const completed = Boolean(task.completed);
  const priority = ["low", "high"].includes(task.priority) ? task.priority : "normal";

  const overlay = el("div");
  overlay.id = "alma-plus-details-overlay";
  overlay.addEventListener("click", closeDetails);

  const panel = el("div", "alma-student-assignment-details-modal alma-modal-base yui3-widget yui3-panel alma-plus-details");
  panel.id = "alma-plus-details";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Task Details");

  const content = el("div", "yui3-panel-content yui3-widget-stdmod");
  // Starts as Alma's loading state ("One moment please…" and a spinning wheel),
  // then switches to the details, the way Alma's own popup does.
  const hd = el("div", "yui3-widget-hd");
  const hdText = document.createTextNode("One moment please…");
  hd.appendChild(hdText);
  const buttons = el("span", "yui3-widget-buttons");
  const close = el("button", "yui3-button yui3-button-close", "Close");
  close.type = "button";
  close.addEventListener("click", closeDetails);
  buttons.appendChild(close);
  hd.appendChild(buttons);

  const bd = el("div", "yui3-widget-bd");
  const loading = el("div", "alma-plus-details-loading");
  const spinner = el("i", "fa fa-spinner fa-spin fa-4x");
  spinner.setAttribute("aria-hidden", "true");
  loading.appendChild(spinner);
  const header = el("header");
  const classDiv = el("div", "class");
  const assignment = el("div", "assignment");
  assignment.appendChild(el("h3", "assignment-name", task.name));
  // "My task" already shows on the class line when there's no class.
  const typeText = [
    task.category ? "My task" : "",
    priority === "normal" ? "" : `${priority[0].toUpperCase()}${priority.slice(1)} priority`,
  ].filter(Boolean).join(" · ");
  if (typeText) assignment.appendChild(el("span", "assignment-type", typeText));
  header.append(classDiv, assignment);

  const dl = el("dl", "simple");
  const addRow = (label, value) => {
    dl.appendChild(el("dt", "", label));
    dl.appendChild(document.createTextNode(" "));
    const dd = el("dd");
    dd.appendChild(el("strong", "", value));
    dl.appendChild(dd);
  };
  addRow("Status:", completed ? "Done" : "Not done");
  const hasRange = task.end && task.end > task.due;
  addRow(hasRange ? "Dates:" : "Due:",
    hasRange ? `${formatShortDate(task.due)} – ${formatShortDate(task.end)}` : formatShortDate(task.due));

  const details = [header, dl];
  if (task.notes) details.push(buildDescription(task.notes));
  // Same "Attached files" section as Alma assignments get (materials.js).
  if (settings.attachments && typeof buildAttachedSection === "function") details.push(buildAttachedSection("__tasks__", task.id, task.name));
  bd.appendChild(loading);
  // Like Alma's popup: "P4 Algebra 1 • Simon Pei", the class name linking to the class.
  const minimumWait = new Promise((resolve) => setTimeout(resolve, 500));
  const classesOrGiveUp = Promise.race([getClasses(), new Promise((resolve) => setTimeout(() => resolve([]), 3000))]);
  Promise.all([classesOrGiveUp, minimumWait]).then(([classes]) => {
    if (!panel.isConnected) return;
    const h3 = el("h3");
    const match = findClass(classes, task.category);
    if (match) {
      const a = el("a", "", match.name);
      a.href = match.url;
      h3.appendChild(a);
      classDiv.appendChild(h3);
      if (match.teacher) {
        classDiv.append(" • ");
        const teacher = el("span", "teacher");
        teacher.appendChild(el("span", "fn", match.teacher));
        classDiv.appendChild(teacher);
        if (match.messageUrl.startsWith("/message/person/")) {
          // Same envelope link as Alma's popup; Alma opens its own Send Message window for it.
          const msg = el("a", "send-msg");
          msg.href = match.messageUrl;
          msg.dataset.almaModal = "Message";
          msg.setAttribute("aria-label", "Send Message");
          const icon = el("i", "fa fa-envelope");
          icon.setAttribute("aria-hidden", "true");
          msg.appendChild(icon);
          // Close after Alma's own click handler has seen the link.
          msg.addEventListener("click", () => setTimeout(closeDetails, 0));
          classDiv.append(" ", msg);
        }
      }
    } else {
      h3.textContent = task.category || "My task";
      classDiv.appendChild(h3);
    }
    hdText.nodeValue = "Task Details";
    bd.replaceChildren(...details);
  });


  content.append(hd, bd);
  panel.appendChild(content);
  document.body.append(overlay, panel);
  lockPageScroll();
  document.addEventListener("keydown", closeDetailsOnEscape);
  close.focus();
}

function scheduleRender() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (!isTaskPage()) {
      document.querySelectorAll("[data-alma-plus-row], #alma-plus-toolbar").forEach((el) => el.remove());
      return;
    }
    ensureAddButton();
    renderCustomRows();
  }, 80);
}

// Changes made by the class materials section don't need a re-render.
function onlyMaterialsChanges(mutations) {
  return mutations.every((m) =>
    m.target.closest?.(".alma-plus-clip, .alma-plus-notes, .alma-plus-attached, #alma-plus-photo") ||
    ([...m.addedNodes, ...m.removedNodes].length > 0 &&
      [...m.addedNodes, ...m.removedNodes].every((n) => n.nodeType === 1 && n.matches?.(".alma-plus-clip, .alma-plus-notes, .alma-plus-attached, #alma-plus-photo, #alma-plus-photo-overlay, #alma-plus-message, #alma-plus-message-mask"))));
}

function startObserving() {
  bodyObserver = new MutationObserver((mutations) => {
    if (!onlyMaterialsChanges(mutations)) scheduleRender();
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

// Tasks show on the To Do page (all of them) and on class pages (only that
// class's tasks, in its Upcoming list). Nowhere else.
function isTaskPage() {
  return location.pathname.startsWith("/home/assignments") || isClassPage();
}

async function init() {
  if (!isTaskPage()) return;
  await loadSettings();
  getClasses(); // start loading so suggestions and teacher names are ready
  ensureAddButton();
  renderCustomRows();
  startObserving();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
