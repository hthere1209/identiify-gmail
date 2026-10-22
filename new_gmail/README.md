# Gmail HTML Auto Sender

A Chrome extension that sends an **HTML email** (from your own `.html` file) to a list of recipients from your signed-in Gmail account, on a fixed schedule (every 10 minutes by default).

Every run it:

1. Clicks **Compose** and fills in **To** and **Subject**
2. Clicks **</> / Edit Html message** beside Send (added by the *Mail HTML Injector* extension)
3. Pastes your HTML into the **HTML code** box and clicks **Insert at cursor**
4. Back in the new message, clicks **Send** and confirms Gmail closed the window

Each run sends to the **next** recipients on the list, so each person gets the email once. Progress is saved, so you can pause, close Chrome, and pick up where you left off.

## Install

1. Make sure **Mail HTML Injector** is installed and enabled, and that **Edit Html message** shows next to Send in a new Gmail message.
2. Open `chrome://extensions` and turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `new_gmail` folder (the one containing `manifest.json`).
4. Pin **Gmail HTML Auto Sender** from the puzzle-piece menu. Its icon is teal.

After editing any file, click the reload icon on the extension's card in `chrome://extensions`, then reload your Gmail tab.

## Use

1. Open `https://mail.google.com`, sign in and wait for the inbox.
2. Click the extension icon. A **dashboard** opens in a new tab, and the header shows `Gmail: you@gmail.com` with a green dot.
3. Fill in the dashboard:
   - **Recipients**: one per line (`jane@example.com`, `John Smith <john@example.com>`, or `bob@example.com, Bob Lee`).
   - **Subject**.
   - **HTML file**: drop your `.html` file on the box or click **Choose file…**. The **Preview** shows how it renders for the first recipient. Warnings appear for things Gmail strips or clips.
   - **Insert HTML using**: keep **Mail HTML Injector** (the workflow above), or pick **Built-in** to insert the HTML without the injector.
   - **Schedule**: every N minutes (default 10), emails per run (default 1), daily limit (default 100).
4. Click **Start**. The first email goes out immediately, then one run every interval.

The toolbar icon shows **ON** while running, **II** when paused, and **✓** when finished. Progress and every send or error appear in **Activity**.

Personalisation works in both the subject and the HTML: `{{name}}`, `{{first_name}}`, `{{email}}`, with a fallback like `{{first_name|there}}`. Values are HTML-escaped when placed into the HTML.

## Requirements while it runs

- Chrome stays open with a signed-in Gmail tab, and the computer stays awake.
- Keep Gmail in **its own window** that isn't minimised. With **"Switch to the Gmail tab while sending"** on (the default), the extension shows the Gmail tab for a few seconds per run, then switches back. Gmail and the injector's dialog often do nothing while a tab is hidden.
- The campaign pauses itself if the Gmail tab is signed in to a different account than the one you started with.

## Limits and good practice

- Gmail allows about **500 messages a day** on personal accounts (about 2,000 on Google Workspace). Keep the daily limit well below that.
- Gmail **clips** messages whose HTML exceeds about 102 KB, ignores `<script>` and linked stylesheets, and generally blocks `data:` images. Use inline styles and images hosted at `https://` URLs.
- Only email people who expect to hear from you.
- A recipient that fails twice is skipped and counted as **Failed**. Problems with the tab or the injector (missing button, dialog didn't open) don't count against the recipient. The run is skipped and retried.

## Troubleshooting

| Activity message | What to do |
| --- | --- |
| `HTML injector button … not found in the active compose window` | Check Mail HTML Injector is enabled and its **</>** button appears beside Send. Reload both extensions and the Gmail tab after updating. Icon text, accessible labels, and tooltips are supported; an unlabeled image icon may require a selector specific to the injector. You can also switch to **Built-in**. |
| `The Mail HTML Injector dialog did not open` | Turn on "Switch to the Gmail tab", keep Gmail in a visible window, and try again. |
| `…dialog is in a protected frame…` | The injector draws its dialog in a frame other extensions can't fill. Switch to **Built-in**. |
| `Could not find the HTML code box` / `Could not paste…` | The injector uses an editor this extension can't fill. Switch to **Built-in**. |
| `Timed out waiting for the HTML to appear in the message` | "Insert at cursor" didn't put anything into the body. Click into a new message once by hand to check the injector works, then retry. |
| Drafts piling up | When a send fails partway, the compose window is closed, and Gmail keeps it as a draft. Delete those drafts. |

## Project layout

```
manifest.json      Manifest V3 definition
background.js      Service worker: schedule (chrome.alarms), queue, daily limit, log, toolbar badge
content.js         Runs in Gmail: Compose → To/Subject → injector dialog (or direct) → Send
dashboard.html/.css/.js  Campaign editor, HTML file loader and preview, status, activity log
lib/shared.js      Recipient parsing, placeholders, config defaults
icons/
```

Everything (campaign, HTML file, progress, log) is stored locally in `chrome.storage.local`. Nothing leaves your machine except through your own Gmail.

### Updating selectors

Neither Gmail nor Mail HTML Injector has a public page API. All lookups are at the top of `content.js`:

- `SELECTORS`: Gmail's Compose, To, Subject, body and Send elements.
- `INJECTOR`: the injector's button labels ("Edit Html message", "Insert at cursor") and its code box.

## Version 1.0.1

The injector workflow locates the HTML CODE editor and Insert at cursor within the same panel, verifies the file contents after filling, and waits for insertion and panel closure before Send. Activity errors identify the step that failed. Reload the extension and Gmail after updating.

Local workflow checks: `node --test tests/insertion.test.cjs`. These checks do not send email or validate a live Gmail session.
