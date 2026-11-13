/**
 * Hit-testing of the book (spec 8.7 and 8.8): the windows are aria-hidden copies of the flow, so a click is resolved
 * from the rectangles of the visible window's own elements instead of from the event target.
 */

/** How far from a note number (px) a click still counts as on it: the number is a few pixels wide. */
export const NOTE_SLOP: Record<string, number> = { mouse: 3, pen: 8, touch: 14 };
export const LINK_SLOP = 2;

export type Hit =
  | { kind: 'note'; el: Element; key: string | null; n: string | null }
  | { kind: 'hash'; h: string }
  | { kind: 'book'; id: string }
  | { kind: 'ext'; href: string }
  | { kind: 'toc'; h: string }
  | { kind: 'plate'; fig: Element };

/** Distance from a point to a rectangle (0 inside it). */
export function distance(r: DOMRect, x: number, y: number): number {
  return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
}

/** A page on display, for hit-testing: its element and the copy of the flow it shows. */
export interface HitPage { el: HTMLElement; flow: HTMLElement }

/** The note, link, contents row or plate at a point of the screen, or null. Looks only at the pages on display. */
export function hitAt(pages: Array<HitPage | null>, x: number, y: number, slop: number): Hit | null {
  for (const p of pages) {
    if (!p || p.el.classList.contains('blank')) continue;
    const win = p.flow.parentElement;
    if (!win || distance(win.getBoundingClientRect(), x, y) > slop) continue;
    const found = hitIn(p.flow, x, y, slop);
    if (found) return found;
  }
  return null;
}

export function hitIn(flow: HTMLElement, x: number, y: number, slop: number): Hit | null {
  const near = (e: Element, within: number): number => {
    let d = Number.POSITIVE_INFINITY;
    for (const r of Array.from(e.getClientRects())) d = Math.min(d, distance(r, x, y));
    return d <= within ? d : Number.POSITIVE_INFINITY;
  };
  let best: Element | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  flow.querySelectorAll('sup.note').forEach((sup) => {
    const d = near(sup, slop);
    if (d < bestD) {
      best = sup;
      bestD = d;
    }
  });
  if (best) {
    const sup: Element = best;
    return { kind: 'note', el: sup, key: sup.getAttribute('data-key'), n: sup.querySelector('a[data-note]')?.getAttribute('data-note') ?? null };
  }
  for (const a of Array.from(flow.querySelectorAll('a[href^="#"], a[data-book], a[href^="https:"]'))) {
    if (near(a, LINK_SLOP) === Number.POSITIVE_INFINITY) continue;
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#')) return { kind: 'hash', h: href.slice(1) };
    if (a.hasAttribute('data-book')) return { kind: 'book', id: a.getAttribute('data-book') ?? '' };
    return { kind: 'ext', href };
  }
  for (const li of Array.from(flow.querySelectorAll('.fm-next li[data-book]'))) {
    if (near(li, 0) !== Number.POSITIVE_INFINITY) return { kind: 'book', id: li.getAttribute('data-book') ?? '' };
  }
  for (const li of Array.from(flow.querySelectorAll('.fm-next li.fm-next-ext'))) {
    const a = li.querySelector('a[href^="https:"]');
    if (a && near(li, 0) !== Number.POSITIVE_INFINITY) return { kind: 'ext', href: a.getAttribute('href') ?? '' };
  }
  for (const li of Array.from(flow.querySelectorAll('.fm.contents li[data-h]'))) {
    if (near(li, 0) !== Number.POSITIVE_INFINITY) return { kind: 'toc', h: li.getAttribute('data-h') ?? '' };
  }
  for (const fig of Array.from(flow.querySelectorAll('figure.plate'))) {
    if (near(fig, 0) !== Number.POSITIVE_INFINITY) return { kind: 'plate', fig };
  }
  return null;
}
