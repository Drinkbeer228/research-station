import test from 'node:test';
import assert from 'node:assert/strict';
import type { Anchor } from '../store';
import type { BookFile } from '../types';
import { anchorAt, chooseRestorePage, chosenFontSize, isFinished, NO_BLOCK } from '../reader/position';

const layout = { pages: 20, bodyStart: 4, endStart: 18, chapters: [{ text: '1.', h: 'a', page: 4 }, { text: '2.', h: 'b', page: 9 }] };
const book = { contentHash: 'sha256:111111111111' } as BookFile;
const mem = (hash: string, at: Anchor | null) => ({ hash, at, bookmarks: [], opened: [], finished: [] });

test('restores the exact block when the book is unchanged', () => {
  assert.equal(chooseRestorePage(mem('sha256:111111111111', { b: 42, o: 0, h: 'b', f: 0.5 }), book, layout, () => 11), 11);
});
test('falls back to the same chapter when the book changed', () => {
  assert.equal(chooseRestorePage(mem('sha256:222222222222', { b: 42, o: 0, h: 'b', f: 0.5 }), book, layout, () => null), 9);
});
test('falls back to the same share of the book', () => {
  assert.equal(chooseRestorePage(mem('sha256:222222222222', { b: 42, o: 0, h: 'gone', f: 0.5 }), book, layout, () => null), 10);
});
test('starts at the text for a new reader', () => {
  assert.equal(chooseRestorePage(null, book, layout, () => null), 4);
});
test('detects the colophon page', () => {
  assert.equal(isFinished(17, layout), false); assert.equal(isFinished(18, layout), true);
});

test('does not look for the block when the book changed', () => {
  let asked = 0;
  const page = chooseRestorePage(mem('sha256:222222222222', { b: 42, o: 0, h: 'a', f: 0.9 }), book, layout, () => { asked++; return 11; });
  assert.equal(page, 4);
  assert.equal(asked, 0);
});
test('goes on to the chapter when the block is gone from an unchanged book', () => {
  assert.equal(chooseRestorePage(mem('sha256:111111111111', { b: 42, o: 0, h: 'b', f: 0.5 }), book, layout, () => null), 9);
});
test('starts at the text when the memory has no place or only a bare anchor', () => {
  assert.equal(chooseRestorePage(mem('sha256:111111111111', null), book, layout, () => 11), 4);
  assert.equal(chooseRestorePage(mem('sha256:222222222222', { b: 1, o: 0 }), book, layout, () => null), 4);
});
test('keeps the restored page inside the book', () => {
  assert.equal(chooseRestorePage(mem('sha256:222222222222', { b: 1, o: 0, f: 1 }), book, layout, () => null), 19);
  assert.equal(chooseRestorePage(mem('sha256:222222222222', { b: 1, o: 0, f: 0 }), book, layout, () => null), 0);
  assert.equal(chooseRestorePage(mem('sha256:111111111111', { b: 1, o: 0 }), book, layout, () => 99), 19);
});

test('makes an anchor with the block, the chapter and the share of the book', () => {
  const a = anchorAt(11, layout, (p) => (p === 11 ? { b: 42, o: 120 } : null));
  assert.deepEqual(a, { b: 42, o: 120, h: 'b', f: 11 / 19 });
});
test('has no chapter before the first one, and no block on a page without text', () => {
  assert.deepEqual(anchorAt(2, layout, () => null), { b: NO_BLOCK, o: 0, f: 2 / 19 });
  assert.deepEqual(anchorAt(4, layout, () => ({ b: 0, o: 0 })), { b: 0, o: 0, h: 'a', f: 4 / 19 });
});
test('an anchor is a valid stored anchor: f within 0..1', () => {
  assert.equal(anchorAt(0, layout, () => null).f, 0);
  assert.equal(anchorAt(19, layout, () => ({ b: 9, o: 0 })).f, 1);
  assert.equal(anchorAt(0, { ...layout, pages: 1 }, () => null).f, 0);
});

test('a chosen size is used only when the flag is set', () => {
  assert.equal(chosenFontSize({ fontSize: 17, fontSet: true }), 17);
  assert.equal(chosenFontSize({ fontSize: 17 }), null);
  assert.equal(chosenFontSize({ fontSize: 20, fontSet: false }), null);
});
