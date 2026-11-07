/**
 * Samples distinct Cyrillic words of 6+ letters from the built books and prints them hyphenated, as a
 * markdown table for docs/hyphenation-review.md. Fixed seed, so the sample is reproducible.
 *
 *   npx tsx scripts/hyphenation-sample.ts [booksDir] [seed] [count]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import { sanitizeBookHtml } from '../src/library/reader/sanitize';
import { hyphenateWord, SHY } from '../src/library/reader/hyphenate';

const dir = process.argv[2] ?? '../elephantology/dist/library/books';
const seed = Number(process.argv[3] ?? 16);
const count = Number(process.argv[4] ?? 300);

function bookFiles(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? bookFiles(p) : n.endsWith('.json') && d !== dir ? [p] : [];
  }).sort();
}

// The containers hyphenateTree skips; words inside them are never hyphenated, so they are not sampled.
const SKIP = new Set(['pre', 'code', 'math', 'sup', 'h1', 'h2', 'h3']);
function collect(node: Node, out: Map<string, number>): void {
  if (node.nodeType === 3) {
    for (const w of (node.nodeValue ?? '').match(/[А-Яа-яЁё]{6,}/g) ?? []) out.set(w.toLowerCase(), (out.get(w.toLowerCase()) ?? 0) + 1);
    return;
  }
  if (node.nodeType === 1) {
    const el = node as Element;
    if (SKIP.has(el.localName.toLowerCase()) || el.classList.contains('fm') || el.hasAttribute('data-note')) return;
  }
  for (let c = node.firstChild; c; c = c.nextSibling) collect(c, out);
}

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { document } = parseHTML('<!doctype html><html><body></body></html>');
const words = new Map<string, number>();
const files = bookFiles(dir);
for (const f of files) collect(sanitizeBookHtml(JSON.parse(readFileSync(f, 'utf8')).html, document), words);

const pool = [...words.keys()].sort();
const rnd = mulberry32(seed);
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const sample = pool.slice(0, count).sort((a, b) => a.localeCompare(b, 'ru'));

console.error(`${files.length} books, ${pool.length} distinct words of 6+ letters, seed ${seed}, sample ${sample.length}`);
console.log('| № | Слово | С переносами | Верно |\n|---|---|---|---|');
sample.forEach((w, i) => console.log(`| ${i + 1} | ${w} | ${hyphenateWord(w).split(SHY).join('·')} |  |`));
