import type { CatalogFile } from './types';

export interface Anchor { b: number; o: number; h?: string; f?: number }
export interface BookMemory { hash: string; at: Anchor | null; bookmarks: Array<Anchor & { t: string }>; opened: string[]; finished: string[] }
export interface LibraryState { v: 1; current: { book: string; seat: number | null } | null; books: Record<string, BookMemory>; settings: { fontSize: number; theme: 'paper' | 'lamp' }; catalogCache: { generatedAt: string; catalog: CatalogFile } | null }
export interface Store { read(): LibraryState; write(mutate: (s: LibraryState) => void): void }

const DEFAULT_KEY = 'ers_library_v1';
const MAX_BOOKS = 60;
const MAX_DATES = 20;
const MAX_BOOKMARKS = 50;
const MIN_FONT = 15;
const MAX_FONT = 22;
const DEFAULT_FONT = 17;

function defaults(): LibraryState {
  return { v: 1, current: null, books: {}, settings: { fontSize: DEFAULT_FONT, theme: 'paper' }, catalogCache: null };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function clampFont(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return DEFAULT_FONT;
  return Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(x)));
}

function latestOpened(b: BookMemory): string {
  return b.opened.reduce((m, d) => (d > m ? d : m), '');
}

// Brings any value (stored JSON or a mutated state) to a valid state within the limits.
function normalize(x: unknown): LibraryState {
  const out = defaults();
  if (!isObject(x)) return out;
  const settings = isObject(x.settings) ? x.settings : {};
  out.settings = { fontSize: clampFont(settings.fontSize), theme: settings.theme === 'lamp' ? 'lamp' : 'paper' };
  if (isObject(x.current) && typeof x.current.book === 'string') {
    out.current = { book: x.current.book, seat: typeof x.current.seat === 'number' ? x.current.seat : null };
  }
  if (isObject(x.catalogCache) && typeof x.catalogCache.generatedAt === 'string' && isObject(x.catalogCache.catalog)) {
    out.catalogCache = { generatedAt: x.catalogCache.generatedAt, catalog: x.catalogCache.catalog as unknown as CatalogFile };
  }
  const books: Array<[string, BookMemory]> = [];
  if (isObject(x.books)) {
    for (const [id, raw] of Object.entries(x.books)) {
      if (!isObject(raw)) continue;
      const dates = (v: unknown) => (Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string') : []).slice(-MAX_DATES);
      const bookmarks = Array.isArray(raw.bookmarks)
        ? raw.bookmarks.filter((m): m is Anchor & { t: string } => isObject(m) && typeof m.b === 'number' && typeof m.o === 'number' && typeof m.t === 'string')
        : [];
      books.push([id, {
        hash: typeof raw.hash === 'string' ? raw.hash : '',
        at: isObject(raw.at) && typeof raw.at.b === 'number' && typeof raw.at.o === 'number' ? (raw.at as unknown as Anchor) : null,
        bookmarks: bookmarks.slice(-MAX_BOOKMARKS),
        opened: dates(raw.opened),
        finished: dates(raw.finished),
      }]);
    }
  }
  if (books.length > MAX_BOOKS) {
    // Evict the books whose latest `opened` date is oldest; a book never opened counts as oldest.
    const ranked = books.map((e, i) => ({ e, i, d: latestOpened(e[1]) })).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : a.i - b.i));
    const keep = new Set(ranked.slice(0, MAX_BOOKS).map((r) => r.i));
    out.books = Object.fromEntries(books.filter((_, i) => keep.has(i)));
  } else {
    out.books = Object.fromEntries(books);
  }
  return out;
}

const clone = (s: LibraryState): LibraryState => JSON.parse(JSON.stringify(s)) as LibraryState;

/** Reader memory in `storage`. With no storage, or storage that throws or holds junk, the state lives in memory. */
export function createStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null, key: string = DEFAULT_KEY): Store {
  let memory: LibraryState = defaults();

  function load(): LibraryState {
    if (storage) {
      try {
        const raw = storage.getItem(key);
        if (raw !== null) memory = normalize(JSON.parse(raw));
      } catch {
        // Storage unavailable or corrupt: keep the in-memory state.
      }
    }
    return memory;
  }

  return {
    read: () => clone(load()),
    write(mutate) {
      const draft = clone(load());
      mutate(draft);
      memory = normalize(draft);
      if (!storage) return;
      try {
        storage.setItem(key, JSON.stringify(memory));
      } catch {
        // Quota or denied: the change stays in memory.
      }
    },
  };
}
