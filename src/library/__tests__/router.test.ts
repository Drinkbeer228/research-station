import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, bookHash } from '../router';

test('parses library routes', () => {
  assert.deepEqual(parseRoute('#/library'), { kind: 'hall' });
  assert.deepEqual(parseRoute('#/library/catalog?q=%D1%85%D0%BE%D0%B1%D0%BE%D1%82'), { kind: 'catalog', q: 'хобот' });
  assert.deepEqual(parseRoute('#/library/anatomy/muscular-hydrostat-and-trunk-biomechanics'), { kind: 'book', id: 'anatomy/muscular-hydrostat-and-trunk-biomechanics' });
  assert.deepEqual(parseRoute('#/library/glossary'), { kind: 'book', id: 'glossary' });
});

test('handles hall and catalog edges', () => {
  assert.deepEqual(parseRoute('#/library/'), { kind: 'hall' });
  assert.deepEqual(parseRoute('#/library/catalog'), { kind: 'catalog', q: '' });
  assert.equal(parseRoute('#/library?glossary'), null);
  assert.equal(parseRoute('#/library?q=x'), null);
});

test('rejects garbage', () => {
  for (const h of ['', '#', '#/other', '#/library/../x', '#/library/a/b/c', '#/library/ANATOMY/x y', '#/library/<script>/x']) {
    assert.equal(parseRoute(h), null, h);
  }
});

test('builds book hashes', () => {
  assert.equal(bookHash('anatomy/x'), '#/library/anatomy/x');
});
