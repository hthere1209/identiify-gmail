import {
  DEFAULT_STATE,
  GMAIL_CLIP_BYTES,
  LIMITS,
  emptyProgress,
  formatBytes,
  normalizeConfig,
  parseRecipients,
  renderTemplate,
  summarize,
  todayKey,
} from './lib/shared.js';

const $ = (id) => document.getElementById(id);
const TEXT_FIELDS = ['recipientsText', 'subject'];
const NUMBER_FIELDS = Object.keys(LIMITS);
const STATUS_LABELS = { idle: 'Idle', running: 'Running', paused: 'Paused', completed: 'Done' };
const MAX_FILE_BYTES = 5 * 1024 * 1024;

let data = {
  config: normalizeConfig(),
  state: { ...DEFAULT_STATE },
  progress: emptyProgress(),
  log: [],
  template: null,
};
let saveTimer = null;
let previewTimer = null;
let resetArmed = null;

const send = (msg) => chrome.runtime.sendMessage(msg).catch((e) => ({ ok: false, error: e.message }));
const isRunning = () => data.state.status === 'running';

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function fillForm() {
  for (const key of [...TEXT_FIELDS, ...NUMBER_FIELDS]) $(key).value = data.config[key];
  $('bringToFront').checked = data.config.bringToFront;
  for (const radio of document.querySelectorAll('input[name="insertMethod"]')) {
    radio.checked = radio.value === data.config.insertMethod;
  }
}

function readForm() {
  const cfg = {};
  for (const key of [...TEXT_FIELDS, ...NUMBER_FIELDS]) cfg[key] = $(key).value;
  cfg.bringToFront = $('bringToFront').checked;
  cfg.insertMethod = document.querySelector('input[name="insertMethod"]:checked')?.value;
  return cfg;
}

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  data.config = normalizeConfig(readForm());
  return chrome.storage.local.set({ config: data.config });
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

async function loadFile(file) {
  showError('');
  if (isRunning()) return showError('Pause the campaign before changing the HTML file.');
  if (!file) return;
  if (!/\.html?$/i.test(file.name) && file.type !== 'text/html') {
    return showError(`"${file.name}" is not an HTML file.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    return showError(`"${file.name}" is ${formatBytes(file.size)}. The maximum is ${formatBytes(MAX_FILE_BYTES)}.`);
  }
  const html = await file.text();
  if (!html.trim()) return showError(`"${file.name}" is empty.`);

  data.template = { name: file.name, size: file.size, html, loadedAt: Date.now() };
  await chrome.storage.local.set({ template: data.template });
  renderTemplateInfo();
  schedulePreview();
}

async function removeFile() {
  if (isRunning()) return;
  data.template = null;
  await chrome.storage.local.remove('template');
  renderTemplateInfo();
  schedulePreview();
}

function templateWarnings(html, size) {
  const warnings = [];
  if (size > GMAIL_CLIP_BYTES) {
    warnings.push(`At ${formatBytes(size)}, Gmail will clip this message ("[Message clipped]"). Keep it under 102 KB.`);
  }
  if (/<script[\s>]/i.test(html)) warnings.push('Gmail removes <script> tags.');
  if (/src\s*=\s*["']?data:image/i.test(html)) {
    warnings.push('Embedded data: images are usually blocked by Gmail. Host images online and link to them.');
  }
  if (/<img[^>]+src\s*=\s*["']?(?!https?:|\/\/|cid:|data:|\{\{)[^"'\s>]+/i.test(html)) {
    warnings.push('Some images use local file paths, which recipients cannot load. Use full https:// URLs.');
  }
  if (/<link[^>]+stylesheet/i.test(html)) warnings.push('Gmail ignores linked stylesheets. Use inline styles.');
  return warnings;
}

function renderTemplateInfo() {
  const t = data.template;
  $('templateEmpty').hidden = !!t;
  $('templateLoaded').hidden = !t;
  const list = $('templateWarnings');
  list.replaceChildren();
  if (!t) return;

  $('templateName').textContent = t.name;
  const loaded = new Date(t.loadedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  $('templateInfo').textContent = `${formatBytes(t.size)} · loaded ${loaded}`;
  for (const text of templateWarnings(t.html, t.size)) {
    const li = document.createElement('li');
    li.textContent = text;
    list.append(li);
  }
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 250);
}

function renderPreview() {
  const t = data.template;
  $('preview').hidden = !t;
  $('previewEmpty').hidden = !!t;
  if (!t) {
    $('previewFor').textContent = '';
    $('preview').srcdoc = '';
    return;
  }
  const [first] = parseRecipients(data.config.recipientsText).recipients;
  const sample = first || { email: 'recipient@example.com', name: '' };
  $('previewFor').textContent = first ? `As sent to ${first.email}` : 'With sample data';
  $('preview').srcdoc = renderTemplate(t.html, sample, { html: true });
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
  $('log').replaceChildren(
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
}

function showError(message) {
  $('formError').textContent = message;
  $('formError').hidden = !message;
}

async function checkConnection() {
  const res = await send({ type: 'getConnection' });
  const el = $('connection');
  el.dataset.state = res?.ready ? 'ok' : 'bad';
  el.textContent = res?.ready
    ? res.account
      ? `Gmail: ${res.account}`
      : 'Gmail connected'
    : res?.message || res?.error || 'Gmail not available';
  el.title = el.textContent;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function onToggle() {
  showError('');
  const btn = $('toggleBtn');
  btn.disabled = true;
  try {
    if (isRunning()) {
      await send({ type: 'pause' });
      return;
    }
    await saveNow();
    fillForm(); // show clamped numbers
    const res = await send({ type: 'start' });
    if (!res?.ok) showError(res?.error || 'Could not start.');
    checkConnection();
  } finally {
    btn.disabled = false;
  }
}

async function onReset() {
  const btn = $('resetBtn');
  if (!resetArmed) {
    btn.textContent = 'Click again to confirm';
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

function bindEvents() {
  for (const key of TEXT_FIELDS) {
    $(key).addEventListener('input', () => {
      data.config = { ...data.config, ...readForm() };
      saveSoon();
      if (key === 'recipientsText') {
        renderRecipientStats();
        renderStats();
        schedulePreview();
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
  for (const radio of document.querySelectorAll('input[name="insertMethod"]')) {
    radio.addEventListener('change', saveNow);
  }

  const fileInput = $('fileInput');
  $('chooseFile').addEventListener('click', () => fileInput.click());
  $('replaceFile').addEventListener('click', () => fileInput.click());
  $('removeFile').addEventListener('click', removeFile);
  fileInput.addEventListener('change', () => {
    loadFile(fileInput.files[0]);
    fileInput.value = '';
  });

  const zone = $('dropzone');
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!isRunning()) zone.classList.add('dragging');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragging');
    loadFile(e.dataTransfer.files[0]);
  });

  $('toggleBtn').addEventListener('click', onToggle);
  $('resetBtn').addEventListener('click', onReset);
  $('clearLog').addEventListener('click', () => send({ type: 'clearLog' }));
  window.addEventListener('pagehide', () => {
    if (saveTimer) saveNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkConnection();
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
  const stored = await chrome.storage.local.get(['config', 'state', 'progress', 'log', 'template']);
  data = {
    config: normalizeConfig(stored.config),
    state: { ...DEFAULT_STATE, ...stored.state },
    progress: { ...emptyProgress(), ...stored.progress },
    log: stored.log || [],
    template: stored.template || null,
  };
  fillForm();
  bindEvents();
  render();
  renderTemplateInfo();
  renderPreview();
  checkConnection();
  setInterval(renderSchedule, 1000);
  setInterval(checkConnection, 30000);
}

init();
