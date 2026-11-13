/**
 * The reading place (spec section 8.10): the pure decisions. The reader measures; this module only chooses. An anchor is
 * the block (`data-b`) and the character offset in it, the nearest heading `h` and the share of the book `f`.
 */
import type { Anchor, BookMemory } from '../store';
import type { BookFile } from '../types';
import type { Layout } from './paginate';

/** The `b` of an anchor on a page that has no block of the text (the front matter, the literature, the colophon): its place is the share `f`. */
export const NO_BLOCK = -1;

const clampPage = (p: number, layout: Layout): number => Math.max(0, Math.min(layout.pages - 1, p));

/**
 * The page to open on: the block of the anchor if the book is the same and the block is found; else the chapter with
 * the same `h`; else the same share of the book; else the start of the text. `locate` measures a block anchor.
 */
export function chooseRestorePage(memory: BookMemory | null, book: BookFile, layout: Layout, locate: (a: Anchor) => number | null): number {
  const at = memory?.at;
  if (!memory || !at) return layout.bodyStart;
  if (memory.hash === book.contentHash) {
    const page = locate(at);
    if (page !== null) return clampPage(page, layout);
  }
  if (at.h !== undefined) {
    const chapter = layout.chapters.find((c) => c.h === at.h);
    if (chapter) return clampPage(chapter.page, layout);
  }
  if (at.f !== undefined) return clampPage(Math.round(at.f * (layout.pages - 1)), layout);
  return layout.bodyStart;
}

/**
 * The anchor of a page: its first block and offset (`firstBlockOnPage`; null on a page that has no block of the text), the last chapter that begins on or before it, and its share of the book. A page with no block gets `b: NO_BLOCK`.
 */
export function anchorAt(page: number, layout: Layout, firstBlockOnPage: (p: number) => { b: number; o: number } | null): Anchor {
  const at = firstBlockOnPage(page);
  const anchor: Anchor = { b: at?.b ?? NO_BLOCK, o: at?.o ?? 0 };
  let h: string | undefined;
  for (const c of layout.chapters) {
    if (c.page > page) break;
    h = c.h;
  }
  if (h !== undefined) anchor.h = h;
  anchor.f = layout.pages > 1 ? Math.max(0, Math.min(1, page / (layout.pages - 1))) : 0;
  return anchor;
}

/** The colophon page is on display (spec 8.10: «Прочитана»). */
export function isFinished(page: number, layout: Layout): boolean {
  return page >= layout.endStart;
}
