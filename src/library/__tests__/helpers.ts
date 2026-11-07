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
