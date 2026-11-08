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

### What's new in 2.0

Everything the extension adds is built to look like Alma itself: same fonts, colors, buttons, and popups.

### Custom tasks

- **Add your own tasks** with **+ Add my own task**. They show in Upcoming Assignments looking just like Alma's assignments.
- **Multi-day tasks**: add an end date and the task shows as a range (e.g. Nov 13–15).
- **Class pages** show each class's own tasks in its Upcoming list, with the class filled in when you add one there.
- **Done** moves a task off the To Do page into that class's Past Assignments with a green check. **Undo** there brings it back.
- **Past tasks** leave the To Do page by themselves after their date and move to the class's Past Assignments (never to Missing). The Updated column shows when they last changed.
- Tasks without a class stay on the To Do page so they never disappear.
- **Task popup**: click a task's name for an Alma-style popup with the class, teacher (with Alma's message envelope), status, dates, priority, description, and attached files.
- **Filter** to see everything, items due today, or items due this week.
- **Back up and restore tasks** with the JSON buttons.

### Attached files

- Every assignment popup (and every task popup) has an **Attached files** section, laid out like Alma's "Submit your work here": **Upload File**, **Add from Drive**, and **Add Link**.
- Rename or delete attached items; photos open in a viewer, PDFs open in a new tab.
- Rows with attachments show a 📎 with the count; clicking it opens that popup.
- After saving, Alma's own "Files Saved" message appears.

### My notes

- Every Alma assignment popup has **My notes**: write a note (links become clickable), edit or delete it anytime.
- Assignments with a note show a small note icon on their row.

### Google Calendar

- **Calendar icon next to each upcoming assignment** opens Google Calendar with an all-day event pre-filled (multi-day tasks cover every day). Click **Save** in Google to add it.
- **Export to calendar (.ics)** downloads every upcoming assignment and task as one calendar file. In Google Calendar go to **Settings → Import & export → Import**.

All updates to Google Calendar are one-time, so if an assignment changes you will have to add it again.

### Settings

Click the extension's icon in Chrome's toolbar to turn features on or off: tasks on the To Do page, tasks on class pages, the extra buttons, Google Calendar buttons, My notes, attached files, and paperclip counts. The menu also shows how many tasks and files are saved.

## Files

| File | What it does |
|---|---|
| `manifest.json` | Extension name, version, icons, and where it runs |
| `alma-plus.js`, `alma-plus.css` | Custom tasks, task popup, add/edit window, filters, calendar tools, backup |
| `materials.js`, `materials.css` | Attached files, My notes, paperclip and note icons, Files Saved message |
| `popup.html`, `popup.css`, `popup.js` | Settings menu |
| `google-calendar.svg` | Calendar button icon |
| `icons/` | Extension icons |

Tasks, attached files, and notes are stored in this browser only (Chrome `storage`), so they stay on that computer unless backed up. Files can be up to 25 MB each.

## Related

[alma-sync](https://github.com/ians0316/alma-sync) syncs Alma assignments and grades to Notion, Google Calendar, and Google Sheets.

## Report Bug

Email to ian.shin0316@gmail.com


