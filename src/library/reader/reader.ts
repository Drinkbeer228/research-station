/**
 * The book on the desk (spec sections 8.1, 8.2, 8.5 step 7 and 8.6). The measuring flow from `buildFlow` is laid out
 * by `layoutFlow`; every visible page is a window on one column of an inert, aria-hidden copy of that flow: two on a
 * spread, one on a single page, and two more for the turning leaf, made on the first turn.
 *
 * The windows are inert, so a click never reaches what is in them: it lands on the window or the edge strip, and
 * `hit` finds the note, link, contents row or plate under the point from the rectangles of the visible window's
 * own elements (notes, plates and links of spec 8.7 and 8.8; Task 20).
 */
import type { BookFile, CatalogBook, CatalogFile } from '../types';
import type { Store } from '../store';
import { buildFlow, type FlowParts } from './bookDom';
import { computeGeometry, defaultFontSize, layoutFlow, pageIndex, type Geometry, type Layout } from './paginate';
import { loadBookFonts } from './fonts';
import { installCopyCleaner } from './hyphenate';
import { runTurn, TURN_EASING } from './turn';
import { bookHash, parseRoute } from '../router';
import { findNote, hideNote, noteOpen, REFS_EVENT, showNote, tidyNoteSpacing } from './notes';
import { closeFoldout, foldoutOpen, openFoldout } from './foldout';

export interface ReaderOptions { doc: Document; root: HTMLElement; catalog: CatalogFile; entry: CatalogBook; book: BookFile; store: Store; reducedMotion: boolean; onClose(): void }

const SPREAD_MS = 640;
const SINGLE_MS = 460;
const FADE_MS = 120;
const COVER_MS = 640;
const RELAYOUT_DELAY = 160;
/** A finger turns the leaf when it has gone this share of the page width, or moved faster than this (px/ms). */
const SWIPE_SHARE = 0.35;
const SWIPE_SPEED = 0.5;
const SWIPE_SLOP = 10;
const VELOCITY_WINDOW = 100;
/** After a gesture, the click that some browsers send for the same touch is ignored for this long. */
const CLICK_QUIET_MS = 400;
/** How far from a note number (px) a click still counts as on it: the number is a few pixels wide. */
const NOTE_SLOP: Record<string, number> = { mouse: 3, pen: 8, touch: 14 };
const LINK_SLOP = 2;
const FLASH_MS = 2200;

type Hit =
  | { kind: 'note'; el: Element; key: string | null; n: string | null }
  | { kind: 'hash'; h: string }
  | { kind: 'book'; id: string }
  | { kind: 'ext'; href: string }
  | { kind: 'toc'; h: string }
  | { kind: 'plate'; fig: Element };

/** Distance from a point to a rectangle (0 inside it). */
function distance(r: DOMRect, x: number, y: number): number {
  return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
}

/** Cover colours: the discipline colours of the hall draft (`prototype/preview.template.html`, `DISC`). */
const COVER_COLORS: Record<string, string> = {
  taxonomy: '#6B7D57', anatomy: '#C86D51', ethogram: '#A96B3B', cognition: '#4F7F78', veterinary: '#2E5A44',
  ecology: '#7E9A5E', conservation: '#7A5C3E', culture: '#B8893B', paleontology: '#BFA468', genomics: '#8C5A6E',
};
/** The reference books are not on a shelf and have no discipline colour; they take the station ink. */
const REFERENCE_COLOR = '#4F5552';

const LAMP_SVG = '<circle cx="76" cy="76" r="60" fill="#2E5A44" stroke="#2C302E" stroke-width="3"/><circle cx="76" cy="76" r="45" fill="#3a6f55"/><circle cx="62" cy="60" r="20" fill="rgba(255,255,255,.12)"/><circle cx="76" cy="76" r="11" fill="#C9A15A" stroke="#2C302E" stroke-width="2.5"/>';
const PILE_SVG = '<g stroke="#2C302E" stroke-width="2"><rect x="10" y="20" width="108" height="74" rx="4" fill="#2E5A44" transform="rotate(-5 64 57)"/><rect x="14" y="20" width="100" height="70" rx="4" fill="#C86D51" transform="rotate(4 64 55)"/><rect x="20" y="24" width="88" height="62" rx="4" fill="#E4CF9C" transform="rotate(-2 64 55)"/></g>'
  + '<g class="rd-cat"><ellipse cx="62" cy="58" rx="31" ry="25" fill="#1F2324" stroke="#121415" stroke-width="2.4"/><path d="M36 74c10 16 42 16 56 2" fill="none" stroke="#181A1B" stroke-width="7.5" stroke-linecap="round"/><circle cx="91" cy="76" r="3.6" fill="#F7F5F0"/><circle cx="76" cy="48" r="14" fill="#232729" stroke="#121415" stroke-width="2"/><path d="M66 38l-2-13 12 7zM86 38l3-13-12 7z" fill="#161819" stroke="#121415" stroke-width="1.6"/><ellipse cx="80" cy="56" rx="6.5" ry="5" fill="#F7F5F0"/><circle cx="83" cy="54" r="1.5" fill="#D98A7C"/><path d="M66 48q3 2 6 0M78 44q3 2 6 0" fill="none" stroke="#E8E4DA" stroke-width="1.5" stroke-linecap="round"/></g>';

type Side = 'l' | 'r';
interface Page { el: HTMLElement; flow: HTMLElement; head: HTMLElement; folio: HTMLElement; shade: HTMLElement }
interface Leaf { el: HTMLElement; front: Page; back: Page }
/** One turn in progress: the pages it moves and the leaf angle at progress 0..1. */
interface TurnCtx { leaf: Leaf; under: Page; from: number; to: number }
interface Drag { id: number; x0: number; y0: number; samples: Array<{ x: number; t: number }>; dir: 0 | 1 | -1; target: number; dist: number; ctx: TurnCtx | null }

const rotate = (deg: number) => `rotateY(${deg}deg)`;
const angleAt = (c: TurnCtx, p: number) => c.from + (c.to - c.from) * p;
/** Shadows during a turn: the leaf darkens as it lifts, its back and the page under it lighten as it lands. */
const frontShade = (p: number) => 0.42 * p;
const backShade = (p: number) => 0.5 * (1 - p);
const underShade = (p: number) => 0.3 * (1 - p);

export class Reader {
  private readonly o: ReaderOptions;
  private readonly doc: Document;
  private readonly win: Window;
  private parts: FlowParts | null = null;
  private g: Geometry | null = null;
  private layout: Layout | null = null;
  private refsStart = Number.POSITIVE_INFINITY;
  private fs = 17;
  /** The spread (or, on a single page, the page) on display. */
  private s = 0;
  private busy = false;
  private closed = false;
  private bookEl: HTMLElement;
  private measureEl: HTMLElement;
  private cover: HTMLElement | null = null;
  private left: Page | null = null;
  private right: Page | null = null;
  private leaf: Leaf | null = null;
  private drag: Drag | null = null;
  private quietUntil = 0;
  private relayoutTimer: ReturnType<typeof setTimeout> | undefined;
  private flashTimer: ReturnType<typeof setTimeout> | undefined;
  /** The key of the note whose card is open, so a second click on the same number closes it. */
  private noteKey: string | null = null;
  private hoverFrame = 0;
  private fontsChanged = false;
  private readonly cleanup: Array<() => void> = [];

  constructor(o: ReaderOptions) {
    this.o = o;
    this.doc = o.doc;
    const win = o.doc.defaultView;
    if (!win) throw new Error('Reader: the document has no window');
    this.win = win;
    this.bookEl = this.el('div', 'rd-book');
    this.measureEl = this.el('div', 'rd-measure');
  }

  get pages(): number {
    return this.layout?.pages ?? 0;
  }

  /** The first page on display (0-based): the left page of a spread, or the title page on the first spread. */
  get page(): number {
    const n = this.pages;
    if (!n || !this.g) return 0;
    return this.g.spread ? Math.min(n - 1, Math.max(0, 2 * this.s - 1)) : this.s;
  }

  private get maxS(): number {
    const n = this.pages;
    if (n <= 0 || !this.g) return 0;
    return this.g.spread ? Math.ceil((n - 1) / 2) : n - 1;
  }

  async open(): Promise<void> {
    const { root, catalog, entry, book, store, reducedMotion } = this.o;
    const desk = this.el('div', 'rd-desk');
    const lamp = this.svg('rd-lamp', '0 0 150 150', LAMP_SVG);
    const pile = this.svg('rd-pile', '0 0 128 112', PILE_SVG);
    const wrap = this.el('div', 'rd-wrap');
    wrap.append(this.bookEl);
    const bar = this.el('div', 'rd-bar');
    const close = this.el('button', 'rd-btn', 'Закрыть');
    close.setAttribute('type', 'button');
    close.addEventListener('click', () => this.o.onClose());
    bar.append(close);
    this.measureEl.setAttribute('aria-hidden', 'true');
    root.replaceChildren(desk, lamp, pile, wrap, bar, this.measureEl);

    this.fs = defaultFontSize(this.win.innerWidth);
    this.g = this.geometry();
    this.applyVars(this.g);
    this.bookEl.classList.toggle('single', !this.g.spread);
    if (!reducedMotion) {
      this.cover = this.makeCover();
      this.bookEl.append(this.cover);
      if (this.g.spread) this.bookEl.classList.add('closed');
    }

    this.parts = buildFlow(this.doc, catalog, entry, book, store.read().books[entry.id] ?? null);
    this.prepareBody(this.parts.body);
    this.measureEl.append(this.parts.flow);
    this.listen();

    await loadBookFonts(this.fs, this.doc.fonts);
    if (this.closed) return;
    this.relayout(false);
    if (this.cover) void this.openCover(this.cover);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.relayoutTimer);
    clearTimeout(this.flashTimer);
    this.win.cancelAnimationFrame(this.hoverFrame);
    for (const off of this.cleanup.splice(0)) off();
    this.o.root.replaceChildren();
  }

  async turn(dir: 1 | -1): Promise<void> {
    if (this.busy || this.closed || !this.layout) return;
    const target = this.s + dir;
    if (target < 0 || target > this.maxS) return;
    this.dismissNote();
    this.busy = true;
    try {
      if (this.o.reducedMotion) await this.fade(target);
      else await this.finishTurn(this.prepare(dir, target), target, 0);
    } finally {
      this.busy = false;
    }
  }

  goToPage(page: number): void {
    if (this.closed || !this.layout || !this.g || this.busy) return;
    this.dismissNote();
    this.s = this.spreadOf(page);
    this.render();
  }

  // ---- layout -------------------------------------------------------------------------------------------------

  private geometry(): Geometry {
    return computeGeometry(this.win.innerWidth, this.win.innerHeight, this.fs);
  }

  private spreadOf(page: number): number {
    const p = Math.max(0, Math.min(this.pages - 1, Math.round(page)));
    const s = this.g?.spread ? Math.ceil(p / 2) : p;
    return Math.max(0, Math.min(this.maxS, s));
  }

  /** The page an element of the measuring flow starts on. */
  private pageOfElement(e: Element): number {
    const r = e.getClientRects()[0] ?? e.getBoundingClientRect();
    return pageIndex(r.left - this.parts!.flow.getBoundingClientRect().left, this.g!);
  }

  /** What to keep in view across a relayout: the block at the top of the first page on display, or a front page. */
  private anchor(): { block: Element | null; page: number } {
    const page = this.page;
    if (!this.layout || page < this.layout.bodyStart) return { block: null, page };
    let block: Element | null = null;
    for (const b of Array.from(this.parts!.body.querySelectorAll(':scope > [data-b]'))) {
      if (this.pageOfElement(b) > page) break;
      block = b;
    }
    return { block, page };
  }

  /** Debounced relayout. A resize that leaves the geometry as it was (a phone's address bar) changes nothing;
   * fonts that arrive late always do (spec 8.5 step 8). */
  private scheduleRelayout(fontsChanged: boolean): void {
    this.fontsChanged ||= fontsChanged;
    clearTimeout(this.relayoutTimer);
    this.relayoutTimer = setTimeout(() => {
      const force = this.fontsChanged;
      this.fontsChanged = false;
      if (force || !this.g || !sameGeometry(this.geometry(), this.g)) this.relayout(true);
    }, RELAYOUT_DELAY);
  }

  /** Spec 8.5 steps 3–7: measure, number the contents, rebuild the windows. Postponed while a turn runs. */
  private relayout(keep: boolean): void {
    if (this.closed || !this.parts) return;
    if (this.busy) {
      this.scheduleRelayout(true);
      return;
    }
    const g = this.geometry();
    const kept = keep && this.layout ? this.anchor() : null;
    this.dismissNote(); // the card is placed beside a number that is about to move
    this.g = g;
    this.layout = layoutFlow(this.parts, g);
    const refs = this.parts.flow.querySelector(':scope > section.refs');
    this.refsStart = refs ? this.pageOfElement(refs) : Number.POSITIVE_INFINITY;
    this.fillContents(this.layout);
    this.assemble();
    if (kept) this.s = this.spreadOf(kept.block ? this.pageOfElement(kept.block) : kept.page);
    else this.s = Math.min(this.s, this.maxS);
    this.render();
  }

  /** Contents rows get their page numbers (1-based) from the measured chapters. */
  private fillContents(layout: Layout): void {
    const pageOf = new Map(layout.chapters.map((c) => [c.h, c.page]));
    this.parts!.contents.querySelectorAll('li[data-h]').forEach((li) => {
      const page = pageOf.get(li.getAttribute('data-h') ?? '');
      const cell = li.querySelector('.toc-page');
      if (cell) cell.textContent = page === undefined ? '' : String(page + 1);
    });
  }

  /**
   * Display-only marks, made before the first measurement: the «Развернуть вклейку» label of a folded plate
   * (absolutely placed, so it adds no height), the space before a note number (spec 8.8: removed at display only),
   * and the comma between note numbers that touch (`1,3`); CSS alone cannot tell `<sup>1</sup><sup>3</sup>` from two
   * notes with text between them.
   */
  private prepareBody(body: HTMLElement): void {
    tidyNoteSpacing(body);
    body.querySelectorAll('figure.plate').forEach((fig) => {
      const b = this.el('button', 'rd-unf', 'Развернуть вклейку');
      b.setAttribute('type', 'button');
      b.tabIndex = -1;
      fig.append(b);
    });
    body.querySelectorAll('sup.note').forEach((sup) => {
      const prev = sup.previousSibling;
      if (prev instanceof Element && prev.matches('sup.note')) sup.classList.add('rd-next-note');
    });
  }

  // ---- pages --------------------------------------------------------------------------------------------------

  private applyVars(g: Geometry): void {
    for (const k of ['W', 'H', 'fs', 'lh', 'pt', 'pb', 'po', 'pi', 'cw', 'ch', 'gap'] as const) {
      this.bookEl.style.setProperty(`--${k}`, `${g[k]}px`);
    }
  }

  private makePage(cls: string): Page {
    const el = this.el('div', cls ? `rd-pg ${cls}` : 'rd-pg');
    const head = this.el('div', 'rd-head');
    const win = this.el('div', 'rd-win');
    const folio = this.el('div', 'rd-folio');
    const shade = this.el('div', 'rd-shade');
    const flow = this.parts!.flow.cloneNode(true) as HTMLElement;
    flow.setAttribute('aria-hidden', 'true');
    flow.setAttribute('inert', '');
    win.append(flow);
    el.append(this.el('div', 'rd-endp'), head, win, folio, shade);
    return { el, flow, head, folio, shade };
  }

  /** Rebuilds the book from the current geometry; the leaf is made again on the next turn. */
  private assemble(): void {
    const g = this.g!;
    const book = this.bookEl;
    book.replaceChildren();
    this.applyVars(g);
    book.classList.toggle('single', !g.spread);
    const stackL = this.el('div', 'rd-stack l');
    const stackR = this.el('div', 'rd-stack r');
    this.left = g.spread ? this.makePage('L') : null;
    this.right = this.makePage('R');
    this.leaf = null;
    if (g.spread) book.append(stackL);
    book.append(stackR);
    if (this.left) book.append(this.left.el);
    book.append(this.right.el);
    if (g.spread) book.append(this.el('div', 'rd-gut'));
    for (const [cls, dir] of [['rd-edge p', -1], ['rd-edge n', 1]] as const) {
      const edge = this.el('div', cls);
      edge.dataset.dir = String(dir);
      book.append(edge);
    }
    if (this.cover) book.append(this.cover);
  }

  private paint(p: Page, idx: number, side: Side): void {
    const g = this.g!;
    const layout = this.layout!;
    const ok = idx >= 0 && idx < layout.pages;
    p.el.classList.toggle('sl', side === 'l');
    p.el.classList.toggle('sr', side === 'r');
    p.el.classList.toggle('blank', !ok);
    if (!ok) return;
    p.flow.style.transform = `translateX(${-idx * (g.cw + g.gap)}px)`;
    const plain = idx < layout.bodyStart || idx >= layout.endStart;
    // No running head over the opening of the text, where the drop cap begins the page.
    const head = plain || idx === layout.bodyStart ? '' : side === 'l' && g.spread ? this.o.entry.shortTitle : this.runningHead(idx);
    p.head.textContent = head;
    p.folio.textContent = plain ? '' : String(idx + 1);
  }

  /** The right running head: the chapter the page belongs to, or «Литература» from the literature on. */
  private runningHead(idx: number): string {
    if (idx >= this.refsStart) return 'Литература';
    let text = '';
    for (const c of this.layout!.chapters) {
      if (c.page > idx) break;
      text = c.text;
    }
    return text || this.o.entry.shortTitle;
  }

  private render(): void {
    const g = this.g!;
    if (!this.right) return;
    if (this.left) this.paint(this.left, 2 * this.s - 1, 'l');
    this.paint(this.right, g.spread ? 2 * this.s : this.s, 'r');
    // The edges of the block: the left one grows as the reader goes on, the right one shrinks (spec 8.2).
    const read = this.maxS ? this.s / this.maxS : 0;
    this.bookEl.style.setProperty('--sl', `${g.spread ? 3 + read * 15 : 0}px`);
    this.bookEl.style.setProperty('--sr', `${g.spread ? 3 + (1 - read) * 15 : 2 + (1 - read) * 4}px`);
  }

  // ---- cover --------------------------------------------------------------------------------------------------

  private makeCover(): HTMLElement {
    const { entry, catalog } = this.o;
    const cover = this.el('div', 'rd-cover');
    cover.setAttribute('aria-hidden', 'true');
    const color = entry.kind === 'reference' ? REFERENCE_COLOR : shade(COVER_COLORS[entry.discipline] ?? REFERENCE_COLOR, (hash(entry.id) % 20) - 10);
    cover.style.setProperty('--cc', color);
    const front = this.el('div', 'rd-cf');
    front.append(this.el('span', 'rd-frame'), this.el('p', 'rd-cover-series', 'Слонология'), this.el('h2', 'rd-cover-title', entry.shortTitle));
    const discipline = entry.kind === 'reference' ? null : catalog.disciplines.find((d) => d.id === entry.discipline)?.name;
    if (discipline) front.append(this.el('p', 'rd-cover-series', discipline));
    cover.append(front, this.el('div', 'rd-cb'));
    return cover;
  }

  /** The cover swings open on its spine while the closed book slides to the middle of the spread. */
  private async openCover(cover: HTMLElement): Promise<void> {
    this.busy = true;
    try {
      await new Promise<void>((r) => this.win.requestAnimationFrame(() => this.win.requestAnimationFrame(() => r())));
      if (this.closed) return;
      this.bookEl.classList.remove('closed');
      await runTurn(cover, [{ transform: rotate(0) }, { transform: rotate(-180) }], COVER_MS, this.doc);
    } finally {
      cover.remove();
      this.cover = null;
      this.busy = false;
    }
  }

  // ---- turning ------------------------------------------------------------------------------------------------

  private ensureLeaf(): Leaf {
    if (this.leaf) return this.leaf;
    const el = this.el('div', 'rd-leaf');
    el.hidden = true;
    const f = this.el('div', 'rd-face f');
    const b = this.el('div', 'rd-face b');
    const front = this.makePage('');
    const back = this.makePage('');
    f.append(front.el);
    b.append(back.el);
    el.append(f, b);
    this.bookEl.append(el);
    this.leaf = { el, front, back };
    return this.leaf;
  }

  /** Paints the page under the leaf and both faces of the leaf, and shows the leaf flat on its start. */
  private prepare(dir: 1 | -1, target: number): TurnCtx {
    const g = this.g!;
    const s = this.s;
    const leaf = this.ensureLeaf();
    let under: Page;
    if (g.spread) {
      if (dir > 0) {
        this.paint(this.right!, 2 * target, 'r');
        this.paint(leaf.front, 2 * s, 'r');
        this.paint(leaf.back, 2 * target - 1, 'l');
        under = this.right!;
      } else {
        this.paint(this.left!, 2 * target - 1, 'l');
        this.paint(leaf.front, 2 * s - 1, 'l');
        this.paint(leaf.back, 2 * target, 'r');
        under = this.left!;
      }
    } else {
      // One page: forward, the page lifts off to the left; back, the previous page comes back over it.
      const shown = dir > 0 ? s : target;
      if (dir > 0) this.paint(this.right!, target, 'r');
      this.paint(leaf.front, shown, 'r');
      this.paint(leaf.back, shown, 'r');
      under = this.right!;
    }
    leaf.el.className = `rd-leaf ${g.spread && dir < 0 ? 'bwd' : 'fwd'}`;
    const [from, to] = g.spread ? [0, dir > 0 ? -180 : 180] : dir > 0 ? [0, -178] : [-178, 0];
    const ctx = { leaf, under, from, to };
    this.setProgress(ctx, 0);
    leaf.el.hidden = false;
    return ctx;
  }

  private setProgress(c: TurnCtx, p: number): void {
    c.leaf.el.style.transform = rotate(angleAt(c, p));
    c.leaf.front.shade.style.opacity = String(frontShade(p));
    c.leaf.back.shade.style.opacity = String(backShade(p));
    c.under.shade.style.opacity = String(underShade(p));
  }

  /** Animates the leaf from progress `p0` to `p1` (1 completes the turn, 0 puts the leaf back). */
  private async swing(c: TurnCtx, p0: number, p1: number): Promise<void> {
    const full = this.g!.spread ? SPREAD_MS : SINGLE_MS;
    const duration = Math.max(60, Math.round(full * Math.abs(p1 - p0)));
    const opts: KeyframeAnimationOptions = { duration, easing: TURN_EASING, fill: 'forwards' };
    const shades: Array<[HTMLElement, (p: number) => number]> = [[c.leaf.front.shade, frontShade], [c.leaf.back.shade, backShade], [c.under.shade, underShade]];
    for (const [el, f] of shades) el.animate([{ opacity: f(p0) }, { opacity: f(p1) }], opts);
    await runTurn(c.leaf.el, [{ transform: rotate(angleAt(c, p0)) }, { transform: rotate(angleAt(c, p1)) }], duration, this.doc);
  }

  private async finishTurn(c: TurnCtx, target: number, p0: number): Promise<void> {
    await this.swing(c, p0, 1);
    if (this.closed) return;
    this.s = target;
    this.endTurn(c);
  }

  private async revertTurn(c: TurnCtx, p0: number): Promise<void> {
    await this.swing(c, p0, 0);
    if (this.closed) return;
    this.endTurn(c);
  }

  private endTurn(c: TurnCtx): void {
    this.render();
    c.leaf.el.hidden = true;
    for (const el of [c.leaf.el, c.leaf.front.shade, c.leaf.back.shade, c.under.shade]) {
      el.getAnimations().forEach((a) => a.cancel());
      el.style.transform = '';
      el.style.opacity = '';
    }
  }

  /** Reduced motion: the pages fade out and in, 120 ms in all. */
  private async fade(target: number): Promise<void> {
    const pages = [this.left, this.right].filter((p): p is Page => !!p).map((p) => p.el);
    const half = FADE_MS / 2;
    await Promise.all(pages.map((el) => runTurn(el, [{ opacity: 1 }, { opacity: 0 }], half, this.doc)));
    if (this.closed) return;
    this.s = target;
    this.render();
    await Promise.all(pages.map((el) => runTurn(el, [{ opacity: 0 }, { opacity: 1 }], half, this.doc)));
    pages.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
  }

  // ---- input --------------------------------------------------------------------------------------------------

  private listen(): void {
    const on = <K extends keyof HTMLElementEventMap>(t: HTMLElement, type: K, f: (e: HTMLElementEventMap[K]) => void) => {
      t.addEventListener(type, f);
      this.cleanup.push(() => t.removeEventListener(type, f));
    };
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    const onResize = () => this.scheduleRelayout(false);
    const onFonts = () => this.scheduleRelayout(true);
    this.win.addEventListener('keydown', onKey, true);
    this.win.addEventListener('resize', onResize);
    this.doc.fonts.addEventListener('loadingdone', onFonts);
    this.cleanup.push(
      () => this.win.removeEventListener('keydown', onKey, true),
      () => this.win.removeEventListener('resize', onResize),
      () => this.doc.fonts.removeEventListener('loadingdone', onFonts),
      installCopyCleaner(this.o.root),
    );
    this.cleanup.push(this.listenRoot());
    on(this.bookEl, 'pointerdown', (e) => this.onPointerDown(e));
    on(this.bookEl, 'pointermove', (e) => this.onPointerMove(e));
    on(this.bookEl, 'pointerup', (e) => this.onPointerUp(e, false));
    on(this.bookEl, 'pointercancel', (e) => this.onPointerUp(e, true));
  }

  private onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    // A fold-out lies over the whole book: its keys (arrows, space) scroll it, only Esc is the reader's.
    if (e.key !== 'Escape' && foldoutOpen(this.o.root)) return;
    switch (e.key) {
      case 'Escape':
        // The topmost layer first: a fold-out, then a note card, then the book itself.
        if (closeFoldout(this.o.root)) break;
        if (noteOpen(this.o.root)) {
          this.dismissNote();
          break;
        }
        this.o.onClose();
        break;
      case 'ArrowRight':
      case 'PageDown':
        void this.turn(1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        void this.turn(-1);
        break;
      case ' ':
        void this.turn(e.shiftKey ? -1 : 1);
        break;
      case 'Home':
        this.goToPage(0);
        break;
      case 'End':
        this.goToPage(this.pages - 1);
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  private onPointerDown(e: PointerEvent): void {
    if (!e.isPrimary) {
      // A second finger is a pinch, not a turn.
      this.abandonDrag();
      return;
    }
    if (e.pointerType === 'mouse' || this.busy || !this.layout) return;
    this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, samples: [{ x: e.clientX, t: e.timeStamp }], dir: 0, target: 0, dist: 0, ctx: null };
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && !this.drag) this.hover(e.clientX, e.clientY);
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    d.samples.push({ x: e.clientX, t: e.timeStamp });
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW) d.samples.shift();
    if (!d.dir) {
      if (Math.abs(dx) < SWIPE_SLOP && Math.abs(dy) < SWIPE_SLOP) return;
      const dir = dx < 0 ? 1 : -1;
      const target = this.s + dir;
      if (Math.abs(dy) >= Math.abs(dx) || this.busy || target < 0 || target > this.maxS) {
        this.drag = null; // vertical: the browser pans; or nothing to turn to
        return;
      }
      d.dir = dir;
      d.target = target;
      this.busy = true;
      try {
        this.bookEl.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a convenience; without it the gesture still ends on pointerup or pointercancel.
      }
      if (!this.o.reducedMotion) d.ctx = this.prepare(dir, target);
    }
    d.dist = Math.max(0, -dx * d.dir);
    // The free edge of the leaf stays under the finger: edge = W·cos(angle) from the spine.
    if (d.ctx) this.setProgress(d.ctx, progressOf(d.dist, this.g!.W));
  }

  private onPointerUp(e: PointerEvent, cancelled: boolean): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (!d.dir) return;
    this.quietUntil = performance.now() + CLICK_QUIET_MS;
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const speed = last.t > first.t ? (-(last.x - first.x) * d.dir) / (last.t - first.t) : 0;
    const go = !cancelled && (d.dist / this.g!.W > SWIPE_SHARE || speed > SWIPE_SPEED);
    void this.endDrag(d, go);
  }

  private abandonDrag(): void {
    const d = this.drag;
    this.drag = null;
    if (d?.dir) void this.endDrag(d, false);
  }

  private async endDrag(d: Drag, go: boolean): Promise<void> {
    try {
      if (!d.ctx) {
        if (go) await this.fade(d.target);
        return;
      }
      const p = progressOf(d.dist, this.g!.W);
      if (go) await this.finishTurn(d.ctx, d.target, p);
      else await this.revertTurn(d.ctx, p);
    } finally {
      this.busy = false;
    }
  }

  // ---- notes, plates and links (spec 8.7 and 8.8) --------------------------------------------------------------

  private listenRoot(): () => void {
    const root = this.o.root;
    const onClick = (e: MouseEvent) => this.onClick(e);
    const onRefs = (e: Event) => this.showRefs((e as CustomEvent<{ key: string }>).detail.key);
    root.addEventListener('click', onClick);
    root.addEventListener(REFS_EVENT, onRefs);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener(REFS_EVENT, onRefs);
    };
  }

  private dismissNote(): void {
    this.noteKey = null;
    hideNote(this.o.root);
  }

  /** Every click in the reader: the card and the fold-out take their own, the rest is resolved against the page. */
  private onClick(e: MouseEvent): void {
    const t = e.target as Element | null;
    if (this.closed || !t || t.nodeType !== 1) return;
    const link = t.closest('a[href^="#"]');
    if (link && this.o.root.contains(link)) {
      // A link to a place in the book never changes `location.hash` (it holds the route): turn to the place instead.
      e.preventDefault();
      this.goToHeading(link.getAttribute('href')!.slice(1));
      return;
    }
    if (t.closest('.rd-note')) {
      const book = t.closest('a[data-book]');
      if (book) this.openBook(book.getAttribute('data-book') ?? '');
      return;
    }
    if (t.closest('.rd-fold, .rd-bar') || !this.layout) return;
    if (this.busy || performance.now() < this.quietUntil) return;
    const hit = this.hit(e.clientX, e.clientY, NOTE_SLOP[(e as PointerEvent).pointerType] ?? NOTE_SLOP.mouse);
    if (noteOpen(this.o.root)) {
      // A click away from the card puts it away; a click on another number shows that one.
      const same = hit?.kind === 'note' && hit.key === this.noteKey;
      this.dismissNote();
      if (!hit || same) return;
    }
    if (!hit) {
      const edge = t.closest<HTMLElement>('.rd-edge');
      if (edge) void this.turn(edge.dataset.dir === '-1' ? -1 : 1);
      return;
    }
    this.act(hit, e);
  }

  private act(hit: Hit, e: MouseEvent): void {
    switch (hit.kind) {
      case 'note': {
        const note = findNote(this.o.book.notes, hit.key, hit.n);
        if (!note) return;
        this.noteKey = note.key;
        showNote(this.o.root, hit.el, note, { x: e.clientX, y: e.clientY });
        break;
      }
      case 'hash':
      case 'toc':
        this.goToHeading(hit.h);
        break;
      case 'book':
        this.openBook(hit.id);
        break;
      case 'ext':
        this.win.open(hit.href, '_blank', 'noopener,noreferrer');
        break;
      case 'plate':
        this.openPlate(hit.fig);
        break;
    }
  }

  /** The note, link, contents row or plate at a point of the screen, or null. Looks only at the pages on display. */
  private hit(x: number, y: number, slop: number): Hit | null {
    for (const p of [this.right, this.left]) {
      if (!p || p.el.classList.contains('blank')) continue;
      const win = p.flow.parentElement;
      if (!win || distance(win.getBoundingClientRect(), x, y) > slop) continue;
      const found = this.hitIn(p.flow, x, y, slop);
      if (found) return found;
    }
    return null;
  }

  private hitIn(flow: HTMLElement, x: number, y: number, slop: number): Hit | null {
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
    for (const li of Array.from(flow.querySelectorAll('.fm.contents li[data-h]'))) {
      if (near(li, 0) !== Number.POSITIVE_INFINITY) return { kind: 'toc', h: li.getAttribute('data-h') ?? '' };
    }
    for (const fig of Array.from(flow.querySelectorAll('figure.plate'))) {
      if (near(fig, 0) !== Number.POSITIVE_INFINITY) return { kind: 'plate', fig };
    }
    return null;
  }

  /** The hand cursor over what a click would do, for a mouse; touch has no hover. Once per frame. */
  private hover(x: number, y: number): void {
    if (this.hoverFrame) return;
    this.hoverFrame = this.win.requestAnimationFrame(() => {
      this.hoverFrame = 0;
      if (this.closed || !this.layout || this.busy) return;
      this.bookEl.style.cursor = this.hit(x, y, NOTE_SLOP.mouse) ? 'pointer' : '';
    });
  }

  /** Turns to the heading of the book that carries `data-h` (the contents and links inside the book). */
  private goToHeading(h: string): void {
    if (!this.parts) return;
    const target = Array.from(this.parts.body.querySelectorAll('[data-h]')).find((e) => e.getAttribute('data-h') === h);
    if (target) this.goToPage(this.pageOfElement(target));
  }

  /** «К списку литературы»: turn to the page of the entry and mark it for a moment. */
  private showRefs(key: string): void {
    if (!this.parts) return;
    this.dismissNote();
    const item = Array.from(this.parts.flow.querySelectorAll('.refs li[data-key]')).find((li) => li.getAttribute('data-key') === key);
    const page = item ? this.pageOfElement(item) : this.refsStart;
    if (!Number.isFinite(page)) return;
    this.goToPage(page);
    const flows = [this.parts.flow, this.left?.flow, this.right?.flow, this.leaf?.front.flow, this.leaf?.back.flow];
    const mark = (on: boolean) =>
      flows.forEach((f) => f?.querySelectorAll('.refs li[data-key]').forEach((li) => li.classList.toggle('rd-flash', on && li.getAttribute('data-key') === key)));
    mark(true);
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => mark(false), FLASH_MS);
  }

  /** Opens a fold-out with a copy of the plate, set free of the page's measuring styles. */
  private openPlate(fig: Element): void {
    this.dismissNote();
    const copy = fig.cloneNode(true) as HTMLElement;
    copy.classList.remove('fold');
    copy.removeAttribute('style');
    copy.querySelectorAll('.rd-unf').forEach((b) => b.remove());
    copy.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
      pre.style.fontSize = pre.style.lineHeight = pre.style.maxHeight = '';
    });
    openFoldout(this.o.root, copy, () => undefined);
  }

  /**
   * Another book (a link in the text, a note or «Дальше»): `location.replace`, so that closing the new book still
   * returns to the campus instead of reopening this one. The replaced entry loses its state, so the load marker that
   * `boot.ts` put there is written back.
   */
  private openBook(id: string): void {
    if (id === this.o.entry.id || parseRoute(bookHash(id))?.kind !== 'book') return;
    const state: unknown = this.win.history.state;
    this.win.location.replace(bookHash(id));
    try {
      if (state !== null && state !== undefined) this.win.history.replaceState(state, '');
    } catch {
      // A history that refuses state only costs the back-or-replace choice on close.
    }
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  private el(tag: string, cls?: string, text?: string): HTMLElement {
    const e = this.doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  private svg(cls: string, viewBox: string, inner: string): Element {
    const s = this.doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', cls);
    s.setAttribute('viewBox', viewBox);
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = inner; // fixed drawing from this file, no data
    return s;
  }
}

/** Turn progress 0..1 for a finger that has moved `dist` px towards the spine on a page `W` px wide. */
function progressOf(dist: number, W: number): number {
  return Math.acos(Math.max(-1, Math.min(1, 1 - dist / W))) / Math.PI;
}

function sameGeometry(a: Geometry, b: Geometry): boolean {
  return a.spread === b.spread && a.W === b.W && a.H === b.H && a.fs === b.fs && a.cw === b.cw && a.ch === b.ch;
}

/** FNV-1a of a string, as in the hall draft: the small colour spread between books of one discipline. */
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount))).toString(16).padStart(2, '0');
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}
