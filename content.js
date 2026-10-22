// Runs inside mail.google.com. Opens a new message, fills it in and sends it.
// Gmail has no public DOM API, so selectors are listed with fallbacks in priority order.

(() => {
  if (globalThis.__gmailAutoSenderLoaded) return;
  globalThis.__gmailAutoSenderLoaded = true;

  const SELECTORS = {
    composeButton: ['div[gh="cm"]', 'div.T-I.T-I-KE.L3[role="button"]'],
    subject: 'input[name="subjectbox"]',
    to: [
      'input[aria-label="To recipients"]',
      'div[name="to"] input',
      'input[peoplekit-id]',
      'input.agP.aFw',
      'textarea[name="to"]',
      'input[role="combobox"]',
    ],
    body: [
      'div[g_editable="true"][contenteditable="true"]',
      'div.Am.Al.editable[contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
    ],
    send: ['div[role="button"].aoO', 'div.T-I.aoO'],
    close: ['img.Ha', '[role="button"][aria-label*="close" i]'],
    alert: 'div[role="alertdialog"]',
  };

  const TIMEOUT = { compose: 15000, field: 8000, send: 20000 };
  const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

  let busy = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const isVisible = (el) => !!el && el.isConnected && el.type !== 'hidden' && el.getClientRects().length > 0;

  function findFirst(root, selectors) {
    for (const selector of [].concat(selectors)) {
      for (const el of root.querySelectorAll(selector)) if (isVisible(el)) return el;
    }
    return null;
  }

  class SendError extends Error {
    constructor(message, fatal = false) {
      super(message);
      this.fatal = fatal;
    }
  }

  // Resolves with the first truthy value of check(). Uses a MutationObserver
  // because timers are heavily throttled in background tabs.
  function waitFor(check, timeout, label) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearInterval(interval);
        clearTimeout(timer);
        fn(value);
      };
      const test = () => {
        try {
          const value = check();
          if (value) finish(resolve, value);
        } catch (e) {
          finish(reject, e);
        }
      };
      const observer = new MutationObserver(test);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      const interval = setInterval(test, 400);
      const timer = setTimeout(() => finish(reject, new SendError(`Timed out waiting for ${label}.`)), timeout);
      test();
    });
  }

  // Gmail's buttons listen for mousedown/mouseup rather than click alone.
  function press(el) {
    const opts = { bubbles: true, cancelable: true, view: window, button: 0 };
    for (const type of ['mousedown', 'mouseup', 'click']) el.dispatchEvent(new MouseEvent(type, opts));
  }

  function setInputValue(el, text) {
    el.focus();
    el.select?.();
    document.execCommand('insertText', false, text);
    if (el.value !== text) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function setBody(el, text) {
    if (!text) return;
    el.focus();
    // Insert at the very top so an existing signature stays below the message.
    const range = document.createRange();
    range.setStart(el, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    const html = escapeHtml(text).replace(/\r?\n/g, '<br>');
    if (!document.execCommand('insertHTML', false, html)) {
      el.insertAdjacentHTML('afterbegin', html);
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  }

  // Smallest ancestor of the subject field that also holds this message's body and Send button.
  function composeRootFor(subjectEl) {
    for (let node = subjectEl.parentElement; node && node !== document.body; node = node.parentElement) {
      if (findFirst(node, SELECTORS.send) && findFirst(node, SELECTORS.body)) return node;
    }
    return null;
  }

  function closeCompose(root) {
    const closeButton = root && findFirst(root, SELECTORS.close);
    if (closeButton) press(closeButton); // Gmail keeps it as a draft
  }

  function dismissAlert(alert) {
    const ok = alert.querySelector('button[name="ok"], button, [role="button"]');
    if (ok) press(ok);
  }

  function detectAccount() {
    const fromTitle = document.title.match(EMAIL_RE);
    if (fromTitle) return fromTitle[0];
    for (const el of document.querySelectorAll('a[aria-label*="@"]')) {
      const match = el.getAttribute('aria-label').match(EMAIL_RE);
      if (match) return match[0];
    }
    return null;
  }

  async function sendEmail({ to, subject, body }) {
    if (busy) return { ok: false, error: 'Another message is already being sent.' };
    busy = true;
    let subjectEl = null;
    let root = null;

    try {
      const composeButton = findFirst(document, SELECTORS.composeButton);
      if (!composeButton) {
        throw new SendError('Compose button not found. Make sure Gmail has loaded and you are signed in.', true);
      }

      // 1. Open a new message window.
      const existing = new Set(document.querySelectorAll(SELECTORS.subject));
      press(composeButton);
      subjectEl = await waitFor(
        () => [...document.querySelectorAll(SELECTORS.subject)].find((el) => !existing.has(el) && isVisible(el)),
        TIMEOUT.compose,
        'the new message window',
      );
      root = await waitFor(() => composeRootFor(subjectEl), TIMEOUT.field, 'the message editor');
      const toEl = await waitFor(() => findFirst(root, SELECTORS.to), TIMEOUT.field, 'the To field');
      const bodyEl = findFirst(root, SELECTORS.body);

      // 2. Fill in recipient, subject and message.
      setInputValue(toEl, to);
      await sleep(400);
      setInputValue(subjectEl, subject); // also blurs To, turning the address into a chip
      await sleep(250);
      setBody(bodyEl, body);
      await sleep(400);

      // 3. Send and wait until Gmail closes the window (sent) or shows an error dialog.
      const sendButton = findFirst(root, SELECTORS.send);
      if (!sendButton) throw new SendError('Send button not found.');
      const priorAlerts = new Set(document.querySelectorAll(SELECTORS.alert));
      press(sendButton);

      const outcome = await waitFor(
        () => {
          if (!isVisible(subjectEl)) return 'sent';
          return [...document.querySelectorAll(SELECTORS.alert)].find((a) => !priorAlerts.has(a) && isVisible(a));
        },
        TIMEOUT.send,
        'Gmail to send the message',
      );

      if (outcome !== 'sent') {
        const reason = outcome.innerText.replace(/\s+/g, ' ').trim();
        dismissAlert(outcome);
        throw new SendError(`Gmail rejected the message: ${reason || 'unknown error'}.`);
      }
      await sleep(1500); // let Gmail settle before the next message
      return { ok: true };
    } catch (e) {
      if (isVisible(subjectEl)) {
        await sleep(300);
        closeCompose(root);
      }
      return { ok: false, fatal: !!e.fatal, error: e.message };
    } finally {
      busy = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'GAS_PING') {
      sendResponse({ loggedIn: !!findFirst(document, SELECTORS.composeButton), account: detectAccount() });
      return false;
    }
    if (msg?.type === 'GAS_SEND') {
      sendEmail(msg.email).then(sendResponse);
      return true;
    }
    return false;
  });
})();
