import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBook, loadCatalog } from '../api';
import type { CatalogFile } from '../types';
import { failing, memoryStore, okJson, status } from './helpers';

const catalogFixture = JSON.parse(readFileSync('tests/e2e/fixtures/library/catalog.json', 'utf8')) as CatalogFile;
const bookBody = { schema: 'elephantology.library.book/1', id: 'glossary', contentHash: 'h', html: '<p>x</p>', notes: [], blocks: 1 };
const glossary = { ...catalogFixture.books[0], id: 'glossary', contentUrl: 'books/glossary.json' };

test('loads the catalog and caches it', async () => {
  const store = memoryStore();
  const r = await loadCatalog({ fetch: okJson(catalogFixture), store });
  assert.equal(r.stale, false);
  assert.equal(store.read().catalogCache?.catalog.schema, 'elephantology.library/1');
});
test('requests base + catalog.json', async () => {
  const urls: string[] = [];
  const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify(catalogFixture)); }) as unknown as typeof fetch;
  await loadCatalog({ fetch: f, store: memoryStore(), base: '/x/' });
  assert.deepEqual(urls, ['/x/catalog.json']);
});
test('falls back to the cached catalog when offline', async () => {
  const store = memoryStore({ catalogCache: { generatedAt: 'x', catalog: catalogFixture } });
  const r = await loadCatalog({ fetch: failing(), store });
  assert.equal(r.stale, true);
  assert.equal(r.catalog.books.length, catalogFixture.books.length);
});
test('falls back to the cache on a server error', async () => {
  const store = memoryStore({ catalogCache: { generatedAt: 'x', catalog: catalogFixture } });
  assert.equal((await loadCatalog({ fetch: status(503), store })).stale, true);
});
test('reports network errors without a cache', async () => {
  await assert.rejects(loadCatalog({ fetch: failing(), store: memoryStore() }), { kind: 'network' });
});
test('reports a bad status as network without a cache', async () => {
  await assert.rejects(loadCatalog({ fetch: status(500), store: memoryStore() }), { kind: 'network' });
});
test('rejects unknown schemas', async () => {
  await assert.rejects(loadCatalog({ fetch: okJson({ ...catalogFixture, schema: 'elephantology.library/2' }), store: memoryStore() }), { kind: 'schema' });
});
test('rejects a catalog without books', async () => {
  await assert.rejects(loadCatalog({ fetch: okJson({ ...catalogFixture, books: null }), store: memoryStore() }), { kind: 'schema' });
});
test('treats invalid JSON as a network error', async () => {
  const f = (async () => new Response('<html>')) as typeof fetch;
  await assert.rejects(loadCatalog({ fetch: f, store: memoryStore() }), { kind: 'network' });
});
test('falls back to the cache when the body is not JSON', async () => {
  const store = memoryStore({ catalogCache: { generatedAt: 'x', catalog: catalogFixture } });
  const f = (async () => new Response('<html>portal</html>')) as typeof fetch;
  assert.equal((await loadCatalog({ fetch: f, store })).stale, true);
});
test('an unknown schema rejects even when a cache exists', async () => {
  const store = memoryStore({ catalogCache: { generatedAt: 'x', catalog: catalogFixture } });
  await assert.rejects(loadCatalog({ fetch: okJson({ ...catalogFixture, schema: 'elephantology.library/2' }), store }), { kind: 'schema' });
});
test('treats a book body that is not JSON as a network error', async () => {
  const f = (async () => new Response('<html>')) as typeof fetch;
  await assert.rejects(loadBook(glossary, { fetch: f }), { kind: 'network' });
});
test('loads a book from base + contentUrl', async () => {
  const urls: string[] = [];
  const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify(bookBody)); }) as unknown as typeof fetch;
  const b = await loadBook(glossary, { fetch: f, base: '/x/' });
  assert.equal(b.id, 'glossary');
  assert.deepEqual(urls, ['/x/books/glossary.json']);
});
test('reports a missing book as notfound', async () => {
  await assert.rejects(loadBook(catalogFixture.books[0], { fetch: status(404) }), { kind: 'notfound' });
});
test('reports book network failures and server errors as network', async () => {
  await assert.rejects(loadBook(glossary, { fetch: failing() }), { kind: 'network' });
  await assert.rejects(loadBook(glossary, { fetch: status(500) }), { kind: 'network' });
});
test('rejects a malformed book as schema', async () => {
  await assert.rejects(loadBook(glossary, { fetch: okJson({ ...bookBody, schema: 'x' }) }), { kind: 'schema' });
  await assert.rejects(loadBook(glossary, { fetch: okJson({ ...bookBody, html: 5 }) }), { kind: 'schema' });
  await assert.rejects(loadBook(glossary, { fetch: okJson({ ...bookBody, id: 'other' }) }), { kind: 'schema' });
});
