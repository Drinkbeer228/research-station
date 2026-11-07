const base: string = import.meta.env?.VITE_LIBRARY_BASE || '/elephantology/library/';

export const LIBRARY_BASE: string = base.endsWith('/') ? base : base + '/';
