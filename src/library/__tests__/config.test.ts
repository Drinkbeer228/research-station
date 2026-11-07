import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY_BASE } from '../config';

test('LIBRARY_BASE falls back outside Vite', () => {
  assert.equal(LIBRARY_BASE, '/elephantology/library/');
});
