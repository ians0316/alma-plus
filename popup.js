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
}

start();
