// Safari-only parts of Alma+ (see safari-shim.js):
// - an Alma+ button in Alma's top bar that opens the settings menu as a panel
//   (Chrome has a toolbar icon for it; Safari userscripts don't)
// - running background jobs (reminder, grade alerts) when an Alma page opens

function __apSettingsPanel() {
  if (document.getElementById("alma-plus-settings-panel")) return;
  const overlay = document.createElement("div");
  overlay.id = "alma-plus-settings-panel";
  const host = document.createElement("div");
  host.className = "alma-plus-settings-host";
  overlay.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${__AP_POPUP_CSS}</style><div class="ap-body">${__AP_POPUP_HTML}</div>`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ap-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  root.querySelector("header")?.appendChild(close);
  const shut = () => overlay.remove();
  close.addEventListener("click", shut);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) shut(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { shut(); document.removeEventListener("keydown", esc); }
  });
  document.body.appendChild(overlay);
  __AP_POPUP_JS(root);
}

function __apSettingsButton() {
  const menu = document.querySelector("#user-menu > ul.pure-menu-list");
  const bell = menu?.querySelector('a[href="/home/announcements"]')?.closest("li");
  if (!menu || menu.querySelector(".alma-plus-settings-btn")) return;
  const li = document.createElement("li");
  li.className = "pure-menu-item button alma-plus-settings-btn";
  const a = document.createElement("a");
  a.className = "pure-menu-link";
  a.href = "#";
  a.title = "Alma+ settings";
  a.setAttribute("aria-label", "Alma+ settings");
  const img = document.createElement("img");
  img.src = __AP_ASSETS["layout/icons/icon32.png"];
  img.alt = "";
  a.appendChild(img);
  a.addEventListener("click", (e) => {
    e.preventDefault();
    __apSettingsPanel();
  });
  li.appendChild(a);
  if (bell) bell.before(li);
  else menu.prepend(li);
}

async function __apStartBackground() {
  // background.js schedules its alarms on install/startup; then catch up on due ones.
  for (const fn of __apStartListeners) { try { await fn(); } catch (e) { console.error(e); } }
  await new Promise((r) => setTimeout(r, 1500));
  __apRunDueAlarms();
  for (const alarm of Object.values(__apStore[ALARMS_KEY] || {})) __apAlarmTimer(alarm);
}
