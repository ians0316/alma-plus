// Attached files for Alma+: links, files, and photos attached to Alma assignments
// and to your own tasks. Everything happens in the assignment/task popup, in an
// "Attached files" section built like Alma's own "Submitted work" section. Rows
// with attachments get a paperclip with a count, everywhere in Alma.
// Stored in chrome.storage.local, in this browser only.

const MATERIALS_KEY = "almaPlusMaterials";
const TASKS_BUCKET = "__tasks__"; // attachments of custom tasks; other buckets are Alma class ids
const MAX_FILE_MB = 25;

function mEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function mIcon(name) {
  const i = mEl("i", `fa ${name}`);
  i.setAttribute("aria-hidden", "true");
  return i;
}

function classIdFromUrl() {
  return location.pathname.match(/^\/home\/class\/([0-9a-f]+)/)?.[1] || null;
}

// ---- Storage (read once, kept in memory) ----

let allMaterialsCache = null;
async function loadAllMaterials() {
  if (!allMaterialsCache) {
    const result = await chrome.storage.local.get(MATERIALS_KEY);
    allMaterialsCache = result[MATERIALS_KEY] || {};
  }
  return allMaterialsCache;
}

async function loadMaterials(bucket) {
  return (await loadAllMaterials())[bucket] || [];
}

async function saveMaterials(bucket, items) {
  const all = { ...(await loadAllMaterials()), [bucket]: items };
  await chrome.storage.local.set({ [MATERIALS_KEY]: all });
  allMaterialsCache = all;
}

async function attachmentsFor(bucket, ownerId) {
  return (await loadMaterials(bucket)).filter((i) => i.assignmentId === ownerId);
}

// Called when a custom task is deleted, so its files don't linger.
async function removeOwnerAttachments(bucket, ownerId) {
  const items = await loadMaterials(bucket);
  if (items.some((i) => i.assignmentId === ownerId)) {
    await saveMaterials(bucket, items.filter((i) => i.assignmentId !== ownerId));
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[MATERIALS_KEY]) {
    allMaterialsCache = changes[MATERIALS_KEY].newValue || {};
    refreshAttachmentClips();
  }
});

// ---- Small helpers ----

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function normalizeLink(text) {
  let url = text.trim();
  if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url.replace(/^\/+/, "")}`;
  return /^https?:\/\//i.test(url) && hostOf(url).includes(".") ? url : null;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlobUrl(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

let mScrollLocks = 0;
let mSavedOverflow = "";
function mLockScroll() {
  if (mScrollLocks++ === 0) {
    mSavedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}
function mUnlockScroll() {
  if (mScrollLocks > 0 && --mScrollLocks === 0) document.body.style.overflow = mSavedOverflow;
}

// ---- Opening an attachment ----

function openMaterial(item) {
  if (item.kind === "link") {
    window.open(item.url, "_blank", "noopener");
  } else if (item.kind === "photo") {
    openPhoto(item);
  } else {
    const url = dataUrlToBlobUrl(item.data);
    if (/^(application\/pdf|text\/|image\/|video\/|audio\/)/.test(item.mime || "")) {
      window.open(url, "_blank", "noopener");
    } else {
      const a = mEl("a");
      a.href = url;
      a.download = item.fileName || item.title;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

// Photo viewer built from the classes of Alma's own popups, shown above them.
function openPhoto(item) {
  closePhoto();
  const overlay = mEl("div");
  overlay.id = "alma-plus-photo-overlay";
  overlay.addEventListener("click", closePhoto);

  const panel = mEl("div", "alma-modal-base yui3-widget yui3-panel alma-plus-photo-panel");
  panel.id = "alma-plus-photo";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", item.title);
  const content = mEl("div", "yui3-panel-content yui3-widget-stdmod");
  const hd = mEl("div", "yui3-widget-hd", item.title);
  const buttons = mEl("span", "yui3-widget-buttons");
  const close = mEl("button", "yui3-button yui3-button-close", "Close");
  close.type = "button";
  close.addEventListener("click", closePhoto);
  buttons.appendChild(close);
  hd.appendChild(buttons);

  const bd = mEl("div", "yui3-widget-bd");
  const img = mEl("img", "alma-plus-photo-full");
  img.src = item.data;
  img.alt = item.title;
  const download = mEl("a", "alma-plus-photo-download", "Download");
  download.href = item.data;
  download.download = item.fileName || `${item.title}.jpg`;
  bd.append(img, download);

  content.append(hd, bd);
  panel.appendChild(content);
  document.body.append(overlay, panel);
  mLockScroll();
  document.addEventListener("keydown", closePhotoOnEscape, true);
  close.focus();
}

function closePhoto() {
  const panel = document.getElementById("alma-plus-photo");
  if (!panel) return;
  document.getElementById("alma-plus-photo-overlay")?.remove();
  panel.remove();
  mUnlockScroll();
  document.removeEventListener("keydown", closePhotoOnEscape, true);
}

function closePhotoOnEscape(e) {
  if (e.key === "Escape") {
    e.stopPropagation(); // close only the photo, not the popup under it
    closePhoto();
  }
}

// ---- "Attached files" section (used in Alma's popup and in the task popup) ----

// Same markup as Alma's "Submitted work": heading, one line per file with a
// paperclip, and Alma-style "Upload File" / "Add Link" buttons.
function buildAttachedSection(bucket, ownerId, ownerName = "") {
  const section = mEl("div", "pure-form submitted-files alma-plus-attached");
  section.dataset.owner = `${bucket}:${ownerId}`;

  const fileInput = mEl("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.hidden = true;

  async function render(editing = null) {
    const items = await attachmentsFor(bucket, ownerId);
    section.replaceChildren(mEl("h3", "", "Attached files"), fileInput);

    for (const item of items) {
      if (editing?.id === item.id) {
        section.appendChild(linkEditor(item));
        continue;
      }
      const line = mEl("div", "submitted-file split-flex");
      const a = mEl("a");
      a.href = item.kind === "link" ? item.url : "#";
      if (item.kind === "link") {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      } else {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          openMaterial(item);
        });
      }
      a.append(mIcon("fa-paperclip"), ` ${item.title}`);
      const tools = mEl("span", "alma-plus-attached-tools");
      const edit = mEl("button", "pure-button");
      edit.type = "button";
      edit.setAttribute("aria-label", item.kind === "link" ? "Edit link" : "Rename");
      edit.title = item.kind === "link" ? "Edit link" : "Rename";
      edit.appendChild(mIcon("fa-pencil-alt"));
      edit.addEventListener("click", () => render(item));
      const del = mEl("button", "pure-button delete");
      del.type = "button";
      del.setAttribute("aria-label", "Remove Item");
      del.title = "Remove";
      del.appendChild(mIcon("fa-trash"));
      del.addEventListener("click", async () => {
        if (!confirm(`Remove "${item.title}"?`)) return;
        const all = await loadMaterials(bucket);
        await saveMaterials(bucket, all.filter((i) => i.id !== item.id));
        render();
        refreshAttachmentClips();
      });
      tools.append(edit, del);
      line.append(a, tools);
      section.appendChild(line);
    }

    if (editing === "new-link") section.appendChild(linkEditor(null));

    const add = mEl("div", "add");
    const upload = mEl("button", "pure-button upload");
    upload.type = "button";
    upload.append(mIcon("fa-upload"), " Upload File");
    upload.addEventListener("click", () => fileInput.click());
    const link = mEl("button", "pure-button link");
    link.type = "button";
    link.append(mIcon("fa-link"), " Add Link");
    link.addEventListener("click", () => render("new-link"));
    add.append(upload, link);
    section.appendChild(add);
  }

  // Inline row for adding a link, or editing a link / renaming a file.
  function linkEditor(item) {
    const row = mEl("div", "new-file alma-plus-link-editor");
    const isFile = item && item.kind !== "link";
    let urlInput = null;
    if (!isFile) {
      urlInput = mEl("input", "pure-input-1");
      urlInput.type = "text";
      urlInput.placeholder = "Link, e.g. docs.google.com/...";
      urlInput.value = item?.url || "";
      row.appendChild(urlInput);
    }
    const nameInput = mEl("input", "pure-input-1");
    nameInput.type = "text";
    nameInput.placeholder = isFile ? "Name" : "Name (optional)";
    nameInput.value = item?.title || "";
    row.appendChild(nameInput);

    const buttons = mEl("div", "buttons");
    const cancel = mEl("button", "pure-button pure-button-link", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => render());
    const save = mEl("button", "pure-button pure-button-primary", item ? "Save" : "Add");
    save.type = "button";
    const submit = async () => {
      const all = await loadMaterials(bucket);
      const name = nameInput.value.trim();
      if (isFile) {
        if (!name) return;
        await saveMaterials(bucket, all.map((i) => (i.id === item.id ? { ...i, title: name, updated: new Date().toISOString() } : i)));
      } else {
        const url = normalizeLink(urlInput.value);
        if (!url) {
          alert("That doesn't look like a web link. Try something like docs.google.com/...");
          return;
        }
        const entry = { kind: "link", url, title: name || hostOf(url), updated: new Date().toISOString() };
        await saveMaterials(bucket, item
          ? all.map((i) => (i.id === item.id ? { ...i, ...entry } : i))
          : [...all, { ...entry, id: crypto.randomUUID(), assignmentId: ownerId, assignmentName: ownerName, added: entry.updated }]);
      }
      render();
      refreshAttachmentClips();
    };
    save.addEventListener("click", submit);
    for (const input of [urlInput, nameInput].filter(Boolean)) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });
    }
    buttons.append(cancel, save);
    row.appendChild(buttons);
    setTimeout(() => (urlInput || nameInput).focus(), 0);
    return row;
  }

  fileInput.addEventListener("change", async () => {
    const files = [...fileInput.files];
    fileInput.value = "";
    const tooBig = files.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) {
      alert(`"${tooBig.name}" is bigger than ${MAX_FILE_MB} MB. Try a smaller file, or save it to Google Drive and add the link.`);
      return;
    }
    if (!files.length) return;
    const now = new Date().toISOString();
    const added = [];
    for (const file of files) {
      added.push({
        id: crypto.randomUUID(),
        kind: file.type.startsWith("image/") ? "photo" : "file",
        title: file.name,
        fileName: file.name,
        mime: file.type,
        size: file.size,
        data: await readFileAsDataUrl(file),
        assignmentId: ownerId,
        assignmentName: ownerName,
        added: now,
      });
    }
    try {
      await saveMaterials(bucket, [...(await loadMaterials(bucket)), ...added]);
    } catch (error) {
      alert(`Couldn't save: ${error.message}`);
      return;
    }
    render();
    refreshAttachmentClips();
  });

  render();
  return section;
}

// ---- Alma's Assignment Details popup ----

let lastClickedAssignmentId = null;

function assignmentLinkIn(row) {
  return row?.querySelector("a[data-alma-modal='StudentAssignmentDetailsModal']") || null;
}

function assignmentIdOf(link) {
  return link?.getAttribute("href")?.match(/\/home\/assignment\/([0-9a-f]+)/)?.[1] || null;
}

function addAttachedFilesToPopup() {
  const bd = document.querySelector(".alma-student-assignment-details-modal:not(.alma-plus-details) .yui3-widget-bd");
  const header = bd?.querySelector(":scope > header");
  if (!header || !lastClickedAssignmentId) return;
  const classId = header.querySelector(".class a[href*='/home/class/']")
    ?.getAttribute("href").match(/\/home\/class\/([0-9a-f]+)/)?.[1];
  if (!classId) return;
  const owner = `${classId}:${lastClickedAssignmentId}`;
  const existing = bd.querySelector(".alma-plus-attached");
  if (existing?.dataset.owner === owner) return;
  existing?.remove();
  const name = header.querySelector(".assignment-name")?.textContent.trim() || "";
  bd.appendChild(buildAttachedSection(classId, lastClickedAssignmentId, name));
}

// ---- Paperclips on rows (Alma assignments and custom tasks), everywhere ----

function setClip(container, count, onClick) {
  const existing = container.querySelector(":scope > .alma-plus-clip");
  if (!count) {
    existing?.remove();
    return;
  }
  if (existing?.dataset.count === String(count)) return;
  existing?.remove();
  const clip = mEl("button", "alma-plus-clip");
  clip.type = "button";
  clip.dataset.count = String(count);
  clip.title = `${count} attached file${count === 1 ? "" : "s"}`;
  clip.append(mIcon("fa-paperclip"), ` ${count}`);
  clip.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  container.appendChild(clip);
}

let refreshing = false;
async function refreshAttachmentClips() {
  if (refreshing) return;
  refreshing = true;
  try {
    const all = await loadAllMaterials();
    const pageClass = classIdFromUrl();

    // Alma's assignment rows (class pages and the To Do page).
    for (const row of document.querySelectorAll("table tbody tr:not([data-alma-plus-row])")) {
      const link = assignmentLinkIn(row);
      const id = assignmentIdOf(link);
      if (!id) continue;
      const cell = link.closest("td");
      const classLink = cell.querySelector("small a[href*='/home/class/']");
      const classId = pageClass || classLink?.getAttribute("href").match(/\/home\/class\/([0-9a-f]+)/)?.[1];
      if (!classId) continue;
      const count = (all[classId] || []).filter((i) => i.assignmentId === id).length;
      const line = cell.querySelector("small");
      if (line) {
        setClip(line, count, () => {
          lastClickedAssignmentId = id;
          link.click();
        });
      }
    }

    // Custom task rows.
    const taskItems = all[TASKS_BUCKET] || [];
    for (const row of document.querySelectorAll("tr[data-alma-plus-row]")) {
      const id = row.dataset.almaPlusId;
      const line = row.querySelector("small.alma-plus-class");
      if (!id || !line) continue;
      const count = taskItems.filter((i) => i.assignmentId === id).length;
      setClip(line, count, () => {
        if (typeof openDetails === "function" && row._almaPlusTask) openDetails(row._almaPlusTask);
      });
    }
  } finally {
    refreshing = false;
  }
}

// ---- Start ----

function startAttachments() {
  // Remember which assignment was clicked (its name or anywhere on its row).
  document.addEventListener("click", (e) => {
    if (e.target.closest?.(".alma-plus-clip")) return;
    const link = e.target.closest?.("a[data-alma-modal='StudentAssignmentDetailsModal']") ||
      assignmentLinkIn(e.target.closest?.("tr"));
    const id = assignmentIdOf(link);
    if (id) lastClickedAssignmentId = id;
  }, true);

  refreshAttachmentClips();
  const OURS = ".alma-plus-clip, .alma-plus-attached, #alma-plus-photo, #alma-plus-photo-overlay";
  let popupPending = false;
  let clipTimer = null;
  new MutationObserver((mutations) => {
    const ours = mutations.every((m) => m.target.closest?.(OURS) ||
      ([...m.addedNodes, ...m.removedNodes].length > 0 &&
        [...m.addedNodes, ...m.removedNodes].every((n) => n.nodeType === 1 && n.matches?.(OURS))));
    if (ours) return;
    if (!popupPending) {
      popupPending = true;
      requestAnimationFrame(() => {
        popupPending = false;
        addAttachedFilesToPopup();
      });
    }
    clearTimeout(clipTimer);
    clipTimer = setTimeout(refreshAttachmentClips, 150);
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startAttachments);
} else {
  startAttachments();
}
