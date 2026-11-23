// Class tabs on a class page, like the teacher version of Alma:
// dashboard · bulletin · attendance · gradebook.
// Only tabs a student can use. Teacher-only ones (roster, curriculum,
// recommendations, settings, admin panel) are left out because Alma sends
// students back to Home from them.
//
// dashboard   = Alma's own class page, unchanged (default)
// bulletin    = Alma's class announcements page
// attendance  = your attendance for this class only (from Alma's Attendance list)
// gradebook   = every assignment as a column, each score as a colored box,
//               plus a grade calculator under it

(() => {
  const TABS = [
    ["dashboard", "Dashboard"],
    ["bulletin", "Bulletin"],
    ["attendance", "Attendance"],
    ["gradebook", "Gradebook"],
  ];

  const path = location.pathname;
  const onAnnouncements = path.startsWith("/home/class-announcements/");
  const classId = (path.match(/\/home\/class(?:-announcements)?\/([0-9a-f]+)/) || [])[1];
  if (!classId) return;

  const classUrl = `/home/class/${classId}`;
  const bulletinUrl = `/home/class-announcements/${classId}`;

  function className() {
    return document.querySelector("header.class-header h3")?.textContent.trim() || "";
  }

  // ---- Tab row (Alma's own submenu classes, like Attendance's List / Year / Week) ----

  function buildTabs(active) {
    const wrap = document.createElement("div");
    wrap.className = "submenu pure-menu pure-menu-horizontal segmented-control-sm alma-plus-class-tabs";
    const ul = document.createElement("ul");
    ul.className = "pure-menu-list";
    for (const [key, label] of TABS) {
      const li = document.createElement("li");
      li.className = "pure-menu-item" + (key === active ? " pure-menu-selected" : "");
      const a = document.createElement("a");
      a.className = "pure-menu-link";
      a.textContent = label;
      a.dataset.view = key;
      if (key === "bulletin") a.href = bulletinUrl;
      else if (onAnnouncements) a.href = classUrl + (key === "dashboard" ? "" : "#" + key);
      else {
        a.href = key === "dashboard" ? location.pathname + location.search : "#" + key;
        a.addEventListener("click", (e) => {
          e.preventDefault();
          history.replaceState(null, "", key === "dashboard" ? location.pathname + location.search : "#" + key);
          show(key);
        });
      }
      li.appendChild(a);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
    return wrap;
  }

  function placeTabs(active) {
    if (document.querySelector(".alma-plus-class-tabs")) return;
    const header = document.querySelector("header.class-header");
    if (!header) return;
    header.after(buildTabs(active));
  }

  function markActive(view) {
    document.querySelectorAll(".alma-plus-class-tabs li").forEach((li) => {
      li.classList.toggle("pure-menu-selected", li.querySelector("a").dataset.view === view);
    });
  }

  // ---- Switching views on the class page ----

  function section() {
    return document.querySelector("#content > section");
  }

  function show(view) {
    const sec = section();
    if (!sec) return;
    markActive(view);
    sec.dataset.almaPlusView = view;
    if (view === "gradebook") renderGradebook();
    if (view === "attendance") renderAttendance();
  }

  function panel(id) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.className = "alma-plus-class-panel";
      section().appendChild(el);
    }
    return el;
  }

  // ---- Gradebook ----

  function readAssignments() {
    const rows = [];
    const add = (tr, upcoming) => {
      const link = tr.querySelector("td.name a");
      if (!link) return;
      const due = Number(tr.querySelector("td.due")?.dataset.sortableVal) || 0;
      const category = tr.querySelector("td.name small")?.textContent.trim() || "";
      const gradeCell = tr.querySelector("td.grade");
      let letter = "", percent = null, text = "";
      if (gradeCell) {
        letter = [...gradeCell.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent).join("").trim();
        const m = (gradeCell.querySelector(".percent")?.textContent || "").match(/([\d.]+)\s*%/);
        if (m) percent = parseFloat(m[1]);
        text = gradeCell.textContent.replace(/\s+/g, " ").trim();
      }
      rows.push({ link, due, category, name: link.textContent.trim(), letter, percent, text, upcoming });
    };
    document.querySelectorAll("table.assignment-grades tbody tr").forEach((tr) => add(tr, false));
    document.querySelectorAll("table.upcoming-assignments tbody tr:not([data-alma-plus-row])").forEach((tr) => add(tr, true));
    return rows.sort((a, b) => a.due - b.due);
  }

  function readCategories() {
    return [...document.querySelectorAll(".category-totals .category-total")].map((el) => ({
      name: el.querySelector(".name")?.textContent.trim() || "",
      weight: el.querySelector(".weight")?.textContent.trim() || "",
      score: el.querySelector(".score")?.textContent.replace(/\s+/g, " ").trim() || "",
    }));
  }

  function level(a) {
    const l = (a.letter || "").toUpperCase()[0];
    if (l === "A") return 4;
    if (l === "B") return 3;
    if (l === "C") return 2;
    if (l === "D" || l === "F") return 1;
    if (a.percent !== null) return a.percent >= 90 ? 4 : a.percent >= 80 ? 3 : a.percent >= 70 ? 2 : 1;
    return 0;
  }

  function dateLabel(sec) {
    if (!sec) return "";
    const d = new Date(sec * 1000);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  let gbFilter = "";
  let gbColors = true;

  function renderGradebook() {
    const box = panel("alma-plus-gradebook");
    const all = readAssignments();
    const cats = readCategories();
    const catNames = [...new Set([...cats.map((c) => c.name), ...all.map((a) => a.category)])].filter(Boolean);
    const shown = gbFilter ? all.filter((a) => a.category === gbFilter) : all;
    const rowCats = gbFilter ? [gbFilter] : catNames;

    box.replaceChildren();

    const head = document.createElement("div");
    head.className = "alma-plus-gb-head";
    const h = document.createElement("h4");
    h.className = "page-heading";
    h.textContent = "Gradebook";
    head.appendChild(h);

    const tools = document.createElement("div");
    tools.className = "alma-plus-gb-tools pure-form";

    const colorLabel = document.createElement("label");
    const colorBox = document.createElement("input");
    colorBox.type = "checkbox";
    colorBox.checked = gbColors;
    colorBox.addEventListener("change", () => { gbColors = colorBox.checked; renderGradebook(); });
    colorLabel.append(colorBox, " Show Level Colors");

    const select = document.createElement("select");
    select.append(new Option("All Assignments", ""));
    catNames.forEach((c) => select.append(new Option(c, c)));
    select.value = gbFilter;
    select.addEventListener("change", () => { gbFilter = select.value; renderGradebook(); });

    tools.append(colorLabel, select);
    if (typeof openModal === "function") {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "pure-button pure-button-primary alma-plus-gb-add";
      addBtn.textContent = "Add Assignment";
      addBtn.title = "Add your own task to this class";
      addBtn.addEventListener("click", () => openModal());
      tools.appendChild(addBtn);
    }
    head.appendChild(tools);
    box.appendChild(head);

    if (!shown.length) {
      const empty = document.createElement("p");
      empty.className = "dimmed";
      empty.textContent = "No assignments in this class yet.";
      box.appendChild(empty);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "alma-plus-gb-scroll";
    const table = document.createElement("table");
    table.className = "pure-table alma-plus-gb" + (gbColors ? " alma-plus-gb-colors" : "");

    // header: one column per assignment
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "alma-plus-gb-corner";
    corner.textContent = className();
    hr.appendChild(corner);
    for (const a of shown) {
      const th = document.createElement("th");
      th.className = "alma-plus-gb-col" + (a.upcoming ? " alma-plus-gb-upcoming" : "");
      th.title = `${a.category ? a.category + ": " : ""}${a.name}${a.due ? " (due " + dateLabel(a.due) + ")" : ""}`;
      const date = document.createElement("div");
      date.className = "alma-plus-gb-date";
      date.textContent = dateLabel(a.due);
      const vert = document.createElement("div");
      vert.className = "alma-plus-gb-vert";
      const cat = document.createElement("small");
      cat.textContent = a.category;
      const nm = document.createElement("span");
      nm.textContent = a.name;
      vert.append(cat, nm);
      th.append(date, vert);
      th.addEventListener("click", () => a.link.click());
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    // overall row: Alma's in-progress grade, and a check for each graded assignment
    const overall = document.createElement("tr");
    overall.className = "alma-plus-gb-overall";
    const oth = document.createElement("th");
    const grade = document.querySelector(".current-grade .grade");
    const oLabel = document.createElement("span");
    oLabel.textContent = "Overall Class Grade";
    const oVal = document.createElement("strong");
    if (grade) {
      // the grade box also holds Alma's "categories" toggle button; skip it
      const letter = [...grade.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent).join("").trim();
      const pct = grade.querySelector(".percent")?.textContent.trim() || "";
      oVal.textContent = [letter, pct].filter(Boolean).join(" ");
    }
    oth.append(oLabel, oVal);
    overall.appendChild(oth);
    for (const a of shown) {
      const td = document.createElement("td");
      if (level(a)) {
        const i = document.createElement("i");
        i.className = "fa fa-check green";
        td.appendChild(i);
      }
      overall.appendChild(td);
    }
    tbody.appendChild(overall);

    // one row per category, the score sits in its category's row
    for (const catName of rowCats) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      const info = cats.find((c) => c.name === catName);
      const n = document.createElement("span");
      n.textContent = catName;
      th.appendChild(n);
      if (info) {
        const s = document.createElement("small");
        s.className = "dimmed";
        s.textContent = [info.score, info.weight].filter(Boolean).join(" · ");
        th.appendChild(s);
      }
      tr.appendChild(th);
      for (const a of shown) {
        const td = document.createElement("td");
        if (a.category === catName) {
          const lv = level(a);
          const cell = document.createElement("button");
          cell.type = "button";
          cell.className = "alma-plus-gb-score" + (lv ? ` alma-plus-gb-l${lv}` : " alma-plus-gb-none");
          cell.title = `${a.name}: ${a.text || "not graded yet"}`;
          if (lv) {
            const L = document.createElement("span");
            L.textContent = a.letter || "";
            cell.appendChild(L);
            if (a.percent !== null) {
              const p = document.createElement("small");
              p.textContent = `(${a.percent}%)`;
              cell.appendChild(p);
            }
          } else {
            cell.textContent = "-";
          }
          cell.addEventListener("click", () => a.link.click());
          td.appendChild(cell);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    box.appendChild(wrap);
    renderCalculator(box);
  }

  // ---- Grade calculator (under the Gradebook) ----
  // Alma's class grade = each category's score times its weight ("25% of Final
  // Grade"), divided by the total weight of categories that have grades. A
  // category's score is points earned / points possible. So for the next
  // assignment (its category and points), we can work out the score needed for a
  // target grade, or the grade a given score would give.

  let calcCat = null;
  let calcPoints = 100;
  let calcTarget = null;
  let calcCustom = 90;
  let calcIf = "";

  function gradeModel() {
    const cats = readCategories().map((c) => ({
      name: c.name,
      weight: parseFloat((c.weight.match(/([\d.]+)\s*%/) || [])[1]) || 0,
      pct: (() => { const m = c.score.match(/\(([\d.]+)%\)/); return m ? parseFloat(m[1]) : null; })(),
      possible: 0,
    }));
    const key = (n) => n.trim().toLowerCase();
    let earnedAll = 0, possibleAll = 0;
    for (const tr of document.querySelectorAll("table.assignment-grades tbody tr")) {
      const m = (tr.querySelector("td.points")?.textContent || "").match(/([\d.]+)\s*\/\s*([\d.]+)/);
      if (!m) continue;
      const earned = parseFloat(m[1]), possible = parseFloat(m[2]);
      earnedAll += earned;
      possibleAll += possible;
      const cat = cats.find((c) => key(c.name) === key(tr.querySelector("td.name small")?.textContent || ""));
      if (cat) cat.possible += possible;
    }
    const weighted = cats.length > 0 && cats.every((c) => c.weight > 0);
    return { cats, weighted, earnedAll, possibleAll };
  }

  // Grade with the next assignment scored `score` out of `points` in category `catName`.
  function gradeWith(model, catName, points, score) {
    if (!model.weighted) return ((model.earnedAll + score) / (model.possibleAll + points)) * 100;
    let sum = 0, total = 0;
    for (const c of model.cats) {
      if (c.name === catName) {
        const earned = c.pct !== null ? (c.pct / 100) * c.possible : 0;
        const possible = c.pct !== null ? c.possible : 0;
        sum += c.weight * ((earned + score) / (possible + points)) * 100;
        total += c.weight;
      } else if (c.pct !== null) {
        sum += c.weight * c.pct;
        total += c.weight;
      }
    }
    return total ? sum / total : 0;
  }

  // Score needed out of `points` to reach `target` %. The grade goes up in a
  // straight line with the score, so two points on the line give the answer.
  function scoreNeeded(model, catName, points, target) {
    const at0 = gradeWith(model, catName, points, 0);
    const atFull = gradeWith(model, catName, points, points);
    if (atFull === at0) return null;
    return ((target - at0) / (atFull - at0)) * points;
  }

  // Letter cutoffs. If Alma shows any + or - grades in this class, use the usual
  // +/- scale; otherwise plain A 90 / B 80 / C 70 / D 60.
  function letterScale() {
    const letters = [...document.querySelectorAll("table.assignment-grades td.grade, .current-grade .grade")]
      .map((td) => [...td.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("").trim());
    const plusMinus = letters.some((l) => /^[A-D][+-]$/.test(l));
    return plusMinus
      ? [["A", 93], ["A-", 90], ["B+", 87], ["B", 83], ["B-", 80], ["C+", 77], ["C", 73], ["C-", 70], ["D+", 67], ["D", 63], ["D-", 60]]
      : [["A", 90], ["B", 80], ["C", 70], ["D", 60]];
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function renderCalculator(box) {
    const model = gradeModel();
    if (!model.weighted && !model.possibleAll) return;
    const cats = model.weighted ? model.cats : [];
    if (!calcCat || !cats.some((c) => c.name === calcCat)) {
      calcCat = cats.slice().sort((a, b) => b.weight - a.weight)[0]?.name || "";
    }
    const scale = letterScale();
    if (calcTarget === null) calcTarget = scale[0][0];

    const wrap = document.createElement("div");
    wrap.className = "alma-plus-calc";
    const h = document.createElement("h4");
    h.className = "module-heading";
    h.textContent = "Grade Calculator";
    wrap.appendChild(h);

    const form = document.createElement("div");
    form.className = "pure-form alma-plus-calc-form";
    const field = (label, control) => {
      const l = document.createElement("label");
      const span = document.createElement("span");
      span.textContent = label;
      l.append(span, control);
      form.appendChild(l);
      return control;
    };

    if (cats.length) {
      const sel = document.createElement("select");
      cats.forEach((c) => sel.append(new Option(`${c.name} (${c.weight}%)`, c.name)));
      sel.value = calcCat;
      sel.addEventListener("change", () => { calcCat = sel.value; update(); });
      field("Next assignment's category", sel);
    }

    const pts = document.createElement("input");
    pts.type = "number";
    pts.min = "1";
    pts.step = "any";
    pts.value = calcPoints;
    pts.addEventListener("input", () => { calcPoints = parseFloat(pts.value) || 0; update(); });
    field("Out of (points)", pts);

    const target = document.createElement("select");
    scale.forEach(([l, cut]) => target.append(new Option(`${l} (${cut}%)`, l)));
    target.append(new Option("Custom %", "custom"));
    target.value = calcTarget;
    const custom = document.createElement("input");
    custom.type = "number";
    custom.step = "any";
    custom.value = calcCustom;
    custom.className = "alma-plus-calc-custom";
    const targetWrap = document.createElement("span");
    targetWrap.className = "alma-plus-calc-target";
    targetWrap.append(target, custom);
    target.addEventListener("change", () => { calcTarget = target.value; update(); });
    custom.addEventListener("input", () => { calcCustom = parseFloat(custom.value) || 0; update(); });
    field("Grade I want", targetWrap);

    const ifInput = document.createElement("input");
    ifInput.type = "number";
    ifInput.step = "any";
    ifInput.placeholder = "score";
    ifInput.value = calcIf;
    ifInput.addEventListener("input", () => { calcIf = ifInput.value; update(); });
    field("What if I get", ifInput);

    wrap.appendChild(form);
    const need = document.createElement("p");
    need.className = "alma-plus-calc-result";
    const ifResult = document.createElement("p");
    ifResult.className = "alma-plus-calc-result";
    const note = document.createElement("p");
    note.className = "dimmed alma-plus-calc-note";
    note.textContent = model.weighted
      ? "Uses this class's category weights and points, the same way Alma works out your grade. It's an estimate, so check with your teacher."
      : "This class has no category weights, so this uses total points. It's an estimate, so check with your teacher.";
    wrap.append(need, ifResult, note);
    box.appendChild(wrap);

    function letterFor(pct) {
      return (scale.find(([, cut]) => pct >= cut) || ["F"])[0];
    }

    function update() {
      custom.hidden = calcTarget !== "custom";
      const goal = calcTarget === "custom" ? calcCustom : (scale.find(([l]) => l === calcTarget) || [, 90])[1];
      const p = calcPoints;
      need.replaceChildren();
      ifResult.replaceChildren();
      if (!(p > 0)) {
        need.textContent = "Enter how many points the assignment is out of.";
        return;
      }
      const x = scoreNeeded(model, calcCat, p, goal);
      const goalText = calcTarget === "custom" ? `${goal}%` : `${calcTarget} (${goal}%)`;
      const strong = (t) => { const b = document.createElement("strong"); b.textContent = t; return b; };
      if (x === null) {
        need.textContent = "This assignment won't change your grade.";
      } else if (x <= 0) {
        need.append("You'll keep ", strong(goalText), " even with a 0.");
      } else if (x > p) {
        need.append("You'd need ", strong(`${round1(x)}/${p} (${round1((x / p) * 100)}%)`), ` to get ${goalText}, so it isn't reachable with this assignment alone.`);
      } else {
        need.append("You need at least ", strong(`${round1(x)}/${p} (${round1((x / p) * 100)}%)`), ` to get ${goalText}.`);
      }
      const y = parseFloat(calcIf);
      if (calcIf !== "" && !Number.isNaN(y)) {
        const g = gradeWith(model, calcCat, p, y);
        ifResult.append(`With ${y}/${p}, your grade would be `, strong(`${letterFor(g)} (${round1(g)}%)`), ".");
      }
    }
    update();
  }

  // ---- Attendance for this class ----

  let attendanceLoaded = false;

  async function renderAttendance() {
    const box = panel("alma-plus-class-attendance");
    if (attendanceLoaded) return;
    box.replaceChildren();

    const h = document.createElement("h4");
    h.className = "page-heading";
    h.textContent = "Attendance";
    box.appendChild(h);
    const status = document.createElement("p");
    status.className = "dimmed";
    status.textContent = "Loading…";
    box.appendChild(status);

    let doc;
    try {
      // Alma fills the Attendance list with this JSON call ({ Message: { html } })
      const res = await fetch("/home/attendance?view=list&load=1", {
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const json = await res.json();
      doc = new DOMParser().parseFromString(json?.Message?.html || "", "text/html");
    } catch {
      status.textContent = "Couldn't load attendance. Try again later.";
      return;
    }

    const name = className();
    const records = [];
    for (const tr of doc.querySelectorAll("table.attendance tr[data-row]")) {
      const span = [...tr.querySelectorAll("td.class-attendance .attendance-status")].find((s) => {
        const tip = (s.querySelector(".tooltip")?.textContent || "").replace(/\s+/g, " ");
        return tip.includes(": " + name + " (") || tip.trim().endsWith(": " + name);
      });
      if (!span) continue;
      const tipText = (span.querySelector(".tooltip")?.textContent || "").replace(/\s+/g, " ");
      const time = (tipText.match(/\d{1,2}(?::\d\d)?\s*(?:[ap]m)?\s*-\s*\d{1,2}(?::\d\d)?\s*[ap]m/i) || [""])[0];
      const kind = [...span.classList].find((c) => c.startsWith("attendance-") && c !== "attendance-status") || "";
      records.push({
        date: tr.querySelector("td")?.textContent.trim() || "",
        day: tr.querySelector("td.wide-only")?.textContent.trim() || "",
        kind,
        time,
        label: labelFor(kind, span),
      });
    }

    status.remove();
    attendanceLoaded = true;

    if (!records.length) {
      const p = document.createElement("p");
      p.className = "dimmed";
      p.textContent = "No attendance for this class yet.";
      box.appendChild(p);
      return;
    }

    // counts, in a box like Alma's "Days This Year"
    const counts = {};
    records.forEach((r) => { counts[r.label] = (counts[r.label] || 0) + 1; });
    const sum = document.createElement("div");
    sum.className = "alma-plus-att-summary";
    for (const [label, n] of Object.entries(counts)) {
      const item = document.createElement("span");
      const b = document.createElement("strong");
      b.textContent = n;
      item.append(b, " " + label);
      sum.appendChild(item);
    }
    box.appendChild(sum);

    const table = document.createElement("table");
    table.className = "attendance pure-table alma-plus-att-table";
    table.innerHTML = "<thead><tr><th class='snug'>Date</th><th class='snug'>Day</th><th class='snug'>Time</th><th>Class Attendance</th></tr></thead>";
    const tbody = document.createElement("tbody");
    records.forEach((r, i) => {
      const tr = document.createElement("tr");
      if (i % 2 === 0) tr.className = "pure-table-odd";
      const cells = [r.date, r.day, r.time];
      for (const c of cells) {
        const td = document.createElement("td");
        td.textContent = c;
        tr.appendChild(td);
      }
      const td = document.createElement("td");
      const s = document.createElement("span");
      s.className = `attendance-status ${r.kind}`;
      s.textContent = r.label;
      td.appendChild(s);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
  }

  function labelFor(kind, span) {
    const tip = (span.querySelector(".tooltip")?.textContent || "").replace(/\s+/g, " ").trim();
    // tooltip ends with e.g. "P: Present", "Not Taken", "AE: Absent (Excused)"
    const m = tip.match(/(?:\b[A-Z]{1,3}:\s*)?([A-Z][A-Za-z]+(?: [A-Za-z()]+)*)$/);
    if (m) return m[1];
    return kind.replace("attendance-", "").replace(/^\w/, (c) => c.toUpperCase());
  }

  // ---- Start ----

  // ---- Time in the Updated column ----
  // Alma's Past Assignments table shows only the date a grade was updated
  // ("11/23/26"). The cell already holds the exact time, so show it under the date.
  function addUpdatedTimes() {
    document.querySelectorAll("table.assignment-grades td.updated").forEach((td) => {
      const sec = Number(td.dataset.sortableVal);
      if (!sec || td.querySelector(".alma-plus-updated-time")) return;
      const t = document.createElement("small");
      t.className = "alma-plus-updated-time";
      t.textContent = new Date(sec * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      td.appendChild(t);
    });
  }

  function init() {
    addUpdatedTimes();
    if (onAnnouncements) {
      placeTabs("bulletin");
      return;
    }
    const view = (location.hash.slice(1) || "dashboard");
    const valid = TABS.some(([k]) => k === view) && view !== "bulletin" ? view : "dashboard";
    placeTabs(valid);
    show(valid);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
