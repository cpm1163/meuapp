// Tests for the alerts screen rules and the alert service, with a fake Supabase client.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Records every call the service makes; the database itself is covered by supabase/tests/alerts_rls.test.sql.
const calls = [];
let deleteError = null;
const query = {
  delete() { calls.push(['delete']); return this; },
  in(column, values) { calls.push(['in', column, values]); return Promise.resolve({error: deleteError}); },
};
const fakeClient = {
  from(table) { calls.push(['from', table]); return query; },
};
const load = file => {
  const exportsObject = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const requireStub = spec => {
    if (spec === '@supabase/supabase-js') return {createClient: () => fakeClient};
    throw new Error(`unexpected import ${spec}`);
  };
  vm.runInThisContext(`(function (exports, require) {${source}\n})`)(exportsObject, requireStub);
  return exportsObject;
};
const selection = load('src/features/alerts/selection.ts');
const alerts = load('src/features/alerts/service.ts');
const ids = set => [...set].sort();

test('an alert is marked and unmarked on its own, without changing the previous selection', () => {
  const before = new Set(['a']);
  const marked = selection.toggleOne(before, 'b');
  assert.deepEqual(ids(marked), ['a', 'b']);
  assert.deepEqual(ids(before), ['a']);
  assert.deepEqual(ids(selection.toggleOne(marked, 'a')), ['b']);
});

test('"Marcar todos" marks every loaded alert and "Desmarcar todos" clears them', () => {
  const marked = selection.toggleAll(new Set(['b']), ['a', 'b', 'c']);
  assert.deepEqual(ids(marked), ['a', 'b', 'c']);
  assert.equal(selection.isAllSelected(marked, ['a', 'b', 'c']), true);
  assert.equal(selection.toggleAll(marked, ['a', 'b', 'c']).size, 0);
});

test('marking every alert one by one counts as all selected; an empty list never does', () => {
  let marked = new Set();
  for (const id of ['a', 'b']) {
    assert.equal(selection.isAllSelected(marked, ['a', 'b']), false);
    marked = selection.toggleOne(marked, id);
  }
  assert.equal(selection.isAllSelected(marked, ['a', 'b']), true);
  assert.equal(selection.isAllSelected(new Set(), []), false);
});

test('a deletion takes only the deleted ids out of the selection', () => {
  assert.deepEqual(ids(selection.withoutIds(new Set(['a', 'b']), ['c'])), ['a', 'b']);
  assert.deepEqual(ids(selection.withoutIds(new Set(['a', 'b']), ['a'])), ['b']);
  assert.equal(selection.withoutIds(new Set(['a', 'b']), ['a', 'b']).size, 0);
});

test('a reload takes out of the selection the alerts that no longer exist', () => {
  assert.deepEqual(ids(selection.keepLoaded(new Set(['a', 'b']), ['b', 'c'])), ['b']);
});

test('the notice appears only with marked alerts and more alerts than the loaded ones', () => {
  assert.equal(selection.selectionNotice(50, 50, 120), '50 de 120 marcados');
  assert.equal(selection.selectionNotice(3, 30, 30), null);
  assert.equal(selection.selectionNotice(0, 50, 120), null);
  assert.equal(selection.selectionNotice(50, 50, null), null);
});

test('after deleting 50 of 120 alerts, the next ones load with none marked', () => {
  const first = Array.from({length: 50}, (_, index) => `a${index}`);
  const next = Array.from({length: 50}, (_, index) => `a${index + 50}`);
  const remaining = selection.keepLoaded(selection.withoutIds(selection.toggleAll(new Set(), first), first), next);
  assert.equal(remaining.size, 0);
  assert.equal(selection.selectionNotice(remaining.size, next.length, 70), null);
});

test('remove sends the given ids to the alerts table', async () => {
  calls.length = 0;
  await alerts.createAlertService('token').remove(['a', 'b']);
  assert.deepEqual(calls, [['from', 'alerts'], ['delete'], ['in', 'id', ['a', 'b']]]);
});

test('remove with no ids does not call the database', async () => {
  calls.length = 0;
  await alerts.createAlertService('token').remove([]);
  assert.deepEqual(calls, []);
});

test('remove propagates the database error', async () => {
  deleteError = {code: '42501', message: 'denied'};
  try {
    await assert.rejects(alerts.createAlertService('token').remove(['a']), {code: '42501'});
  } finally {
    deleteError = null;
  }
});
