import {
  DEFAULT_STATE,
  LIMITS,
  emptyProgress,
  normalizeConfig,
  parseRecipients,
  summarize,
  todayKey,
} from './lib/shared.js';

const $ = (id) => document.getElementById(id);
const GMAIL_PREFIX = 'https://mail.google.com/mail/';
const TEXT_FIELDS = ['recipientsText', 'subject', 'body'];
const NUMBER_FIELDS = Object.keys(LIMITS);
const STATUS_LABELS = { idle: 'Idle', running: 'Running', paused: 'Paused', completed: 'Done' };

let data = { config: normalizeConfig(), state: { ...DEFAULT_STATE }, progress: emptyProgress(), log: [] };
let saveTimer = null;
let resetArmed = null;

const send = (msg) => chrome.runtime.sendMessage(msg).catch((e) => ({ ok: false, error: e.message }));

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function fillForm() {
  for (const key of [...TEXT_FIELDS, ...NUMBER_FIELDS]) $(key).value = data.config[key];
  $('bringToFront').checked = data.config.bringToFront;
}

function readForm() {
  const cfg = {};
  for (const key of TEXT_FIELDS) cfg[key] = $(key).value;
  for (const key of NUMBER_FIELDS) cfg[key] = $(key).value;
  cfg.bringToFront = $('bringToFront').checked;
  return cfg;
}

function saveNow() {
  clearTimeout(saveTimer);
  data.config = normalizeConfig(readForm());
  return chrome.storage.local.set({ config: data.config });
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  const { status } = data.state;
  const running = status === 'running';

  $('statusPill').dataset.status = status;
  $('statusPill').textContent = STATUS_LABELS[status] || status;
  $('toggleBtn').textContent = running ? 'Pause' : status === 'paused' ? 'Resume' : 'Start';
  $('campaignFields').disabled = running;
  $('lockedNote').hidden = !running;

  renderRecipientStats();
  renderStats();
  renderSchedule();
  renderLog();
}

function renderRecipientStats() {
  const { recipients, invalid, duplicates } = parseRecipients($('recipientsText').value);
  const parts = [`${recipients.length} valid`];
  if (invalid.length) parts.push(`${invalid.length} invalid`);
  if (duplicates) parts.push(`${duplicates} duplicate${duplicates > 1 ? 's' : ''}`);
  const el = $('recipientStats');
  el.textContent = parts.join(' · ');
  el.classList.toggle('warn', invalid.length > 0);
  el.title = invalid.length ? `Not recognised:\n${invalid.slice(0, 10).join('\n')}` : '';
}

function renderStats() {
  const { recipients } = parseRecipients(data.config.recipientsText);
  const s = summarize(recipients, data.progress);
  const today = data.progress.daily?.date === todayKey() ? data.progress.daily.count : 0;

  $('statSent').textContent = s.sent;
  $('statRemaining').textContent = s.remaining;
  $('statFailed').textContent = s.failed;
  $('statToday').textContent = `${today}/${data.config.dailyLimit}`;

  const pct = s.total ? Math.round(((s.sent + s.failed) / s.total) * 100) : 0;
  $('barFill').style.width = `${pct}%`;
  $('barFill').parentElement.setAttribute('aria-valuenow', pct);
}

function formatCountdown(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${s}`;
}

function renderSchedule() {
  const { status, nextRunAt, sending } = data.state;
  let text;
  if (sending) {
    text = 'Sending now…';
  } else if (status === 'running' && nextRunAt) {
    const at = new Date(nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    text = `Next run in ${formatCountdown(Math.max(0, nextRunAt - Date.now()))} · ${at}`;
  } else {
    text = { running: 'Waiting for schedule…', paused: 'Paused', completed: 'All recipients processed' }[status] || 'Not started';
  }
  $('schedule').textContent = text;
}

function renderLog() {
  const list = $('log');
  list.replaceChildren(
    ...data.log.map((entry) => {
      const li = document.createElement('li');
      li.className = 'log-item';
      li.dataset.level = entry.level;
      const dot = document.createElement('span');
      dot.className = 'log-dot';
      const content = document.createElement('div');
      const msg = document.createElement('p');
      msg.className = 'log-msg';
      msg.textContent = entry.message;
      const time = document.createElement('time');
      time.className = 'log-time';
      time.dateTime = new Date(entry.time).toISOString();
      time.textContent = new Date(entry.time).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      content.append(msg, time);
      li.append(dot, content);
      return li;
    }),
  );
  $('logEmpty').hidden = data.log.length > 0;

  const lastSeen = Number(sessionStorage.getItem('logSeen') || 0);
  const unseenErrors = data.log.filter((e) => e.level === 'error' && e.time > lastSeen).length;
  $('errorBadge').hidden = unseenErrors === 0;
  $('errorBadge').textContent = unseenErrors;
}

function showError(message) {
  $('formError').textContent = message;
  $('formError').hidden = !message;
}

async function checkConnection() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const res = await send({ type: 'getConnection', tabId: tab?.url?.startsWith(GMAIL_PREFIX) ? tab.id : null });
  const el = $('connection');
  if (res?.ready) {
    el.dataset.state = 'ok';
    el.textContent = res.account ? `Gmail: ${res.account}` : 'Gmail connected';
    el.title = el.textContent;
  } else {
    el.dataset.state = 'bad';
    el.textContent = res?.message || res?.error || 'Gmail not available';
    el.title = el.textContent;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function onToggle() {
  showError('');
  const btn = $('toggleBtn');
  btn.disabled = true;
  try {
    if (data.state.status === 'running') {
      await send({ type: 'pause' });
      return;
    }
    await saveNow();
    fillForm(); // show clamped numbers
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await send({ type: 'start', tabId: tab?.url?.startsWith(GMAIL_PREFIX) ? tab.id : null });
    if (!res?.ok) showError(res?.error || 'Could not start.');
    checkConnection();
  } finally {
    btn.disabled = false;
  }
}

async function onReset() {
  const btn = $('resetBtn');
  if (!resetArmed) {
    btn.textContent = 'Click to confirm';
    btn.classList.add('confirm');
    resetArmed = setTimeout(disarmReset, 3000);
    return;
  }
  disarmReset();
  showError('');
  await send({ type: 'reset' });
}

function disarmReset() {
  clearTimeout(resetArmed);
  resetArmed = null;
  $('resetBtn').textContent = 'Reset progress';
  $('resetBtn').classList.remove('confirm');
}

function selectTab(name) {
  for (const tab of document.querySelectorAll('.tab')) {
    const active = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(active));
    $(`tab-${tab.dataset.tab}`).hidden = !active;
  }
  if (name === 'activity') {
    sessionStorage.setItem('logSeen', String(Date.now()));
    renderLog();
  }
}

function bindEvents() {
  for (const key of TEXT_FIELDS) {
    $(key).addEventListener('input', () => {
      data.config = { ...data.config, ...readForm() };
      saveSoon();
      if (key === 'recipientsText') {
        renderRecipientStats();
        renderStats();
      }
    });
  }
  for (const key of NUMBER_FIELDS) {
    $(key).addEventListener('change', async () => {
      await saveNow();
      $(key).value = data.config[key];
      renderStats();
    });
  }
  $('bringToFront').addEventListener('change', saveNow);
  $('toggleBtn').addEventListener('click', onToggle);
  $('resetBtn').addEventListener('click', onReset);
  $('clearLog').addEventListener('click', () => send({ type: 'clearLog' }));
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  }
  window.addEventListener('pagehide', () => {
    if (saveTimer) saveNow();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.state) data.state = { ...DEFAULT_STATE, ...changes.state.newValue };
    if (changes.progress) data.progress = { ...emptyProgress(), ...changes.progress.newValue };
    if (changes.log) data.log = changes.log.newValue || [];
    if (changes.state || changes.progress || changes.log) render();
  });
}

async function init() {
  const stored = await chrome.storage.local.get(['config', 'state', 'progress', 'log']);
  data = {
    config: normalizeConfig(stored.config),
    state: { ...DEFAULT_STATE, ...stored.state },
    progress: { ...emptyProgress(), ...stored.progress },
    log: stored.log || [],
  };
  fillForm();
  bindEvents();
  render();
  checkConnection();
  setInterval(renderSchedule, 1000);
}

init();
