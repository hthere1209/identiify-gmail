// Runs inside mail.google.com. For each message it:
//   1. clicks Compose and fills in To and Subject,
//   2. inserts the HTML body, either through Mail HTML Injector's
//      "Edit Html message" dialog or directly into the editor,
//   3. clicks Send and waits for Gmail to confirm.
// Neither Gmail nor the injector has a public DOM API, so every lookup below
// has fallbacks. If one of them changes its layout, update SELECTORS / INJECTOR.

(() => {
  if (globalThis.__gmailHtmlSenderLoaded) return;
  globalThis.__gmailHtmlSenderLoaded = true;

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

  // Mail HTML Injector is matched by its visible labels (whole label, so an
  // inbox subject that merely mentions "edit HTML" never matches).
  const INJECTOR = {
    openButton: /^(?:(?:edit|insert)\s+html(?:\s+(?:message|code))?|html(?:\s+(?:editor|code|message))?|mail\s+html\s+injector|<\s*\/\s*>)$/i,
    insertButton: /^\W*insert\s+at\s+cursor\W*$/i,
    closeButton: /^\W*(close|cancel|×|✕|x)\W*$/i,
    editor: 'textarea, [contenteditable="true"], [contenteditable=""]',
  };

  const CLICKABLE = 'button, [role="button"], a, input[type="button"], input[type="submit"]';
  const TIMEOUT = { compose: 15000, field: 8000, dialog: 10000, insert: 10000, send: 20000 };
  const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

  let busy = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const isVisible = (el) => !!el && el.isConnected && el.type !== 'hidden' && el.getClientRects().length > 0;

  class SendError extends Error {
    constructor(message, fatal = false) {
      super(message);
      this.fatal = fatal;
    }
  }

  function findFirst(root, selectors) {
    for (const selector of [].concat(selectors)) {
      for (const el of root.querySelectorAll(selector)) if (isVisible(el)) return el;
    }
    return null;
  }

  function shadowRootOf(el) {
    if (el.shadowRoot) return el.shadowRoot;
    // Chrome accepts HTMLElement, not SVGElement (including toolbar icons).
    // Use the element's own window so elements inside frames also qualify.
    const HTMLElementClass = el.ownerDocument?.defaultView?.HTMLElement;
    if (!HTMLElementClass || !(el instanceof HTMLElementClass)) return null;
    try {
      return globalThis.chrome?.dom?.openOrClosedShadowRoot?.(el) || null;
    } catch {
      // An inaccessible host must not prevent scanning the remaining controls.
      return null;
    }
  }

  // Injector dialogs can live inside a shadow root or an accessible iframe.
  // Cross-origin frames remain inaccessible and are reported to the user.
  function deepQueryAll(root, selector) {
    const found = [...root.querySelectorAll(selector)];
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.nodeType !== 1) continue;
      const shadow = shadowRootOf(el);
      if (shadow) found.push(...deepQueryAll(shadow, selector));
      if (el.tagName === 'IFRAME' && isVisible(el)) {
        try {
          if (el.contentDocument) found.push(...deepQueryAll(el.contentDocument, selector));
        } catch { /* Cross-origin iframe: do not attempt to bypass its boundary. */ }
      }
    }
    return found;
  }

  const labelOf = (el) =>
    (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('data-tooltip') ||
      el.value ||
      el.textContent ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();

  // A visible button-like element whose label matches. Falls back to plain
  // text elements for extensions that style a <div>/<span> as a button.
  function findClickable(root, pattern) {
    for (const el of deepQueryAll(root, CLICKABLE)) {
      if (isVisible(el) && [el.getAttribute('aria-label'), el.getAttribute('title'),
        el.getAttribute('data-tooltip'), el.value, el.textContent].some(
        (label) => label && pattern.test(label.replace(/\s+/g, ' ').trim()),
      )) return el;
    }
    for (const el of deepQueryAll(root, 'div, span')) {
      if (!el.firstElementChild && isVisible(el) && pattern.test(labelOf(el))) return el;
    }
    return null;
  }

  // Icon-only injector buttons may label the control, its SVG, or a tooltip.
  // Never search the inbox or message body: email content can contain code icons.
  function findInjectorButton(root) {
    const candidates = deepQueryAll(root, `${CLICKABLE}, [tabindex], [title], [data-tooltip]`);
    const matches = candidates.filter((el) => {
      if (!isVisible(el)) return false;
      for (let node = el; node; node = node.parentElement || node.getRootNode().host) {
        if (node.matches?.('[contenteditable="true"], [g_editable]')) return false;
      }
      const labeled = [el, ...deepQueryAll(el, '[aria-label], [title], [data-tooltip], svg title, img[alt]')];
      return labeled.some((node) => [
        node.getAttribute('aria-label'), node.getAttribute('title'),
        node.getAttribute('data-tooltip'), node.getAttribute('alt'), node.textContent,
      ].some((label) => label && INJECTOR.openButton.test(label.replace(/\s+/g, ' ').trim())));
    });
    // A wrapper and its button can both match the same icon. Prefer the button.
    const controls = matches.filter((el) => el.matches(CLICKABLE));
    const unique = (controls.length ? controls : matches).filter(
      (el, _, all) => !all.some((other) => other !== el && el.contains(other)),
    );
    return unique.length === 1 ? unique[0] : null;
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
      observer.observe(document.documentElement, { childList: true, subtree: true });
      const interval = setInterval(test, 400);
      const timer = setTimeout(() => finish(reject, new SendError(`Timed out waiting for ${label}.`)), timeout);
      test();
    });
  }

  // Gmail's buttons listen for mousedown/mouseup rather than click alone.
  function press(el) {
    const opts = { bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
    for (const type of ['mousedown', 'mouseup', 'click']) el.dispatchEvent(new MouseEvent(type, opts));
  }

  function setInputValue(el, text) {
    el.focus();
    el.select?.();
    document.execCommand('insertText', false, text);
    if (el.value !== text) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function placeCaretAtStart(el) {
    el.focus();
    const range = document.createRange();
    range.setStart(el, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
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

  // ---------------------------------------------------------------------------
  // HTML insertion
  // ---------------------------------------------------------------------------

  // The injector's dialog: the smallest container around the "Insert at cursor"
  // button that also holds an editable code box.
  function injectorDialog(insertButton) {
    let node = insertButton;
    while (node && node !== document.body && node !== document.documentElement) {
      const editors = deepQueryAll(node, INJECTOR.editor).filter(
        (e) => isVisible(e) && !e.hasAttribute('g_editable') && !e.closest('[g_editable]'),
      );
      if (editors.length) {
        const labeledEditor = editors.find((e) =>
          /paste\s+or\s+write\s+your\s+html\s+here/i.test(
            e.getAttribute('placeholder') || e.getAttribute('data-placeholder') || '',
          ),
        );
        return { container: node, editor: labeledEditor || editors.find((e) => e.tagName === 'TEXTAREA') || editors[0] };
      }
      // Visit the ShadowRoot itself: the editor and footer can be siblings in it.
      node = node.parentNode || node.host;
      if (node?.nodeType === 9) break;
    }
    return null;
  }

  function closeInjectorDialog(insertButton) {
    const dialog = injectorDialog(insertButton);
    const closeButton = dialog && findClickable(dialog.container, INJECTOR.closeButton);
    if (closeButton) press(closeButton);
  }

  function fillEditor(editor, html) {
    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
      editor.focus();
      const view = editor.ownerDocument.defaultView;
      const prototype = editor.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(editor, html);
      editor.dispatchEvent(new view.Event('input', { bubbles: true, composed: true }));
      editor.dispatchEvent(new view.Event('change', { bubbles: true, composed: true }));
      return editor.value === html;
    }
    editor.focus();
    const doc = editor.ownerDocument;
    const range = doc.createRange();
    range.selectNodeContents(editor);
    const selection = doc.defaultView.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    doc.execCommand('insertText', false, html);
    if (editor.textContent !== html) {
      editor.textContent = html;
      editor.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true, composed: true }));
    }
    return editor.textContent === html;
  }

  // Start with the field shown in the injector, then locate its own footer.
  // This avoids depending on a global button lookup to detect an open panel.
  function findInjectorPanel() {
    const editors = deepQueryAll(document, INJECTOR.editor).filter((editor) =>
      isVisible(editor) && !editor.hasAttribute('g_editable') && !editor.closest('[g_editable]'),
    );
    editors.sort((a, b) => Number(/paste.*html/i.test(b.getAttribute('placeholder') || ''))
      - Number(/paste.*html/i.test(a.getAttribute('placeholder') || '')));
    for (const editor of editors) {
      for (let container = editor.parentNode; container && container.nodeType !== 9;
        container = container.parentNode || container.host) {
        const insertButton = findClickable(container, INJECTOR.insertButton);
        if (insertButton) return { editor, container, insertButton };
        if (container === editor.ownerDocument.body) break;
      }
    }
    return null;
  }

  async function insertWithInjector(root, bodyEl, html) {
    let step = 'checking the HTML file';
    try {
      if (typeof html !== 'string' || !html.trim()) {
        throw new Error('Choose a nonempty HTML file in the dashboard.');
      }
      const normalizedHtml = html.replace(/\r\n?/g, '\n');
      const stale = findInjectorPanel();
      if (stale) {
        step = 'closing the previous injector panel';
        const close = findClickable(stale.container, INJECTOR.closeButton);
        if (!close) throw new Error('Close the existing injector panel manually and retry.');
        press(close);
        await waitFor(() => !isVisible(stale.editor), TIMEOUT.dialog, step);
      }

      step = 'opening Edit HTML message';
      placeCaretAtStart(bodyEl);
      const openButton = await waitFor(() => findInjectorButton(root), TIMEOUT.dialog, step);
      press(openButton);

      step = 'finding HTML CODE and Insert at cursor in the injector panel';
      const panel = await waitFor(findInjectorPanel, TIMEOUT.dialog, step);
      step = 'filling HTML CODE';
      if (!fillEditor(panel.editor, normalizedHtml)) throw new Error('The HTML field did not accept the file contents.');
      await sleep(300);
      const actual = panel.editor.tagName === 'TEXTAREA' || panel.editor.tagName === 'INPUT'
        ? panel.editor.value : panel.editor.textContent;
      if (actual !== normalizedHtml) throw new Error('The HTML field changed after filling.');

      step = 'clicking Insert at cursor';
      const before = bodyEl.innerHTML;
      press(panel.insertButton);
      step = 'confirming HTML was inserted into the message';
      await waitFor(() => bodyEl.innerHTML !== before && bodyEl.innerHTML.trim(), TIMEOUT.insert, step);
      step = 'waiting for the injector panel to close';
      await waitFor(() => !isVisible(panel.editor), TIMEOUT.dialog, step);
    } catch (error) {
      throw new SendError(`HTML insertion stopped while ${step}: ${error.message}`, true);
    }
  }

  function insertDirectly(bodyEl, html) {
    const before = bodyEl.innerHTML;
    placeCaretAtStart(bodyEl);
    if (!document.execCommand('insertHTML', false, html) || bodyEl.innerHTML === before) {
      bodyEl.insertAdjacentHTML('afterbegin', html);
      bodyEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    if (bodyEl.innerHTML === before) throw new SendError('Could not insert the HTML into the message.');
  }

  // ---------------------------------------------------------------------------
  // Send one message
  // ---------------------------------------------------------------------------

  async function sendEmail({ to, subject, html, method }) {
    if (busy) return { ok: false, error: 'Another message is already being sent.' };
    busy = true;
    let subjectEl = null;
    let root = null;

    try {
      const composeButton = findFirst(document, SELECTORS.composeButton);
      if (!composeButton) {
        throw new SendError('Compose button not found. Make sure Gmail has loaded and you are signed in.', true);
      }

      // 1. Open a new message and fill in To and Subject.
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

      setInputValue(toEl, to);
      await sleep(400);
      setInputValue(subjectEl, subject); // also blurs To, turning the address into a chip
      await sleep(300);

      // 2. Insert the HTML body.
      if (method === 'direct') insertDirectly(bodyEl, html);
      else await insertWithInjector(root, bodyEl, html);
      await sleep(600);

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
    if (msg?.type === 'GHS_PING') {
      sendResponse({ loggedIn: !!findFirst(document, SELECTORS.composeButton), account: detectAccount() });
      return false;
    }
    if (msg?.type === 'GHS_SEND') {
      sendEmail(msg.email).then(sendResponse);
      return true;
    }
    return false;
  });
})();
