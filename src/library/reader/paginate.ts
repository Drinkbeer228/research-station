/**
 * Book pagination with CSS columns (spec sections 8.2 and 8.5). The flow is one block a page high whose columns are
 * as wide as the text; page `i` is a window on column `i`. The pure functions hold the geometry and the decisions;
 * `layoutFlow` measures a flow that the caller has already attached to a hidden, rendered measuring block, and only
 * touches that flow: inline geometry on it, plate sizes, `break-before` on headings and one blank page before the text.
 */
import type { FlowParts } from './bookDom';

export interface Geometry { spread: boolean; W: number; H: number; fs: number; lh: number; pt: number; pb: number; po: number; pi: number; cw: number; ch: number; gap: number }

const GAP = 120;
/** Line height of a diagram, relative to its own size: the value of the measured preview (`fitPlates` in the prototype). */
const PLATE_LINE = 1.3;
/** A folded preview is shrunk into the rest of the previous column only if at least this many text lines remain. */
const MIN_REST_LINES = 6;
const MAX_KEEP_PASSES = 4;

/** Spread when the window is at least 860 px wide and wider than 1.04:1, otherwise one page (spec 8.2). */
export function computeGeometry(vw: number, vh: number, fs: number): Geometry {
  const spread = vw >= 860 && vw / vh > 1.04;
  let H: number;
  let W: number;
  if (spread) {
    H = Math.min(vh - 74, 960);
    W = Math.min(Math.round(H * 0.7), Math.floor((vw - 56) / 2));
  } else {
    W = Math.min(vw - 14, 640, Math.round((vh - 74) * 0.7) + 200);
    H = Math.min(vh - 74, Math.round(W * 1.62));
  }
  const lh = Math.round(fs * 1.5);
  const [pt, pb, po, pi] = spread ? [56, 52, 44, 56] : [46, 46, 22, 22];
  const cw = W - po - pi;
  const ch = Math.floor((H - pt - pb) / lh) * lh;
  return { spread, W, H, fs, lh, pt, pb, po, pi, cw, ch, gap: GAP };
}

export function defaultFontSize(vw: number): number {
  return vw < 560 ? 16 : 17;
}

/** The size at which a diagram's longest line fits the column, never larger than 0.76 of the text; below 9.8 px it folds. */
export function plateFit(cols: number, cw: number, fs: number): { fontPx: number; fold: boolean } {
  const px = Math.min(fs * 0.76, (cw - 8) / (cols * 0.602));
  return { fontPx: Math.round(px * 100) / 100, fold: px < 9.8 };
}

/** The page (column) an element starts on, from its left edge relative to the flow; 2 px absorbs subpixel drift. */
export function pageIndex(leftOffset: number, g: Geometry): number {
  return Math.floor((leftOffset + 2) / (g.cw + g.gap));
}

/** Indices of headings that end up in an earlier column than the element after them, or split between columns. */
export function headingsToPush(items: Array<{ heading: boolean; col: number; split: boolean }>): number[] {
  const out: number[] = [];
  items.forEach((it, i) => {
    if (!it.heading) return;
    const next = items[i + 1];
    if (it.split || (next !== undefined && next.col > it.col)) out.push(i);
  });
  return out;
}

export interface Layout { pages: number; bodyStart: number; endStart: number; chapters: Array<{ text: string; h: string; page: number }> }

const HEADING = /^H[2-6]$/;
const KEPT = 'data-keep';

function px(n: number): string {
  return `${n}px`;
}

/** Puts the geometry on the flow itself, so the measuring block and every window cloned from it lay out the same. */
function applyGeometry(flow: HTMLElement, g: Geometry): void {
  for (const k of ['W', 'H', 'fs', 'lh', 'pt', 'pb', 'po', 'pi', 'cw', 'ch', 'gap'] as const) flow.style.setProperty(`--${k}`, px(g[k]));
  const s = flow.style;
  s.width = px(g.cw);
  s.height = px(g.ch);
  s.columnWidth = px(g.cw);
  s.columnGap = px(g.gap);
  s.columnFill = 'auto';
  s.fontSize = px(g.fs);
  s.lineHeight = px(g.lh);
}

/** Undoes a previous `layoutFlow` on the same flow, for relayout after a resize or a font size change. */
function reset(parts: FlowParts): void {
  parts.flow.querySelectorAll(':scope > section.fm.blank').forEach((b) => b.remove());
  parts.body.querySelectorAll<HTMLElement>(`[${KEPT}]`).forEach((h) => {
    h.style.breakBefore = '';
    h.style.marginTop = '';
    h.removeAttribute(KEPT);
  });
  parts.flow.querySelectorAll<HTMLElement>(':scope > section.refs, :scope > section.fm.end').forEach((s) => (s.style.marginTop = ''));
  parts.body.querySelectorAll<HTMLElement>('figure.plate').forEach((fig) => {
    fig.classList.remove('fold');
    const pre = fig.querySelector('pre');
    if (pre) pre.style.fontSize = pre.style.lineHeight = pre.style.maxHeight = '';
  });
}

function diagramCols(fig: Element, pre: Element): number {
  const fromData = Number(fig.getAttribute('data-cols'));
  if (Number.isFinite(fromData) && fromData > 0) return fromData;
  const lines = (pre.textContent ?? '').replace(/\n$/, '').split('\n');
  return Math.max(1, ...lines.map((l) => [...l].length));
}

export function layoutFlow(parts: FlowParts, g: Geometry): Layout {
  const { flow, body, end, sentinel } = parts;
  if (!flow.isConnected) throw new Error('layoutFlow: the flow must be attached to a rendered measuring block');
  const win = flow.ownerDocument.defaultView;
  if (!win) throw new Error('layoutFlow: the flow must be attached to a rendered measuring block');
  reset(parts);
  applyGeometry(flow, g);

  // Firefox does not know `break-before: column` (and its `always` breaks pages only). A margin as high as a column,
  // on the first block of the new column, is cut at the column break and leaves the block at the top of the next one.
  const forcesColumns = win.CSS?.supports?.('break-before', 'column') ?? true;
  const startColumn = (e: HTMLElement) => {
    if (forcesColumns) e.style.breakBefore = 'column';
    else e.style.marginTop = px(g.ch);
  };
  if (!forcesColumns) flow.querySelectorAll<HTMLElement>(':scope > section.refs, :scope > section.fm.end').forEach(startColumn);

  const origin = () => flow.getBoundingClientRect();
  const colOf = (left: number) => pageIndex(left - origin().left, g);
  const firstRect = (e: Element) => e.getClientRects()[0] ?? e.getBoundingClientRect();
  const lastRect = (e: Element) => {
    const rects = e.getClientRects();
    return rects[rects.length - 1] ?? e.getBoundingClientRect();
  };
  const pageOf = (e: Element) => colOf(firstRect(e).left);

  // 4a. On a spread the text starts on a right page: pages are 0-based and right pages are even.
  // Only the front matter decides this, so nothing done to the body below can change it.
  if (g.spread && pageOf(body) % 2 === 1) {
    const blank = flow.ownerDocument.createElement('section');
    blank.className = 'fm blank';
    blank.setAttribute('aria-hidden', 'true');
    blank.style.height = px(g.ch);
    blank.style.breakAfter = 'column';
    body.before(blank);
  }

  // 4b. Images: the box comes from the `width` and `height` attributes, so it is the same before the file has arrived
  // (a box of 2 px, the borders only) and after (its own size): a picture that arrives late changed the page count.
  // The size is what the style sheet gives a loaded picture: at most the column wide and 0.6 of a column high.
  flow.querySelectorAll<HTMLImageElement>('img[width][height]').forEach((img) => {
    const w0 = Number(img.getAttribute('width'));
    const h0 = Number(img.getAttribute('height'));
    if (!(w0 > 0 && h0 > 0)) return;
    const w = Math.floor(Math.min(g.cw - 2, w0, (g.ch * 0.6 * w0) / h0));
    img.style.width = px(w);
    img.style.height = px(Math.round((w * h0) / w0));
  });

  // 5. Plates: the size at which the longest line fits; too small means a folded preview.
  const folded: HTMLElement[] = [];
  body.querySelectorAll<HTMLElement>('figure.plate[data-kind="diagram"]').forEach((fig) => {
    const pre = fig.querySelector('pre');
    if (!pre) return;
    const { fontPx, fold } = plateFit(diagramCols(fig, pre), g.cw, g.fs);
    pre.style.fontSize = px(fontPx);
    pre.style.lineHeight = px(Math.round(fontPx * PLATE_LINE * 100) / 100);
    fig.classList.toggle('fold', fold);
    if (fold) folded.push(fig);
  });
  // A preview pushed to the next column leaves a gap; if the gap holds at least 6 lines, shrink the preview into it.
  // Redone from scratch on every pass, in document order, because each pushed heading moves everything after it.
  const shrink = (): string => {
    for (const fig of folded) fig.querySelector('pre')!.style.maxHeight = '';
    for (const fig of folded) {
      const pre = fig.querySelector('pre')!;
      const prev = fig.previousElementSibling;
      if (!prev) continue;
      const prevCol = colOf(lastRect(prev).left);
      if (pageOf(fig) <= prevCol) continue;
      const rest = g.ch - (lastRect(prev).bottom - origin().top);
      if (rest < MIN_REST_LINES * g.lh) continue;
      const prevMargin = parseFloat(win.getComputedStyle(prev).marginBottom) || 0;
      const chrome = fig.getBoundingClientRect().height - pre.getBoundingClientRect().height;
      const max = Math.floor(rest - Math.max(prevMargin, parseFloat(win.getComputedStyle(fig).marginTop) || 0) - chrome);
      if (max <= 0 || max >= pre.getBoundingClientRect().height) continue;
      pre.style.maxHeight = px(max);
      if (pageOf(fig) !== prevCol) pre.style.maxHeight = ''; // did not fit after all: keep the preview whole
    }
    return folded.map((fig) => fig.querySelector('pre')!.style.maxHeight).join('|');
  };

  // 4. Keep with next: a heading left at a column end, or split between columns, starts the next column.
  const push = (): boolean => {
    const els = Array.from(body.children) as HTMLElement[];
    const items = els.map((e) => ({
      heading: HEADING.test(e.tagName),
      col: pageOf(e),
      split: HEADING.test(e.tagName) && colOf(lastRect(e).left) !== pageOf(e),
    }));
    const fresh = headingsToPush(items).map((i) => els[i]).filter((h) => !h.hasAttribute(KEPT));
    for (const h of fresh) {
      startColumn(h);
      h.setAttribute(KEPT, '');
    }
    return fresh.length > 0;
  };

  // Steps 5 and 4 together, until neither changes anything, at most 4 passes. A pass that ends with pushed
  // headings is followed by one last shrink, so the previews always match the final heading breaks.
  let shrunk: string | null = null;
  let pushed = false;
  for (let pass = 0; pass < MAX_KEEP_PASSES; pass++) {
    const now = shrink();
    pushed = push();
    if (!pushed && now === shrunk) break;
    shrunk = now;
  }
  if (pushed) shrink();

  // 3. Pages by the zero-height sentinel: at the very top of a column it means that column is empty.
  const s = firstRect(sentinel);
  const pages = colOf(s.left) + (s.top - origin().top < 4 ? 0 : 1);

  // 6. Page numbers of the chapters, for the contents, the running heads and the literature.
  const chapters = Array.from(body.querySelectorAll<HTMLElement>('h2[data-h]')).map((h) => ({
    text: (h.textContent ?? '').trim(),
    h: h.getAttribute('data-h') ?? '',
    page: pageOf(h),
  }));

  return { pages, bodyStart: pageOf(body), endStart: pageOf(end), chapters };
}
