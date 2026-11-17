# Alma+ Custom Tasks

The Alma+ Custom Tasks is an extension that adds convenient features for Seoul Academy students and technically everyone who uses Alma. Alma+ Custom Tasks allows students to add custom tasks to Alma's "todo" tab, so that any tasks or events that are not on Alma can be added. Also, the extension allows students to add assignments on Alma to their Google Calendar with a click of a button.

> [!IMPORTANT]
> **Alma+ is an unofficial student project.** It is not made, supported, or approved by Alma or
> Seoul Academy. Alma can change its website at any time and break parts of the extension, so
> always double-check due dates in Alma itself.

## How it works

Alma+ runs on Alma's own pages (`*.getalma.com`) and adds to what's already there:

1. **Add:** press **+ Add my own task** on the To Do page or a class page, or click a day on the Calendar.
2. **See:** your tasks show up next to Alma's assignments, on the Today dashboard, and on the Calendar.
3. **Attach:** open any assignment or task to add files, links and notes.
4. **Finish:** press **Done** and the task moves to that class's Past Assignments with a green check.

## Install

1. Download this repo (click **Code**, then **Download ZIP**) and unzip it.
2. Open `chrome://extensions` (Chrome or Brave) or `edge://extensions` (Edge).
3. Turn on **Developer mode** in the top right.
4. Click **Load unpacked** and pick the unzipped folder.
5. Open Alma's To Do tab. The new buttons are there.

> [!NOTE]
> Updates are manual for now: when a new version comes out, remove the old one from the
> extensions page and load the new folder. **Back up your tasks first** (see below).

## Features

### Custom tasks

- **Add your own tasks** with **+ Add my own task**. They show in Upcoming Assignments looking just like Alma's.
- **Multi-day tasks:** add an end date and the task shows as a range (e.g. Nov 13–15).
- **Class pages** list each class's own tasks in its Upcoming block, with the class filled in when you add one there.
- **Done** moves a task into that class's Past Assignments with a green check; **Undo** brings it back.
- **Past tasks** leave the To Do page on their own after their date and go to Past Assignments, never to Missing.
- Tasks without a class stay on the To Do page, so they never disappear.
- **Task popup:** click a task's name for an Alma-style popup with its class, teacher (with Alma's message envelope), status, dates, priority, description and files.
- **Filter** by everything, due today, or due this week.
- **Back up and restore** all tasks with the JSON buttons.

### Attached files

- Every assignment and task popup gets an **Attached files** section laid out like Alma's "Submit your work here": **Upload File**, **Add from Drive** and **Add Link**.
- Rename or delete items; photos open in a viewer and PDFs in a new tab.
- Rows with attachments show 📎 and a count; click it to open the popup.
- After saving, Alma's own "Files Saved" message appears.

### My notes

- Every assignment popup has **My notes**: write a note (links become clickable), edit or delete it any time.
- Assignments with a note show a small note icon on their row.

### Today dashboard

Alma's Overview page gets **Due Today**, **Due Tomorrow** and **Recently Updated Grades** under your
schedule, in the same card style as Alma's schedule. Click an assignment to open Alma's popup.

### Calendar page

- Colored dots under each day with assignments or tasks, one color per class period.
- Hover a day to see them; click it for a popup with everything that day and **+ Add my own task** for that date.
- The Events list mixes them in under each month.
- The **official Seoul Academy 2026–2027 academic calendar** (breaks, closed days, shortened schedules) is shown alongside Alma's own events.

### Google Calendar

- A **calendar button** next to each upcoming assignment opens Google Calendar with an all-day event filled in (multi-day tasks cover every day). Press **Save** in Google to add it.
- **Export to calendar (.ics)** downloads every upcoming assignment and task as one file. In Google Calendar, go to **Settings → Import & export → Import**.

These are one-time copies: if an assignment changes, add it again. For automatic updates, use
[Alma Sync](#notion--google-calendar).

### Around Alma

- **Extra sidebar tabs:** Classes, Assignments, Attendance and Report Cards in the left menu, built with Alma's own icons.
- **Top bar search and mail:** look people up in the Directory, or pick a teacher to open Alma's New Message window.
- **Rounded corners** on Alma's boxes, tables, menus and buttons, matching its Schedule cards.

## Settings

Click the Alma+ icon in Chrome's toolbar to turn each part on or off:

| Setting | What it controls |
|---|---|
| Today dashboard | Due Today, Due Tomorrow and Recently Updated Grades on the Overview page |
| Calendar | Your work and the official school calendar on Alma's Calendar page |
| Extra tabs | The extra sidebar tabs and the top bar buttons |
| On the To Do page | Your own tasks in Upcoming Assignments |
| On class pages | Each class's tasks in its Upcoming list |
| Extra buttons | Export, Back up, Restore and Show next to "+ Add my own task" |
| Google Calendar button | The calendar button on assignments and tasks |
| My notes | Notes in assignment popups |
| In popups | Upload File, Add from Drive and Add Link |
| Paperclip counts | 📎 on rows with attached files |

The menu also shows how many tasks and files are saved and when tasks last synced.

## Notion & Google Calendar

Pair Alma+ with **[Alma Sync](https://github.com/ians0316/alma-sync)** on your Mac and your tasks
show up in Notion and Google Calendar within seconds of adding or editing them. Run this once in
Alma Sync's `alma_sync` folder:

```sh
./install_task_bridge.sh
```

The settings menu shows when tasks last synced, with a **Sync now** button.

## Privacy

- Tasks, attached files and notes are stored **in this browser only** (Chrome `storage`). They stay on that computer unless you back them up.
- Files can be up to 25 MB each.
- Alma+ never asks for your Alma password; it reads Alma's pages with the sign-in you already have.
- Besides Alma itself, the only place your data goes is Alma Sync on your own computer (your task list, if you set it up). The Google Calendar button just opens a pre-filled Google page; nothing is saved until you press Save.

## Files

Plain JavaScript and CSS, no build step, no outside libraries. Each Alma page gets only the scripts it needs:

| File | What it does |
|---|---|
| `manifest.json` | Name, version, icons, and which Alma pages each script runs on |
| `alma-plus.js`, `alma-plus.css` | Custom tasks, task popup, add/edit window, filters, calendar tools, backup |
| `materials.js`, `materials.css` | Attached files, My notes, paperclip and note icons, Files Saved message |
| `dashboard.js`, `dashboard.css` | Today dashboard on the Overview page |
| `calendar.js`, `calendar.css` | Your assignments and tasks on Alma's Calendar page |
| `official-calendar.js` | The official school calendar (update each school year) |
| `sidebar.js` | Extra sidebar tabs |
| `topbar.js`, `topbar.css` | Search and mail buttons in the top bar |
| `rounded.css` | Rounded corners across Alma |
| `background.js` | Hands your tasks to Alma Sync for Notion and Google Calendar |
| `popup.html`, `popup.css`, `popup.js` | The settings menu |
| `google-calendar.svg`, `icons/` | Icons |

## Status

> [!IMPORTANT]
> **Status:** version 2.8.6, used day to day at Seoul Academy.
>
> - **Works today:** custom tasks, attached files, notes, Today dashboard, Calendar page, Google
>   Calendar buttons and .ics export, extra tabs, settings menu, task sync through Alma Sync on macOS.
> - **Limits:** updates are manual; data lives in one browser; Google Calendar buttons make one-time copies.
> - **Other schools:** most features work on any `getalma.com` site, but the official calendar is Seoul Academy's.

## Report a bug

Email **ian.shin0316@gmail.com** 

<p align="center">
  <sub>Made by a Seoul Academy student, for Seoul Academy students. Not affiliated with Alma or Seoul Academy.</sub>
</p>
