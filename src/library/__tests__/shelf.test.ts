import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { createStore } from '../store';
import type { CatalogFile } from '../types';
import { REFERENCE_COLOR } from '../reader/reader';
import { searchCatalog, Shelf, spineColor } from '../reader/shelf';

const catalogPath = fileURLToPath(new URL('../../../tests/e2e/fixtures/library/catalog.json', import.meta.url));
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as CatalogFile;

test('searchCatalog finds books by shortTitle, title, and h2 headings with Russian stem matching', () => {
  const byShort = searchCatalog(catalog, 'хобота');
  assert.ok(byShort.some((h) => h.book.id === 'anatomy/muscular-hydrostat-and-trunk-biomechanics'));

  const byH2 = searchCatalog(catalog, 'Гидродинамика');
  const trunkHit = byH2.find((h) => h.book.id === 'anatomy/muscular-hydrostat-and-trunk-biomechanics');
  assert.ok(trunkHit, 'expected trunk book to match h2 heading «Гидродинамика»');
  assert.ok(trunkHit.matchedHeadings.some((h) => /Гидродинамика/i.test(h.text)));

  const refHit = searchCatalog(catalog, 'Глоссарий');
  assert.equal(refHit[0]?.book.id, 'glossary');
});

test('Shelf renders 10 discipline shelves, reference books in #4F5552, and living details (lamp + cat)', () => {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const root = document.createElement('div');
  document.body.appendChild(root);

  let openedBook: { id: string; heading?: string } | null = null;
  const shelf = new Shelf({
    doc: document,
    root,
    catalog,
    store: createStore(null),
    onClose: () => {},
    onOpenBook: (id, heading) => {
      openedBook = { id, heading };
    },
  });
  shelf.open();

  // 10 discipline cases in order (taxonomy is order: 1, anatomy is order: 2)
  const cases = [...root.querySelectorAll('.sh-case')];
  assert.equal(cases.length, 10);
  assert.equal(cases[0].getAttribute('data-discipline'), 'taxonomy');
  assert.equal(cases[1].getAttribute('data-discipline'), 'anatomy');

  // Discipline spines + 2 reference books = all books in catalog
  const spines = [...root.querySelectorAll('.sh-spine')];
  const refs = [...root.querySelectorAll('.sh-ref-book')];
  assert.equal(refs.length, 2);
  assert.equal(spines.length + refs.length, catalog.books.length);

  // Reference books use #4F5552
  for (const r of refs) {
    const id = r.getAttribute('data-book')!;
    const book = catalog.books.find((b) => b.id === id)!;
    assert.equal(spineColor(book), REFERENCE_COLOR);
  }

  // Living details: lamp + sleeping cat on book pile
  assert.ok(root.querySelector('.sh-lamp'));
  assert.ok(root.querySelector('.sh-pile .rd-cat'));

  // Clicking a spine triggers onOpenBook
  const trunkSpine = root.querySelector<HTMLElement>('.sh-spine[data-book="anatomy/muscular-hydrostat-and-trunk-biomechanics"]');
  assert.ok(trunkSpine);
  trunkSpine.click();
  assert.deepEqual(openedBook, { id: 'anatomy/muscular-hydrostat-and-trunk-biomechanics', heading: undefined });

  shelf.close();
});
