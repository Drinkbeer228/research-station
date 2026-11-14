// Size budgets of the library (spec section 13), read from the build: run `npm run build` first.
//   boot (the entry chunk, always loaded)      <= 5 KB gzip
//   reader (the lazy chunk, with its CSS)      <= 60 KB gzip
//   book fonts (Latin and Cyrillic, roman and italic, and the mono)   <= 200 KB
// The latin-ext, cyrillic-ext, greek and vietnamese subsets load only when a book has such characters.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const DIST = new URL('../dist/', import.meta.url);
const KB = 1024;
const manifest = JSON.parse(readFileSync(new URL('.vite/manifest.json', DIST), 'utf8'));

const entry = manifest['index.html'];
const lazy = manifest['src/library/reader/open.ts'];
if (!entry || !lazy) {
  console.error('manifest has no index.html entry or no src/library/reader/open.ts chunk: build first');
  process.exit(2);
}

const gz = (file) => gzipSync(readFileSync(new URL(file, DIST)), { level: 9 }).length;
const sum = (files) => files.reduce((n, f) => n + gz(f), 0);

// Chunks the lazy chunk imports statically, other than the entry that is already loaded.
const lazyFiles = new Set([lazy.file, ...(lazy.css ?? [])]);
for (const key of lazy.imports ?? []) {
  if (key !== 'index.html') {
    lazyFiles.add(manifest[key].file);
    for (const css of manifest[key].css ?? []) lazyFiles.add(css);
  }
}

const fontFiles = (lazy.assets ?? []).filter((f) => /source-serif-4-(latin|cyrillic)-wght-(normal|italic)-|book-mono-/.test(f));
const fontBytes = fontFiles.reduce((n, f) => n + statSync(new URL(f, DIST)).size, 0);

// The catalog Elephantology publishes; CATALOG=<path> checks another copy (the fixture is a copy of the real one).
const catalogPath = new URL(process.env.CATALOG ?? '../tests/e2e/fixtures/library/catalog.json', import.meta.url);
const catalogRaw = existsSync(catalogPath) ? readFileSync(catalogPath) : null;

const rows = [
  { name: 'boot', value: sum([entry.file]), limit: 5 * KB, unit: 'gzip' },
  { name: 'reader (lazy)', value: sum([...lazyFiles]), limit: 60 * KB, unit: 'gzip' },
  { name: `book fonts (${fontFiles.length} files)`, value: fontBytes, limit: 200 * KB, unit: 'raw' },
  ...(catalogRaw
    ? [
        { name: 'catalog.json', value: catalogRaw.length, limit: 250 * KB, unit: 'raw' },
        { name: 'catalog.json', value: gzipSync(catalogRaw, { level: 9 }).length, limit: 60 * KB, unit: 'gzip' },
      ]
    : []),
];

// Five font files are expected: Latin and Cyrillic, roman and italic, and Book Mono. Fewer means a file
// stopped matching the filter and its bytes are not counted.
if (fontFiles.length !== 5) {
  console.error(`FAIL book fonts: expected 5 files, found ${fontFiles.length}: ${fontFiles.join(', ')}`);
  process.exitCode = 1;
}
if (!catalogRaw) {
  console.error(`FAIL catalog.json not found at ${catalogPath.pathname} (set CATALOG=<path>)`);
  process.exitCode = 1;
}

let failed = false;
for (const r of rows) {
  const ok = r.value <= r.limit;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.name}: ${(r.value / KB).toFixed(2)} KB ${r.unit} (limit ${r.limit / KB} KB; ${r.value} B)`);
}
process.exit(failed || process.exitCode ? 1 : 0);
