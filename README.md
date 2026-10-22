# Gmail Auto Sender

A Chrome extension that sends a prepared email to a list of recipients from your signed-in Gmail account, on a fixed schedule (every 10 minutes by default).

Every run it:

1. Clicks **Compose** in Gmail
2. Fills in **To**, **Subject** and **Message**
3. Clicks **Send** and confirms Gmail closed the window

Each run sends to the **next** recipients on the list, so each person gets the email once. Progress is saved, so you can pause, close Chrome, and pick up where you left off.

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Click the puzzle-piece icon in the toolbar and pin **Gmail Auto Sender**.

After editing any file, click the reload icon on the extension's card in `chrome://extensions`, then reload your Gmail tab.

## Use

1. Open `https://mail.google.com` and sign in. Wait for the inbox to load.
2. Click the extension icon. The header should show `Gmail: you@gmail.com` with a green dot.
3. Fill in the **Campaign** tab:
   - **Recipients**: one per line. Accepted formats:
     ```
     jane@example.com
     John Smith <john@example.com>
     bob@example.com, Bob Lee
     ```
     Duplicates are removed, and lines starting with `#` are ignored.
   - **Subject** and **Message**: plain text. You can personalise with `{{name}}`, `{{first_name}}` and `{{email}}`, and set a fallback with `{{first_name|there}}`.
   - **Every (min)**: how often a run happens (default 10).
   - **Emails per run**: how many recipients each run sends to (default 1).
   - **Daily limit**: the most emails sent per calendar day (default 100).
4. Click **Start**. The first run happens immediately, then on the schedule.
5. Watch progress in the summary card and see each send or error in the **Activity** tab.

**Pause** stops the schedule and keeps your progress. **Resume** continues with the next recipients. **Reset progress** clears the sent history, so the whole list would be emailed again.

## Requirements while it runs

- Chrome must stay open with a **signed-in Gmail tab** (any `mail.google.com/mail/...` tab).
- For best reliability, keep Gmail in **its own window** that isn't minimised. With **"Switch to the Gmail tab while sending"** on (the default), the extension brings Gmail to the front in that window for a few seconds per run and then switches back.
- The computer must be awake. Missed runs are not made up. The schedule continues on the next tick.
- The extension refuses to send if the Gmail tab is now signed in to a **different account** than the one you started with. It pauses and logs why.

## Limits and good practice

- Gmail limits personal accounts to about **500 messages a day** (Google Workspace allows about 2,000). Hitting the limit can lock sending for 24 hours. Keep the daily limit well below it.
- Only email people who expect to hear from you. Many sends of the same text to people who don't know you will get the account flagged for spam.
- A recipient that fails twice (for example, Gmail rejects the address) is skipped and counted as **Failed**. Problems with the tab itself (closed, signed out, still loading) don't count against the recipient. The run is skipped and retried next time.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Open Gmail (mail.google.com) in a tab and sign in." | Open Gmail and wait for the inbox, then reopen the popup. |
| "Timed out waiting for the new message window" | Gmail was hidden or slow. Keep "Switch to the Gmail tab" on and Gmail in a non-minimised window. |
| "Compose button not found" | Gmail's page changed or hasn't loaded. Reload the Gmail tab. If it persists, Gmail may have changed its layout and the selectors in `content.js` need updating. |
| Drafts piling up | When a send fails mid-way, the compose window is closed, which Gmail saves as a draft. Delete those drafts. |

## Project layout

```
manifest.json     Manifest V3 definition
background.js     Service worker: schedule (chrome.alarms), queue, daily limit, logging
content.js        Runs in Gmail: Compose → fill To/Subject/Body → Send
popup.html/.css/.js  Campaign editor, status, activity log
lib/shared.js     Recipient parsing, placeholders, config defaults
icons/            Toolbar and store icons
```

All data (campaign, progress, log) is stored locally with `chrome.storage.local`. Nothing is sent anywhere except through your own Gmail.

### Gmail selectors

Gmail has no public page API, so `content.js` finds elements by Gmail's current markup. The selectors are at the top of the file in `SELECTORS`, each with fallbacks. If Google changes Gmail's layout, that's the only place to update.
