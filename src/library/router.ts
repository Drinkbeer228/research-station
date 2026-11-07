export type Route = { kind: 'hall' } | { kind: 'catalog'; q: string } | { kind: 'book'; id: string };

const PREFIX = '#/library';
const BOOK_ID = /^(?:[a-z]+\/)?[a-z0-9-]+$/;

export function parseRoute(hash: string): Route | null {
  if (hash !== PREFIX && !hash.startsWith(PREFIX + '/')) return null;
  const rest = hash.slice(PREFIX.length);
  if (rest === '' || rest === '/') return { kind: 'hall' };
  if (rest === '/catalog' || rest.startsWith('/catalog?')) {
    const q = rest.slice('/catalog'.length + 1);
    try {
      return { kind: 'catalog', q: new URLSearchParams(q).get('q') ?? '' };
    } catch {
      return null;
    }
  }
  const id = rest.slice(1);
  return BOOK_ID.test(id) ? { kind: 'book', id } : null;
}

export function bookHash(id: string): string {
  return PREFIX + '/' + id;
}
