# Alma+ Custom Tasks

The Alma+ Custom Tasks is an extension that adds convenient features for Seoul Academy students and technically everyone who uses Alma. Alma+ Custom Tasks allows students to add custom tasks to Alma's "todo" tab, so that any tasks or events that are not on Alma can be added. Also, the extension allows students to add assignments on Alma to their Google Calendar with a click of a button.

### Setup

1. Download the Github repo (click "Code" then "Download Zip").
2. Unzip the zip file. This should create the extension folder.
3. Open `chrome://extensions` (Chrome/Brave) or `edge://extensions` (Edge).
4. Turn on **Developer mode** in the top right.
5. Click **Load unpacked** and select this project folder.
6. Open Alma's todo tab and you should be able to access the features this extension offers.

If a bug fix or a new version is released, you would have to manually update the extension by deleting the previous version and uploading the new one.

### Google Calendar

- **Calendar icon next to each assignment** opens Google Calendar with an all-day event pre-filled for that due date. Click **Save** in Google to add it.
- **Export to calendar (.ics)** downloads every assignment in the table (both Alma's and your custom tasks) as one calendar file. In Google Calendar go to **Settings → Import & export → Import**, pick the file, and choose which calendar to add it to (creating an "Alma" calendar can be a good option).

All updates to Google Calendar are one-time, so if any new assignments are added or an assignment is modified, you will have to add to Google Calendar again.

### Custom task features

- **Edit tasks** to update the name, class/category, notes, priority, or due date.
- **Mark tasks done** with the checkbox; completed tasks remain visible and are shown with a strikethrough.
- **Filter assignments** to see everything, items due today, items due this week (Monday through Sunday), or overdue items.
- **Back up and restore tasks** using the JSON buttons. Restoring merges tasks into the current list and keeps existing tasks; ID conflicts are imported as separate tasks.
- **Notes and priority** are shown with your custom tasks. Notes are also included when adding a task to Google Calendar or exporting the calendar file.

## Files

| File | What it does |
|---|---|
| `manifest.json` | Extension settings |
| `content.js`, `style.css` | Days-left badges and the recently graded box |
| `alma-plus.js`, `alma-plus.css` | Custom tasks, filters, calendar tools, and backup |
| `google-calendar.svg` | Calendar button icon |

Custom tasks are stored in the browser with Chrome's `storage` permission, so they stay on that computer unless backed up. Grades are cached for 10 minutes in the browser tab.

## Related

[alma-sync](https://github.com/ians0316/alma-sync) syncs Alma assignments and grades to Notion, Google Calendar, and Google Sheets.

## Report Bug

Email to ian.shin0316@gmail.com


