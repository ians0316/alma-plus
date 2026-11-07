// Class materials for Alma+: links, files, and photos saved per class, grouped
// under that class's assignments. Runs only on class pages (/home/class/<id>).
// Everything is stored in chrome.storage.local, in this browser only.

const MATERIALS_KEY = "almaPlusMaterials";
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

async function loadAllMaterials() {
  const result = await chrome.storage.local.get(MATERIALS_KEY);
  return result[MATERIALS_KEY] || {};
}

async function loadMaterials(classId) {
  return (await loadAllMaterials())[classId] || [];
}

async function saveMaterials(classId, items) {
  const all = await loadAllMaterials();
  all[classId] = items;
  await chrome.storage.local.set({ [MATERIALS_KEY]: all });
}

// Assignments listed on this class page: id, name, category, due date.
function getPageAssignments() {
  return [...document.querySelectorAll(".student-assignments table tbody tr")].map((row) => {
    const link = row.querySelector("td.name a[href*='/home/assignment/']");
    if (!link) return null;
    const ts = Number(row.querySelector("td.due")?.dataset.sortableVal);
    return {
      id: link.getAttribute("href").split("/").pop(),
      name: link.textContent.trim(),
      category: row.querySelector("td.name small")?.textContent.trim() || "",
      due: ts ? new Date(ts * 1000) : null,
      row,
    };
  }).filter(Boolean);
}

function shortDue(date) {
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "2-digit" }) : "";
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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

// Same page-freeze behavior as Alma's popups.
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

// ---- Opening a material ----

function openMaterial(item) {
  if (item.kind === "link") {
    window.open(item.url, "_blank", "noopener");
  } else if (item.kind === "photo") {
    openPhoto(item);
  } else {
    const url = dataUrlToBlobUrl(item.data);
    const viewable = /^(application\/pdf|text\/|image\/|video\/|audio\/)/.test(item.mime || "");
    if (viewable) {
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

// Photo viewer built from the classes of Alma's own popups.
function openPhoto(item) {
  closePhoto();
  const overlay = mEl("div");
  overlay.id = "alma-plus-details-overlay";
  overlay.addEventListener("click", closePhoto);

  const panel = mEl("div", "alma-modal-base yui3-widget yui3-panel alma-plus-details alma-plus-photo-panel");
  panel.id = "alma-plus-details";
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
  document.addEventListener("keydown", closePhotoOnEscape);
  close.focus();
}

function closePhoto() {
  const panel = document.getElementById("alma-plus-details");
  if (!panel) return;
  document.getElementById("alma-plus-details-overlay")?.remove();
  panel.remove();
  mUnlockScroll();
  document.removeEventListener("keydown", closePhotoOnEscape);
}

function closePhotoOnEscape(e) {
  if (e.key === "Escape") closePhoto();
}

// ---- Add window ----

function openAddMaterial(classId, presetAssignmentId = "") {
  if (document.getElementById("alma-plus-modal-overlay")) return;
  const assignments = getPageAssignments();

  const overlay = mEl("div");
  overlay.id = "alma-plus-modal-overlay";
  const modal = mEl("div", "pure-form");
  modal.id = "alma-plus-modal";

  modal.appendChild(mEl("h4", "", "Add material"));

  const linkLabel = mEl("label", "", "Link");
  const linkInput = mEl("input");
  linkInput.type = "text";
  linkInput.autocomplete = "off";
  linkInput.placeholder = "docs.google.com/...";
  linkLabel.appendChild(linkInput);

  const fileLabel = mEl("label", "", "Or files and photos");
  const fileInput = mEl("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileLabel.appendChild(fileInput);

  const titleLabel = mEl("label", "", "Name (optional)");
  const titleInput = mEl("input");
  titleInput.type = "text";
  titleInput.placeholder = "e.g. Chapter 3 notes";
  titleLabel.appendChild(titleInput);

  const assignLabel = mEl("label", "", "Assignment");
  const assignSelect = mEl("select");
  const general = mEl("option", "", "General (whole class)");
  general.value = "";
  assignSelect.appendChild(general);
  for (const a of assignments) {
    const o = mEl("option", "", `${a.name}${a.due ? ` (${shortDue(a.due)})` : ""}`);
    o.value = a.id;
    assignSelect.appendChild(o);
  }
  assignSelect.value = presetAssignmentId;
  assignLabel.appendChild(assignSelect);

  const actions = mEl("div", "alma-plus-modal-actions");
  const cancel = mEl("button", "pure-button", "Cancel");
  cancel.type = "button";
  const save = mEl("button", "pure-button pure-button-primary", "Add");
  save.type = "button";
  actions.append(cancel, save);

  modal.append(linkLabel, fileLabel, titleLabel, assignLabel, actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  mLockScroll();

  const closeModal = () => {
    overlay.remove();
    mUnlockScroll();
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  cancel.addEventListener("click", closeModal);

  save.addEventListener("click", async () => {
    // Typing "https://" is optional: "docs.google.com/..." works too.
    let url = linkInput.value.trim();
    if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url.replace(/^\/+/, "")}`;
    const files = [...fileInput.files];
    const title = titleInput.value.trim();
    const assignment = assignments.find((a) => a.id === assignSelect.value);
    if (!url && !files.length) {
      alert("Add a link or choose at least one file.");
      return;
    }
    if (url && (!/^https?:\/\//i.test(url) || !hostOf(url).includes("."))) {
      alert("That doesn't look like a web link. Try something like docs.google.com/...");
      return;
    }
    const tooBig = files.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) {
      alert(`"${tooBig.name}" is bigger than ${MAX_FILE_MB} MB. Try a smaller file, or save it to Google Drive and add the link.`);
      return;
    }

    save.disabled = true;
    save.textContent = "Adding…";
    const base = {
      assignmentId: assignment?.id || "",
      assignmentName: assignment?.name || "",
      added: new Date().toISOString(),
    };
    const newItems = [];
    if (url) {
      newItems.push({ ...base, id: crypto.randomUUID(), kind: "link", url, title: title || hostOf(url) });
    }
    for (const file of files) {
      const data = await readFileAsDataUrl(file);
      newItems.push({
        ...base,
        id: crypto.randomUUID(),
        kind: file.type.startsWith("image/") ? "photo" : "file",
        title: files.length === 1 && !url && title ? title : file.name,
        fileName: file.name,
        mime: file.type,
        size: file.size,
        data,
      });
    }
    try {
      await saveMaterials(classId, [...(await loadMaterials(classId)), ...newItems]);
    } catch (error) {
      alert(`Couldn't save: ${error.message}`);
      save.disabled = false;
      save.textContent = "Add";
      return;
    }
    closeModal();
    renderMaterials();
  });

  linkInput.focus();
}

// ---- Materials section and paperclips ----

function materialRow(classId, item) {
  const row = mEl("tr");
  const iconCell = mEl("td", "alma-plus-material-icon");
  if (item.kind === "photo") {
    const thumb = mEl("img", "alma-plus-thumb");
    thumb.src = item.data;
    thumb.alt = "";
    iconCell.appendChild(thumb);
  } else {
    iconCell.appendChild(mIcon(item.kind === "link" ? "fa-link" : "fa-file-alt"));
  }

  const nameCell = mEl("td", "name");
  const kindText = item.kind === "link" ? `Link · ${hostOf(item.url)}`
    : item.kind === "photo" ? "Photo"
    : `File${item.fileName?.includes(".") ? ` · ${item.fileName.split(".").pop().toUpperCase()}` : ""}`;
  nameCell.appendChild(mEl("small", "", kindText));
  const open = mEl("a", "", item.title);
  open.href = item.kind === "link" ? item.url : "#";
  if (item.kind === "link") {
    open.target = "_blank";
    open.rel = "noopener noreferrer";
  } else {
    open.addEventListener("click", (e) => {
      e.preventDefault();
      openMaterial(item);
    });
  }
  nameCell.appendChild(open);

  const actionCell = mEl("td", "alma-plus-material-actions");
  const remove = mEl("button", "", "Remove");
  remove.type = "button";
  remove.addEventListener("click", async () => {
    if (!confirm(`Remove "${item.title}"?`)) return;
    const items = await loadMaterials(classId);
    await saveMaterials(classId, items.filter((i) => i.id !== item.id));
    renderMaterials();
  });
  actionCell.appendChild(remove);

  row.append(iconCell, nameCell, actionCell);
  return row;
}

let rendering = false;

async function renderMaterials() {
  const classId = classIdFromUrl();
  const assignmentsBlock = document.querySelector(".student-assignments");
  if (!classId || !assignmentsBlock || rendering) return;
  rendering = true;
  try {
    const items = await loadMaterials(classId);
    const assignments = getPageAssignments();

    let section = document.getElementById("alma-plus-materials");
    if (!section) {
      section = mEl("div");
      section.id = "alma-plus-materials";
      assignmentsBlock.before(section);
    }
    section.replaceChildren();

    const heading = mEl("h4", "page-heading assignments-header", "Materials");
    const add = mEl("button", "pure-button pure-button-primary alma-plus-add-material", "+ Add material");
    add.type = "button";
    add.addEventListener("click", () => openAddMaterial(classId));
    section.append(heading, add);

    if (!items.length) {
      section.appendChild(mEl("p", "dimmed alma-plus-materials-empty",
        "Save links, files, and photos for this class here. Use the paperclip on an assignment to attach something to it."));
    } else {
      // General first, then assignments in the order they appear on the page.
      const order = ["", ...assignments.map((a) => a.id)];
      const groups = new Map();
      for (const item of items) {
        const key = item.assignmentId || "";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
      const keys = [...groups.keys()].sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
      });

      const table = mEl("table", "pure-table pure-table-horizontal alma-plus-materials-table");
      const tbody = mEl("tbody");
      for (const key of keys) {
        const a = assignments.find((x) => x.id === key);
        const groupRow = mEl("tr", "alma-plus-material-group");
        groupRow.id = `alma-plus-group-${key || "general"}`;
        const cell = mEl("th");
        cell.colSpan = 3;
        cell.scope = "colgroup";
        if (!key) {
          cell.textContent = "General";
        } else {
          cell.textContent = a?.name || groups.get(key)[0].assignmentName || "Assignment";
          if (a?.due) cell.appendChild(mEl("small", "dimmed", `  ${a.category ? `${a.category} · ` : ""}Due ${shortDue(a.due)}`));
        }
        groupRow.appendChild(cell);
        tbody.appendChild(groupRow);
        for (const item of groups.get(key)) tbody.appendChild(materialRow(classId, item));
      }
      table.appendChild(tbody);
      section.appendChild(table);
    }

    // Paperclip on each assignment row: attach to that assignment, with a count.
    for (const a of assignments) {
      const nameCell = a.row.querySelector("td.name");
      nameCell.querySelector(".alma-plus-clip")?.remove();
      const count = items.filter((i) => i.assignmentId === a.id).length;
      const clip = mEl("button", `alma-plus-clip${count ? " has-items" : ""}`);
      clip.type = "button";
      clip.title = count ? `${count} material${count === 1 ? "" : "s"}. Click to add more.` : "Attach a link, file, or photo";
      clip.appendChild(mIcon("fa-paperclip"));
      if (count) clip.append(` ${count}`);
      clip.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAddMaterial(classId, a.id);
      });
      nameCell.appendChild(clip);
    }
  } finally {
    rendering = false;
  }
}

function startMaterials() {
  if (!classIdFromUrl()) return;
  renderMaterials();
  // Alma rebuilds the assignment table when switching terms or sorting.
  let timer = null;
  const observer = new MutationObserver((mutations) => {
    // Ignore changes from this section and from the custom task rows.
    const OURS = ".alma-plus-clip, #alma-plus-materials, #alma-plus-modal-overlay, #alma-plus-details, #alma-plus-details-overlay, [data-alma-plus-row], .alma-plus-cal-btn, #alma-plus-toolbar, #alma-plus-import-input";
    const ours = mutations.every((m) => m.target.closest?.("#alma-plus-materials, .alma-plus-clip, [data-alma-plus-row], #alma-plus-toolbar") ||
      [...m.addedNodes, ...m.removedNodes].every((n) => n.nodeType === 1 && n.matches?.(OURS)));
    if (ours) return;
    clearTimeout(timer);
    timer = setTimeout(renderMaterials, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startMaterials);
} else {
  startMaterials();
}
