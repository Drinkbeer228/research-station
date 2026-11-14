/**
 * The book on the desk (spec sections 8.1, 8.2, 8.5 step 7 and 8.6). The measuring flow from `buildFlow` is laid out
 * by `layoutFlow`; every visible page is a window on one column of an inert, aria-hidden copy of that flow: two on a
 * spread, one on a single page, and two more for the turning leaf, made on the first turn.
 *
 * The windows on display are `aria-hidden` but not inert, so that their text can be selected (spec 12; the leaf's
 * windows stay inert); what is focusable in them is taken out of the tab order. A click on a note, link, contents row
 * or plate in them is resolved by `hit` from the rectangles of the visible window's own elements (spec 8.7 and 8.8;
 * Task 20). Readers of the screen and the keyboard get a linear `.sr-only` copy of the whole book (spec 12; Task 22)
 * whose notes, plates, contents rows and «Дальше» are buttons, and a polite announcement of the page.
 */
import type { BookFile, CatalogBook, CatalogFile } from '../types';
import type { Anchor, BookMemory, LibraryState, Store } from '../store';
import { buildFlow, type FlowParts } from './bookDom';
import { computeGeometry, defaultFontSize, layoutFlow, pageIndex, type Geometry, type Layout } from './paginate';
import { loadBookFonts } from './fonts';
import { installCopyCleaner } from './hyphenate';
import { runTurn, TURN_EASING } from './turn';
import { bookHash, parseRoute } from '../router';
import { findNote, hideNote, noteOpen, REFS_EVENT, showNote, tidyNoteSpacing } from './notes';
import { closeFoldout, foldoutOpen, openFoldout } from './foldout';
import { barButton, MAX_FONT, MIN_FONT, popButton, renderFontPop, renderMorePop } from './bar';
import { hitAt, NOTE_SLOP, type Hit } from './hit';
import { trapTarget } from './mobile';
import { anchorAt, chooseRestorePage, chosenFontSize, isFinished, NO_BLOCK } from './position';

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
const FLASH_MS = 2200;
/** The store's size when nothing was chosen (`store.ts`); `settings.fontSet` says whether the reader chose one. */
const STORE_DEFAULT_FONT = 17;

/** Cover colours: the discipline colours of the hall draft (`prototype/preview.template.html`, `DISC`). */
export const COVER_COLORS: Record<string, string> = {
  taxonomy: '#6B7D57', anatomy: '#C86D51', ethogram: '#A96B3B', cognition: '#4F7F78', veterinary: '#2E5A44',
  ecology: '#7E9A5E', conservation: '#7A5C3E', culture: '#B8893B', paleontology: '#BFA468', genomics: '#8C5A6E',
};
/** The reference books are not on a shelf and have no discipline colour; they take the station ink. */
export const REFERENCE_COLOR = '#4F5552';

export const LAMP_SVG = '<circle cx="76" cy="76" r="60" fill="#2E5A44" stroke="#2C302E" stroke-width="3"/><circle cx="76" cy="76" r="45" fill="#3a6f55"/><circle cx="62" cy="60" r="20" fill="rgba(255,255,255,.12)"/><circle cx="76" cy="76" r="11" fill="#C9A15A" stroke="#2C302E" stroke-width="2.5"/>';
export const PILE_SVG = '<g stroke="#2C302E" stroke-width="2"><rect x="10" y="20" width="108" height="74" rx="4" fill="#2E5A44" transform="rotate(-5 64 57)"/><rect x="14" y="20" width="100" height="70" rx="4" fill="#C86D51" transform="rotate(4 64 55)"/><rect x="20" y="24" width="88" height="62" rx="4" fill="#E4CF9C" transform="rotate(-2 64 55)"/></g>'
  + '<g class="rd-cat"><ellipse cx="62" cy="58" rx="31" ry="25" fill="#1F2324" stroke="#121415" stroke-width="2.4"/><path d="M36 74c10 16 42 16 56 2" fill="none" stroke="#181A1B" stroke-width="7.5" stroke-linecap="round"/><circle cx="91" cy="76" r="3.6" fill="#F7F5F0"/><circle cx="76" cy="48" r="14" fill="#232729" stroke="#121415" stroke-width="2"/><path d="M66 38l-2-13 12 7zM86 38l3-13-12 7z" fill="#161819" stroke="#121415" stroke-width="1.6"/><ellipse cx="80" cy="56" rx="6.5" ry="5" fill="#F7F5F0"/><circle cx="83" cy="54" r="1.5" fill="#D98A7C"/><path d="M66 48q3 2 6 0M78 44q3 2 6 0" fill="none" stroke="#E8E4DA" stroke-width="1.5" stroke-linecap="round"/></g>';

type Pop = 'bm' | 'fs' | 'more';
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
  /** Type of the last pointer to go down: a browser may deliver `click` as a plain MouseEvent that lacks it. */
  private lastPointer = 'mouse';
  private fontsChanged = false;
  /** The size the reader chose with «Aa»; null while the size follows the width of the window. */
  private explicitFs: number | null = null;
  /** The first layout has chosen the page to open on; before that nothing may be saved over the stored place. */
  private placed = false;
  /** The place of the reader (spec 8.10): set when a page is shown by the reader, kept across a relayout (`holding`). */
  private place: Anchor | null = null;
  private holding = false;
  private finishedDay = '';
  private pop: Pop | null = null;
  private popEl: HTMLElement | null = null;
  private count: HTMLElement | null = null;
  /** The linear copy of the book for readers of the screen, and the polite announcement of the page. */
  private linear: HTMLElement | null = null;
  private live: HTMLElement | null = null;
  private announced = -1;
  private bmBtn: HTMLButtonElement | null = null;
  private lampBtn: HTMLButtonElement | null = null;
  private moreBtn: HTMLButtonElement | null = null;
  private opener: HTMLElement | null = null;
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
    const close = this.barButton('Закрыть', 'close', () => this.o.onClose());
    const toc = this.barButton('Оглавление', 'toc', () => this.goToContents());
    this.bmBtn = this.barButton('Закладка', 'bookmark', (b) => this.togglePop('bm', b));
    const aa = this.barButton('Aa', null, (b) => this.togglePop('fs', b));
    aa.setAttribute('aria-label', 'Aa, размер шрифта');
    this.lampBtn = this.barButton('Лампа', 'lamp', () => this.toggleLamp());
    this.bmBtn.setAttribute('aria-haspopup', 'true');
    aa.setAttribute('aria-haspopup', 'true');
    this.moreBtn = this.barButton('Ещё', 'more', (b) => this.togglePop('more', b));
    this.moreBtn.setAttribute('aria-haspopup', 'true');
    this.count = this.el('div', 'rd-count');
    this.count.setAttribute('aria-hidden', 'true'); // the announcement below says it
    this.live = this.el('div', 'sr-only');
    this.live.setAttribute('role', 'status');
    this.live.setAttribute('aria-live', 'polite');
    bar.append(close, this.el('span', 'rd-sp'), toc, this.bmBtn, aa, this.lampBtn, this.moreBtn);
    this.measureEl.setAttribute('aria-hidden', 'true');
    root.replaceChildren(desk, lamp, pile, wrap, bar, this.count, this.live, this.measureEl);

    const settings = store.read().settings;
    this.explicitFs = chosenFontSize(settings);
    this.fs = this.explicitFs ?? defaultFontSize(this.win.innerWidth);
    root.classList.toggle('lamp', settings.theme === 'lamp');
    this.lampBtn.setAttribute('aria-pressed', String(settings.theme === 'lamp'));
    this.markOpened(); // before the colophon is built: its formular shows today
    this.g = this.geometry();
    this.applyVars(this.g);
    this.barMode(this.g);
    this.bookEl.classList.toggle('single', !this.g.spread);
    if (!reducedMotion) {
      this.cover = this.makeCover();
      this.bookEl.append(this.cover);
      if (this.g.spread) this.bookEl.classList.add('closed');
    }

    this.parts = buildFlow(this.doc, catalog, entry, book, store.read().books[entry.id] ?? null);
    // A picture without width and height gets its size only when it arrives: lay out again once it has.
    this.parts.flow.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      if (img.hasAttribute('width') && img.hasAttribute('height')) return;
      img.addEventListener('load', () => this.scheduleRelayout(true), { once: true });
    });
    this.prepareBody(this.parts.body);
    this.linear = this.makeLinear(this.parts.flow); // before the measuring layout puts its styles on the flow
    this.o.root.insertBefore(this.linear, this.measureEl);
    this.measureEl.append(this.parts.flow);
    this.listen();

    await loadBookFonts(this.fs, this.doc.fonts);
    if (this.closed) return;
    this.relayout(false);
    if (this.cover) void this.openCover(this.cover);
  }

  close(): void {
    if (this.closed) return;
    this.savePlace();
    this.closed = true;
    this.o.root.classList.remove('lamp');
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
    this.closePop();
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

  /** The size follows the window until «Aa» is used; then the chosen size wins. */
  private geometry(): Geometry {
    const fs = this.explicitFs ?? defaultFontSize(this.win.innerWidth);
    return computeGeometry(this.win.innerWidth, this.win.innerHeight, fs);
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
    const kept = keep && this.layout && this.placed ? this.place : null;
    this.dismissNote(); // the card is placed beside a number that is about to move
    this.g = g;
    this.fs = g.fs;
    this.barMode(g);
    this.layout = layoutFlow(this.parts, g);
    const refs = this.parts.flow.querySelector(':scope > section.refs');
    this.refsStart = refs && refs.children.length ? this.pageOfElement(refs) : Number.POSITIVE_INFINITY;
    this.fillContents(this.layout);
    this.assemble();
    if (!this.placed) {
      this.s = this.spreadOf(this.restorePage());
      this.placed = true;
    } else if (kept) {
      // The place is the character the reader was at (a block and an offset), found again in the new layout.
      const page = this.locate(kept) ?? this.page;
      this.s = this.spreadOf(page);
      this.place = kept.b === NO_BLOCK ? this.anchorOf(page) : anchorAt(page, this.layout, () => ({ b: kept.b, o: kept.o }));
    } else this.s = Math.min(this.s, this.maxS);
    this.holding = !!kept;
    try {
      this.render();
    } finally {
      this.holding = false;
    }
  }

  /** Contents rows get their page numbers (1-based) from the measured chapters. */
  private fillContents(layout: Layout): void {
    const pageOf = new Map(layout.chapters.map((c) => [c.h, c.page]));
    for (const contents of [this.parts!.contents, this.linear?.querySelector('.fm.contents')]) {
      contents?.querySelectorAll('li[data-h]').forEach((li) => {
        const page = pageOf.get(li.getAttribute('data-h') ?? '');
        const cell = li.querySelector('.toc-page');
        if (cell) cell.textContent = page === undefined ? '' : String(page + 1);
      });
    }
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

  /**
   * The linear copy (spec 12): the whole book as one document for the screen reader, clipped out of sight. What the
   * windows leave to hit-testing is a button here: note numbers, «Развернуть вклейку», the rows of the contents and
   * of «Дальше».
   */
  private makeLinear(flow: HTMLElement): HTMLElement {
    const sr = this.el('div', 'rd-sr sr-only');
    sr.setAttribute('role', 'document');
    sr.setAttribute('aria-label', 'Текст книги');
    sr.append(...Array.from((flow.cloneNode(true) as HTMLElement).childNodes));
    const button = (text: string): HTMLButtonElement => {
      const b = this.el('button', 'rd-sr-go', text) as HTMLButtonElement;
      b.setAttribute('type', 'button');
      return b;
    };
    sr.querySelectorAll('sup.note').forEach((sup) => {
      const text = sup.textContent?.trim() ?? '';
      const n = sup.querySelector('a[data-note]')?.getAttribute('data-note') ?? text;
      const b = button(text);
      b.dataset.note = n;
      b.setAttribute('aria-label', `Сноска ${n}`);
      sup.replaceChildren(b);
    });
    sr.querySelectorAll('.rd-unf').forEach((b) => b.removeAttribute('tabindex'));
    sr.querySelectorAll('.fm.contents li[data-h], .fm-next li[data-book]').forEach((li) => {
      const b = button('');
      b.append(...Array.from(li.childNodes));
      li.append(b);
    });
    return sr;
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
    flow.querySelectorAll('a, button, [tabindex]').forEach((e) => e.setAttribute('tabindex', '-1')); // hidden from readers: out of Tab too
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
    // The pages on display are not inert, so their text can be selected (spec 12); the leaf's windows stay inert.
    for (const p of [this.left, this.right]) p?.flow.removeAttribute('inert');
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
    this.shown();
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
    // A pointerup that never reaches the book (capture refused, or released elsewhere) must not leave `busy` set.
    const onLost = (e: PointerEvent) => {
      if (this.drag && e.pointerId === this.drag.id) this.abandonDrag();
    };
    // `setPointerCapture` on the book releases the capture the touch had on the element under the finger: that fires
    // `lostpointercapture` too, bubbling up to the book, while the book holds the capture. Only a real loss ends the drag.
    on(this.bookEl, 'lostpointercapture', (e) => {
      if (!this.bookEl.hasPointerCapture(e.pointerId)) onLost(e);
    });
    this.win.addEventListener('pointerup', onLost);
    this.win.addEventListener('pointercancel', onLost);
    this.cleanup.push(
      () => this.win.removeEventListener('pointerup', onLost),
      () => this.win.removeEventListener('pointercancel', onLost),
    );
  }

  private onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    // Space and Enter on a focused button or link press it; they do not turn the page.
    if ((e.key === ' ' || e.key === 'Enter') && (e.target as Element | null)?.closest?.('button, a[href], input, select, textarea, summary')) return;
    if (e.key === 'Tab') {
      this.trapFocus(e);
      return;
    }
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
        if (this.pop) {
          this.closePop();
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

  /** Tab stays inside the overlay (spec 12), or inside the fold-out while one lies over it. */
  private trapFocus(e: KeyboardEvent): void {
    const next = trapTarget(this.o.root, this.doc.activeElement, e.shiftKey);
    if (!next) return;
    e.preventDefault();
    next.focus();
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
    const onDown = (e: PointerEvent) => {
      this.lastPointer = e.pointerType || 'mouse';
    };
    root.addEventListener('pointerdown', onDown, true);
    root.addEventListener('click', onClick);
    root.addEventListener(REFS_EVENT, onRefs);
    return () => {
      root.removeEventListener('pointerdown', onDown, true);
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
    if (t.closest('.rd-sr')) {
      this.onLinear(e, t);
      return;
    }
    // A link in a window is never followed by the browser: `hit` below finds it by its place on the page, so it is
    // subject to the same checks as any click there (a turn in progress, a selection drag).
    const inWindow = !!t.closest('.rd-win');
    if (inWindow && t.closest('a')) e.preventDefault();
    const link = inWindow ? null : t.closest('a[href^="#"]');
    if (link && this.o.root.contains(link)) {
      // A link to a place in the book never changes `location.hash` (it holds the route): turn to the place instead.
      e.preventDefault();
      this.goToHeading(link.getAttribute('href')!.slice(1));
      return;
    }
    if (t.closest('.rd-note')) {
      const book = t.closest('a[data-book]');
      if (book) this.openBook(book.getAttribute('data-book') ?? '');
      const ext = t.closest('a[href^="https:"]');
      if (ext) {
        // Same as in the windows: a new tab, never away from the reader.
        e.preventDefault();
        this.win.open(ext.getAttribute('href')!, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    // A menu button may have been replaced while it handled the click, so the menu is found on the event's path.
    const inPop = e.composedPath().some((n) => n instanceof Element && n.classList.contains('rd-pop'));
    if (this.pop && !inPop && !t.closest('.rd-bar')) {
      // A click away from the menu puts it away and does nothing else.
      this.closePop();
      return;
    }
    if (inPop || t.closest('.rd-fold, .rd-bar') || !this.layout) return;
    if (this.busy || performance.now() < this.quietUntil) return;
    // A drag that selected text and ended on a number or a link is not a click on it.
    if (this.win.getSelection()?.isCollapsed === false) return;
    const hit = this.hit(e.clientX, e.clientY, NOTE_SLOP[(e as PointerEvent).pointerType || (e.detail === 0 ? 'mouse' : this.lastPointer)] ?? NOTE_SLOP.mouse);
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

  /** A click in the linear copy: the buttons and links of the screen reader's book do what the page's own would. */
  private onLinear(e: MouseEvent, t: Element): void {
    const a = t.closest('a');
    if (a) {
      e.preventDefault();
      const href = a.getAttribute('href') ?? '';
      if (href.startsWith('#')) this.goToHeading(href.slice(1));
      else if (a.hasAttribute('data-book')) this.openBook(a.getAttribute('data-book') ?? '');
      else if (href.startsWith('https:')) this.win.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    const b = t.closest<HTMLElement>('button');
    if (!b) return;
    this.closePop();
    const sup = b.closest('sup.note');
    if (sup) {
      const note = findNote(this.o.book.notes, sup.getAttribute('data-key'), b.dataset.note ?? null);
      if (!note) return;
      this.noteKey = note.key;
      // The card has no number on a page to sit beside: it goes to the middle of the screen.
      showNote(this.o.root, this.o.root, note, { x: this.win.innerWidth / 2, y: this.win.innerHeight / 2 });
      return;
    }
    const fig = b.closest('figure.plate');
    if (fig) this.openPlate(fig);
    else if (b.closest('li[data-h]')) this.goToHeading(b.closest('li')!.getAttribute('data-h') ?? '');
    else if (b.closest('li[data-book]')) this.openBook(b.closest('li')!.getAttribute('data-book') ?? '');
  }

  private act(hit: Hit, e: MouseEvent): void {
    this.closePop();
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
    return hitAt([this.right, this.left], x, y, slop);
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
    this.closePop();
    const copy = fig.cloneNode(true) as HTMLElement;
    copy.classList.remove('fold');
    copy.removeAttribute('style');
    copy.querySelectorAll('.rd-unf').forEach((b) => b.remove());
    copy.querySelectorAll<HTMLElement>('img').forEach((img) => (img.style.width = img.style.height = '')); // the page's measured box
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

  // ---- bar, menus, memory (spec sections 8.9, 8.10 and 9) -----------------------------------------------------------

  private barButton(label: string, icon: string | null, f: (b: HTMLButtonElement) => void): HTMLButtonElement {
    return barButton(this.doc, label, icon, f);
  }

  private goToContents(): void {
    if (!this.parts || !this.layout) return;
    this.closePop();
    this.goToPage(this.pageOfElement(this.parts.contents));
  }

  private toggleLamp(): void {
    const on = !this.o.root.classList.contains('lamp');
    this.o.root.classList.toggle('lamp', on);
    this.lampBtn?.setAttribute('aria-pressed', String(on));
    this.renderPop();
    this.o.store.write((s) => {
      s.settings.theme = on ? 'lamp' : 'paper';
    });
  }

  /** The menus under «Закладка» and «Aa»: one at a time, closed by Esc, a click away or the same button. */
  private togglePop(kind: Pop, opener: HTMLElement): void {
    if (this.pop === kind) {
      this.closePop();
      return;
    }
    if (!this.layout) return;
    this.closePop();
    this.dismissNote();
    this.pop = kind;
    this.opener = opener;
    opener.setAttribute('aria-expanded', 'true');
    this.popEl = this.el('div', 'rd-pop');
    this.popEl.setAttribute('role', 'group');
    this.popEl.setAttribute('aria-label', kind === 'bm' ? 'Закладки' : kind === 'more' ? 'Ещё' : 'Размер шрифта');
    this.o.root.append(this.popEl);
    this.renderPop();
    this.popEl.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }

  private closePop(): void {
    if (!this.pop) return;
    const inside = !!this.popEl?.contains(this.doc.activeElement);
    this.popEl?.remove();
    this.popEl = null;
    this.pop = null;
    this.opener?.removeAttribute('aria-expanded');
    if (inside) this.opener?.focus();
    this.opener = null;
  }

  private popButton(text: string, f: () => void, cls = 'rd-pop-btn'): HTMLButtonElement {
    return popButton(this.doc, text, f, cls);
  }

  private renderPop(): void {
    const box = this.popEl;
    if (!box || !this.pop) return;
    const active = this.doc.activeElement;
    const focus = active instanceof HTMLElement && box.contains(active) ? active.dataset.k : undefined;
    box.replaceChildren();
    if (this.pop === 'fs') this.renderFontPop(box);
    else if (this.pop === 'more') this.renderMorePop(box);
    else this.renderBookmarkPop(box);
    if (focus) box.querySelector<HTMLElement>(`[data-k="${focus}"]:not(:disabled)`)?.focus();
  }

  /** Below the spread (spec 8.9, phones) «Закладка» and «Лампа» are not in the bar: «Ещё» opens a menu with them. */
  private barMode(g: Geometry): void {
    const compact = !g.spread;
    this.bmBtn!.hidden = this.lampBtn!.hidden = compact;
    this.moreBtn!.hidden = !compact;
    if (!compact && this.pop === 'more') this.closePop();
    if (compact && (this.pop === 'bm' || this.opener === this.bmBtn)) this.closePop();
  }

  private renderMorePop(box: HTMLElement): void {
    renderMorePop(this.doc, box, this.o.root.classList.contains('lamp'), { bookmarks: () => this.togglePop('bm', this.moreBtn!), lamp: () => this.toggleLamp() });
  }

  private renderFontPop(box: HTMLElement): void {
    renderFontPop(this.doc, box, this.fs, this.explicitFs !== null, (size) => this.setFontSize(size));
  }

  /** The size is chosen by the reader: kept in the store, and the book is laid out again with its place kept (`relayout`). */
  private setFontSize(size: number | null): void {
    const fs = size === null ? null : Math.max(MIN_FONT, Math.min(MAX_FONT, Math.round(size)));
    if (fs === this.explicitFs) return;
    this.explicitFs = fs;
    this.o.store.write((s) => {
      s.settings.fontSize = fs ?? STORE_DEFAULT_FONT;
      if (fs === null) delete s.settings.fontSet;
      else s.settings.fontSet = true;
    });
    if (this.layout) this.relayout(true);
    else this.fs = fs ?? defaultFontSize(this.win.innerWidth);
    this.renderPop();
  }

  /** The pages on display: both of a spread, or the one page. */
  private shownPages(): number[] {
    const n = this.pages;
    if (!n || !this.g) return [];
    const list = this.g.spread ? [2 * this.s - 1, 2 * this.s] : [this.s];
    return list.filter((p) => p >= 0 && p < n);
  }

  private memory(): BookMemory | null {
    return this.o.store.read().books[this.o.entry.id] ?? null;
  }

  private bookmarkPage(memory: BookMemory, m: Anchor): number {
    return this.restoreIn({ ...memory, at: m });
  }

  private renderBookmarkPop(box: HTMLElement): void {
    const memory = this.memory();
    const marks = (memory?.bookmarks ?? []).map((m) => ({ m, page: this.bookmarkPage(memory!, m) })).sort((a, b) => a.page - b.page);
    const here = this.shownPages();
    const onPage = marks.filter((x) => here.includes(x.page));
    const main = onPage.length
      ? this.popButton('Убрать закладку отсюда', () => this.removeBookmarks(onPage.map((x) => x.m)))
      : this.popButton('Добавить закладку', () => this.addBookmark());
    main.dataset.k = 'main';
    box.append(main);
    if (!marks.length) {
      box.append(this.el('p', 'rd-pop-empty', 'Закладок пока нет'));
      return;
    }
    const list = this.el('ul', 'rd-pop-list');
    for (const { m, page } of marks) {
      const li = this.el('li');
      const go = this.popButton('', () => {
        this.closePop();
        this.goToPage(page);
      }, 'rd-pop-go');
      go.append(this.el('span', 'rd-pop-pg', String(page + 1)), this.el('span', 'rd-pop-name', this.runningHead(page)), this.el('span', 'rd-pop-date', m.t));
      const del = this.popButton('×', () => this.removeBookmarks([m]), 'rd-pop-x');
      del.setAttribute('aria-label', `Убрать закладку: страница ${page + 1}`);
      li.append(go, del);
      list.append(li);
    }
    box.append(list);
  }

  private addBookmark(): void {
    const mark = { ...this.anchorOf(this.placePage()), t: localDate() };
    this.o.store.write((s) => {
      this.memoryIn(s).bookmarks.push(mark); // the store keeps the last 50
    });
    this.renderPop();
    this.shown();
  }

  private removeBookmarks(list: Anchor[]): void {
    this.o.store.write((s) => {
      const m = this.memoryIn(s);
      m.bookmarks = m.bookmarks.filter((b) => !list.some((x) => x.b === b.b && x.o === b.o && x.f === b.f));
    });
    this.renderPop();
    this.shown();
  }

  private memoryIn(s: LibraryState): BookMemory {
    const id = this.o.entry.id;
    return (s.books[id] ??= { hash: this.o.book.contentHash, at: null, bookmarks: [], opened: [], finished: [] });
  }

  /** The date of opening goes into the formular (`opened`); a new book gets its entry. */
  private markOpened(): void {
    const today = localDate();
    this.o.store.write((s) => {
      const m = this.memoryIn(s);
      if (!m.opened.includes(today)) m.opened.push(today);
    });
  }

  /** The page to open on (spec 8.10); a changed book also gets its stored places made again for the new text. */
  private restorePage(): number {
    const memory = this.memory();
    const page = this.restoreIn(memory);
    if (memory && memory.hash !== this.o.book.contentHash) this.adoptBook(memory);
    return page;
  }

  private restoreIn(memory: BookMemory | null): number {
    return chooseRestorePage(memory, this.o.book, this.layout!, (a) => this.locate(a));
  }

  /** Another text under the same id: the anchors found by chapter or share are written again as anchors of this text. */
  private adoptBook(memory: BookMemory): void {
    const moved = (a: Anchor) => this.anchorOf(this.restoreIn({ ...memory, at: a }));
    const bookmarks = memory.bookmarks.map((m) => ({ ...moved(m), t: m.t }));
    this.o.store.write((s) => {
      const m = this.memoryIn(s);
      m.hash = this.o.book.contentHash;
      m.bookmarks = bookmarks;
    });
  }

  /** The page that stands for the spread: its first page of the text, else its first page. */
  private placePage(): number {
    return this.shownPages().find((p) => this.inBody(p)) ?? this.page;
  }

  /** What is kept at every page and at close: the place of the reader. */
  private savePlace(): void {
    if (!this.layout || !this.placed) return;
    const at = this.place ?? this.anchorOf(this.placePage());
    this.o.store.write((s) => {
      const m = this.memoryIn(s);
      m.hash = this.o.book.contentHash;
      m.at = at;
    });
  }

  /** After every change of what is on display: the counter, the bookmark mark, the place, the day of finishing. */
  private shown(): void {
    if (!this.layout || !this.g) return;
    const printed = this.placePage() + 1; // the number printed on the page being read
    if (this.count) this.count.textContent = `${printed} из ${this.pages}`;
    if (this.live && this.announced !== printed) {
      this.announced = printed;
      this.live.textContent = `Страница ${printed} из ${this.pages}`;
    }
    if (this.bmBtn) {
      const here = this.shownPages();
      const memory = this.memory();
      const on = !!memory && memory.bookmarks.some((m) => here.includes(this.bookmarkPage(memory, m)));
      this.bmBtn.classList.toggle('on', on);
      this.bmBtn.setAttribute('aria-pressed', String(on));
    }
    if (!this.placed) return;
    if (!this.holding || !this.place) this.place = this.anchorOf(this.placePage());
    this.savePlace();
    const last = this.shownPages().pop();
    if (last !== undefined && isFinished(last, this.layout)) this.markFinished();
  }

  /** The colophon is on display (spec 8.10): today goes into the formular once a day. */
  private markFinished(): void {
    const today = localDate();
    if (this.finishedDay === today) return;
    this.finishedDay = today;
    if (this.memory()?.finished.includes(today)) return;
    this.o.store.write((s) => {
      this.memoryIn(s).finished.push(today);
    });
    this.showDates();
  }

  /** The formular of every copy of the colophon shows the dates of the memory. */
  private showDates(): void {
    const m = this.memory();
    if (!m) return;
    const list = (dates: string[]) => (dates.length ? dates.join(', ') : '—');
    for (const flow of [this.parts?.flow, this.linear, this.left?.flow, this.right?.flow, this.leaf?.front.flow, this.leaf?.back.flow]) {
      const cells = flow?.querySelectorAll('.fm-card dd');
      if (!cells || cells.length < 2) continue;
      cells[0].textContent = list(m.opened);
      cells[1].textContent = list(m.finished);
    }
  }

  // ---- anchors: the measuring side of `position.ts` ------------------------------------------------------------

  private inBody(page: number): boolean {
    const l = this.layout;
    return !!l && page >= l.bodyStart && page < Math.min(this.refsStart, l.endStart);
  }

  private anchorOf(page: number): Anchor {
    return anchorAt(page, this.layout!, (p) => this.blockOn(p));
  }

  /** The page of an anchor: its block and offset; a place with no block (`NO_BLOCK`) by its share of the book. */
  private locate(a: Anchor): number | null {
    const layout = this.layout;
    if (!layout || !this.parts) return null;
    if (a.b === NO_BLOCK) return a.f === undefined ? null : Math.round(a.f * (layout.pages - 1));
    const block = Array.from(this.parts.body.querySelectorAll(':scope > [data-b]')).find((e) => Number(e.getAttribute('data-b')) === a.b);
    if (!block) return null;
    return a.o > 0 ? this.pageAtOffset(block, a.o) : this.pageOfElement(block);
  }

  /** The block at the top of a page of the text, and the offset in it where the page begins (0 if the block begins there). */
  private blockOn(p: number): { b: number; o: number } | null {
    if (!this.parts || !this.inBody(p)) return null;
    let block: Element | null = null;
    let start = 0;
    for (const e of Array.from(this.parts.body.querySelectorAll(':scope > [data-b]'))) {
      const at = this.pageOfElement(e);
      if (at > p) break;
      block = e;
      start = at;
    }
    const b = block ? Number(block.getAttribute('data-b')) : Number.NaN;
    if (!block || !Number.isFinite(b)) return null;
    if (start >= p) return { b, o: 0 };
    // The block runs on to this page: the first character that is on it, by bisection (the page grows with the offset).
    let lo = 0;
    let hi = block.textContent?.length ?? 0;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (this.pageAtOffset(block, mid) >= p) hi = mid;
      else lo = mid;
    }
    return { b, o: hi };
  }

  /** The page of the character at `offset` in a block of the measuring flow (the block's own page if it has no box). */
  private pageAtOffset(block: Element, offset: number): number {
    const flowLeft = this.parts!.flow.getBoundingClientRect().left;
    for (let k = 0; k < 4; k++) {
      const at = textPoint(block, offset + k);
      if (!at) break;
      const range = this.doc.createRange();
      range.setStart(at.node, at.k);
      range.setEnd(at.node, Math.min(at.node.data.length, at.k + 1));
      const r = range.getClientRects()[0];
      if (r) return pageIndex(r.left - flowLeft, this.g!);
    }
    return this.pageOfElement(block);
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
export function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount))).toString(16).padStart(2, '0');
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** Today as `YYYY-MM-DD` in the reader's own time (the dates of the formular, spec 9). */
function localDate(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** The text node and the position in it for a character offset of a block; past the end, the last character. */
function textPoint(block: Element, offset: number): { node: Text; k: number } | null {
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let left = offset;
  let last: Text | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (left < n.data.length) return { node: n, k: left };
    left -= n.data.length;
    last = n;
  }
  return last && last.data.length ? { node: last, k: last.data.length - 1 } : null;
}
