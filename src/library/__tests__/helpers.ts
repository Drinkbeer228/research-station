import { createStore, type LibraryState, type Store } from '../store';
export function fakeStorage(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => {
      data.set(k, String(v));
    },
  };
}

export function throwingStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  return {
    getItem: () => {
      throw new Error('storage access denied');
    },
    setItem: () => {
      throw new Error('quota exceeded');
    },
  };
}

export function memoryStore(initial: Partial<LibraryState> = {}): Store {
  return createStore(fakeStorage({ ers_library_v1: JSON.stringify({ v: 1, ...initial }) }));
}

export function okJson(body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
}

export function failing(): typeof fetch {
  return (async () => {
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;
}

export function status(code: number): typeof fetch {
  return (async () => new Response('', { status: code })) as typeof fetch;
}
