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

// Materials (photos and files included) are read from storage once and kept in
// memory; re-reading them on every page change is what made the page lag.
let allMaterialsCache = null;
async function loadAllMaterials() {
  if (!allMaterialsCache) {
    const result = await chrome.storage.local.get(MATERIALS_KEY);
    allMaterialsCache = result[MATERIALS_KEY] || {};
  }
  return allMaterialsCache;
}

async function loadMaterials(classId) {
  return (await loadAllMaterials())[classId] || [];
}

async function saveMaterials(classId, items) {
  const all = { ...(await loadAllMaterials()), [classId]: items };
  await chrome.storage.local.set({ [MATERIALS_KEY]: all });
  allMaterialsCache = all;
}

// Another Alma tab changed materials: pick up the new list.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[MATERIALS_KEY]) {
    allMaterialsCache = changes[MATERIALS_KEY].newValue || {};
    if (classIdFromUrl()) renderMaterials();
  }
});

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

function openAddMaterial(classId, presetAssignmentId = "", existing = null) {
  if (document.getElementById("alma-plus-modal-overlay")) return;
  const assignments = getPageAssignments();

  // Built like Alma's own form windows: dark header bar, gray boxes, Cancel + green button.
  const overlay = mEl("div");
  overlay.id = "alma-plus-modal-overlay";
  const modal = mEl("div", "alma-message-modal alma-modal alma-modal-base yui3-widget yui3-panel alma-plus-form");
  modal.id = "alma-plus-modal";
  modal.setAttribute("role", "dialog");
  modal.innerHTML = `
    <div class="yui3-panel-content yui3-widget-stdmod">
      <div class="yui3-widget-hd">Add Material<span class="yui3-widget-buttons"><button type="button" class="yui3-button yui3-button-close">Close</button></span></div>
      <div class="yui3-widget-bd">
        <form class="pure-form" novalidate>
          <section class="container pure-form-stacked">
            <div class="section">
              <label class="section-label" for="alma-plus-material-link">Link:</label>
              <input type="text" class="pure-input-1" id="alma-plus-material-link" autocomplete="off" placeholder="docs.google.com/...">
            </div>
            <div class="section">
              <label class="section-label" for="alma-plus-material-files">Files and Photos:</label>
              <p class="helper">Add a link, or choose files and photos (up to ${MAX_FILE_MB} MB each).</p>
              <input type="file" id="alma-plus-material-files" multiple>
            </div>
          </section>
          <section class="container pure-form-stacked message-container">
            <div class="section">
              <label class="section-label" for="alma-plus-material-title">Name:</label>
              <input type="text" class="pure-input-1" id="alma-plus-material-title" placeholder="e.g. Chapter 3 notes (optional)">
            </div>
            <div class="section">
              <label class="section-label" for="alma-plus-material-assignment">Assignment:</label>
              <select class="pure-input-1" id="alma-plus-material-assignment"></select>
            </div>
          </section>
          <div class="buttons">
            <button type="button" class="pure-button pure-button-link alma-plus-cancel">Cancel</button>
            <button type="submit" class="pure-button pure-button-primary alma-plus-save">Add</button>
          </div>
        </form>
      </div>
    </div>`;

  const linkInput = modal.querySelector("#alma-plus-material-link");
  const fileInput = modal.querySelector("#alma-plus-material-files");
  const titleInput = modal.querySelector("#alma-plus-material-title");
  const assignSelect = modal.querySelector("#alma-plus-material-assignment");
  const general = mEl("option", "", "General (whole class)");
  general.value = "";
  assignSelect.appendChild(general);
  for (const a of assignments) {
    const o = mEl("option", "", `${a.name}${a.due ? ` (${shortDue(a.due)})` : ""}`);
    o.value = a.id;
    assignSelect.appendChild(o);
  }
  assignSelect.value = presetAssignmentId;
  const save = modal.querySelector(".alma-plus-save");

  // Edit mode: same window, filled in. Links can change their address; files and
  // photos can be replaced with a new one. Name and assignment can always change.
  if (existing) {
    modal.querySelector(".yui3-widget-hd").firstChild.nodeValue = "Edit Material";
    save.textContent = "Save";
    titleInput.value = existing.title || "";
    if (existing.assignmentId && ![...assignSelect.options].some((o) => o.value === existing.assignmentId)) {
      const kept = mEl("option", "", existing.assignmentName || "Assignment");
      kept.value = existing.assignmentId;
      assignSelect.appendChild(kept);
    }
    assignSelect.value = existing.assignmentId || "";
    if (existing.kind === "link") {
      linkInput.value = existing.url;
      fileInput.closest(".section").hidden = true;
    } else {
      linkInput.closest(".section").hidden = true;
      fileInput.multiple = false;
      fileInput.closest(".section").querySelector(".section-label").textContent =
        existing.kind === "photo" ? "Replace Photo:" : "Replace File:";
      fileInput.closest(".section").querySelector(".helper").textContent =
        `Optional. Now: ${existing.fileName || existing.title}`;
    }
  }

  document.body.append(overlay, modal);
  mLockScroll();
  const closeOnEscape = (e) => {
    if (e.key === "Escape") closeModal();
  };
  const closeModal = () => {
    overlay.remove();
    modal.remove();
    document.removeEventListener("keydown", closeOnEscape);
    mUnlockScroll();
  };
  document.addEventListener("keydown", closeOnEscape);
  overlay.addEventListener("click", closeModal);
  modal.querySelector(".yui3-button-close").addEventListener("click", closeModal);
  modal.querySelector(".alma-plus-cancel").addEventListener("click", closeModal);

  modal.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    // Typing "https://" is optional: "docs.google.com/..." works too.
    let url = linkInput.value.trim();
    if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url.replace(/^\/+/, "")}`;
    const files = [...fileInput.files];
    const title = titleInput.value.trim();
    const assignment = assignments.find((a) => a.id === assignSelect.value);

    if (existing) {
      const keepOld = assignSelect.value && assignSelect.value === existing.assignmentId && !assignment;
      const updated = {
        ...existing,
        updated: new Date().toISOString(),
        assignmentId: assignSelect.value || "",
        assignmentName: keepOld ? existing.assignmentName : assignment?.name || "",
      };
      if (existing.kind === "link") {
        if (!url || !/^https?:\/\//i.test(url) || !hostOf(url).includes(".")) {
          alert("That doesn't look like a web link. Try something like docs.google.com/...");
          return;
        }
        updated.url = url;
        updated.title = title || hostOf(url);
      } else {
        const file = files[0];
        if (file) {
          if (file.size > MAX_FILE_MB * 1024 * 1024) {
            alert(`"${file.name}" is bigger than ${MAX_FILE_MB} MB.`);
            return;
          }
          save.disabled = true;
          save.textContent = "Saving…";
          Object.assign(updated, {
            kind: file.type.startsWith("image/") ? "photo" : "file",
            fileName: file.name,
            mime: file.type,
            size: file.size,
            data: await readFileAsDataUrl(file),
          });
        }
        updated.title = title || (file ? file.name : existing.title);
      }
      try {
        const items = await loadMaterials(classId);
        await saveMaterials(classId, items.map((i) => (i.id === existing.id ? updated : i)));
      } catch (error) {
        alert(`Couldn't save: ${error.message}`);
        save.disabled = false;
        save.textContent = "Save";
        return;
      }
      closeModal();
      renderMaterials();
      return;
    }

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

  (existing && existing.kind !== "link" ? titleInput : linkInput).focus();
}

// ---- Materials section and paperclips ----

// One row, laid out like Alma's assignment rows: shaded "Nov / 07" cell (date
// added), small bold type line over the name, then the assignment it belongs to.
function materialRow(classId, item, assignments) {
  const row = mEl("tr");
  row.dataset.assignmentId = item.assignmentId || "";
  const added = item.added ? new Date(item.added) : null;

  const dateCell = mEl("td", "due");
  if (added) {
    dateCell.dataset.sortableVal = String(Math.floor(added.getTime() / 1000));
    dateCell.append(added.toLocaleDateString("en-US", { month: "short" }), mEl("br"),
      String(added.getDate()).padStart(2, "0"));
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

  const a = assignments.find((x) => x.id === item.assignmentId);
  const forCell = mEl("td", "alma-plus-material-for");
  if (item.assignmentId) {
    forCell.appendChild(mEl("small", "", a?.category || "Assignment"));
    forCell.append(a?.name || item.assignmentName || "Assignment");
  } else {
    forCell.textContent = "General";
  }

  // Like Alma's Updated column: short date of the last change (or when it was added).
  const changed = item.updated || item.added;
  const updatedCell = mEl("td", "updated");
  if (changed) {
    const d = new Date(changed);
    updatedCell.textContent = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
  }

  const actionCell = mEl("td", "alma-plus-material-actions");
  const edit = mEl("button", "", "Edit");
  edit.type = "button";
  edit.addEventListener("click", () => openAddMaterial(classId, "", item));
  actionCell.appendChild(edit);
  const remove = mEl("button", "", "Remove");
  remove.type = "button";
  remove.addEventListener("click", async () => {
    if (!confirm(`Remove "${item.title}"?`)) return;
    const items = await loadMaterials(classId);
    await saveMaterials(classId, items.filter((i) => i.id !== item.id));
    renderMaterials();
  });
  actionCell.appendChild(remove);

  row.append(dateCell, nameCell, forCell, updatedCell, actionCell);
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

    // Same heading style as Alma's "Past Assignments" / "Upcoming Assignments".
    const heading = mEl("h4", "module-heading", "Materials");
    const add = mEl("button", "pure-button pure-button-primary alma-plus-add-material", "+ Add material");
    add.type = "button";
    add.addEventListener("click", () => openAddMaterial(classId));
    const head = mEl("div", "alma-plus-materials-head");
    head.append(heading, add);
    section.appendChild(head);

    if (!items.length) {
      section.appendChild(mEl("p", "alma-plus-materials-empty",
        "Save links, files, and photos for this class with + Add material."));
    } else {
      // General first, then by the order assignments appear on the page, newest added first within each.
      const order = ["", ...assignments.map((x) => x.id)];
      const rank = (item) => {
        const i = order.indexOf(item.assignmentId || "");
        return i === -1 ? 1e9 : i;
      };
      const sorted = [...items].sort((x, y) => rank(x) - rank(y) || String(y.added).localeCompare(String(x.added)));

      const table = mEl("table", "pure-table pure-table-horizontal assignment-grades alma-plus-materials-table");
      const thead = mEl("thead");
      const hr = mEl("tr");
      for (const [cls, text] of [["due snug", "Added"], ["name", "Material Name"], ["", "For"], ["updated", "Updated"], ["", ""]]) {
        hr.appendChild(mEl("th", cls, text));
      }
      thead.appendChild(hr);
      const tbody = mEl("tbody");
      for (const item of sorted) tbody.appendChild(materialRow(classId, item, assignments));
      table.append(thead, tbody);
      section.appendChild(table);
    }

    updateClips(items, assignments);
    ensureAssignmentsHeading(assignmentsBlock);
  } finally {
    rendering = false;
  }
}

// Paperclip with a count, only on assignments that have materials. Clicking it
// scrolls up to the Materials table and highlights that assignment's rows.
// Rows are only touched when their count changes, to keep the page quick.
function updateClips(items, assignments) {
  for (const a of assignments) {
    const nameCell = a.row.querySelector("td.name");
    const existing = nameCell.querySelector(".alma-plus-clip");
    const count = items.filter((i) => i.assignmentId === a.id).length;
    if (!count) {
      existing?.remove();
      continue;
    }
    if (existing?.dataset.count === String(count)) continue;
    existing?.remove();
    const clip = mEl("button", "alma-plus-clip");
    clip.type = "button";
    clip.dataset.count = String(count);
    clip.title = `${count} material${count === 1 ? "" : "s"}. Click to see ${count === 1 ? "it" : "them"}.`;
    clip.append(mIcon("fa-paperclip"), ` ${count}`);
    clip.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showMaterialsFor(a.id);
    });
    // On the small category line ("Unit Tests 📎1"), so it never covers the name.
    (nameCell.querySelector("small") || nameCell).appendChild(clip);
  }
}

// Alma hides the "Past Assignments" heading when a class only has a Past list.
// With Materials sitting right above, the table would look like part of it, so
// show the same heading Alma uses on classes that have both lists.
function ensureAssignmentsHeading(assignmentsBlock) {
  const almaHeadings = [...assignmentsBlock.querySelectorAll(".segment-content > h4.module-heading")];
  const ours = document.getElementById("alma-plus-assignments-heading");
  if (almaHeadings.some((h) => h.offsetParent !== null)) {
    ours?.remove();
    return;
  }
  if (ours) return;
  const heading = mEl("h4", "module-heading", almaHeadings[0]?.textContent.trim() || "Past Assignments");
  heading.id = "alma-plus-assignments-heading";
  const firstTable = assignmentsBlock.querySelector(".segmented-control, table");
  if (firstTable) firstTable.before(heading);
}

function showMaterialsFor(assignmentId) {
  const section = document.getElementById("alma-plus-materials");
  if (!section) return;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  const rows = section.querySelectorAll(`tbody tr[data-assignment-id="${CSS.escape(assignmentId)}"]`);
  rows.forEach((r) => r.classList.add("alma-plus-flash"));
  setTimeout(() => rows.forEach((r) => r.classList.remove("alma-plus-flash")), 1600);
}

// Cheap refresh after Alma changes its own table (sorting, switching terms):
// only the paperclips need checking, unless the Materials section is gone.
async function refreshAfterAlmaChange() {
  const classId = classIdFromUrl();
  if (!classId) return;
  if (!document.getElementById("alma-plus-materials")) {
    renderMaterials();
    return;
  }
  updateClips(await loadMaterials(classId), getPageAssignments());
  ensureAssignmentsHeading(document.querySelector(".student-assignments"));
}

function startMaterials() {
  if (!classIdFromUrl()) return;
  renderMaterials();
  // Alma rebuilds the assignment table when switching terms or sorting.
  let timer = null;
  const observer = new MutationObserver((mutations) => {
    // Ignore changes from this section and from the custom task rows.
    const OURS = "#alma-plus-assignments-heading, .alma-plus-clip, #alma-plus-materials, #alma-plus-modal-overlay, #alma-plus-details, #alma-plus-details-overlay, [data-alma-plus-row], .alma-plus-cal-btn, #alma-plus-toolbar, #alma-plus-import-input";
    const ours = mutations.every((m) => m.target.closest?.("#alma-plus-materials, .alma-plus-clip, [data-alma-plus-row], #alma-plus-toolbar") ||
      [...m.addedNodes, ...m.removedNodes].every((n) => n.nodeType === 1 && n.matches?.(OURS)));
    if (ours) return;
    clearTimeout(timer);
    timer = setTimeout(refreshAfterAlmaChange, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startMaterials);
} else {
  startMaterials();
}
