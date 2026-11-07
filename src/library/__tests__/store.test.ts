import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../store';
import { fakeStorage, throwingStorage } from './helpers';

test('starts with defaults and survives corrupt data', () => {
  const s = createStore(fakeStorage({ ers_library_v1: '{not json' }));
  assert.deepEqual(s.read().settings, { fontSize: 17, theme: 'paper' });
});

test('keeps working when storage throws', () => {
  const s = createStore(throwingStorage());
  s.write((st) => { st.settings.fontSize = 20; });
  assert.equal(s.read().settings.fontSize, 20);
});

test('keeps working without storage', () => {
  const s = createStore(null);
  s.write((st) => { st.settings.theme = 'lamp'; });
  assert.equal(s.read().settings.theme, 'lamp');
});

test('clamps font size and caps histories', () => {
  const s = createStore(fakeStorage());
  s.write((st) => {
    st.settings.fontSize = 40;
    for (let i = 0; i < 70; i++) st.books['a/b' + i] = { hash: 'h', at: null, bookmarks: [], opened: ['2026-11-' + String((i % 28) + 1).padStart(2, '0')], finished: [] };
    st.books['a/b0'].opened = Array.from({ length: 30 }, (_, i) => '2026-10-' + String(i + 1).padStart(2, '0'));
  });
  const st = s.read();
  assert.equal(st.settings.fontSize, 22);
  assert.equal(Object.keys(st.books).length, 60);
  assert.ok(Object.values(st.books).every((b) => b.opened.length <= 20 && b.bookmarks.length <= 50));
});

test('clamps font size from below and caps finished and bookmarks', () => {
  const s = createStore(fakeStorage());
  s.write((st) => {
    st.settings.fontSize = 3;
    st.books['x'] = {
      hash: 'h', at: null,
      bookmarks: Array.from({ length: 60 }, (_, i) => ({ b: i, o: 0, t: 'm' + i })),
      opened: [],
      finished: Array.from({ length: 25 }, (_, i) => '2026-09-' + String(i + 1).padStart(2, '0')),
    };
  });
  const st = s.read();
  assert.equal(st.settings.fontSize, 15);
  assert.equal(st.books['x'].finished.length, 20);
  assert.equal(st.books['x'].bookmarks.length, 50);
});

test('evicts the books whose latest opened date is oldest', () => {
  const s = createStore(fakeStorage());
  s.write((st) => {
    for (let i = 0; i < 61; i++) {
      st.books['k/' + i] = { hash: 'h', at: null, bookmarks: [], opened: ['2026-01-' + String(i % 28 + 1).padStart(2, '0'), '2026-02-' + String(i % 28 + 1).padStart(2, '0')], finished: [] };
    }
    // Oldest latest date: its earlier entry is irrelevant, the latest decides.
    st.books['old'] = { hash: 'h', at: null, bookmarks: [], opened: ['2025-12-31'], finished: [] };
    st.books['never'] = { hash: 'h', at: null, bookmarks: [], opened: [], finished: [] };
  });
  const keys = Object.keys(s.read().books);
  assert.equal(keys.length, 60);
  assert.ok(!keys.includes('old'));
  assert.ok(!keys.includes('never'));
});

test('persists to storage and reads back in a new store', () => {
  const storage = fakeStorage();
  createStore(storage).write((st) => { st.settings.theme = 'lamp'; st.current = { book: 'a/b', seat: 2 }; });
  const again = createStore(storage).read();
  assert.equal(again.settings.theme, 'lamp');
  assert.deepEqual(again.current, { book: 'a/b', seat: 2 });
});

test('sanitizes malformed stored data and returns copies', () => {
  const bad = JSON.stringify({ v: 1, settings: { fontSize: 'big', theme: 'neon' }, books: 5, current: 'x' });
  const s = createStore(fakeStorage({ ers_library_v1: bad }));
  assert.deepEqual(s.read().settings, { fontSize: 17, theme: 'paper' });
  assert.deepEqual(s.read().books, {});
  assert.equal(s.read().current, null);
  s.read().settings.fontSize = 99;
  assert.equal(s.read().settings.fontSize, 17);
});

test('a mutator that throws leaves state unchanged', () => {
  const s = createStore(fakeStorage());
  assert.throws(() => s.write((st) => { st.settings.fontSize = 20; throw new Error('boom'); }));
  assert.equal(s.read().settings.fontSize, 17);
});
