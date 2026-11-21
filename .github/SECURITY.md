# Security policy

## Supported versions

Only the newest version of Alma+ gets fixes. Check the version in the Alma+ settings menu or in `manifest.json`.

## Report a security problem

If you find something that could expose a student's tasks, files, notes or Alma account, **don't open a public issue.** Email the address in the README's [Report a bug](../README.md#report-a-bug) section instead, with "Security" in the subject.

Please include:

- what the problem is and what someone could do with it
- the steps to make it happen
- the Alma+ version

You'll get a reply as soon as possible, and the fix will be listed in the README's Bugs fixed section once it's out.

## What Alma+ does to keep you safe

- Tasks, attached files and notes stay in your browser (`chrome.storage.local`). Nothing is sent anywhere except Alma itself and Alma Sync on your own computer, if you set it up.
- Alma+ never asks for or saves your Alma password. It uses the sign-in you already have.
- It runs only on `*.getalma.com` pages.
- No outside libraries or tracking.
