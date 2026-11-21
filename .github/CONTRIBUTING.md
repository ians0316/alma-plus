# Contributing to Alma+

Thanks for helping make Alma+ better for Seoul Academy students!

## Report a bug or suggest a feature

Open an [issue](https://github.com/ians0316/alma-plus/issues), or use the email in the README's [Report a bug](../README.md#report-a-bug) section. Please include:

- what page of Alma you were on (To Do, Calendar, a class page...)
- what you expected and what happened instead
- a screenshot, if you can (hide grades or anything private)

## Make a change

1. Ask to be added to the repo, since it's private.
2. Make a new branch from `main`.
3. Load your copy in Chrome: `chrome://extensions` → **Developer mode** → **Load unpacked** → pick the project folder. After each change, click reload ↻ and refresh Alma.
4. Open a pull request that says what you changed and why. Add a screenshot for anything you can see.

## Rules

- **Look like Alma.** Anything new should use Alma's own fonts, colors, buttons and popups. Don't restyle or recolor Alma's own parts.
- **Change only what you need.** Small pull requests that do one thing are easiest to review.
- **No popups asking "Are you sure?"** Use an Undo instead when something can be undone.
- **Plain JavaScript and CSS.** No build step and no outside libraries.
- **Keep data private.** Nothing leaves the browser except to Alma itself and Alma Sync on the student's own computer. Never ask for or store an Alma password.
- **Don't break saved tasks.** Students' tasks, files and notes live in `chrome.storage.local`. If you change how they're saved, old data must still load.
- **Bump the version** in `manifest.json` and the Status section of the README.
- **Test real pages** before opening a pull request: To Do, Overview, Calendar, Classes and a class page, with no errors in the console.

## Where things are

See the **Files** table in the [README](../README.md#files). Each feature has its own folder.
