// Extra sidebar tabs (Classes, Assignments, Attendance, Report Cards), after
// Directory and Calendar, linking to
// student pages Alma already has under Home. Built with Alma's own sidebar
// markup and icon sheet, so they look and highlight like the real tabs.

(async () => {
  const nav = document.querySelector("#nav > ul");
  const home = nav?.querySelector("li.nav-home");
  const last = nav?.querySelector("li.nav-calendar") || nav?.querySelector("li.nav-directory") || home;
  if (!home || nav.querySelector(".alma-plus-nav")) return;

  const stored = (await chrome.storage.local.get("almaPlusSettings")).almaPlusSettings || {};
  if (stored.sidebarTabs === false) return;

  const path = location.pathname;
  const tabs = [
    { cls: "nav-classes", label: "Classes", href: "/home/schedule", active: /^\/home\/(schedule|class\/)/ },
    { cls: "nav-alma-plus-assignments", label: "Assignments", href: "/home/assignments", active: /^\/home\/assignments/ },
    { cls: "nav-attendance", label: "Attendance", href: "/home/attendance", active: /^\/home\/attendance/ },
    { cls: "nav-reportcards", label: "Report Cards", href: "/home/report-cards", active: /^\/home\/report-cards/ },
  ];

  let after = last;
  for (const t of tabs) {
    const li = document.createElement("li");
    li.className = `${t.cls} alma-plus-nav`;
    const a = document.createElement("a");
    a.href = t.href;
    a.append(document.createElement("i"));
    const span = document.createElement("span");
    span.textContent = t.label;
    a.append(span);
    li.append(a);
    if (t.active.test(path)) {
      li.classList.add("nav-active");
      home.classList.remove("nav-active");
    }
    after.after(li);
    after = li;
  }
})();

// Extra small tabs in the row under the page title (Overview · To Do · Classes ·
// Attendance · Report Cards): Announcements, My Info, Calendar, Directory. The
// Announcements and My Info pages don't have the row, so it's added there too.
(async () => {
  const stored = (await chrome.storage.local.get("almaPlusSettings")).almaPlusSettings || {};
  if (stored.sidebarTabs === false) return;
  const content = document.getElementById("content");
  if (!content || document.querySelector(".alma-plus-subtab")) return;

  const path = location.pathname;
  const base = [
    ["Overview", "/home"], ["To Do", "/home/assignments"], ["Classes", "/home/schedule"],
    ["Attendance", "/home/attendance"], ["Report Cards", "/home/report-cards"],
  ];
  const extra = [
    ["Announcements", "/home/announcements"], ["My Info", "/home/bio"],
    ["Calendar", "/calendar"], ["Directory", "/directory"],
  ];
  const item = ([label, href], mine) => {
    const li = document.createElement("li");
    li.className = "pure-menu-item" + (mine ? " alma-plus-subtab" : "") + (path === href ? " pure-menu-selected" : "");
    const a = document.createElement("a");
    a.className = "pure-menu-link";
    a.href = href;
    a.textContent = label;
    li.append(a);
    return li;
  };

  let list = [...document.querySelectorAll(".sc-tabmenu .pure-menu-list")]
    .find((ul) => ul.querySelector('a[href="/home/report-cards"]'));
  if (!list) {
    if (!/^\/home\/(announcements|bio)\/?$/.test(path)) return;
    const menu = document.createElement("div");
    menu.className = "sc-tabmenu pure-menu pure-menu-horizontal";
    list = document.createElement("ul");
    list.className = "pure-menu-list";
    for (const t of base) list.append(item(t, false));
    menu.append(list);
    content.prepend(menu);
  }
  for (const t of extra) list.append(item(t, true));
})();
