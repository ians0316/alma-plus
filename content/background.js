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

// ---- Night-before reminder ----
// A Chrome notification at the chosen time (8:00 PM by default) listing Alma
// assignments and your own tasks due tomorrow. Turned on and off in the settings menu.

const REMINDER_ALARM = "alma-plus-reminder";
const LAST_REMINDER_KEY = "almaPlusLastReminder";
const ORIGIN_KEY = "almaPlusOrigin";
const DEFAULT_ORIGIN = "https://seoulacademy.getalma.com";

async function reminderSettings() {
  const s = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  return { on: s.reminder !== false, time: /^\d\d:\d\d$/.test(s.reminderTime || "") ? s.reminderTime : "20:00" };
}

function nextReminderTime(time) {
  const [h, m] = time.split(":").map(Number);
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

async function scheduleReminder() {
  await chrome.alarms.clear(REMINDER_ALARM);
  const { on, time } = await reminderSettings();
  if (on) chrome.alarms.create(REMINDER_ALARM, { when: nextReminderTime(time), periodInMinutes: 24 * 60 });
}

function localDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

// Alma assignments due on `day`, read from the To Do page. Service workers have
// no DOMParser, so the rows are read with simple patterns.
async function almaDueOn(day, origin) {
  const res = await fetch(`${origin}/home/assignments`, { credentials: "include" });
  const html = res.ok ? await res.text() : "";
  const start = html.indexOf("upcoming-assignments");
  if (start < 0) return null; // not signed in, or Alma changed
  const table = html.slice(start, html.indexOf("</table>", start));
  const items = [];
  for (const row of table.split(/<tr[\s>]/).slice(1)) {
    const ts = Number((row.match(/data-sortable-val="(\d+)"/) || [])[1]);
    if (!ts || localDay(new Date(ts * 1000)) !== day) continue;
    const names = [...row.matchAll(/href="\/home\/assignment\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => decodeHtml(m[1].replace(/<[^>]+>/g, ""))).filter(Boolean);
    const cls = decodeHtml(((row.match(/href="\/home\/class\/[^"]*"[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "").replace(/<[^>]+>/g, ""));
    if (names[0]) items.push({ name: names[0], className: cls });
  }
  return items;
}

async function tasksDueOn(day) {
  const tasks = (await chrome.storage.local.get(TASKS_KEY))[TASKS_KEY] || [];
  return tasks
    .filter((t) => !t.completed && t.due && t.due <= day && (t.end && t.end > t.due ? t.end : t.due) >= day)
    .map((t) => ({ name: t.name, className: t.category || "My task" }));
}

// test = from the settings menu's "Test" button: always shows something, even if nothing is due.
async function sendReminder({ test = false } = {}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = localDay(tomorrow);
  if (!test && (await chrome.storage.local.get(LAST_REMINDER_KEY))[LAST_REMINDER_KEY] === day) return;

  const origin = (await chrome.storage.local.get(ORIGIN_KEY))[ORIGIN_KEY] || DEFAULT_ORIGIN;
  const alma = await almaDueOn(day, origin).catch(() => null);
  const items = [...(alma || []), ...(await tasksDueOn(day))];
  if (!test) await chrome.storage.local.set({ [LAST_REMINDER_KEY]: day });
  if (!items.length && !test) return;

  const when = tomorrow.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const lines = items.slice(0, 6).map((i) => `• ${i.name}${i.className ? ` (${i.className})` : ""}`);
  if (items.length > 6) lines.push(`and ${items.length - 6} more`);
  if (!items.length) lines.push("Nothing due tomorrow. Enjoy your night!");
  if (alma === null) lines.push("Sign in to Alma to include Alma assignments.");
  chrome.notifications.create(`alma-plus-reminder-${Date.now()}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("layout/icons/icon128.png"),
    title: items.length ? `${items.length} due tomorrow (${when})` : `Due tomorrow (${when})`,
    message: lines.join("\n"),
    priority: 1,
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== REMINDER_ALARM) return;
  // If the computer was asleep at reminder time, only remind if it's still the same evening.
  if (Date.now() - alarm.scheduledTime > 3 * 60 * 60 * 1000) return;
  sendReminder();
});

chrome.notifications.onClicked.addListener(async (id) => {
  if (!id.startsWith("alma-plus-reminder")) return;
  const origin = (await chrome.storage.local.get(ORIGIN_KEY))[ORIGIN_KEY] || DEFAULT_ORIGIN;
  chrome.tabs.create({ url: `${origin}/home/assignments` });
  chrome.notifications.clear(id);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[SETTINGS_KEY]) return;
  const before = changes[SETTINGS_KEY].oldValue || {};
  const after = changes[SETTINGS_KEY].newValue || {};
  if (before.reminder !== after.reminder || before.reminderTime !== after.reminderTime) scheduleReminder();
});

chrome.runtime.onInstalled.addListener(scheduleReminder);
chrome.runtime.onStartup.addListener(scheduleReminder);

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "test-reminder") {
    sendReminder({ test: true }).then(() => reply({ done: true }), (e) => reply({ error: String(e) }));
    return true;
  }
});
