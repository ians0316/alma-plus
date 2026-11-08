// Alma+ on Alma's Academic Calendar (/calendar): your assignments and tasks
// added to the page Alma already has.
//   - colored dots under days that have assignments or tasks (one color per class)
//   - the day's hover tooltip also lists them
//   - clicking a day opens an Alma-style popup with everything that day and
//     "+ Add my own task" for that date
//   - the Events list gets them mixed in under each month
// Uses helpers from alma-plus.js (loadTasks, loadSettings, getClasses,
// openDetails, openModal) and materials.js (My notes / Attached files in popups).

const CAL_CACHE_KEY = "almaPlusCalendarCache2";
const CAL_CACHE_MINUTES = 15;

// One color per period, picked to sit well next to Alma's orange and teal.
const PERIOD_COLORS = {
  P1: "#eb6841", P2: "#3fc1c8", P3: "#9ec583", P4: "#f2a65a",
  P5: "#8e7cc3", P6: "#5b8def", P7: "#e57fa3", P8: "#7d8a96",
};
const OTHER_COLOR = "#a9a9a9";

function cEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function calIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function colorFor(className) {
  const code = (className || "").match(/^(P\d)\b/)?.[1];
  return PERIOD_COLORS[code] || OTHER_COLOR;
}

// ---- Data: every assignment on every class page (past and upcoming) ----

async function allAssignments() {
  const cached = (await chrome.storage.local.get(CAL_CACHE_KEY))[CAL_CACHE_KEY];
  if (cached && Date.now() - cached.time < CAL_CACHE_MINUTES * 60000) return cached.items;
  const classes = (await getClasses()).filter((c) => /^\/home\/class\//.test(c.url));
  const items = [];
  await Promise.all(classes.map(async (c) => {
    const html = await fetch(c.url, { credentials: "same-origin" }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const row of doc.querySelectorAll(".student-assignments table tbody tr")) {
      const ts = Number(row.cells[0]?.dataset.sortableVal);
      const link = [...row.querySelectorAll("a[href*='/home/assignment/']")].find((a) => a.textContent.trim());
      if (!ts || !link) continue;
      items.push({
        day: calIso(new Date(ts * 1000)),
        name: link.textContent.trim(),
        href: link.getAttribute("href"),
        category: row.querySelector("td small")?.textContent.trim() || "",
        className: c.name,
      });
    }
  }));
  const seen = new Set();
  const unique = items.filter((i) => !seen.has(i.href) && seen.add(i.href));
  await chrome.storage.local.set({ [CAL_CACHE_KEY]: { time: Date.now(), items: unique } });
  return unique;
}

function taskDays(task) {
  const days = [];
  const last = task.end && task.end > task.due ? task.end : task.due;
  const d = new Date(task.due + "T00:00:00");
  while (calIso(d) <= last && days.length < 62) {
    days.push(calIso(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// Official school calendar events (official-calendar.js), minus ones Alma's
// own Events list already has that month (same distinctive word, e.g. "Hangul").
function officialEvents() {
  if (typeof OFFICIAL_CALENDAR === "undefined") return [];
  const almaByMonth = {};
  for (const block of document.querySelectorAll(".event-list-month[data-month]:not(.alma-plus-month)")) {
    almaByMonth[block.dataset.month.slice(0, 7)] = [...block.querySelectorAll("dd")]
      .filter((dd) => !dd.classList.contains("alma-plus-ev")).map((dd) => dd.textContent.toLowerCase()).join(" ");
  }
  const words = (name) => name.toLowerCase().match(/[a-z]{5,}/g) || [];
  return OFFICIAL_CALENDAR.events.filter((e) => {
    const alma = almaByMonth[e.start.slice(0, 7)] || "";
    return !words(e.name).some((w) => !["break", "classes", "school", "students", "first"].includes(w) && alma.includes(w));
  }).map((e) => ({ ...e, color: OFFICIAL_CALENDAR.categories[e.cat]?.color || OTHER_COLOR, catLabel: OFFICIAL_CALENDAR.categories[e.cat]?.label || "" }));
}

function eventDays(start, end) {
  return taskDays({ due: start, end: end || "" });
}

// Map of "YYYY-MM-DD" -> [{kind, name, className, ...}]
function buildDayMap(assignments, tasks, official = []) {
  const map = new Map();
  const add = (day, item) => {
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(item);
  };
  for (const o of official) for (const day of eventDays(o.start, o.end)) add(day, { kind: "official", name: o.name, className: o.catLabel, color: o.color });
  for (const a of assignments) add(a.day, { kind: "assignment", ...a });
  for (const t of tasks) {
    for (const day of taskDays(t)) add(day, { kind: "task", name: t.name, className: t.category || "My task", task: t });
  }
  return map;
}

// ---- Alma's assignment popup, opened here (the Calendar page doesn't load it) ----

let detailsCssAdded = false;
function ensureAlmaPopupStyles() {
  if (detailsCssAdded) return;
  detailsCssAdded = true;
  const link = cEl("link");
  link.rel = "stylesheet";
  link.href = "/mod/student/assignments/details-modal.css";
  document.head.appendChild(link);
}

let calLocks = 0;
let calSavedOverflow = "";
function calLock() {
  if (calLocks++ === 0) {
    calSavedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}
function calUnlock() {
  if (calLocks > 0 && --calLocks === 0) document.body.style.overflow = calSavedOverflow;
}

// A popup window in Alma's style (dark header bar, close button). Returns {panel, body, close}.
function calPanel(title, extraClass = "") {
  const overlay = cEl("div", "alma-plus-cal-overlay");
  const panel = cEl("div", `alma-modal-base yui3-widget yui3-panel alma-plus-cal-panel ${extraClass}`);
  panel.setAttribute("role", "dialog");
  const content = cEl("div", "yui3-panel-content yui3-widget-stdmod");
  const hd = cEl("div", "yui3-widget-hd", title);
  const buttons = cEl("span", "yui3-widget-buttons");
  const closeBtn = cEl("button", "yui3-button yui3-button-close", "Close");
  closeBtn.type = "button";
  buttons.appendChild(closeBtn);
  hd.appendChild(buttons);
  const body = cEl("div", "yui3-widget-bd");
  content.append(hd, body);
  panel.appendChild(content);
  document.body.append(overlay, panel);
  calLock();
  const onKey = (e) => {
    if (e.key === "Escape" && !document.getElementById("alma-plus-photo") && !document.getElementById("alma-plus-message")) close();
  };
  const close = () => {
    overlay.remove();
    panel.remove();
    document.removeEventListener("keydown", onKey);
    calUnlock();
  };
  overlay.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  closeBtn.focus();
  return { panel, body, hd, close };
}

async function openAlmaAssignment(href) {
  ensureAlmaPopupStyles();
  // Same class as Alma's own popup, so My notes / Attached files (materials.js) join in.
  const { body, hd } = calPanel("One moment please…", "alma-student-assignment-details-modal");
  const loading = cEl("div", "alma-plus-details-loading");
  const spinner = cEl("i", "fa fa-spinner fa-spin fa-4x");
  spinner.setAttribute("aria-hidden", "true");
  loading.appendChild(spinner);
  body.appendChild(loading);
  try {
    const res = await fetch(href, { credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest" } });
    const data = await res.json();
    hd.firstChild.nodeValue = data?.Message?.header || "Assignment Details";
    // Alma's own popup content, from Alma's own server.
    body.innerHTML = data?.Message?.html || "";
    // Viewing only here: Alma's submit-work form needs Alma's own popup to work.
    body.querySelectorAll("form.submitted-files .add, form.submitted-files .buttons, form.submitted-files .delete").forEach((n) => n.remove());
  } catch {
    hd.firstChild.nodeValue = "Assignment Details";
    body.replaceChildren(cEl("p", "", "Couldn't load this assignment."));
  }
}

// ---- Day popup ----

function openDay(day, items, schoolEvents) {
  const date = new Date(day + "T00:00:00");
  const title = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const { body, close } = calPanel(title, "alma-plus-day-panel");

  const list = cEl("ul", "alma-plus-day-list");
  for (const ev of schoolEvents) {
    const li = cEl("li", "alma-plus-day-item");
    li.append(cEl("span", "alma-plus-day-swatch alma-plus-day-swatch-school"), cEl("span", "", ev));
    list.appendChild(li);
  }
  for (const item of items.filter((i) => i.kind === "official")) {
    const li = cEl("li", "alma-plus-day-item");
    const swatch = cEl("span", "alma-plus-day-swatch");
    swatch.style.background = item.color;
    const text = cEl("span");
    text.append(cEl("small", "", item.className), item.name);
    li.append(swatch, text);
    list.appendChild(li);
  }
  for (const item of items.filter((i) => i.kind !== "official")) {
    const li = cEl("li", "alma-plus-day-item");
    const swatch = cEl("span", "alma-plus-day-swatch");
    swatch.style.background = colorFor(item.className);
    const text = cEl("span");
    text.appendChild(cEl("small", "", item.kind === "task" ? `${item.className}${item.task.category ? " · My task" : ""}` : `${item.className}${item.category ? " · " + item.category : ""}`));
    const a = cEl("a", "", item.name);
    a.href = item.href || "#";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      close();
      if (item.kind === "task") {
        if (typeof openDetails === "function") openDetails(item.task);
      } else {
        openCalAssignment(item);
      }
    });
    text.appendChild(a);
    li.append(swatch, text);
    list.appendChild(li);
  }
  if (list.children.length) body.appendChild(list);
  else body.appendChild(cEl("p", "alma-plus-day-empty", "Nothing on this day."));

  const actions = cEl("div", "alma-plus-day-actions");
  const add = cEl("button", "pure-button pure-button-primary", "+ Add my own task");
  add.type = "button";
  add.addEventListener("click", () => {
    close();
    if (typeof openModal === "function") openModal(null, { due: day });
  });
  actions.appendChild(add);
  body.appendChild(actions);
}

// Opening an assignment: tell materials.js which one it is (for My notes /
// Attached files), then open Alma's popup content.
function openCalAssignment(item) {
  const id = item.href?.match(/\/home\/assignment\/([0-9a-f]+)/)?.[1];
  if (id && typeof lastClickedAssignmentId !== "undefined") lastClickedAssignmentId = id;
  openAlmaAssignment(item.href);
}

// ---- Drawing on Alma's page ----

function schoolEventsOn(cell) {
  const tip = cell.querySelector(".tooltip");
  if (!tip) return [];
  return [...tip.childNodes]
    .filter((n) => !(n.nodeType === 1 && n.classList?.contains("alma-plus-tip")))
    .map((n) => n.textContent.trim())
    // skip Alma's per-grade schedule entries ("Tuesday for ... Bell Schedule", "Day 1 for ...")
    .filter((t) => t && !/Bell Schedule|\bHR\b|^Day \d+ for /i.test(t));
}

function dayCells() {
  const cells = [];
  for (const table of document.querySelectorAll(".calendar-months table.cal[data-month]")) {
    const [y, m] = table.dataset.month.split("-").map(Number);
    for (const btn of table.querySelectorAll("td button")) {
      const dayNum = parseInt(btn.textContent, 10);
      if (!dayNum) continue;
      cells.push({ day: calIso(new Date(y, m - 1, dayNum)), td: btn.closest("td"), btn });
    }
  }
  return cells;
}

function drawDots(dayMap) {
  for (const { day, td, btn } of dayCells()) {
    td.querySelector(".alma-plus-dots")?.remove();
    td.querySelectorAll(".alma-plus-tip").forEach((n) => n.remove());
    const items = dayMap.get(day) || [];
    if (items.length) {
      const dots = cEl("i", "alma-plus-dots");
      const colors = [...new Set(items.map((i) => i.color || colorFor(i.className)))].slice(0, 3);
      for (const color of colors) {
        const dot = cEl("i", "alma-plus-dot");
        dot.style.background = color;
        dots.appendChild(dot);
      }
      btn.appendChild(dots);
      // Add them to the day's hover tooltip, under any school events.
      const tip = td.querySelector(".tooltip");
      if (tip) {
        for (const item of items.slice(0, 6)) tip.appendChild(cEl("div", "alma-plus-tip", item.kind === "official" ? item.name : `${item.className.match(/^P\d/)?.[0] || ""} ${item.name}`.trim()));
        if (items.length > 6) tip.appendChild(cEl("div", "alma-plus-tip", `+${items.length - 6} more`));
      }
    }
    if (!btn.dataset.almaPlusBound) {
      btn.dataset.almaPlusBound = "1";
      btn.addEventListener("click", () => openDay(day, currentDayMap.get(day) || [], schoolEventsOn(td)));
    }
  }
}

function drawEventList(assignments, tasks, official = []) {
  const list = document.querySelector(".event-list");
  if (!list) return;
  list.querySelectorAll(".alma-plus-ev").forEach((n) => n.remove());
  list.querySelectorAll(".event-list-month.alma-plus-month").forEach((n) => n.remove());

  // Only the school year's months shown on the page.
  const months = [...document.querySelectorAll(".calendar-months table.cal[data-month]")].map((t) => t.dataset.month.slice(0, 7));
  const entries = [];
  for (const o of official) entries.push({ day: o.start, end: o.end || "", label: o.name, className: o.catLabel, color: o.color, item: { kind: "official" } });
  // Assignments and tasks stay on the calendar (dots and day popup), not in this list.

  for (const month of months) {
    const here = entries.filter((e) => e.day.slice(0, 7) === month).sort((a, b) => a.day.localeCompare(b.day));
    if (!here.length) continue;
    let block = list.querySelector(`.event-list-month[data-month="${month}-01"]`);
    if (!block) {
      block = cEl("div", "event-list-month alma-plus-month");
      block.dataset.month = `${month}-01`;
      const monthName = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long" });
      block.append(cEl("h4", "screen-only", monthName), cEl("dl", "inline"));
      const later = [...list.querySelectorAll(".event-list-month[data-month]")].find((b) => b.dataset.month > `${month}-01`);
      if (later) later.before(block);
      else list.appendChild(block);
    }
    const dl = block.querySelector("dl") || block.appendChild(cEl("dl", "inline"));
    for (const e of here) {
      const dayNum = Number(e.day.slice(8));
      const dt = cEl("dt", "alma-plus-ev", !e.end ? String(dayNum)
        : e.end.slice(0, 7) === month ? `${dayNum}-${Number(e.end.slice(8))}`
        : `${Number(e.day.slice(5, 7))}/${dayNum}-${Number(e.end.slice(5, 7))}/${Number(e.end.slice(8))}`);
      const dd = cEl("dd", "alma-plus-ev");
      const span = cEl("span", "alma-plus-ev-item");
      span.style.setProperty("--alma-plus-ev-color", e.color || colorFor(e.className));
      if (e.item.kind === "official") {
        span.classList.add("alma-plus-ev-official");
        span.append(e.label);
        span.title = e.className;
        dd.appendChild(span);
        const laterDt = [...dl.querySelectorAll("dt")].find((d) => parseInt(d.textContent.replace(/\D+/g, " ").trim(), 10) > dayNum);
        if (laterDt) { dl.insertBefore(dt, laterDt); dl.insertBefore(dd, laterDt); } else { dl.append(dt, dd); }
        continue;
      }
      const a = cEl("a", "", e.label);
      a.href = e.item.href || "#";
      a.title = e.className;
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        if (e.item.kind === "task") openDetails?.(e.item.task);
        else openCalAssignment(e.item);
      });
      span.appendChild(a);
      dd.appendChild(span);
      // Keep the list in day order: insert before the first school event on a later day.
      const laterDt = [...dl.querySelectorAll("dt")].find((d) => parseInt(d.textContent.replace(/\D+/g, " ").trim(), 10) > dayNum);
      if (laterDt) {
        dl.insertBefore(dt, laterDt);
        dl.insertBefore(dd, laterDt);
      } else {
        dl.append(dt, dd);
      }
    }
    block.classList.remove("no-events");
  }
}

// The official calendar's color legend, at the top of the Events box.
function drawTitle() {
  if (typeof OFFICIAL_CALENDAR === "undefined" || document.querySelector(".alma-plus-cal-legend")) return;
  const list = document.querySelector(".event-list");
  const firstMonth = list?.querySelector(".event-list-month");
  if (!firstMonth) return;
  const legend = cEl("div", "alma-plus-cal-legend");
  for (const [key, c] of Object.entries(OFFICIAL_CALENDAR.categories)) {
    if (key === "info") continue;
    const item = cEl("span", "alma-plus-cal-legend-item");
    const sw = cEl("span", "alma-plus-day-swatch");
    sw.style.background = c.color;
    item.append(sw, c.label);
    legend.appendChild(item);
  }
  firstMonth.before(legend);
}

let currentDayMap = new Map();
let calRendering = false;

async function renderCalendar() {
  if (calRendering || !document.querySelector(".calendar-months")) return;
  calRendering = true;
  try {
    const settings = typeof loadSettings === "function" ? await loadSettings() : {};
    if (settings.calendar === false) {
      document.querySelectorAll(".alma-plus-dots, .alma-plus-tip, .alma-plus-ev, .alma-plus-month, .alma-plus-cal-legend").forEach((n) => n.remove());
      currentDayMap = new Map();
      return;
    }
    const [assignments, tasks] = await Promise.all([
      allAssignments().catch(() => []),
      settings.tasksTodo === false || typeof loadTasks !== "function" ? [] : loadTasks(),
    ]);
    drawTitle();
    const official = officialEvents();
    currentDayMap = buildDayMap(assignments, tasks, official);
    drawDots(currentDayMap);
    drawEventList(assignments, tasks, official);
  } finally {
    calRendering = false;
  }
}

function startCalendar() {
  if (!/^\/calendar/.test(location.pathname)) return;
  renderCalendar();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.almaPlusCustomTasks || changes.almaPlusSettings)) renderCalendar();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startCalendar);
} else {
  startCalendar();
}
