/**
 * Bookshelf overlay (`#/library` and `#/library/catalog?q=...`, spec sections 6, 7 and roadmap steps 3.2, 3.4):
 * displays all 70 volumes from `catalog.json` grouped by discipline in their cover colours, the reference volumes
 * (`glossary`, `bibliography`) in `#4F5552`, top search across `shortTitle`, `title`, and `h2` headings, and the
 * living station details (warm library lamp + sleeping cat on a book stack).
 */
import type { Store } from '../store';
import type { CatalogBook, CatalogFile, Discipline, Heading } from '../types';
import { bookHash } from '../router';
import { shelfmark } from './bookDom';
import { barButton } from './bar';
import { trapTarget } from './mobile';
import { COVER_COLORS, hash, LAMP_SVG, PILE_SVG, REFERENCE_COLOR, shade } from './reader';

export interface ShelfOptions {
  doc: Document;
  root: HTMLElement;
  catalog: CatalogFile;
  store: Store;
  initialQuery?: string;
  onClose(): void;
  onOpenBook(id: string, heading?: string): void;
}

export interface SearchHit {
  book: CatalogBook;
  score: number;
  matchedHeadings: Heading[];
}

const RU_ENDINGS = /(?:ами|ями|ого|его|ому|ему|ыми|ими|иях|иям|ией|ах|ях|ов|ев|ей|ий|ый|ая|яя|ое|ее|ые|ие|ам|ям|ом|ем|ой|ую|юю|ия|ии|ию|[аяоеыиуюь])$/i;

/** Reduces a Russian or Latin word to a comparable stem for prefix matching (spec section 7). */
export function stemWord(word: string): string {
  const clean = word.toLowerCase().replace(/ё/g, 'е').trim();
  if (clean.length <= 3) return clean;
  const stemmed = clean.replace(RU_ENDINGS, '');
  return stemmed.length >= 3 ? stemmed : clean.slice(0, 3);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я0-9]+/i)
    .filter((w) => w.length > 0);
}

function tokenMatchesText(qToken: string, qStem: string, targetWords: string[]): boolean {
  for (const w of targetWords) {
    if (w.includes(qToken) || w.startsWith(qStem) || stemWord(w).startsWith(qStem)) {
      return true;
    }
  }
  return false;
}

/**
 * Searches `catalog.books` by `shortTitle`, `title`, and `h2` `headings` (plus `tags` and `description`),
 * returning hits ordered by relevance score and then Russian alphabetical order.
 */
export function searchCatalog(catalog: CatalogFile, query: string): SearchHit[] {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];
  const qStems = qTokens.map((t) => ({ raw: t, stem: stemWord(t) }));

  const hits: SearchHit[] = [];
  for (const book of catalog.books) {
    const shortWords = tokenize(book.shortTitle);
    const titleWords = tokenize(book.title);
    const tagWords = tokenize(book.tags.join(' ') + ' ' + book.description);
    const h2List = book.headings.filter((h) => h.level === 2);
    const h2WordsList = h2List.map((h) => ({ heading: h, words: tokenize(h.text) }));

    let allMatched = true;
    let totalScore = 0;
    const matchedH2 = new Map<string, Heading>();

    for (const { raw, stem } of qStems) {
      let tokenScore = 0;
      if (tokenMatchesText(raw, stem, shortWords)) tokenScore = Math.max(tokenScore, 100);
      if (tokenMatchesText(raw, stem, titleWords)) tokenScore = Math.max(tokenScore, 80);

      for (const item of h2WordsList) {
        if (tokenMatchesText(raw, stem, item.words)) {
          tokenScore = Math.max(tokenScore, 60);
          matchedH2.set(item.heading.h, item.heading);
        }
      }

      if (tokenScore === 0 && tokenMatchesText(raw, stem, tagWords)) {
        tokenScore = 25;
      }

      if (tokenScore === 0) {
        allMatched = false;
        break;
      }
      totalScore += tokenScore;
    }

    if (allMatched) {
      hits.push({
        book,
        score: totalScore,
        matchedHeadings: Array.from(matchedH2.values()),
      });
    }
  }

  return hits.sort(
    (a, b) =>
      b.score - a.score ||
      a.book.shortTitle.localeCompare(b.book.shortTitle, 'ru'),
  );
}

/** Canonical shelf order within a discipline: overview first, then alphabetical by `shortTitle` in Russian. */
export function disciplineBooks(catalog: CatalogFile, disciplineId: string): CatalogBook[] {
  return catalog.books
    .filter((b) => b.discipline === disciplineId && b.kind !== 'reference')
    .sort((a, b) => (a.kind === 'overview' ? 0 : 1) - (b.kind === 'overview' ? 0 : 1) || a.shortTitle.localeCompare(b.shortTitle, 'ru'));
}

/** Spine colour for a book: `#4F5552` for reference books, otherwise the discipline cover colour with a deterministic shade offset. */
export function spineColor(book: CatalogBook): string {
  if (book.kind === 'reference') return REFERENCE_COLOR;
  const base = COVER_COLORS[book.discipline] ?? REFERENCE_COLOR;
  return shade(base, (hash(book.id) % 20) - 10);
}

/** Spine width in pixels on a desktop shelf (38..62 px), scaled by `chars`. */
export function spineWidthPx(chars: number): number {
  const t = Math.max(0, Math.min(1, Math.sqrt(Math.max(0, chars - 2500) / 38000)));
  return Math.round(38 + t * 24);
}

export class Shelf {
  private readonly o: ShelfOptions;
  private readonly doc: Document;
  private readonly win: Window;
  private closed = false;
  private searchInput: HTMLInputElement | null = null;
  private clearBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private lampBtn: HTMLButtonElement | null = null;
  private readonly cleanup: Array<() => void> = [];

  constructor(o: ShelfOptions) {
    this.o = o;
    this.doc = o.doc;
    const win = o.doc.defaultView;
    if (!win) throw new Error('Shelf: the document has no window');
    this.win = win;
  }

  open(): void {
    const { root, store, initialQuery } = this.o;
    root.classList.add('ers-shelf-mode');
    root.setAttribute('aria-label', 'Библиотека Слонологии');

    const settings = store.read().settings;
    root.classList.toggle('lamp', settings.theme === 'lamp');

    const desk = this.el('div', 'rd-desk');
    const frame = this.el('div', 'sh-frame');

    // Top bar: Close button, title, Lamp toggle
    const topbar = this.el('header', 'sh-topbar');
    const closeBtn = barButton(this.doc, 'Закрыть', 'close', () => this.o.onClose());
    const headingWrap = this.el('div', 'sh-heading-wrap');
    headingWrap.append(
      this.el('span', 'sh-kicker', 'Западный павильон · Читальный зал'),
      this.el('h1', 'sh-title', 'Научная библиотека «Слонология»'),
    );
    this.lampBtn = barButton(this.doc, 'Лампа', 'lamp', () => this.toggleLamp());
    this.lampBtn.setAttribute('aria-pressed', String(settings.theme === 'lamp'));
    topbar.append(closeBtn, headingWrap, this.lampBtn);

    // Search bar + Living details cornice (Lamp + Sleeping Cat on book stack)
    const cornice = this.el('div', 'sh-cornice');
    const lampArt = this.svg('sh-lamp', '0 0 150 150', LAMP_SVG);
    const searchWrap = this.el('div', 'sh-search-wrap');
    const searchInput = this.el('input', 'sh-search-input') as HTMLInputElement;
    searchInput.type = 'search';
    searchInput.placeholder = 'Поиск по названию, тому или заголовкам глав (h2)…';
    searchInput.setAttribute('aria-label', 'Поиск по названию, короткому названию и заголовкам глав');
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;
    if (initialQuery) searchInput.value = initialQuery;
    this.searchInput = searchInput;

    const clearBtn = this.el('button', 'sh-search-clear', 'Сбросить') as HTMLButtonElement;
    clearBtn.type = 'button';
    clearBtn.hidden = !initialQuery;
    this.clearBtn = clearBtn;

    const statusEl = this.el('div', 'sh-search-status');
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    this.statusEl = statusEl;

    searchWrap.append(searchInput, clearBtn);
    const pileArt = this.svg('sh-pile', '0 0 128 112', PILE_SVG);
    cornice.append(lampArt, searchWrap, pileArt);

    // Live book inspection plaque (shows hovered/focused book details)
    const previewEl = this.el('div', 'sh-preview');
    previewEl.setAttribute('aria-live', 'polite');
    this.previewEl = previewEl;

    // Scrollable bookcase body
    const bodyEl = this.el('div', 'sh-body');
    this.bodyEl = bodyEl;

    frame.append(topbar, cornice, statusEl, previewEl, bodyEl);
    root.replaceChildren(desk, frame);

    this.renderDefaultPreview();
    this.renderContent(initialQuery ?? '');
    this.listen();
  }

  setQuery(q: string): void {
    if (!this.searchInput) return;
    if (this.searchInput.value !== q) {
      this.searchInput.value = q;
      if (this.clearBtn) this.clearBtn.hidden = !q.trim();
      this.renderContent(q);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.o.root.classList.remove('ers-shelf-mode', 'lamp');
    for (const off of this.cleanup.splice(0)) off();
    this.o.root.replaceChildren();
  }

  private toggleLamp(): void {
    const next = this.o.store.read().settings.theme === 'lamp' ? 'paper' : 'lamp';
    this.o.store.write((s) => {
      s.settings.theme = next;
    });
    this.o.root.classList.toggle('lamp', next === 'lamp');
    this.lampBtn?.setAttribute('aria-pressed', String(next === 'lamp'));
  }

  private renderDefaultPreview(): void {
    if (!this.previewEl) return;
    const total = this.o.catalog.books.length;
    const discCount = this.o.catalog.disciplines.length;
    this.previewEl.replaceChildren(
      this.el('span', 'sh-preview-badge', `${total} томов · ${discCount} дисциплин`),
      this.el('span', 'sh-preview-title', 'Выберите корешок на полке или найдите главу через поиск'),
      this.el('span', 'sh-preview-meta', 'Справочники выделены цветом #4F5552 на справочном пульте'),
    );
  }

  private renderBookPreview(book: CatalogBook): void {
    if (!this.previewEl) return;
    const disc = book.kind === 'reference'
      ? 'Справочное издание'
      : this.o.catalog.disciplines.find((d) => d.id === book.discipline)?.name ?? book.discipline;
    const sm = shelfmark(this.o.catalog, book.id);
    const badgeText = sm ? `${sm} · ${disc}` : disc;
    const badge = this.el('span', 'sh-preview-badge', badgeText);
    badge.style.setProperty('--cc', spineColor(book));

    const title = this.el('span', 'sh-preview-title', book.title);
    const metaParts: string[] = [];
    if (book.readingMinutes > 0) metaParts.push(`${book.readingMinutes} мин чтения`);
    const h2Count = book.headings.filter((h) => h.level === 2).length;
    if (h2Count > 0) metaParts.push(`${h2Count} гл.`);
    const meta = this.el('span', 'sh-preview-meta', metaParts.join(' · '));

    this.previewEl.replaceChildren(badge, title, meta);
  }

  private renderContent(rawQuery: string): void {
    if (!this.bodyEl || !this.statusEl) return;
    const q = rawQuery.trim();
    if (q.length > 0) {
      this.renderSearchResults(q);
      return;
    }

    this.statusEl.textContent = '';
    this.statusEl.hidden = true;

    const frag = this.doc.createDocumentFragment();
    const memoryBooks = this.o.store.read().books;

    // 1. Reference Lectern (`kind === 'reference'`) in #4F5552
    const refs = this.o.catalog.books.filter((b) => b.kind === 'reference');
    if (refs.length > 0) {
      const refSec = this.el('section', 'sh-lectern');
      refSec.setAttribute('aria-label', 'Справочный пульт');
      const refHeader = this.el('div', 'sh-shelf-head');
      const refDot = this.el('span', 'sh-disc-swatch');
      refDot.style.backgroundColor = REFERENCE_COLOR;
      refHeader.append(
        refDot,
        this.el('h2', 'sh-shelf-title', 'Справочный пульт'),
        this.el('span', 'sh-shelf-sub', 'Глоссарий и сводная библиография станции'),
      );
      const refRow = this.el('div', 'sh-lectern-row');
      for (const ref of refs) {
        const card = this.el('a', 'sh-ref-book') as HTMLAnchorElement;
        card.href = bookHash(ref.id);
        card.setAttribute('data-book', ref.id);
        card.setAttribute('data-kind', 'reference');
        card.style.backgroundColor = REFERENCE_COLOR;
        const code = ref.id === 'glossary' ? 'ГЛ' : ref.id === 'bibliography' ? 'ББ' : 'СПР';
        const stamp = this.el('span', 'sh-ref-stamp', code);
        const info = this.el('div', 'sh-ref-info');
        info.append(
          this.el('span', 'sh-ref-short', ref.shortTitle),
          this.el('span', 'sh-ref-desc', ref.description || ref.title),
        );
        const mins = this.el('span', 'sh-ref-mins', `${ref.readingMinutes} мин`);
        card.append(stamp, info, mins);
        refRow.append(card);
      }
      refSec.append(refHeader, refRow);
      frag.append(refSec);
    }

    // 2. Discipline Shelves (10 disciplines ordered by `d.order`)
    const grid = this.el('div', 'sh-grid');
    const disciplines = [...this.o.catalog.disciplines].sort((a, b) => a.order - b.order);
    for (const d of disciplines) {
      const books = disciplineBooks(this.o.catalog, d.id);
      if (!books.length) continue;
      grid.append(this.buildDisciplineShelf(d, books, memoryBooks));
    }
    frag.append(grid);

    this.bodyEl.replaceChildren(frag);
  }

  private buildDisciplineShelf(
    d: Discipline,
    books: CatalogBook[],
    memoryBooks: Record<string, { opened?: string[]; bookmarks?: unknown[] }>,
  ): HTMLElement {
    const sec = this.el('section', 'sh-case');
    sec.setAttribute('data-discipline', d.id);
    const baseColor = COVER_COLORS[d.id] ?? REFERENCE_COLOR;
    sec.style.setProperty('--disc-color', baseColor);

    const head = this.el('div', 'sh-shelf-head');
    const swatch = this.el('span', 'sh-disc-swatch');
    swatch.style.backgroundColor = baseColor;
    head.append(
      swatch,
      this.el('h2', 'sh-shelf-title', d.name),
      this.el('span', 'sh-shelf-count', `${books.length} т.`),
    );

    const row = this.el('div', 'sh-spines');
    for (const b of books) {
      const a = this.el('a', 'sh-spine') as HTMLAnchorElement;
      a.href = bookHash(b.id);
      a.setAttribute('data-book', b.id);
      a.setAttribute('data-discipline', b.discipline);
      if (b.kind === 'overview') a.classList.add('is-overview');

      const color = spineColor(b);
      const widthPx = spineWidthPx(b.chars);
      a.style.backgroundColor = color;
      a.style.setProperty('--cc', color);
      a.style.setProperty('--sw', `${widthPx}px`);

      const mem = memoryBooks[b.id];
      if (mem && ((mem.bookmarks && mem.bookmarks.length > 0) || (mem.opened && mem.opened.length > 0))) {
        a.classList.add('is-opened');
        const ribbon = this.el('span', 'sh-ribbon');
        ribbon.setAttribute('aria-hidden', 'true');
        a.append(ribbon);
      }

      const sm = shelfmark(this.o.catalog, b.id);
      a.setAttribute('aria-label', `${b.shortTitle} (${sm ? `${sm}, ` : ''}${d.name}, ${b.readingMinutes} мин)`);

      const band = this.el('span', 'sh-band');
      band.setAttribute('aria-hidden', 'true');
      const titleSpan = this.el('span', 'sh-spine-title', b.shortTitle);
      const codeSpan = this.el('span', 'sh-spine-code', sm);
      a.append(band, titleSpan, codeSpan);
      row.append(a);
    }

    const plank = this.el('div', 'sh-plank');
    plank.setAttribute('aria-hidden', 'true');
    sec.append(head, row, plank);
    return sec;
  }

  private renderSearchResults(q: string): void {
    if (!this.bodyEl || !this.statusEl) return;
    const hits = searchCatalog(this.o.catalog, q);
    this.statusEl.hidden = false;
    this.statusEl.textContent = hits.length
      ? `Найдено томов: ${hits.length}`
      : `По запросу «${q}» ничего не найдено`;

    if (!hits.length) {
      const empty = this.el('div', 'sh-empty');
      empty.append(
        this.el('p', 'sh-empty-title', 'Подходящих книг или глав не нашлось'),
        this.el('p', 'sh-empty-sub', 'Попробуйте другое ключевое слово, название дисциплины или тему главы.'),
      );
      this.bodyEl.replaceChildren(empty);
      return;
    }

    const list = this.el('div', 'sh-results');
    for (const { book, matchedHeadings } of hits) {
      const item = this.el('article', 'sh-result-card');
      const color = spineColor(book);
      item.style.setProperty('--cc', color);

      const spineStrip = this.el('div', 'sh-result-spine');
      spineStrip.style.backgroundColor = color;

      const content = this.el('div', 'sh-result-body');
      const top = this.el('div', 'sh-result-top');
      const discName = book.kind === 'reference'
        ? 'Справочник'
        : this.o.catalog.disciplines.find((d) => d.id === book.discipline)?.name ?? book.discipline;
      const sm = shelfmark(this.o.catalog, book.id);
      top.append(
        this.el('span', 'sh-result-disc', sm ? `${sm} · ${discName}` : discName),
        this.el('span', 'sh-result-mins', `${book.readingMinutes} мин`),
      );

      const mainLink = this.el('a', 'sh-result-link') as HTMLAnchorElement;
      mainLink.href = bookHash(book.id);
      mainLink.setAttribute('data-book', book.id);
      mainLink.append(
        this.el('span', 'sh-result-short', book.shortTitle),
        this.el('span', 'sh-result-full', book.title),
      );
      content.append(top, mainLink);

      if (matchedHeadings.length > 0) {
        const chapters = this.el('div', 'sh-result-chapters');
        for (const h of matchedHeadings.slice(0, 4)) {
          const chLink = this.el('a', 'sh-chapter-chip', `§ ${h.text}`) as HTMLAnchorElement;
          chLink.href = bookHash(book.id);
          chLink.setAttribute('data-book', book.id);
          chLink.setAttribute('data-h', h.h);
          chapters.append(chLink);
        }
        content.append(chapters);
      }

      item.append(spineStrip, content);
      list.append(item);
    }

    this.bodyEl.replaceChildren(list);
  }

  private listen(): void {
    const root = this.o.root;

    const onInput = () => {
      const val = this.searchInput?.value ?? '';
      if (this.clearBtn) this.clearBtn.hidden = !val.trim();
      this.renderContent(val);
    };
    this.searchInput?.addEventListener('input', onInput);
    this.cleanup.push(() => this.searchInput?.removeEventListener('input', onInput));

    const onClear = () => {
      if (!this.searchInput) return;
      this.searchInput.value = '';
      if (this.clearBtn) this.clearBtn.hidden = true;
      this.renderContent('');
      this.searchInput.focus();
    };
    this.clearBtn?.addEventListener('click', onClear);
    this.cleanup.push(() => this.clearBtn?.removeEventListener('click', onClear));

    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (t === root || t.classList.contains('rd-desk')) {
        this.o.onClose();
        return;
      }
      const bookLink = t.closest<HTMLElement>('a[data-book]');
      if (bookLink && root.contains(bookLink)) {
        e.preventDefault();
        const id = bookLink.getAttribute('data-book') ?? '';
        const h = bookLink.getAttribute('data-h') ?? undefined;
        if (id) this.o.onOpenBook(id, h);
      }
    };
    root.addEventListener('click', onClick);
    this.cleanup.push(() => root.removeEventListener('click', onClick));

    const onHoverOrFocus = (e: Event) => {
      const t = e.target as Element | null;
      const bookLink = t?.closest<HTMLElement>('[data-book]');
      if (!bookLink) return;
      const id = bookLink.getAttribute('data-book');
      const book = this.o.catalog.books.find((b) => b.id === id);
      if (book) this.renderBookPreview(book);
    };
    root.addEventListener('pointerover', onHoverOrFocus);
    root.addEventListener('focusin', onHoverOrFocus);
    this.cleanup.push(
      () => root.removeEventListener('pointerover', onHoverOrFocus),
      () => root.removeEventListener('focusin', onHoverOrFocus),
    );

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Tab') {
        const next = trapTarget(root, this.doc.activeElement, e.shiftKey);
        if (next) {
          e.preventDefault();
          next.focus();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (this.searchInput && this.searchInput.value.trim().length > 0 && this.doc.activeElement === this.searchInput) {
          this.searchInput.value = '';
          if (this.clearBtn) this.clearBtn.hidden = true;
          this.renderContent('');
          return;
        }
        this.o.onClose();
      }
    };
    this.win.addEventListener('keydown', onKey, true);
    this.cleanup.push(() => this.win.removeEventListener('keydown', onKey, true));
  }

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
    s.innerHTML = inner;
    return s;
  }
}
