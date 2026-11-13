/**
 * Note cards (spec section 8.8): a small card with the text of a source, anchored to the note number, and the
 * display-only tidying of note numbers. Note HTML is cleaned by the sanitizer again on its way into the card, even
 * though `buildFlow` has already used it once. The pure parts (which note, where the card goes) take plain values.
 */
import type { BookNote } from '../types';
import { sanitizeBookHtml } from './sanitize';

export const MISSING_TEXT = 'Источник не указан в статье';
export const TO_REFS = 'К списку литературы';
/** Raised on the reader root when the card's button is pressed; `detail.key` is the key of the note. */
export const REFS_EVENT = 'rd-note-refs';

const CARD_WIDTH = 380;
const MARGIN = 8;
const GAP = 10;

/** The note a number stands for: its sup's key decides (a number can repeat), the shown number is the fallback. */
export function findNote(notes: BookNote[], key: string | null, n: string | null): BookNote | null {
  if (key !== null) {
    const byKey = notes.find((x) => x.key === key);
    if (byKey) return byKey;
  }
  return n === null ? null : notes.find((x) => x.n === n) ?? null;
}

export function noteTitle(note: BookNote): string {
  return `Источник ${note.n}`;
}

/** A source the article never gives keeps its label as written, so the reader can see what was cited. */
export function noteLabel(note: BookNote): string | null {
  return note.missing ? `Метка в статье: ${note.key}` : null;
}

/**
 * Display only (spec 8.8): the article puts a space before a note number, the page must not. Trims the ordinary
 * whitespace that ends the text node before each `sup.note`; a no-break space is the author's own and stays.
 */
export function tidyNoteSpacing(body: ParentNode): void {
  body.querySelectorAll('sup.note').forEach((sup) => {
    const prev = sup.previousSibling;
    if (!prev || prev.nodeType !== 3) return;
    const text = (prev.nodeValue ?? '').replace(/[ \t\n\r\f]+$/, '');
    if (text) prev.nodeValue = text;
    else prev.parentNode?.removeChild(prev); // only a space between two notes: they touch, so the reader puts a comma

  });
}

interface Box { left: number; top: number; right: number; bottom: number }

/**
 * Where the card goes: centred on the click and kept `MARGIN` inside the window; below the number, or above it
 * when there is no room below; pinned to the bottom edge when there is room neither way.
 */
export function placeNote(anchor: Box | null, at: { x: number; y: number }, size: { w: number; h: number }, view: { w: number; h: number }): { left: number; top: number; above: boolean } {
  const maxLeft = Math.max(MARGIN, view.w - size.w - MARGIN);
  const left = Math.min(maxLeft, Math.max(MARGIN, at.x - size.w / 2));
  const top0 = anchor ? anchor.top : at.y;
  const bottom0 = anchor ? anchor.bottom : at.y;
  let top = bottom0 + GAP;
  let above = false;
  if (top + size.h > view.h - MARGIN) {
    const up = top0 - GAP - size.h;
    if (up >= MARGIN) {
      top = up;
      above = true;
    } else {
      top = Math.max(MARGIN, view.h - size.h - MARGIN);
    }
  }
  return { left, top, above };
}

function el(doc: Document, tag: string, cls: string, text?: string): HTMLElement {
  const e = doc.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function noteOpen(root: HTMLElement): boolean {
  return root.querySelector(':scope > .rd-note') !== null;
}

export function hideNote(root: HTMLElement): void {
  const cards = Array.from(root.querySelectorAll(':scope > .rd-note'));
  if (!cards.length) return;
  const active = root.ownerDocument.activeElement;
  const hadFocus = cards.some((c) => active !== null && c.contains(active));
  cards.forEach((c) => c.remove());
  if (hadFocus) root.focus({ preventScroll: true });
}

export function showNote(root: HTMLElement, anchor: Element, note: BookNote, at: { x: number; y: number }): void {
  hideNote(root);
  const doc = root.ownerDocument;
  const card = el(doc, 'div', 'rd-note');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', noteTitle(note));
  card.tabIndex = -1;

  const head = el(doc, 'div', 'rd-note-head');
  head.append(el(doc, 'h3', 'rd-note-title', noteTitle(note)));
  const x = el(doc, 'button', 'rd-note-x', '×');
  x.setAttribute('type', 'button');
  x.setAttribute('aria-label', 'Скрыть сноску');
  x.addEventListener('click', () => hideNote(root));
  head.append(x);

  const body = el(doc, 'div', 'rd-note-body');
  if (note.missing) {
    body.append(el(doc, 'p', 'rd-note-missing', MISSING_TEXT), el(doc, 'p', 'rd-note-label', noteLabel(note) ?? ''));
  } else {
    body.append(sanitizeBookHtml(note.html, doc));
  }

  const actions = el(doc, 'div', 'rd-note-actions');
  const refs = el(doc, 'button', 'rd-btn rd-note-refs', TO_REFS);
  refs.setAttribute('type', 'button');
  refs.addEventListener('click', () => root.dispatchEvent(new CustomEvent(REFS_EVENT, { detail: { key: note.key } })));
  actions.append(refs);

  card.append(head, body, actions);
  card.style.visibility = 'hidden';
  root.append(card);

  // Measured with the card in place; a layout-less environment (the unit tests) leaves it where CSS puts it.
  const view = root.getBoundingClientRect();
  const w = card.offsetWidth || CARD_WIDTH;
  const h = card.offsetHeight;
  if (Number.isFinite(view.width) && view.width > 0 && h > 0) {
    const rect = anchor.getBoundingClientRect();
    const box = rect.width > 0 || rect.height > 0 ? rect : null;
    const p = placeNote(box, at, { w, h }, { w: view.width, h: view.height });
    card.style.left = `${Math.round(p.left - view.left)}px`;
    card.style.top = `${Math.round(p.top - view.top)}px`;
    card.classList.toggle('above', p.above);
  }
  card.style.visibility = '';
  card.focus({ preventScroll: true });
}
