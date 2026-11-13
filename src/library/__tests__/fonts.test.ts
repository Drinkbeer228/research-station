import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBookFonts } from '../reader/fonts';

test('requests every face the book uses', async () => {
  const calls: string[] = [];
  const r = await loadBookFonts(17, { load: async (f: string) => { calls.push(f); return []; } } as any);
  assert.deepEqual(calls, ['400 17px "Source Serif 4 Variable"', '600 17px "Source Serif 4 Variable"', 'italic 400 17px "Source Serif 4 Variable"', '400 13px "Book Mono"']);
  assert.equal(r.ok, true);
});

test('gives up after the timeout instead of hanging', async () => {
  const t0 = Date.now();
  const r = await loadBookFonts(17, { load: () => new Promise(() => {}) } as any, 50);
  assert.equal(r.ok, false);
  assert.ok(Date.now() - t0 < 500);
});

test('reports failure when a face fails to load', async () => {
  const r = await loadBookFonts(17, { load: async () => { throw new Error('nope'); } } as any);
  assert.equal(r.ok, false);
});
