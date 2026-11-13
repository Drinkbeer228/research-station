import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGeometry, defaultFontSize, headingsToPush, pageIndex, plateFit, type Geometry } from '../reader/paginate';

const pick = (g: Geometry) => ({ spread: g.spread, W: g.W, H: g.H, lh: g.lh, cw: g.cw, ch: g.ch });

test('geometry matches the measured preview', () => {
  assert.deepEqual(pick(computeGeometry(1440, 900, 17)), { spread: true, W: 578, H: 826, lh: 26, cw: 478, ch: 702 });
  assert.deepEqual(pick(computeGeometry(1920, 1080, 17)), { spread: true, W: 672, H: 960, lh: 26, cw: 572, ch: 832 });
  assert.deepEqual(pick(computeGeometry(375, 812, 16)), { spread: false, W: 361, H: 585, lh: 24, cw: 317, ch: 480 });
  assert.deepEqual(pick(computeGeometry(820, 1180, 17)), { spread: false, W: 640, H: 1037, lh: 26, cw: 596, ch: 936 });
});

test('spread and single page margins and gap', () => {
  const s = computeGeometry(1440, 900, 17);
  assert.deepEqual([s.pt, s.pb, s.po, s.pi, s.gap, s.fs], [56, 52, 44, 56, 120, 17]);
  const p = computeGeometry(375, 812, 16);
  assert.deepEqual([p.pt, p.pb, p.po, p.pi, p.gap, p.fs], [46, 46, 22, 22, 120, 16]);
});

test('default font size is 16 below 560 px, else 17', () => {
  assert.equal(defaultFontSize(375), 16);
  assert.equal(defaultFontSize(559), 16);
  assert.equal(defaultFontSize(560), 17);
  assert.equal(defaultFontSize(1440), 17);
});

test('plates fold below 9.8px', () => {
  assert.deepEqual(plateFit(60, 478, 17), { fontPx: 12.92, fold: false });
  assert.deepEqual(plateFit(86, 478, 17), { fontPx: 9.08, fold: true });
});

test('pushes headings stranded at a column end or split across columns', () => {
  assert.deepEqual(headingsToPush([
    { heading: false, col: 3, split: false }, { heading: true, col: 3, split: false }, { heading: false, col: 4, split: false },
    { heading: true, col: 5, split: true }, { heading: false, col: 6, split: false },
    { heading: true, col: 7, split: false }, { heading: false, col: 7, split: false },
  ]), [1, 3]);
});

test('maps offsets to pages', () => {
  const g = computeGeometry(1440, 900, 17);
  assert.equal(pageIndex(0, g), 0); assert.equal(pageIndex(595, g), 0); assert.equal(pageIndex(596, g), 1); assert.equal(pageIndex(1194, g), 2);
});
