/**
 * Reading mode of the page (spec 5.2 and 12): while any DOM overlay of the library is open the campus restrictions
 * are lifted: a root class that frees `touch-action`, and a zoomable `viewport`. The campus and the hall keep their
 * own viewport (zoom forbidden: gestures there steer the game); closing the last overlay puts it back, which also
 * returns the page zoom to 1.
 */
export const ROOT_CLASS = 'ers-library-open';
export const READING_VIEWPORT = 'width=device-width, initial-scale=1.0, viewport-fit=cover';

interface Entry { depth: number; viewport: string | null }
const entries = new WeakMap<Document, Entry>();

/** Enters reading mode; returns the restorer. Calls nest with a counter: the last restorer to run restores. */
export function enterReadingMode(doc: Document): () => void {
  const html = doc.documentElement;
  const meta = doc.querySelector('meta[name="viewport"]');
  let entry = entries.get(doc);
  if (!entry) {
    entry = { depth: 0, viewport: meta?.getAttribute('content') ?? null };
    entries.set(doc, entry);
    html.classList.add(ROOT_CLASS);
    meta?.setAttribute('content', READING_VIEWPORT);
  }
  entry.depth++;
  const mine = entry;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--mine.depth > 0) return;
    entries.delete(doc);
    html.classList.remove(ROOT_CLASS);
    if (meta && mine.viewport !== null) meta.setAttribute('content', mine.viewport);
  };
}

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]';

/** What Tab can reach inside `root` now: not hidden, not inert, not behind `aria-hidden`, not taken out with `tabindex=-1`. */
export function tabStops(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (e) => e.tabIndex >= 0 && !(e as HTMLButtonElement).disabled && !e.closest('[hidden], [inert], [aria-hidden="true"]'),
  );
}

/**
 * The element a Tab (or Shift+Tab) must go to to keep focus in the overlay, or null when the browser's own move stays
 * inside: from the end to the start, from the start to the end, from outside the list (the root itself) to an end.
 */
export function wrapFocus<T>(stops: T[], active: unknown, back: boolean): T | null {
  if (!stops.length) return null;
  const at = stops.indexOf(active as T);
  if (at < 0) return back ? stops[stops.length - 1] : stops[0];
  if (back && at === 0) return stops[stops.length - 1];
  if (!back && at === stops.length - 1) return stops[0];
  return null;
}
