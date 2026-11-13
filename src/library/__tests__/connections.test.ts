import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BOOK_CONNECTIONS, getBookConnections } from '../connections';
import type { CatalogFile } from '../types';

const catalogPath = fileURLToPath(new URL('../../../tests/e2e/fixtures/library/catalog.json', import.meta.url));
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as CatalogFile;

test('every book id in BOOK_CONNECTIONS exists in catalog.json', () => {
  const knownIds = new Set(catalog.books.map((b) => b.id));
  const ids = Object.keys(BOOK_CONNECTIONS);
  assert.ok(ids.length >= 30, 'expected at least 30 connected books');
  for (const id of ids) {
    assert.ok(knownIds.has(id), `BOOK_CONNECTIONS references unknown book id: ${id}`);
  }
});

test('excludes veterinary/clinical-welfare-and-protected-contact from Keeper Sim links per spec §5.4', () => {
  const pc = getBookConnections('veterinary/clinical-welfare-and-protected-contact');
  assert.equal(pc?.keeper, undefined);
});

test('formats Elephantorina and Keeper Sim URLs accurately', () => {
  const trunk = getBookConnections('anatomy/muscular-hydrostat-and-trunk-biomechanics');
  assert.ok(trunk?.elephantorina);
  assert.equal(
    trunk.elephantorina.url,
    'https://drinkbeer228.github.io/elephantorina/?course=track-4-evolution&lesson=lesson-3-18-1',
  );
  assert.ok(trunk?.keeper);
  assert.equal(trunk.keeper.url, 'https://drinkbeer228.github.io/Elephant-keeper-/');
});
