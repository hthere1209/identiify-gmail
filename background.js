import {
  DEFAULT_STATE,
  MAX_ATTEMPTS,
  emptyProgress,
  normalizeConfig,
  parseRecipients,
  pendingRecipients,
  recipientKey,
  renderTemplate,
  summarize,
  todayKey,
} from './lib/shared.js';

const ALARM = 'send-cycle';
const GMAIL_MATCH = 'https://mail.google.com/mail/*';
const GMAIL_PREFIX = 'https://mail.google.com/mail/';
const LOG_LIMIT = 300;
const GAP_BETWEEN_EMAILS_MS = 4000;

let cycleInProgress = false;
let writeQueue = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Storage. All writes go through one queue so read-modify-write never races.
// ---------------------------------------------------------------------------

async function load() {
  const d = await chrome.storage.local.get(['config', 'state', 'progress']);
  return {
    config: normalizeConfig(d.config),
    state: { ...DEFAULT_STATE, ...d.state },
    progress: { ...emptyProgress(), ...d.progress },
  };
}

function update(key, fn, fallback) {
  const run = async () => {
    const current = (await chrome.storage.local.get(key))[key];
    const next = fn(current === undefined ? fallback() : current);
    await chrome.storage.local.set({ [key]: next });
    return next;
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.catch(() => {});
  return result;
}

const patchState = (patch) => update('state', (s) => ({ ...DEFAULT_STATE, ...s, ...patch }), () => ({}));
const updateProgress = (fn) => update('progress', (p) => fn({ ...emptyProgress(), ...p }), emptyProgress);
const addLog = (level, message) =>
  update('log', (log) => [{ time: Date.now(), level, message }, ...log].slice(0, LOG_LIMIT), () => []);

async function refreshNextRun() {
  const alarm = await chrome.alarms.get(ALARM);
  await patchState({ nextRunAt: alarm?.scheduledTime ?? null });
}

// ---------------------------------------------------------------------------
// Gmail tab discovery
// ---------------------------------------------------------------------------

async function findGmailTab(preferredId, account) {
  if (preferredId != null) {
    const tab = await chrome.tabs.get(preferredId).catch(() => null);
    if (tab?.url?.startsWith(GMAIL_PREFIX)) return tab;
  }
  const tabs = await chrome.tabs.query({ url: GMAIL_MATCH });
  const byAccount = account && tabs.find((t) => t.title?.toLowerCase().includes(account.toLowerCase()));
  return byAccount || tabs.find((t) => t.active) || tabs[0] || null;
}

async function pingTab(tabId) {
  const ping = () => chrome.tabs.sendMessage(tabId, { type: 'GAS_PING' });
  try {
    return await ping();
  } catch {
    // Tab was open before the extension was installed or reloaded: inject now.
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
    return ping().catch(() => null);
  }
}

async function getConnection(tabId, account) {
  const tab = await findGmailTab(tabId, account);
  if (!tab) return { ready: false, message: 'Open Gmail (mail.google.com) in a tab and sign in.' };
  if (tab.discarded) return { ready: false, tab, message: 'The Gmail tab is asleep. Click on it once to reload it.' };

  const info = await pingTab(tab.id);
  if (!info?.loggedIn) {
    return { ready: false, tab, message: 'Gmail is still loading or not signed in. Wait for the inbox to appear.' };
  }
  return { ready: true, tab, account: info.account };
}

// ---------------------------------------------------------------------------
// Campaign control
// ---------------------------------------------------------------------------

async function start(tabId) {
  const { config, progress } = await load();
  const { recipients } = parseRecipients(config.recipientsText);
  if (!recipients.length) throw new Error('Add at least one valid recipient.');
  if (!config.subject.trim()) throw new Error('Enter a subject.');
  if (!pendingRecipients(recipients, progress).length) {
    throw new Error('Every recipient has already been processed. Add new recipients or reset progress.');
  }

  const conn = await getConnection(tabId);
  if (!conn.ready) throw new Error(conn.message);

  await patchState({ status: 'running', tabId: conn.tab.id, account: conn.account || null, sending: false });
  await chrome.alarms.clear(ALARM);
  await chrome.alarms.create(ALARM, {
    delayInMinutes: config.intervalMinutes,
    periodInMinutes: config.intervalMinutes,
  });
  const who = conn.account ? ` as ${conn.account}` : '';
  await addLog('info', `Started${who}: ${config.perCycle} email(s) every ${config.intervalMinutes} min.`);
  await refreshNextRun();

  runCycle(); // first run immediately; later runs come from the alarm
  return { ok: true };
}

async function pause(message = 'Paused.', level = 'info') {
  await chrome.alarms.clear(ALARM);
  await patchState({ status: 'paused', nextRunAt: null });
  await addLog(level, message);
  return { ok: true };
}

async function reset() {
  await chrome.alarms.clear(ALARM);
  await chrome.storage.local.set({ progress: emptyProgress() });
  await patchState({ status: 'idle', nextRunAt: null, sending: false, limitNoticeDate: null });
  await addLog('info', 'Progress reset.');
  return { ok: true };
}

async function complete(recipients) {
  await chrome.alarms.clear(ALARM);
  const { progress } = await load();
  const s = summarize(recipients, progress);
  await patchState({ status: 'completed', nextRunAt: null });
  await addLog('info', `Campaign complete: ${s.sent} sent, ${s.failed} failed.`);
}

// ---------------------------------------------------------------------------
// One scheduled run
// ---------------------------------------------------------------------------

async function runCycle() {
  if (cycleInProgress) return;
  cycleInProgress = true;
  let restoreTabId = null;

  try {
    const { config, state, progress } = await load();
    if (state.status !== 'running') return;

    const { recipients } = parseRecipients(config.recipientsText);
    if (!pendingRecipients(recipients, progress).length) return await complete(recipients);

    const today = todayKey();
    const sentToday = progress.daily.date === today ? progress.daily.count : 0;
    const allowance = Math.min(config.perCycle, config.dailyLimit - sentToday);
    if (allowance <= 0) {
      if (state.limitNoticeDate !== today) {
        await addLog('warn', `Daily limit of ${config.dailyLimit} reached. Sending resumes tomorrow.`);
        await patchState({ limitNoticeDate: today });
      }
      return;
    }

    const conn = await getConnection(state.tabId, state.account);
    if (!conn.ready) {
      await addLog('error', `Run skipped: ${conn.message}`);
      return;
    }
    if (state.account && conn.account && conn.account.toLowerCase() !== state.account.toLowerCase()) {
      await pause(`Paused: the Gmail tab is signed in as ${conn.account}, not ${state.account}.`, 'error');
      return;
    }

    const tab = conn.tab;
    await patchState({ tabId: tab.id, sending: true, lastRunAt: Date.now() });
    chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {});

    // Gmail renders unreliably in hidden tabs, so briefly show it and switch back afterwards.
    if (config.bringToFront && !tab.active) {
      const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
      restoreTabId = active?.id ?? null;
      await chrome.tabs.update(tab.id, { active: true });
      await sleep(1000);
    }

    const tried = new Set();
    for (let i = 0; i < allowance; i++) {
      const latest = await load();
      if (latest.state.status !== 'running') break;

      const next = pendingRecipients(recipients, latest.progress).find((r) => !tried.has(recipientKey(r.email)));
      if (!next) break;
      tried.add(recipientKey(next.email));

      if (i > 0) await sleep(GAP_BETWEEN_EMAILS_MS);
      const result = await sendTo(tab.id, config, next);
      if (result.fatal) break;
    }

    const final = await load();
    if (final.state.status === 'running' && !pendingRecipients(recipients, final.progress).length) {
      await complete(recipients);
    }
  } catch (e) {
    await addLog('error', `Unexpected error: ${e.message}`);
  } finally {
    if (restoreTabId != null) chrome.tabs.update(restoreTabId, { active: true }).catch(() => {});
    await patchState({ sending: false });
    await refreshNextRun();
    cycleInProgress = false;
  }
}

async function sendTo(tabId, config, recipient) {
  const key = recipientKey(recipient.email);
  const email = {
    to: recipient.email,
    subject: renderTemplate(config.subject, recipient),
    body: renderTemplate(config.body, recipient),
  };

  let result;
  try {
    result = await chrome.tabs.sendMessage(tabId, { type: 'GAS_SEND', email });
  } catch (e) {
    result = { ok: false, fatal: true, error: `Lost connection to the Gmail tab (${e.message}).` };
  }
  result ??= { ok: false, fatal: true, error: 'No response from the Gmail tab.' };

  if (result.ok) {
    const today = todayKey();
    await updateProgress((p) => {
      if (p.daily.date !== today) p.daily = { date: today, count: 0 };
      p.daily.count += 1;
      p.sent[key] = Date.now();
      delete p.errors[key];
      return p;
    });
    await addLog('success', `Sent to ${recipient.email}`);
  } else if (result.fatal) {
    // Environment problem (tab closed, signed out): not the recipient's fault, so no attempt is counted.
    await addLog('error', `${recipient.email}: ${result.error} Will retry next run.`);
  } else {
    const p = await updateProgress((p) => {
      p.attempts[key] = (p.attempts[key] || 0) + 1;
      p.errors[key] = result.error;
      return p;
    });
    const outcome = p.attempts[key] >= MAX_ATTEMPTS ? 'Skipping this recipient.' : 'Will retry next run.';
    await addLog('error', `${recipient.email}: ${result.error} ${outcome}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) runCycle();
});

async function restoreSchedule() {
  const { config, state } = await load();
  await patchState({ sending: false });
  if (state.status !== 'running') return;
  // Alarms are not guaranteed to survive browser restarts or extension updates.
  if (!(await chrome.alarms.get(ALARM))) {
    await chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: config.intervalMinutes });
  }
  await refreshNextRun();
}
chrome.runtime.onStartup.addListener(restoreSchedule);
chrome.runtime.onInstalled.addListener(restoreSchedule);

const handlers = {
  start: (msg) => start(msg.tabId ?? null),
  pause: () => pause('Paused by user.'),
  reset,
  clearLog: () => update('log', () => [], () => []).then(() => ({ ok: true })),
  getConnection: async (msg) => {
    const { state } = await load();
    const conn = await getConnection(msg.tabId ?? state.tabId, state.account);
    return { ok: true, ready: conn.ready, account: conn.account ?? null, message: conn.message ?? null };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler || sender.tab) return false; // only the popup controls the campaign
  Promise.resolve()
    .then(() => handler(msg))
    .then(sendResponse, (e) => sendResponse({ ok: false, error: e.message }));
  return true;
});
