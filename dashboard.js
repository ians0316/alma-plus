// Today dashboard for Alma+ on Alma's Overview page (/home): "Due Today",
// "Due Tomorrow", and "New Grades", built from the same card markup as Alma's
// Schedule cards so they look like part of the page. Uses helpers from
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

// "P3 Discussions" -> "P3"; "HS Advisory: Carmen" -> "HS".
function classCode(name) {
  return (name || "").match(/^(P\d+)\b/)?.[1] || (name || "").trim().split(/\s+/)[0]?.slice(0, 3) || "•";
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

// ---- Cards (same markup as Alma's Schedule cards) ----

function card({ code, headerText, title, href, onOpen, sub, subHref, grade }) {
  const li = dEl("li", "class pane alma-plus-dash-card");
  const header = dEl("div", "header");
  header.append(dEl("span", "sc-box", code), " ", dEl("span", "schedule-time", headerText));
  const content = dEl("div", "content");
  if (grade) {
    const g = dEl("a", "class-grade");
    if (href) g.href = href;
    g.append(grade.letter || "");
    if (grade.percent) g.append(" ", dEl("small", "dimmed percent", `(${grade.percent})`));
    content.appendChild(g);
  }
  const h5 = dEl("h5");
  const a = dEl("a", "", title);
  a.href = href || "#";
  if (onOpen) {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      onOpen();
    });
  }
  h5.appendChild(a);
  content.appendChild(h5);
  if (sub) {
    const line = dEl("span", "class-teacher");
    if (subHref) {
      const s = dEl("a", "", sub);
      s.href = subHref;
      line.appendChild(s);
    } else {
      line.textContent = sub;
    }
    content.appendChild(line);
  }
  li.append(header, content);
  return li;
}

function section(id, heading, cards, emptyText) {
  const wrap = dEl("div", "todays-classes alma-plus-dash-section");
  wrap.id = id;
  wrap.appendChild(dEl("h4", "module-heading", heading));
  if (!cards.length) {
    wrap.appendChild(dEl("p", "alma-plus-dash-empty", emptyText));
    return wrap;
  }
  const list = dEl("ol", "scrollpane pane-stack-sm pane-sm-1-2 pane-md-1-3");
  cards.forEach((c) => list.appendChild(c));
  wrap.appendChild(list);
  return wrap;
}

function dueCards(day, alma, tasks) {
  const cards = [];
  for (const a of alma.filter((x) => x.day === day)) {
    cards.push(card({ code: classCode(a.className), headerText: a.className, title: a.name, href: a.href }));
  }
  for (const t of tasks) {
    const range = t.end && t.end > t.due;
    cards.push(card({
      code: t.category ? classCode(t.category) : "•",
      headerText: t.category || "My task",
      title: t.name,
      onOpen: () => typeof openDetails === "function" && openDetails(t),
      sub: range ? `My task · ${t.due.slice(5).replace("-", "/")}–${t.end.slice(5).replace("-", "/")}` : "My task",
    }));
  }
  return cards;
}

function gradeCards(grades) {
  const today = isoDay(new Date());
  const yesterday = isoDay(new Date(Date.now() - 86400000));
  return grades.slice(0, 9).map((g) => {
    const day = isoDay(new Date(g.updated * 1000));
    const when = day === today ? "Updated today" : day === yesterday ? "Updated yesterday"
      : `Updated ${new Date(g.updated * 1000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
    return card({ code: classCode(g.className), headerText: when, title: g.name, href: g.href, sub: g.className, subHref: g.classHref, grade: g });
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

    const dash = dEl("div", "alma-plus-dashboard");
    dash.id = "alma-plus-dashboard";
    dash.append(
      section("alma-plus-dash-today", dayHeading(date), dueCards(day, alma, tasksOnDay(allTasks, day)), "Nothing due."),
      section("alma-plus-dash-tomorrow", dayHeading(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)),
        dueCards(next, alma, tasksOnDay(allTasks, next)), "Nothing due."),
    );
    const gradesSlot = dEl("div");
    gradesSlot.appendChild(section("alma-plus-dash-grades", "New Grades", [], "Loading…"));
    dash.appendChild(gradesSlot);

    document.getElementById("alma-plus-dashboard")?.remove();
    anchor.after(dash);
    dashRenderedFor = day;

    recentGrades()
      .then((grades) => gradesSlot.replaceChildren(section("alma-plus-dash-grades", "New Grades", gradeCards(grades), `No new grades in the last ${NEW_GRADE_DAYS} days.`)))
      .catch(() => gradesSlot.replaceChildren(section("alma-plus-dash-grades", "New Grades", [], "Couldn't load grades.")));
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
