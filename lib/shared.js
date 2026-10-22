// Helpers shared by the service worker and the popup.

// A recipient is skipped after this many failed sends.
export const MAX_ATTEMPTS = 2;

export const DEFAULT_CONFIG = Object.freeze({
  recipientsText: '',
  subject: '',
  body: '',
  intervalMinutes: 10,
  perCycle: 1,
  dailyLimit: 100,
  bringToFront: true,
});

export const LIMITS = Object.freeze({
  intervalMinutes: [1, 1440],
  perCycle: [1, 20],
  dailyLimit: [1, 2000],
});

export const DEFAULT_STATE = Object.freeze({
  status: 'idle', // idle | running | paused | completed
  tabId: null,
  account: null,
  sending: false,
  nextRunAt: null,
  lastRunAt: null,
  limitNoticeDate: null,
});

export function emptyProgress() {
  return { sent: {}, attempts: {}, errors: {}, daily: { date: '', count: 0 } };
}

export function normalizeConfig(raw) {
  const cfg = { ...DEFAULT_CONFIG, ...raw };
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const n = Math.round(Number(cfg[key]));
    cfg[key] = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : DEFAULT_CONFIG[key];
  }
  cfg.bringToFront = cfg.bringToFront !== false;
  return cfg;
}

const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;

/**
 * Parses one recipient per line. Accepted forms:
 *   jane@example.com
 *   Jane Doe <jane@example.com>
 *   jane@example.com, Jane Doe
 * Lines starting with # are ignored. Duplicates (case-insensitive) are dropped.
 */
export function parseRecipients(text) {
  const seen = new Set();
  const recipients = [];
  const invalid = [];
  let duplicates = 0;

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const emails = line.match(EMAIL_RE);
    if (!emails) {
      invalid.push(line);
      continue;
    }
    const name = emails.length === 1 ? cleanName(line.replace(emails[0], '')) : '';
    for (const email of emails) {
      const key = recipientKey(email);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      recipients.push({ email, name });
    }
  }
  return { recipients, invalid, duplicates };
}

function cleanName(s) {
  return s.replace(/[<>"(),;]/g, ' ').replace(/\s+/g, ' ').trim();
}

export const recipientKey = (email) => email.toLowerCase();

export function pendingRecipients(recipients, progress) {
  return recipients.filter((r) => {
    const key = recipientKey(r.email);
    return !progress.sent[key] && (progress.attempts[key] || 0) < MAX_ATTEMPTS;
  });
}

export function summarize(recipients, progress) {
  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    const key = recipientKey(r.email);
    if (progress.sent[key]) sent++;
    else if ((progress.attempts[key] || 0) >= MAX_ATTEMPTS) failed++;
  }
  return { total: recipients.length, sent, failed, remaining: recipients.length - sent - failed };
}

/** Replaces {{name}}, {{first_name}} and {{email}}; {{name|fallback}} supplies a default. */
export function renderTemplate(template, { email, name = '' }) {
  const values = { name, first_name: name.split(/\s+/)[0] || '', email };
  return String(template || '').replace(
    /\{\{\s*(name|first_name|email)\s*(?:\|([^}]*))?\}\}/gi,
    (_, key, fallback = '') => values[key.toLowerCase()] || fallback.trim(),
  );
}

export function todayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
