/**
 * The book route `#/library/<id>` (spec sections 10 and 11): an overlay over the campus that loads the catalog and the
 * book and shows the reader, or a card that says what went wrong. Loaded lazily by `boot.ts`.
 */
import './fontStyles';
import './reader.css';
import { LibraryError, loadBook, loadCatalog } from '../api';
import { bookHash } from '../router';
import { createStore, type Store } from '../store';
import type { CatalogBook } from '../types';
import { enterReadingMode } from './mobile';
import { Reader } from './reader';

const SITE = 'https://drinkbeer228.github.io/elephantology/';

interface GameInput { blockedByModal: boolean; clearAllInputs?: () => void }
interface Session { id: string; root: HTMLElement; reader: Reader | null; entry: CatalogBook | null; site: string; restore: () => void; returnTo: HTMLElement | null }

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

/**
 * While the overlay is open (spec 5.2): reading mode (`mobile.ts`: the root class that lifts the campus `touch-action`
 * and the zoomable viewport), the campus input blocked, and Esc for the overlay before the reader exists. Returns the
 * restorer.
 */
function enterOverlay(root: HTMLElement): () => void {
  const leaveReading = enterReadingMode(document);
  const input = gameInput();
  const blocked = input?.blockedByModal ?? false;
  if (input) {
    input.blockedByModal = true;
    input.clearAllInputs?.();
  }
  const onKey = (e: KeyboardEvent) => {
    // The reader handles its own keys; while loading or on an error card, Esc closes the overlay.
    if (e.key === 'Escape' && session && !session.reader) {
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

/** Closes the overlay without touching the history (the route has already changed, or another book replaces it). */
function end(): void {
  seq++;
  const s = session;
  session = null;
  if (!s) return;
  s.reader?.close();
  s.restore();
  giveFocusBack(s.returnTo);
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
 * Closes the overlay at the reader's request and removes the hash: back through the history if the book was opened
 * by a navigation inside the page, otherwise in place. `boot.ts` marks the history entry the page was loaded on.
 */
function leave(): void {
  end();
  const state: unknown = history.state;
  const loadedHere = typeof state === 'object' && state !== null && (state as { ersLoad?: number }).ersLoad === performance.timeOrigin;
  if (loadedHere) history.replaceState(state, '', location.pathname + location.search);
  else history.back();
}

addEventListener('hashchange', () => {
  if (session && location.hash !== bookHash(session.id)) end();
});

export async function openBookRoute(id: string): Promise<void> {
  if (session?.id === id) return;
  end();
  const active = document.activeElement;
  const returnTo = active instanceof HTMLElement && active !== document.body && active !== document.documentElement ? active : null;
  const root = document.createElement('div');
  root.className = 'ers-reader';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Книга');
  root.tabIndex = -1;
  document.body.append(root);
  session = { id, root, reader: null, entry: null, site: SITE, restore: enterOverlay(root), returnTo };
  root.focus();
  await load(session);
}

async function load(s: Session): Promise<void> {
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
    showError(s, e);
  }
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Spec 11: «Книга не найдена» with the site's catalog; «Книга не загрузилась» with a retry; an unknown schema. */
function showError(s: Session, e: unknown): void {
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
    if (kind === 'network') actions.append(button('Повторить', () => void load(s)));
    actions.append(link('Открыть на сайте', s.entry?.siteUrl || s.site));
  }
  actions.append(button('Закрыть', leave));
  card.append(h, el('p', 'rd-card-text', message), actions);
  s.root.replaceChildren(el('div', 'rd-desk'), card);
  (actions.firstElementChild as HTMLElement | null)?.focus();
}
