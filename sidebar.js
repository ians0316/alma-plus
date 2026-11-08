// Extra sidebar tabs (Assignments, Classes, Attendance, Report Cards) linking to
// student pages Alma already has under Home. Built with Alma's own sidebar
// markup and icon sheet, so they look and highlight like the real tabs.

(async () => {
  const nav = document.querySelector("#nav > ul");
  const home = nav?.querySelector("li.nav-home");
  if (!home || nav.querySelector(".alma-plus-nav")) return;

  const stored = (await chrome.storage.local.get("almaPlusSettings")).almaPlusSettings || {};
  if (stored.sidebarTabs === false) return;

  const path = location.pathname;
  const tabs = [
    { cls: "nav-alma-plus-assignments", label: "Assignments", href: "/home/assignments", active: /^\/home\/assignments/ },
    { cls: "nav-classes", label: "Classes", href: "/home/schedule", active: /^\/home\/(schedule|class\/)/ },
    { cls: "nav-attendance", label: "Attendance", href: "/home/attendance", active: /^\/home\/attendance/ },
    { cls: "nav-reportcards", label: "Report Cards", href: "/home/report-cards", active: /^\/home\/report-cards/ },
  ];

  let after = home;
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
