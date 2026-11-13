import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { enterReadingMode, READING_VIEWPORT, wrapFocus } from '../reader/mobile';

const CAMPUS = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
const page = () => parseHTML(`<html><head><meta name="viewport" content="${CAMPUS}"></head><body></body></html>`).document as unknown as Document;

test('lifts root restrictions and restores them', () => {
  const document = page();
  const restore = enterReadingMode(document);
  assert.ok(document.documentElement.classList.contains('ers-library-open'));
  assert.equal(document.querySelector('meta[name=viewport]')!.getAttribute('content'), READING_VIEWPORT);
  restore();
  assert.ok(!document.documentElement.classList.contains('ers-library-open'));
  assert.equal(document.querySelector('meta[name=viewport]')!.getAttribute('content'), CAMPUS);
});

test('nests safely', () => {
  const document = page();
  const outer = enterReadingMode(document);
  const inner = enterReadingMode(document);
  inner();
  assert.ok(document.documentElement.classList.contains('ers-library-open'));
  assert.equal(document.querySelector('meta[name=viewport]')!.getAttribute('content'), READING_VIEWPORT);
  outer();
  assert.ok(!document.documentElement.classList.contains('ers-library-open'));
  assert.equal(document.querySelector('meta[name=viewport]')!.getAttribute('content'), CAMPUS);
});

test('a restorer called twice does not unbalance the count', () => {
  const document = page();
  const outer = enterReadingMode(document);
  const inner = enterReadingMode(document);
  inner();
  inner();
  assert.ok(document.documentElement.classList.contains('ers-library-open'));
  outer();
  assert.equal(document.querySelector('meta[name=viewport]')!.getAttribute('content'), CAMPUS);
});

test('a page without a viewport meta only gets the class', () => {
  const { document } = parseHTML('<html><head></head><body></body></html>');
  const restore = enterReadingMode(document as unknown as Document);
  assert.ok(document.documentElement.classList.contains('ers-library-open'));
  restore();
  assert.ok(!document.documentElement.classList.contains('ers-library-open'));
});

test('the focus trap wraps at both ends and pulls in focus from outside', () => {
  const stops = ['a', 'b', 'c'];
  assert.equal(wrapFocus(stops, 'c', false), 'a');
  assert.equal(wrapFocus(stops, 'a', true), 'c');
  assert.equal(wrapFocus(stops, 'b', false), null);
  assert.equal(wrapFocus(stops, 'b', true), null);
  assert.equal(wrapFocus(stops, 'root', false), 'a');
  assert.equal(wrapFocus(stops, 'root', true), 'c');
  assert.equal(wrapFocus([], 'root', false), null);
});
