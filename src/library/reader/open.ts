/**
 * The book route `#/library/<id>` (spec sections 10 and 11): an overlay over the campus that loads the catalog and the
 * book and shows the reader, or a card that says what went wrong. Loaded lazily by `boot.ts`.
 */
import './fontStyles';
import './reader.css';
import { LibraryError, loadBook, loadCatalog } from '../api';
import { bookHash, parseRoute } from '../router';
import { createStore, type Store } from '../store';
import type { CatalogBook } from '../types';
import { enterReadingMode } from './mobile';
import { NO_BLOCK } from './position';
import { Reader } from './reader';
import { Shelf } from './shelf';

const SITE = 'https://drinkbeer228.github.io/elephantology/';

interface GameInput { blockedByModal: boolean; clearAllInputs?: () => void }
interface GameUi { activeModal?: string | null; closeAllModals?: (playSound?: boolean) => void }
interface Session {
  kind: 'book' | 'hall';
  id: string;
  root: HTMLElement;
  reader: Reader | null;
  shelf: Shelf | null;
  entry: CatalogBook | null;
  site: string;
  restore: () => void;
  returnTo: HTMLElement | null;
}

let session: Session | null = null;
/** Bumped by every load and every close, so a load that resolves late for an old route does nothing. */
let seq = 0;
let store: Store | null = null;

function libraryStore(): Store {
  if (!store) {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      // Storage denied: the library works without memory.
    }
    store = createStore(storage);
  }
  return store;
}

const gameInput = (): GameInput | undefined => (window as unknown as { __ERS_GAME__?: { input?: GameInput } }).__ERS_GAME__?.input;
const gameUi = (): GameUi | undefined => (window as unknown as { __ERS_GAME__?: { ui?: GameUi } }).__ERS_GAME__?.ui;

/**
 * While the overlay is open (spec 5.2): reading mode (`mobile.ts`: the root class that lifts the campus `touch-action`
 * and the zoomable viewport), the campus input blocked, and Esc for the overlay before the reader/shelf exists. Returns
 * the restorer.
 */
function enterOverlay(root: HTMLElement): () => void {
  const leaveReading = enterReadingMode(document);
  const ui = gameUi();
  if (ui?.activeModal) {
    ui.closeAllModals?.(false);
  }
  const input = gameInput();
  const blocked = input?.blockedByModal ?? false;
  if (input) {
    input.blockedByModal = true;
    input.clearAllInputs?.();
  }
  const onKey = (e: KeyboardEvent) => {
    // The reader and shelf handle their own keys; while loading or on an error card, Esc closes the overlay.
    if (e.key === 'Escape' && session && !session.reader && !session.shelf) {
      e.preventDefault();
      e.stopPropagation();
      leave();
    }
  };
  window.addEventListener('keydown', onKey, true);
  return () => {
    window.removeEventListener('keydown', onKey, true);
    leaveReading();
    if (input) input.blockedByModal = blocked;
    root.remove();
  };
}

/** Closes the overlay without touching the history (the route has already changed, or another view replaces it). */
function end(restoreFocus = true): void {
  seq++;
  const s = session;
  session = null;
  if (!s) return;
  s.reader?.close();
  s.shelf?.close();
  s.restore();
  if (restoreFocus) giveFocusBack(s.returnTo);
}

/**
 * After the overlay closes (spec 12): focus goes back to the element that opened the book; a book opened by a link
 * (the address, a link in the page) leaves none, and focus rests on the page body.
 */
function giveFocusBack(to: HTMLElement | null): void {
  if (to && to.isConnected) to.focus({ preventScroll: true });
  else (document.activeElement as HTMLElement | null)?.blur?.();
}

/**
 * Closes the overlay at the reader's or shelf's request and removes the hash: back through the history if opened
 * by a navigation inside the page, otherwise in place. `boot.ts` marks the history entry the page was loaded on.
 */
function leave(): void {
  end(true);
  const state: unknown = history.state;
  const loadedHere = typeof state === 'object' && state !== null && (state as { ersLoad?: number }).ersLoad === performance.timeOrigin;
  if (loadedHere) history.replaceState(state, '', location.pathname + location.search);
  else history.back();
}

addEventListener('hashchange', () => {
  if (!session) return;
  const r = parseRoute(location.hash);
  if (!r) {
    end(true);
  }
});

function captureReturnTo(): HTMLElement | null {
  if (session?.returnTo && session.returnTo.isConnected) return session.returnTo;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body && active !== document.documentElement && !active.closest('.ers-reader') ? active : null;
}

export async function openHallRoute(q?: string): Promise<void> {
  if (session?.kind === 'hall' && session.shelf) {
    session.shelf.setQuery(q ?? '');
    return;
  }
  const returnTo = captureReturnTo();
  end(false);
  const root = document.createElement('div');
  root.className = 'ers-reader ers-shelf-mode';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Библиотека Слонологии');
  root.tabIndex = -1;
  document.body.append(root);
  session = { kind: 'hall', id: '', root, reader: null, shelf: null, entry: null, site: SITE, restore: enterOverlay(root), returnTo };
  root.focus();
  await loadHall(session, q);
}

async function loadHall(s: Session, q?: string): Promise<void> {
  const my = ++seq;
  s.shelf = null;
  s.root.replaceChildren(el('div', 'rd-desk'), el('p', 'rd-loading', 'Открываю библиотеку…'));
  const fetchFn: typeof fetch = (input, init) => fetch(input, init);
  try {
    const { catalog } = await loadCatalog({ fetch: fetchFn, store: libraryStore() });
    if (my !== seq) return;
    s.site = catalog.source?.site || SITE;
    const shelf = new Shelf({
      doc: document,
      root: s.root,
      catalog,
      store: libraryStore(),
      initialQuery: q,
      onClose: leave,
      onOpenBook: (id, heading) => {
        if (heading) {
          libraryStore().write((st) => {
            const cur = st.books[id];
            st.books[id] = {
              hash: cur?.hash ?? '',
              at: { b: NO_BLOCK, o: 0, h: heading },
              bookmarks: cur?.bookmarks ?? [],
              opened: cur?.opened ?? [],
              finished: cur?.finished ?? [],
            };
          });
        }
        const state: unknown = window.history.state;
        window.location.replace(bookHash(id));
        try {
          if (state !== null && state !== undefined) window.history.replaceState(state, '');
        } catch {
          // Ignore if history refuses state.
        }
      },
    });
    s.shelf = shelf;
    shelf.open();
  } catch (e) {
    if (my !== seq) return;
    s.shelf?.close();
    s.shelf = null;
    showError(s, e, () => void loadHall(s, q));
  }
}

export async function openBookRoute(id: string): Promise<void> {
  if (session?.kind === 'book' && session.id === id) return;
  const returnTo = captureReturnTo();
  end(false);
  const root = document.createElement('div');
  root.className = 'ers-reader';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Книга');
  root.tabIndex = -1;
  document.body.append(root);
  session = { kind: 'book', id, root, reader: null, shelf: null, entry: null, site: SITE, restore: enterOverlay(root), returnTo };
  root.focus();
  await loadBookSession(session);
}

async function loadBookSession(s: Session): Promise<void> {
  const my = ++seq;
  s.reader = null;
  s.root.replaceChildren(el('div', 'rd-desk'), el('p', 'rd-loading', 'Открываю книгу…'));
  const fetchFn: typeof fetch = (input, init) => fetch(input, init);
  try {
    const { catalog } = await loadCatalog({ fetch: fetchFn, store: libraryStore() });
    if (my !== seq) return;
    s.site = catalog.source?.site || SITE;
    s.entry = catalog.books.find((b) => b.id === s.id) ?? null;
    if (!s.entry) throw new LibraryError('notfound', 'Такой книги нет в библиотеке.');
    const book = await loadBook(s.entry, { fetch: fetchFn });
    if (my !== seq) return;
    const reader = new Reader({
      doc: document,
      root: s.root,
      catalog,
      entry: s.entry,
      book,
      store: libraryStore(),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      onClose: leave,
    });
    s.reader = reader;
    await reader.open();
  } catch (e) {
    if (my !== seq) return;
    s.reader?.close();
    s.reader = null;
    showError(s, e, () => void loadBookSession(s));
  }
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Spec 11: «Книга не найдена» with the site's catalog; «Книга не загрузилась» with a retry; an unknown schema. */
function showError(s: Session, e: unknown, onRetry: () => void): void {
  const kind = e instanceof LibraryError ? e.kind : 'network';
  if (!(e instanceof LibraryError)) console.error(e);
  const title = kind === 'notfound' ? 'Книга не найдена' : kind === 'schema' ? 'Неизвестная схема данных' : 'Книга не загрузилась';
  const message = e instanceof LibraryError ? e.message : 'Книгу не удалось открыть. Попробуйте ещё раз.';
  const card = el('div', 'rd-card');
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-labelledby', 'ers-reader-card-title');
  const h = el('h2', 'rd-card-title', title);
  h.id = 'ers-reader-card-title';
  const actions = el('div', 'rd-card-actions');
  const link = (text: string, href: string) => {
    const a = el('a', 'rd-btn', text) as HTMLAnchorElement;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  };
  const button = (text: string, f: () => void) => {
    const b = el('button', 'rd-btn', text);
    b.setAttribute('type', 'button');
    b.addEventListener('click', f);
    return b;
  };
  if (kind === 'notfound') {
    actions.append(link('Каталог Elephantology', s.site));
  } else {
    if (kind === 'network') actions.append(button('Повторить', onRetry));
    actions.append(link('Открыть на сайте', s.entry?.siteUrl || s.site));
  }
  actions.append(button('Закрыть', leave));
  card.append(h, el('p', 'rd-card-text', message), actions);
  s.root.replaceChildren(el('div', 'rd-desk'), card);
  (actions.firstElementChild as HTMLElement | null)?.focus();
}
