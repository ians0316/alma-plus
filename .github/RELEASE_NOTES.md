## Highlights
- **📱 Alma+ on iPad (Safari).** All of Alma+ now works on the Alma website in Safari on iPad, iPhone and Mac, through the free **Userscripts** app. No app to build, nothing to re-install every week.

## What works in Safari
- Your own tasks, Today dashboard, New & Updated Assignments, Recently Updated Grades with times.
- Calendar dots and the official school calendar, Google Calendar buttons and .ics export.
- Class tabs (Bulletin, Attendance, Gradebook), Grade Calculator, update times, GPA on My Classes.
- Attached files, links and My notes; My Classes and the other extra left-menu tabs; top bar search and mail.
- **Settings:** an `Alma+` icon in Alma's top bar opens the full settings menu as a panel.
- **Night-before reminder and new grade alerts** pop up inside Alma (top right) when you open it, since Safari scripts can't send iPad notifications.

## Changes
- New `ipad/` folder: the Safari script `alma-plus.user.js` (also attached to this release), built automatically from the extension so both always match.
- **Fixed:** grade alerts for classes with a Submit (cloud) button showed no assignment name (Chrome too).
- The "Send my tasks" (Notion & Google Calendar) option is hidden in Safari, because it needs Alma Sync on a Mac.

## How to set it up on iPad
1. Install **Userscripts** from the App Store (free).
2. **Settings → Apps → Safari → Extensions → Userscripts**: turn it on and allow it on getalma.com.
3. Open the Userscripts app once and choose a folder for scripts (iCloud Drive is fine).
4. In Safari, open `https://raw.githubusercontent.com/ians0316/alma-plus/main/ipad/alma-plus.user.js`, tap the puzzle icon → **Userscripts** → **Install**.
5. Open Alma. To bring your tasks over: **Back up tasks** on the Mac, AirDrop the file, **Restore tasks** on the iPad.

## How to update the Chrome extension
1. Download the zip below and copy its files over your Alma+ folder.
2. Click reload ↻ on Alma+ in `chrome://extensions`.

> ⚠️ Don't remove the Chrome extension to update — removing it deletes your saved tasks.
