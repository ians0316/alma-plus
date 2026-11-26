// Alma+ for Safari (iPad, iPhone, Mac Safari) through the free "Userscripts" app.
// Chrome extensions get chrome.* APIs; a userscript doesn't. This file gives the
// rest of Alma+ the few chrome.* parts it uses, built on what Safari has:
//   storage   -> Userscripts' GM storage (or this site's localStorage as a fallback)
//   alarms    -> checked whenever an Alma page is open, plus timers while it stays open
//   notifications -> a small Alma-style box in the corner of the page
// Everything stays in Safari on this device.

const __apStore = {};
const __apChangeListeners = [];
const __apGM = typeof GM !== "undefined" && GM && typeof GM.getValue === "function" ? GM : null;
const __apLS = "almaPlus:";

async function __apLoad() {
  if (__apGM) {
    for (const key of (await __apGM.listValues()) || []) {
      try {
        const raw = await __apGM.getValue(key);
        __apStore[key] = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch { /* skip unreadable value */ }
    }
  } else {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key.startsWith(__apLS)) continue;
      try { __apStore[key.slice(__apLS.length)] = JSON.parse(localStorage.getItem(key)); } catch { /* skip */ }
    }
  }
}

function __apClone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

async function __apPersist(key, value) {
  if (__apGM) {
    if (value === undefined) await __apGM.deleteValue(key);
    else await __apGM.setValue(key, JSON.stringify(value));
  } else if (value === undefined) {
    localStorage.removeItem(__apLS + key);
  } else {
    localStorage.setItem(__apLS + key, JSON.stringify(value));
  }
}

function __apFire(changes) {
  if (!Object.keys(changes).length) return;
  setTimeout(() => __apChangeListeners.forEach((fn) => { try { fn(changes, "local"); } catch (e) { console.error(e); } }), 0);
}

const __apLocal = {
  async get(keys) {
    let wanted;
    if (keys == null) wanted = Object.keys(__apStore).filter((k) => !k.startsWith("__"));
    else if (typeof keys === "string") wanted = [keys];
    else if (Array.isArray(keys)) wanted = keys;
    else wanted = Object.keys(keys);
    const out = {};
    for (const k of wanted) {
      if (k in __apStore) out[k] = __apClone(__apStore[k]);
      else if (keys && typeof keys === "object" && !Array.isArray(keys)) out[k] = keys[k];
    }
    return out;
  },
  async set(items) {
    const changes = {};
    for (const [k, v] of Object.entries(items)) {
      const oldValue = __apStore[k];
      __apStore[k] = __apClone(v);
      changes[k] = { oldValue: __apClone(oldValue), newValue: __apClone(v) };
      await __apPersist(k, __apStore[k]);
    }
    __apFire(changes);
  },
  async remove(keys) {
    const changes = {};
    for (const k of [].concat(keys)) {
      if (!(k in __apStore)) continue;
      changes[k] = { oldValue: __apClone(__apStore[k]) };
      delete __apStore[k];
      await __apPersist(k, undefined);
    }
    __apFire(changes);
  },
  async getBytesInUse(keys) {
    const data = await __apLocal.get(keys);
    return new Blob([JSON.stringify(data)]).size;
  },
};

// Another Alma tab changed something (localStorage fallback only).
window.addEventListener("storage", (e) => {
  if (!e.key?.startsWith(__apLS)) return;
  const k = e.key.slice(__apLS.length);
  const oldValue = __apStore[k];
  try { __apStore[k] = e.newValue == null ? undefined : JSON.parse(e.newValue); } catch { return; }
  if (__apStore[k] === undefined) delete __apStore[k];
  __apFire({ [k]: { oldValue, newValue: __apClone(__apStore[k]) } });
});

// ---- runtime / tabs ----
const __apMessageListeners = [];
const __apStartListeners = new Set(); // onInstalled + onStartup, each run once per page

const __apRuntime = {
  getURL: (path) => __AP_ASSETS[path] || "",
  getManifest: () => ({ version: __AP_VERSION }),
  sendMessage(msg) {
    return new Promise((resolve) => {
      let answered = false;
      const reply = (r) => { if (!answered) { answered = true; resolve(r); } };
      let async = false;
      for (const fn of __apMessageListeners) if (fn(msg, {}, reply) === true) async = true;
      if (!async) reply(undefined);
    });
  },
  // Notion & Google Calendar hand-off needs Alma Sync on a Mac.
  sendNativeMessage: () => Promise.reject(new Error("Specified native messaging host not found.")),
  onMessage: { addListener: (fn) => __apMessageListeners.push(fn) },
  onInstalled: { addListener: (fn) => __apStartListeners.add(fn) },
  onStartup: { addListener: (fn) => __apStartListeners.add(fn) },
};

const __apTabs = {
  query: async () => [{ id: 1, url: location.href }],
  reload: async () => location.reload(),
  create: async ({ url }) => { location.href = url; },
};

// ---- alarms: due ones fire when an Alma page opens; timers while it stays open ----
const __apAlarmListeners = [];
const __apAlarmTimers = {};
const ALARMS_KEY = "__alarms";

function __apAlarmTimer(alarm) {
  clearTimeout(__apAlarmTimers[alarm.name]);
  const wait = alarm.scheduledTime - Date.now();
  if (wait < 2 ** 31) __apAlarmTimers[alarm.name] = setTimeout(() => __apRunDueAlarms(), Math.max(0, wait) + 50);
}

async function __apSaveAlarms(alarms) {
  __apStore[ALARMS_KEY] = alarms;
  await __apPersist(ALARMS_KEY, alarms);
}

async function __apRunDueAlarms() {
  const alarms = __apStore[ALARMS_KEY] || {};
  const now = Date.now();
  for (const alarm of Object.values(alarms)) {
    if (alarm.scheduledTime > now) continue;
    const fired = { name: alarm.name, scheduledTime: alarm.scheduledTime, periodInMinutes: alarm.periodInMinutes };
    if (alarm.periodInMinutes) {
      const step = alarm.periodInMinutes * 60000;
      // the most recent missed time counts as "this" alarm, like Chrome after sleep
      const missed = Math.floor((now - alarm.scheduledTime) / step);
      fired.scheduledTime = alarm.scheduledTime + missed * step;
      alarm.scheduledTime = fired.scheduledTime + step;
      __apAlarmTimer(alarm);
    } else {
      delete alarms[alarm.name];
    }
    await __apSaveAlarms(alarms);
    __apAlarmListeners.forEach((fn) => { try { fn(fired); } catch (e) { console.error(e); } });
  }
}

const __apAlarms = {
  async create(name, info) {
    const alarms = __apStore[ALARMS_KEY] || {};
    const when = info.when || Date.now() + (info.delayInMinutes ?? info.periodInMinutes ?? 0) * 60000;
    const alarm = { name, scheduledTime: when, periodInMinutes: info.periodInMinutes };
    alarms[name] = alarm;
    await __apSaveAlarms(alarms);
    __apAlarmTimer(alarm);
  },
  async clear(name) {
    const alarms = __apStore[ALARMS_KEY] || {};
    clearTimeout(__apAlarmTimers[name]);
    const had = name in alarms;
    delete alarms[name];
    await __apSaveAlarms(alarms);
    return had;
  },
  async getAll() {
    return Object.values(__apStore[ALARMS_KEY] || {});
  },
  onAlarm: { addListener: (fn) => __apAlarmListeners.push(fn) },
};

// ---- notifications: an Alma-style box in the corner ----
const __apNoteClick = [];

function __apNotify(id, opts) {
  let stack = document.getElementById("alma-plus-notes-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "alma-plus-notes-stack";
    document.body.appendChild(stack);
  }
  const box = document.createElement("div");
  box.className = "alma-plus-note";
  box.dataset.id = id;
  box.setAttribute("role", "status");
  const icon = document.createElement("img");
  icon.src = opts.iconUrl || __AP_ASSETS["layout/icons/icon128.png"];
  icon.alt = "";
  const text = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = opts.title || "Alma+";
  const body = document.createElement("div");
  body.textContent = opts.message || "";
  text.append(title, body);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "alma-plus-note-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  close.addEventListener("click", (e) => { e.stopPropagation(); box.remove(); });
  box.append(icon, text, close);
  box.addEventListener("click", () => __apNoteClick.forEach((fn) => fn(id)));
  stack.prepend(box);
  setTimeout(() => box.remove(), 20000);
}

const __apNotifications = {
  create(id, opts) {
    if (typeof id === "object") { opts = id; id = `alma-plus-${Date.now()}`; }
    const show = () => __apNotify(id, opts);
    if (document.body) show();
    else document.addEventListener("DOMContentLoaded", show, { once: true });
    return Promise.resolve(id);
  },
  clear(id) {
    document.querySelectorAll(".alma-plus-note").forEach((n) => { if (n.dataset.id === id) n.remove(); });
    return Promise.resolve(true);
  },
  onClicked: { addListener: (fn) => __apNoteClick.push(fn) },
};

// eslint-disable-next-line no-unused-vars
const chrome = {
  storage: { local: __apLocal, onChanged: { addListener: (fn) => __apChangeListeners.push(fn) } },
  runtime: __apRuntime,
  tabs: __apTabs,
  alarms: __apAlarms,
  notifications: __apNotifications,
};
