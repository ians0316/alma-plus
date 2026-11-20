// Sends your tasks to Alma Sync (tasks_bridge.py, a Chrome native messaging host)
// whenever they change, so they show up in Notion and Google Calendar.
// Setup on the Mac: alma_sync/install_task_bridge.sh (one time).

const HOST = "com.alma.sync.tasks";
const TASKS_KEY = "almaPlusCustomTasks";
const STATUS_KEY = "almaPlusSyncStatus";
const SETTINGS_KEY = "almaPlusSettings";

let timer = null;

async function syncEnabled() {
  const s = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  return s.syncTasks !== false;
}

async function sendTasks() {
  if (!(await syncEnabled())) return;
  const tasks = (await chrome.storage.local.get(TASKS_KEY))[TASKS_KEY] || [];
  let status;
  try {
    const reply = await chrome.runtime.sendNativeMessage(HOST, { type: "tasks", tasks });
    status = reply?.ok
      ? { ok: true, time: Date.now(), count: reply.count }
      : { ok: false, time: Date.now(), error: reply?.error || "No reply from Alma Sync" };
  } catch (e) {
    const notInstalled = /not found|forbidden|Specified native messaging host/i.test(String(e?.message || e));
    status = { ok: false, time: Date.now(), error: notInstalled ? "not-installed" : String(e?.message || e) };
  }
  await chrome.storage.local.set({ [STATUS_KEY]: status });
}

function scheduleSend(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(sendTasks, delay);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[TASKS_KEY]) scheduleSend();
  // Turning sync back on sends right away.
  if (changes[SETTINGS_KEY] && changes[SETTINGS_KEY].newValue?.syncTasks !== false &&
      changes[SETTINGS_KEY].oldValue?.syncTasks === false) scheduleSend(200);
});

chrome.runtime.onInstalled.addListener(() => scheduleSend(500));
chrome.runtime.onStartup.addListener(() => scheduleSend(3000));

// The settings menu's "Sync now" button.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "sync-tasks-now") {
    sendTasks().then(() => reply({ done: true }));
    return true;
  }
});
