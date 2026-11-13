import type { CatalogFile } from './types';

export interface Anchor { b: number; o: number; h?: string; f?: number }
export interface BookMemory { hash: string; at: Anchor | null; bookmarks: Array<Anchor & { t: string }>; opened: string[]; finished: string[] }
export interface LibraryState { v: 1; current: { book: string; seat: number | null } | null; books: Record<string, BookMemory>; settings: { fontSize: number; theme: 'paper' | 'lamp'; fontSet?: boolean }; catalogCache: { generatedAt: string; catalog: CatalogFile } | null }
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

// A usable anchor has finite b and o, a string h if present, and f in [0, 1] if present.
function anchor(x: unknown): Anchor | null {
  if (!isObject(x) || !Number.isFinite(x.b) || !Number.isFinite(x.o)) return null;
  const a: Anchor = { b: x.b as number, o: x.o as number };
  if (x.h !== undefined) {
    if (typeof x.h !== 'string') return null;
    a.h = x.h;
  }
  if (x.f !== undefined) {
    if (!Number.isFinite(x.f) || (x.f as number) < 0 || (x.f as number) > 1) return null;
    a.f = x.f as number;
  }
  return a;
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
  // `fontSet`: the reader chose the size (otherwise it follows the window width). Absent in old states: unset.
  if (settings.fontSet === true) out.settings.fontSet = true;
  if (isObject(x.current) && typeof x.current.book === 'string') {
    out.current = { book: x.current.book, seat: typeof x.current.seat === 'number' ? x.current.seat : null };
  }
  if (isObject(x.catalogCache) && typeof x.catalogCache.generatedAt === 'string' && isObject(x.catalogCache.catalog)) {
    const c = x.catalogCache.catalog;
    if (c.schema === 'elephantology.library/1' && Array.isArray(c.books) && Array.isArray(c.disciplines)) {
      out.catalogCache = { generatedAt: x.catalogCache.generatedAt, catalog: c as unknown as CatalogFile };
    }
  }
  const books: Array<[string, BookMemory]> = [];
  if (isObject(x.books)) {
    for (const [id, raw] of Object.entries(x.books)) {
      if (!isObject(raw)) continue;
      const dates = (v: unknown) => (Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string') : []).slice(-MAX_DATES);
      const bookmarks: Array<Anchor & { t: string }> = [];
      if (Array.isArray(raw.bookmarks)) {
        for (const m of raw.bookmarks) {
          const a = anchor(m);
          if (a && typeof (m as Record<string, unknown>).t === 'string') bookmarks.push({ ...a, t: (m as { t: string }).t });
        }
      }
      books.push([id, {
        hash: typeof raw.hash === 'string' ? raw.hash : '',
        at: anchor(raw.at),
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

/**
 * Reader memory in `storage`. Storage is read once, when the store is created; after that memory is the source
 * of truth, so a failed write (quota, denied) never reverts the session. With no storage, or storage that throws
 * or holds junk, the state lives in memory.
 */
export function createStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null, key: string = DEFAULT_KEY): Store {
  let memory: LibraryState = defaults();
  if (storage) {
    try {
      const raw = storage.getItem(key);
      if (raw !== null) memory = normalize(JSON.parse(raw));
    } catch {
      // Storage unavailable or corrupt: start from defaults.
    }
  }

  return {
    read: () => clone(memory),
    write(mutate) {
      const draft = clone(memory);
      mutate(draft);
      memory = normalize(draft);
      if (!storage) return;
      try {
        storage.setItem(key, JSON.stringify(memory));
      } catch {
        // The catalog cache is the bulk of the state: retry without it so the reader's own memory still persists.
        try {
          storage.setItem(key, JSON.stringify({ ...memory, catalogCache: null }));
        } catch {
          // Still failing: the change stays in memory only.
        }
      }
    },
  };
}
