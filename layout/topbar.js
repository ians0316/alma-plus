// Search and mail buttons in Alma's top bar, left of the announcements bell.
// - Search: a search box that looks people up in the Directory (Alma's own
//   /directory/search).
// - Mail: a list of your teachers (from your Classes page); picking one opens
//   Alma's own "New Message" window. Replies go to your email, like in Alma.

(async () => {
  const menu = document.querySelector("#user-menu > ul.pure-menu-list");
  const bell = menu?.querySelector('a[href="/home/announcements"]')?.closest("li");
  if (!menu || !bell || menu.querySelector(".alma-plus-topbtn")) return;
  const stored = (await chrome.storage.local.get("almaPlusSettings")).almaPlusSettings || {};
  if (stored.sidebarTabs === false) return;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // One top-bar button with a dropdown, built like Alma's own menu items.
  function topButton(icon, label) {
    const li = el("li", "pure-menu-item button alma-plus-topbtn");
    const a = el("a", "pure-menu-link");
    a.href = "#";
    a.setAttribute("aria-label", label);
    a.title = label;
    a.append(el("i", `fa ${icon}`));
    const drop = el("div", "alma-plus-drop");
    drop.hidden = true;
    li.append(a, drop);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const open = drop.hidden;
      document.querySelectorAll(".alma-plus-drop").forEach((d) => (d.hidden = true));
      drop.hidden = !open;
      if (open) li.dispatchEvent(new Event("alma-plus-open"));
    });
    return { li, drop };
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".alma-plus-topbtn")) document.querySelectorAll(".alma-plus-drop").forEach((d) => (d.hidden = true));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".alma-plus-drop").forEach((d) => (d.hidden = true));
  });

  // ---- Search ----
  const search = topButton("fa-search", "Search people");
  const form = el("form", "pure-form alma-plus-search");
  form.action = "/directory/search";
  form.method = "get";
  const input = el("input", "pure-input-1");
  input.type = "search";
  input.name = "q";
  input.placeholder = "Search for people";
  const u = el("input");
  u.type = "hidden";
  u.name = "u";
  u.value = "0";
  form.append(input, u);
  search.drop.append(form);
  search.li.addEventListener("alma-plus-open", () => setTimeout(() => input.focus(), 0));

  // ---- Mail ----
  const mail = topButton("fa-envelope", "Message a teacher");
  mail.drop.append(el("div", "alma-plus-drop-heading", "Message a teacher"));
  const list = el("div", "alma-plus-teachers");
  list.append(el("div", "alma-plus-drop-empty", "Loading…"));
  mail.drop.append(list);
  let loaded = false;
  mail.li.addEventListener("alma-plus-open", async () => {
    if (loaded) return;
    loaded = true;
    const teachers = await myTeachers();
    list.replaceChildren();
    if (!teachers.length) list.append(el("div", "alma-plus-drop-empty", "No teachers found"));
    for (const t of teachers) {
      const li = el("div", "alma-plus-teacher");
      const a = el("a", "alma-plus-teacher-link");
      a.href = t.href;
      a.append(el("span", "alma-plus-teacher-name", t.name), el("small", "", t.classes.join(", ")));
      a.addEventListener("click", (e) => {
        e.preventDefault();
        mail.drop.hidden = true;
        openMessage(t.href, t.name);
      });
      li.append(a);
      list.append(li);
    }
  });

  bell.before(search.li, mail.li);

  async function myTeachers() {
    try {
      const html = await fetch("/home/schedule", { credentials: "same-origin" }).then((r) => r.text());
      const doc = new DOMParser().parseFromString(html, "text/html");
      const byHref = new Map();
      for (const link of doc.querySelectorAll('a[href^="/message/person/"]')) {
        // List view: "Last, First" in the teacher cell. Grid view: "First Last" in h5.teacher.
        const box = link.closest("tr, .class");
        const raw = (link.closest("h5.teacher")?.querySelector("span") || link.closest("td"))?.textContent.replace(/\s+/g, " ").trim() || "";
        const [last, first] = raw.split(",").map((s) => s.trim());
        const name = first ? `${first} ${last}` : raw;
        const cls = box?.querySelector('a[href^="/home/class/"]')?.textContent.replace(/\s+/g, " ").trim() || "";
        const href = link.getAttribute("href");
        const t = byHref.get(href) || { href, name, classes: [] };
        if (cls && !t.classes.includes(cls)) t.classes.push(cls);
        byHref.set(href, t);
      }
      return [...byHref.values()].sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  // Alma's own New Message window (same form Alma shows from the envelope icons).
  async function openMessage(href, name) {
    const overlay = el("div", "alma-plus-cal-overlay");
    const panel = el("div", "alma-modal-base yui3-widget yui3-panel alma-plus-cal-panel alma-plus-msg-panel");
    panel.setAttribute("role", "dialog");
    const content = el("div", "yui3-panel-content yui3-widget-stdmod");
    const hd = el("div", "yui3-widget-hd", "New Message");
    const btns = el("span", "yui3-widget-buttons");
    const closeBtn = el("button", "yui3-button yui3-button-close", "Close");
    closeBtn.type = "button";
    btns.append(closeBtn);
    hd.append(btns);
    const body = el("div", "yui3-widget-bd");
    const spin = el("div", "alma-plus-details-loading");
    spin.append(el("i", "fa fa-spinner fa-spin fa-4x"));
    body.append(spin);
    content.append(hd, body);
    panel.append(content);
    document.body.append(overlay, panel);
    const close = () => {
      overlay.remove();
      panel.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", close);
    closeBtn.addEventListener("click", close);

    try {
      const data = await fetch(href, { credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest" } }).then((r) => r.json());
      body.innerHTML = data?.Message?.html || "";
    } catch {
      body.replaceChildren(el("p", "", `Couldn't open a message to ${name}.`));
      return;
    }
    const f = body.querySelector("form");
    if (!f) return;
    f.querySelectorAll('button[type="reset"], button[aria-label="Close"]').forEach((b) =>
      b.addEventListener("click", (e) => { e.preventDefault(); close(); }));

    // Add Attachment, done the same way as Alma's own message window: upload
    // each file to Alma, list it in the Attachments table, and attach it to the
    // message with a hidden "Attachments[]" field.
    const drop = body.querySelector("form.file-drop");
    const file = drop?.querySelector('input[type="file"]');
    const addBtn = f.querySelector(".add-attachment");
    const attachments = f.querySelector("section.attachments");
    const rowTmpl = attachments?.querySelector("tbody tr");
    const sendBtn = f.querySelector('button[type="submit"]');
    let totalSize = 0;
    const MAX = 15728640;
    const note = el("p", "alma-plus-msg-note");
    addBtn?.after(note);
    const sizeCheck = () => {
      const tooBig = totalSize >= MAX;
      if (sendBtn) sendBtn.disabled = tooBig;
      note.textContent = tooBig ? "Total attachments exceed 15MB. Message cannot be sent." : "";
      note.classList.toggle("alma-plus-msg-error", tooBig);
    };
    if (drop && file && addBtn && attachments && rowTmpl) {
      drop.style.display = "none";
      addBtn.addEventListener("click", (e) => { e.preventDefault(); file.click(); });
      file.addEventListener("change", async () => {
        if (!file.files.length) return;
        const data = new FormData();
        [...file.files].forEach((x) => data.append("Files[]", x));
        file.value = "";
        note.classList.remove("alma-plus-msg-error");
        note.textContent = "Uploading…";
        try {
          const res = await fetch(drop.action, { method: "POST", body: data, credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest" } });
          const out = await res.json();
          const files = out?.Message?.files || [];
          if (!res.ok || out.ErrorCode || !files.length) throw new Error();
          for (const x of files) {
            const row = rowTmpl.cloneNode(true);
            row.classList.remove("hidden");
            const link = row.querySelector("a.file-name");
            link.href = link.getAttribute("href").replace("{id}", x.id);
            link.textContent = x.FileName;
            row.querySelector(".file-size").textContent = x.SizeFormatted;
            const del = row.querySelector("button");
            del.dataset.id = x.id;
            del.dataset.size = x.SizeInBytes;
            const hidden = el("input");
            hidden.type = "hidden";
            hidden.name = "Attachments[]";
            hidden.value = x.id;
            row.append(hidden);
            attachments.querySelector("tbody").append(row);
            totalSize += x.SizeInBytes;
          }
          attachments.classList.remove("hidden");
          note.textContent = "";
          sizeCheck();
        } catch {
          note.classList.add("alma-plus-msg-error");
          note.textContent = "Upload failed. The total size of all files must be less than 15MB.";
        }
      });
      // Trash button: remove the file from Alma and from the list (no confirm).
      attachments.addEventListener("click", async (e) => {
        const del = e.target.closest("button[data-href]");
        if (!del || !del.dataset.id) return;
        e.preventDefault();
        await fetch(del.dataset.href, {
          method: "POST",
          credentials: "same-origin",
          headers: { "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ FileId: del.dataset.id }),
        }).catch(() => {});
        totalSize -= Number(del.dataset.size) || 0;
        del.closest("tr").remove();
        attachments.classList.toggle("hidden", !attachments.querySelector("tbody tr:not(.hidden)"));
        sizeCheck();
      });
    }

    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const send = f.querySelector('button[type="submit"], input[type="submit"]');
      if (send) send.disabled = true;
      try {
        const res = await fetch(f.action, {
          method: "POST",
          body: new FormData(f),
          credentials: "same-origin",
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || out.ErrorCode) throw new Error(out?.Message?.text || "failed");
        body.replaceChildren(el("p", "alma-plus-msg-sent", `Message sent to ${name}.`));
        setTimeout(close, 1500);
      } catch {
        if (send) send.disabled = false;
        let err = f.querySelector(".alma-plus-msg-error");
        if (!err) {
          err = el("p", "alma-plus-msg-error");
          f.prepend(err);
        }
        err.textContent = "Message not sent. Check the subject and message, then try again.";
      }
    });
  }
})();
