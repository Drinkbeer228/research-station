import { LIBRARY_BASE } from './config';
import type { Store } from './store';
import type { BookFile, CatalogBook, CatalogFile } from './types';

export type LibraryErrorKind = 'network' | 'schema' | 'notfound';

export class LibraryError extends Error {
  readonly kind: LibraryErrorKind;
  constructor(kind: LibraryErrorKind, message: string) {
    super(message);
    this.name = 'LibraryError';
    this.kind = kind;
  }
}

export interface CatalogResult { catalog: CatalogFile; stale: boolean }

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

// Fetches and parses JSON; every failure becomes a LibraryError, never a raw exception.
async function getJson(fetchFn: typeof fetch, url: string, notFoundIsMissing: boolean): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch {
    throw new LibraryError('network', 'Нет связи с библиотекой. Проверьте подключение и попробуйте ещё раз.');
  }
  if (!res.ok) {
    if (res.status === 404 && notFoundIsMissing) throw new LibraryError('notfound', 'Такой книги нет в библиотеке.');
    throw new LibraryError('network', 'Библиотека сейчас недоступна. Попробуйте позже.');
  }
  try {
    return await res.json();
  } catch {
    // A truncated or intercepted body (e.g. a captive-portal page) is a connection problem.
    throw new LibraryError('network', 'Ответ библиотеки получен не полностью. Проверьте подключение и попробуйте ещё раз.');
  }
}

function parseCatalog(x: unknown): CatalogFile {
  if (!isObject(x) || x.schema !== 'elephantology.library/1' || !Array.isArray(x.books) || !Array.isArray(x.disciplines)) {
    throw new LibraryError('schema', 'Каталог библиотеки имеет неизвестный формат.');
  }
  return x as unknown as CatalogFile;
}

function parseBook(x: unknown, entry: CatalogBook): BookFile {
  if (!isObject(x) || x.schema !== 'elephantology.library.book/1' || x.id !== entry.id || typeof x.html !== 'string' || !Array.isArray(x.notes)) {
    throw new LibraryError('schema', 'Книга имеет неизвестный формат.');
  }
  return x as unknown as BookFile;
}

const withSlash = (b: string): string => (b.endsWith('/') ? b : `${b}/`);

/** Loads the catalog and caches it. If loading fails with a network error and a cached copy exists, returns that copy with `stale: true`. */
export async function loadCatalog(deps: { fetch: typeof fetch; store: Store; base?: string }): Promise<CatalogResult> {
  const base = withSlash(deps.base ?? LIBRARY_BASE);
  try {
    const catalog = parseCatalog(await getJson(deps.fetch, base + 'catalog.json', false));
    deps.store.write((s) => {
      s.catalogCache = { generatedAt: catalog.generatedAt, catalog };
    });
    return { catalog, stale: false };
  } catch (e) {
    // Only a connection problem falls back to the cache; an unknown schema is never masked.
    const cached = e instanceof LibraryError && e.kind === 'network' ? deps.store.read().catalogCache : null;
    if (cached) return { catalog: cached.catalog, stale: true };
    throw e;
  }
}

export async function loadBook(entry: CatalogBook, deps: { fetch: typeof fetch; base?: string }): Promise<BookFile> {
  const base = withSlash(deps.base ?? LIBRARY_BASE);
  return parseBook(await getJson(deps.fetch, base + entry.contentUrl, true), entry);
}
