// Toolbar menu: feature switches saved to chrome.storage.local ("almaPlusSettings").
// The content scripts read the same settings (see DEFAULT_SETTINGS in alma-plus.js).

const SETTINGS_KEY = "almaPlusSettings";
const DEFAULT_SETTINGS = {
  tasksTodo: true,
  tasksClass: true,
  toolbarExtras: true,
  calendarButtons: true,
  attachments: true,
  clips: true,
  notes: true,
  dashboard: true,
  calendar: true,
  sidebarTabs: true,
  syncTasks: true,
};

async function loadSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
}

// Reload the Alma tab that's open, so changes show right away.
async function reloadAlmaTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && /^https:\/\/[^/]*getalma\.com\//.test(tab.url || "")) {
    await chrome.tabs.reload(tab.id);
    return true;
  }
  return false;
}

async function showStats() {
  const data = await chrome.storage.local.get(["almaPlusCustomTasks", "almaPlusMaterials"]);
  const tasks = (data.almaPlusCustomTasks || []).length;
  const files = Object.values(data.almaPlusMaterials || {}).reduce((n, list) => n + list.length, 0);
  const bytes = await chrome.storage.local.getBytesInUse(null);
  const size = bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  document.getElementById("stats").textContent =
    `${tasks} task${tasks === 1 ? "" : "s"} · ${files} attached file${files === 1 ? "" : "s"} · ${size}`;
}

function timeAgo(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} hr ago` : `${Math.round(hours / 24)} days ago`;
}

async function showSyncStatus() {
  const status = (await chrome.storage.local.get("almaPlusSyncStatus")).almaPlusSyncStatus;
  const el = document.getElementById("sync-status");
  el.className = "";
  if (!status) {
    el.textContent = "Not synced yet";
  } else if (status.ok) {
    el.textContent = `Synced ${status.count} task${status.count === 1 ? "" : "s"} ${timeAgo(status.time)}`;
    el.className = "ok";
  } else if (status.error === "not-installed") {
    el.textContent = "Alma Sync helper isn't set up on this Mac yet";
    el.className = "bad";
  } else {
    el.textContent = `Couldn't sync: ${status.error}`;
    el.className = "bad";
  }
}

async function start() {
  document.getElementById("version").textContent = `Version ${chrome.runtime.getManifest().version}`;
  const settings = await loadSettings();
  for (const input of document.querySelectorAll("input[data-setting]")) {
    input.checked = settings[input.dataset.setting] !== false;
    input.addEventListener("change", async () => {
      const current = await loadSettings();
      current[input.dataset.setting] = input.checked;
      await chrome.storage.local.set({ [SETTINGS_KEY]: current });
      const reloaded = await reloadAlmaTab();
      const saved = document.getElementById("saved");
      saved.textContent = reloaded ? "Saved. Alma reloaded with your changes." : "Saved. Open or reload Alma to see it.";
      saved.hidden = false;
    });
  }
  showStats();
  showSyncStatus();
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.almaPlusSyncStatus) showSyncStatus();
  });
  document.getElementById("sync-now").addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Syncing…";
    await chrome.runtime.sendMessage({ type: "sync-tasks-now" });
    e.target.disabled = false;
    e.target.textContent = "Sync now";
    showSyncStatus();
  });
}

start();
