const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');
const flow = source.slice(source.indexOf('  async function insertWithInjector('), source.indexOf('  function insertDirectly('));
function setup({ accept = true, insert = true } = {}) {
  const events = [];
  const body = { innerHTML: '' };
  const editor = { tagName: 'TEXTAREA', value: '', visible: false };
  const open = {}, button = {};
  const context = {
    SendError: class extends Error {}, TIMEOUT: { dialog: 1, insert: 1 },
    sleep: async () => {}, isVisible: el => el.visible,
    placeCaretAtStart: () => events.push('caret'),
    findInjectorButton: () => open,
    findInjectorPanel: () => editor.visible ? { editor, insertButton: button } : null,
    fillEditor: (_, html) => { events.push('fill'); editor.value = accept ? html : ''; return accept; },
    press(el) {
      if (el === open) { events.push('open'); editor.visible = true; }
      else { events.push('insert'); if (insert) { body.innerHTML = editor.value; editor.visible = false; } }
    },
    waitFor: async (check, _, label) => { const value = check(); if (!value) throw new Error(label); return value; },
  };
  vm.createContext(context); vm.runInContext(flow, context);
  return { run: html => context.insertWithInjector({}, body, html), events, body };
}
test('opens, fills exact HTML, inserts, and confirms panel closure', async () => {
  const f = setup(); await f.run('<p>Hello</p>\r\n');
  assert.deepEqual(f.events, ['caret', 'open', 'fill', 'insert']);
  assert.equal(f.body.innerHTML, '<p>Hello</p>\n');
});
test('empty template does not open the injector', async () => {
  const f = setup(); await assert.rejects(f.run(''), /checking the HTML file/);
  assert.deepEqual(f.events, []);
});
test('failed filling does not click insert', async () => {
  const f = setup({ accept: false }); await assert.rejects(f.run('<p>Hello</p>'), /filling HTML CODE/);
  assert.deepEqual(f.events, ['caret', 'open', 'fill']);
});
test('missing body update fails instead of continuing to Send', async () => {
  const f = setup({ insert: false }); await assert.rejects(f.run('<p>Hello</p>'), /confirming HTML was inserted/);
});
