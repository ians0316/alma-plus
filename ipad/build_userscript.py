#!/usr/bin/env python3
"""Builds ipad/alma-plus.user.js: all of Alma+ as one userscript for Safari
(iPad, iPhone and Mac) through the free "Userscripts" app.

Run from anywhere:  python3 ipad/build_userscript.py

It reads manifest.json, so the userscript always has the same scripts, styles
and pages as the Chrome extension. Safari-only glue lives next to this file:
safari-shim.js (chrome.* APIs), safari-extras.js (settings panel, background
jobs) and safari.css.
"""
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HERE = ROOT / "ipad"
OUT = HERE / "alma-plus.user.js"
RAW = "https://raw.githubusercontent.com/ians0316/alma-plus/main/ipad/alma-plus.user.js"
ASSETS = ["layout/icons/icon32.png", "layout/icons/icon128.png",
          "layout/icons/google-calendar.svg", "layout/icons/seoul-academy.png"]
SHARED = ["content/alma-plus.js", "content/materials.js"]


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def data_uri(rel):
    mime = "image/svg+xml" if rel.endswith(".svg") else "image/png"
    return f"data:{mime};base64," + base64.b64encode((ROOT / rel).read_bytes()).decode()


def pattern_regex(pattern):
    """Chrome match pattern -> JavaScript regex source."""
    out = ""
    for ch in pattern:
        out += ".*" if ch == "*" else re.escape(ch)
    out = out.replace(r"https://.*\.", r"https://([^/]*\.)?", 1)
    return "^" + out + "$"


def matcher(matches):
    return " || ".join(f"/{pattern_regex(m).replace('/', chr(92) + '/')}/.test(location.href)" for m in matches)


def wrap(rel):
    return f"\n// ===== {rel} =====\n" + read(rel)


def build():
    manifest = json.loads(read("manifest.json"))
    version = manifest["version"]
    assets = {rel: data_uri(rel) for rel in ASSETS}

    def css_fix(text):
        return text.replace("chrome-extension://__MSG_@@extension_id__/", "__AP_ASSET__").replace(
            "__AP_ASSET__layout/icons/seoul-academy.png", assets["layout/icons/seoul-academy.png"])

    early_css, late_css, page_js, all_js = [], [], [], []
    for group in manifest["content_scripts"]:
        cond = matcher(group["matches"])
        css = "\n".join(css_fix(read(c)) for c in group.get("css", []))
        if css:
            (early_css if group.get("run_at") == "document_start" else late_css).append((cond, css))
        js = group.get("js", [])
        if not js:
            continue
        if js[:2] == SHARED:
            page_js.append((cond, js[2:]))
        else:
            all_js.append((cond, js))

    # Pages that get the shared task scripts, each with its own extra scripts.
    shared_cond = " || ".join(f"({c})" for c, _ in page_js)
    page_blocks = "".join(
        f"\n    if ({cond}) (() => {{{''.join(wrap(f) for f in files)}\n    }})();" for cond, files in page_js if files)
    other_blocks = "".join(f"\n  if ({cond}) (() => {{{''.join(wrap(f) for f in files)}\n  }})();" for cond, files in all_js)
    style = lambda pairs: "".join(f"\n  if ({c}) __apStyle({json.dumps(css)});" for c, css in pairs)

    popup_html = read("settings/popup.html")
    body = re.search(r"<body>(.*)</body>", popup_html, re.S).group(1)
    body = re.sub(r"<script[^>]*></script>", "", body).replace("../layout/icons/icon32.png", assets["layout/icons/icon32.png"])
    popup_css = re.sub(r"(^|[\s,}])body(?=[\s,{.:])", r"\1.ap-body", read("settings/popup.css"))
    popup_css = re.sub(r"(^|[\s,}])html(?=[\s,{])", r"\1:host", popup_css)
    popup_css += """
header { position: relative; }
.ap-close { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); border: 0; background: none;
  font-size: 24px; line-height: 1; color: inherit; cursor: pointer; padding: 4px 8px; }
section:has(#sync-now) { display: none; } /* Alma Sync hand-off needs a Mac */
"""

    header = f"""// ==UserScript==
// @name         Alma+ Custom Tasks (Safari)
// @namespace    https://github.com/ians0316/alma-plus
// @version      {version}
// @description  Your own tasks, Today dashboard, grade alerts, Gradebook and more, inside Alma. Safari version of the Alma+ Chrome extension.
// @author       ians0316
// @match        https://*.getalma.com/*
// @run-at       document-start
// @inject-into  content
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.listValues
// @updateURL    {RAW}
// @downloadURL  {RAW}
// ==/UserScript==

// Built by ipad/build_userscript.py from the Alma+ extension; don't edit by hand.
"""

    script = f"""{header}
(async () => {{
  const __AP_VERSION = {json.dumps(version)};
  const __AP_ASSETS = {json.dumps(assets)};
  const __AP_POPUP_HTML = {json.dumps(body)};
  const __AP_POPUP_CSS = {json.dumps(popup_css)};
  const __AP_POPUP_JS = (document) => {{
{read("settings/popup.js")}
  }};
  function __apStyle(css) {{
    const s = document.createElement("style");
    s.textContent = css;
    const add = () => (document.head || document.documentElement).appendChild(s);
    if (document.documentElement) add();
    else new MutationObserver((_, obs) => {{
      if (document.documentElement) {{ obs.disconnect(); add(); }}
    }}).observe(document, {{ childList: true }});
  }}
{read("ipad/safari-shim.js")}
{read("ipad/safari-extras.js")}
{style(early_css)}
  await __apLoad();
  if (document.readyState === "loading") await new Promise((r) => document.addEventListener("DOMContentLoaded", r, {{ once: true }}));
  __apStyle({json.dumps(read("ipad/safari.css"))});{style(late_css)}

  // Background jobs (reminder, grade alerts) run inside the page in Safari.
  (() => {{{wrap("content/background.js")}
  }})();

  if ({shared_cond}) (() => {{{''.join(wrap(f) for f in SHARED)}{page_blocks}
  }})();
{other_blocks}

  __apSettingsButton();
  __apStartBackground();
}})();
"""
    OUT.write_text(script, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} (Alma+ {version}, {len(script) // 1024} KB)")


if __name__ == "__main__":
    build()
