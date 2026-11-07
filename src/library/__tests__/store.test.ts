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

function stored(state: object): string {
  return JSON.stringify({ v: 1, current: null, books: {}, settings: { fontSize: 17, theme: 'paper' }, catalogCache: null, ...state });
}

test('memory stays authoritative when setItem fails but getItem returns prior data', () => {
  const prior = stored({ settings: { fontSize: 16, theme: 'paper' } });
  const storage = { getItem: () => prior, setItem: () => { throw new Error('quota'); } };
  const s = createStore(storage);
  s.write((st) => { st.settings.fontSize = 20; });
  assert.equal(s.read().settings.fontSize, 20);
  s.write((st) => { st.settings.theme = 'lamp'; });
  const st = s.read();
  assert.equal(st.settings.fontSize, 20);
  assert.equal(st.settings.theme, 'lamp');
});

test('retries a failed write without catalogCache and keeps the cache in memory', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (JSON.parse(v).catalogCache !== null) throw new Error('quota');
      data.set(k, v);
    },
  };
  const s = createStore(storage);
  const catalog = { schema: 'elephantology.library/1', generatedAt: '2026-11-07T00:00:00Z', source: { commit: 'c', site: 'https://x' }, disciplines: [], books: [] };
  s.write((st) => {
    st.settings.fontSize = 19;
    st.catalogCache = { generatedAt: catalog.generatedAt, catalog: catalog as never };
  });
  assert.notEqual(s.read().catalogCache, null);
  const persisted = JSON.parse(data.get('ers_library_v1') as string);
  assert.equal(persisted.settings.fontSize, 19);
  assert.equal(persisted.catalogCache, null);
});

test('drops a catalogCache that does not look like a catalog', () => {
  const bad = (catalog: object) => createStore(fakeStorage({ ers_library_v1: stored({ catalogCache: { generatedAt: 'x', catalog } }) })).read().catalogCache;
  assert.equal(bad({ schema: 'other/1', books: [], disciplines: [] }), null);
  assert.equal(bad({ schema: 'elephantology.library/1', books: {}, disciplines: [] }), null);
  assert.equal(bad({ schema: 'elephantology.library/1', books: [] }), null);
  assert.notEqual(bad({ schema: 'elephantology.library/1', books: [], disciplines: [] }), null);
});

test('drops invalid anchors and bookmarks', () => {
  const book = (extra: object) => ({ hash: 'h', at: null, bookmarks: [], opened: [], finished: [], ...extra });
  const books = {
    nan: book({ at: { b: NaN, o: 0 }, bookmarks: [{ b: 1, o: 2, t: 'ok' }, { b: 1, o: Infinity, t: 'bad' }] }),
    f: book({ at: { b: 1, o: 2, f: 1.5 } }),
    h: book({ at: { b: 1, o: 2, h: 5 } }),
    good: book({ at: { b: 1, o: 2, h: 'sec', f: 0.5 } }),
  };
  // JSON turns NaN into null, so also check mutated state.
  const s = createStore(fakeStorage({ ers_library_v1: stored({ books }) }));
  s.write((st) => { st.books.nan.at = { b: NaN, o: 0 }; });
  const r = s.read().books;
  assert.equal(r.nan.at, null);
  assert.deepEqual(r.nan.bookmarks, [{ b: 1, o: 2, t: 'ok' }]);
  assert.equal(r.f.at, null);
  assert.equal(r.h.at, null);
  assert.deepEqual(r.good.at, { b: 1, o: 2, h: 'sec', f: 0.5 });
});
