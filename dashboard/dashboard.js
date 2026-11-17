// Today dashboard for Alma+ on Alma's Overview page (/home): "Due Today",
// "Due Tomorrow", and "Recently Updated Grades" side by side under the Schedule, as compact
// lists styled like the rows of Alma's To Do tables. Uses helpers from
// alma-plus.js (loadTasks, loadSettings, getClasses, findClass, openDetails).

const GRADES_CACHE_KEY = "almaPlusGradesCache";
const GRADES_CACHE_MINUTES = 15;
const NEW_GRADE_DAYS = 3;

function dEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// The day Alma's Overview is showing ("Monday, November 9, 2026"), or today.
function overviewDate() {
  const text = document.querySelector("form.date-picker label span")?.textContent.trim();
  const parsed = text ? new Date(text) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

function dayHeading(date) {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (isoDay(date) === isoDay(today)) return "Due Today";
  if (isoDay(date) === isoDay(tomorrow)) return "Due Tomorrow";
  return `Due ${date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`;
}

// ---- Data ----

// Alma's upcoming assignments, read from the To Do page.
async function almaUpcoming() {
  const html = await fetch("/home/assignments", { credentials: "same-origin" }).then((r) => (r.ok ? r.text() : ""));
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("table.upcoming-assignments tbody tr")].map((row) => {
    const ts = Number(row.cells[0]?.dataset.sortableVal);
    const link = row.querySelector("a[href*='/home/assignment/']");
    const classLink = row.querySelector("small a[href*='/home/class/']");
    if (!ts || !link) return null;
    return {
      day: isoDay(new Date(ts * 1000)),
      name: link.textContent.trim(),
      href: link.getAttribute("href"),
      className: classLink?.textContent.trim() || "",
      classHref: (classLink?.getAttribute("href") || "").split("?")[0],
    };
  }).filter(Boolean);
}

// Grades updated in the last few days, read from each class page. Cached for a
// few minutes so opening Overview stays quick.
async function recentGrades() {
  const cached = (await chrome.storage.local.get(GRADES_CACHE_KEY))[GRADES_CACHE_KEY];
  if (cached && Date.now() - cached.time < GRADES_CACHE_MINUTES * 60000) return cached.items;

  const classes = (await getClasses()).filter((c) => /^\/home\/class\//.test(c.url));
  const cutoff = Date.now() / 1000 - NEW_GRADE_DAYS * 86400;
  const items = [];
  await Promise.all(classes.map(async (c) => {
    const html = await fetch(c.url, { credentials: "same-origin" }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = doc.querySelector(".student-assignments table.assignment-grades");
    if (!table) return;
    const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim().toLowerCase());
    const gradeAt = heads.indexOf("grade");
    const updatedAt = heads.indexOf("updated");
    for (const row of table.querySelectorAll("tbody tr")) {
      const updated = Number(row.cells[updatedAt]?.dataset.sortableVal);
      const link = row.querySelector("td a[href*='/home/assignment/']");
      const gradeText = row.cells[gradeAt]?.textContent.replace(/\s+/g, " ").trim() || "";
      if (!link || !updated || updated < cutoff || !gradeText || /ungraded/i.test(gradeText)) continue;
      const letter = gradeText.match(/^[A-F][+-]?/)?.[0] || "";
      const percent = gradeText.match(/\(([\d.]+%)\)/)?.[1] || "";
      items.push({ name: link.textContent.trim(), href: link.getAttribute("href"), className: c.name, classHref: c.url, letter, percent, updated });
    }
  }));
  items.sort((a, b) => b.updated - a.updated);
  await chrome.storage.local.set({ [GRADES_CACHE_KEY]: { time: Date.now(), items } });
  return items;
}

function tasksOnDay(tasks, day) {
  return tasks.filter((t) => !t.completed && t.due <= day && (t.end && t.end > t.due ? t.end : t.due) >= day);
}

// ---- Compact lists in the same box style as Alma's Schedule cards ----

// One row: small bold class line over the name (like Alma's To Do rows), with an
// optional grade on the right.
function row({ classLine, title, href, onOpen, grade }) {
  const tr = dEl("li", "alma-plus-dash-item");
  const name = dEl("div", "alma-plus-dash-name");
  name.appendChild(dEl("small", "", classLine));
  const a = dEl("a", "", title);
  a.href = href || "#";
  // Same marker as Alma's own assignment links, so clicking opens Alma's popup.
  if (href && /\/home\/assignment\//.test(href)) a.dataset.almaModal = "StudentAssignmentDetailsModal";
  if (onOpen) {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      onOpen();
    });
  }
  name.appendChild(a);
  tr.appendChild(name);
  if (grade) {
    const g = dEl("div", "alma-plus-dash-grade");
    g.append(grade.letter || "");
    if (grade.percent) g.append(dEl("small", "", `(${grade.percent})`));
    tr.appendChild(g);
  }
  return tr;
}

function column(id, heading, rows, emptyText) {
  const col = dEl("div", "pure-u-1 pure-u-md-1-3");
  const box = dEl("div", "alma-plus-dash-col");
  box.id = id;
  box.appendChild(dEl("h4", "module-heading", heading));
  if (!rows.length) {
    box.appendChild(dEl("p", "alma-plus-dash-empty", emptyText));
  } else {
    const list = dEl("ul", "alma-plus-dash-list");
    rows.forEach((r) => list.appendChild(r));
    box.appendChild(list);
  }
  col.appendChild(box);
  return col;
}

function dueRows(day, alma, tasks) {
  const rows = alma.filter((x) => x.day === day).map((a) => row({ classLine: a.className, title: a.name, href: a.href }));
  for (const t of tasks) {
    const range = t.end && t.end > t.due ? ` · ${t.due.slice(5).replace("-", "/")}–${t.end.slice(5).replace("-", "/")}` : "";
    rows.push(row({
      classLine: `${t.category || "My task"}${t.category ? " · My task" : ""}${range}`,
      title: t.name,
      onOpen: () => typeof openDetails === "function" && openDetails(t),
    }));
  }
  return rows;
}

function gradeRows(grades) {
  const today = isoDay(new Date());
  const yesterday = isoDay(new Date(Date.now() - 86400000));
  return grades.slice(0, 8).map((g) => {
    const day = isoDay(new Date(g.updated * 1000));
    const when = day === today ? "today" : day === yesterday ? "yesterday"
      : new Date(g.updated * 1000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    return row({ classLine: `${g.className} · ${when}`, title: g.name, href: g.href, grade: g });
  });
}

// ---- Render ----

let dashRendering = false;
let dashRenderedFor = "";

async function renderDashboard() {
  const schedule = document.querySelector(".todays-classes:not(.alma-plus-dash-section)");
  const anchor = schedule || document.querySelector(".module-row") || document.querySelector("form.date-picker");
  if (!anchor || dashRendering) return;
  const date = overviewDate();
  const day = isoDay(date);
  const next = isoDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1));
  if (dashRenderedFor === day && document.getElementById("alma-plus-dashboard")) return;
  dashRendering = true;
  try {
    const settings = typeof loadSettings === "function" ? await loadSettings() : {};
    if (settings.dashboard === false) {
      document.getElementById("alma-plus-dashboard")?.remove();
      return;
    }
    const [alma, allTasks] = await Promise.all([
      almaUpcoming().catch(() => []),
      settings.tasksTodo === false || typeof loadTasks !== "function" ? [] : loadTasks(),
    ]);

    const dash = dEl("div", "pure-g alma-plus-dashboard");
    dash.id = "alma-plus-dashboard";
    const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const gradesSlot = column("alma-plus-dash-grades", "Recently Updated Grades", [], "Loading…");
    dash.append(
      column("alma-plus-dash-today", dayHeading(date), dueRows(day, alma, tasksOnDay(allTasks, day)), "Nothing due."),
      column("alma-plus-dash-tomorrow", dayHeading(nextDate), dueRows(next, alma, tasksOnDay(allTasks, next)), "Nothing due."),
      gradesSlot,
    );

    document.getElementById("alma-plus-dashboard")?.remove();
    anchor.after(dash);
    dashRenderedFor = day;

    recentGrades()
      .then((grades) => gradesSlot.replaceWith(column("alma-plus-dash-grades", "Recently Updated Grades", gradeRows(grades), `No grades updated in the last ${NEW_GRADE_DAYS} days.`)))
      .catch(() => gradesSlot.replaceWith(column("alma-plus-dash-grades", "Recently Updated Grades", [], "Couldn't load grades.")));
  } finally {
    dashRendering = false;
  }
}

function startDashboard() {
  if (!/^\/home\/?$/.test(location.pathname)) return;
  renderDashboard();
  // Alma's date arrows change the page; follow along.
  let timer = null;
  new MutationObserver((mutations) => {
    if (mutations.every((m) => m.target.closest?.("#alma-plus-dashboard, .yui3-panel, #alma-plus-details, #alma-plus-modal"))) return;
    clearTimeout(timer);
    timer = setTimeout(renderDashboard, 200);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  // Tasks changed (added, edited, done): redraw.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.almaPlusCustomTasks || changes.almaPlusSettings)) {
      dashRenderedFor = "";
      renderDashboard();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startDashboard);
} else {
  startDashboard();
}
