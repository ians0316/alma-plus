## Highlights
- **Releases with a ready-to-load zip.** Every new version now comes with `alma-plus-vX.Y.Z.zip` below. Download it, unzip it, and load it in Chrome — no need to download the whole repo.
- **Cleaner project folders.** Files were grouped into fewer folders (`content/`, `calendar/`, `gpa/`, `layout/`, `files-and-notes/`, `settings/`), so the repo front page is shorter. The extension works exactly the same.

## Changes
- The `tasks` folder is now called `content`, and the sync helper (`background.js`) moved into it.
- The Today dashboard files moved into `calendar/`; class tabs and the Gradebook moved into `gpa/`.
- Extension icons and README pictures now live in `layout/`.
- README: new Setup steps, screenshots of the main features, a Contributing section, and a note that Alma+ works only with **student** accounts.
- New Contributing guide and Code of conduct, plus an MIT license.
- Every push is now checked automatically for broken code.

## How to update
1. Download the zip below and unzip it.
2. Copy its files over your old Alma+ folder (same place, same folder name).
3. Go to `chrome://extensions` and click reload ↻ on Alma+, then refresh Alma.

> ⚠️ Don't remove the extension to update — removing it deletes your saved tasks. Back up your tasks first with **Back up tasks** on the To Do page if you're unsure.
