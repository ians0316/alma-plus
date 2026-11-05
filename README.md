# Alma Helper

A Chrome extension that improves the To Do page of the Alma student portal. Everything runs in the browser, using the Alma login already there. It sends nothing to outside servers.

## Features

- **Days-left badges:** each assignment shows Today, Tomorrow, or the number of days left, color-coded by urgency.
- **Recently graded box:** grades from the last 7 days appear above the To Do list, newest first, with links to each assignment.
- **Custom tasks:** add tasks that aren't on Alma, with notes, a priority, and a due date, then edit them or mark them done.
- **Filters:** show everything, items due today, items due this week, or overdue items.
- **Google Calendar:** a button on each assignment opens a pre-filled event, and an export button downloads everything as an `.ics` file.
- **Backup:** save custom tasks to a JSON file and restore them later.

## Install

1. Download this repo and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the folder with `manifest.json` in it.
4. Open or refresh Alma's To Do page.

After changing the code, click the reload icon on the extension's card.

## Files

| File | What it does |
|---|---|
| `manifest.json` | Extension settings |
| `content.js`, `style.css` | Days-left badges and the recently graded box |
| `alma-plus.js`, `alma-plus.css` | Custom tasks, filters, calendar tools, and backup |
| `google-calendar.svg` | Calendar button icon |

Custom tasks are stored in the browser with Chrome's `storage` permission, so they stay on that computer unless backed up. Grades are cached for 10 minutes in the browser tab.

## Credits

The custom tasks, filters, calendar tools, and backup features come from [Alma+ Custom Tasks](https://github.com/juholee10/alma-plus) by Juho Lee and Beomgyu Kim, included with their permission. `alma-plus.js` is changed from the original to support Alma's Submit column and to add days-left badges to custom tasks.

## Related

[alma-sync](https://github.com/ians0316/alma-sync) syncs Alma assignments and grades to Notion, Google Calendar, and Google Sheets.
