/**
 * The reader (spec section 8). Task 20 starts this file with the checks for notes, fold-out plates and links
 * between books; Task 23 adds the rest and the Playwright config (`baseURL` is the Research Station root).
 *
 * The pages of the reader are inert windows, so Playwright's own click (which waits for the element to receive
 * the event) cannot be used on what is in them: these tests click at the point where the element is drawn.
 */
import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BOOK = 'anatomy/muscular-hydrostat-and-trunk-biomechanics';
const FIXTURES = fileURLToPath(new URL('./fixtures/library/', import.meta.url));

async function serveLibrary(page: Page): Promise<void> {
  await page.route('**/elephantology/library/**', async (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^.*\/elephantology\/library\//, '');
    const file = FIXTURES + rel;
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(file) });
  });
}

/** Opens the book by its address and returns when the first page is on the desk (the cover may still be swinging). */
async function openRaw(page: Page, book = BOOK): Promise<void> {
  await serveLibrary(page);
  await page.goto(`./#/library/${book}`);
  await expect(page.locator('.rd-pg.sr .rd-folio')).toBeAttached();
}

/**
 * Returns when the layout has come to rest: the cover is gone, the fonts are in, and the reader has not rebuilt the
 * pages for a quiet period longer than its relayout delay (160 ms). Fonts that arrive late lay the book out again
 * and put a card away, so a test must not act before that.
 */
async function laidOut(page: Page): Promise<void> {
  await expect(page.locator('.rd-cover')).toHaveCount(0, { timeout: 5000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const book = document.querySelector('.rd-book')!;
    await new Promise<void>((resolve) => {
      let timer = setTimeout(done, 300);
      const mo = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(done, 300);
      });
      mo.observe(book, { childList: true });
      function done() {
        mo.disconnect();
        resolve();
      }
    });
  });
}

async function openBook(page: Page, book = BOOK): Promise<void> {
  await openRaw(page, book);
  await laidOut(page);
}

/** Waits until no turn or fade is running (a click during a turn is ignored; the reader's own animations are finite). */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getComputedTiming().iterations === Infinity));
}

const counter = (page: Page) => page.locator('.rd-count');

/** Presses a key that turns the page and returns when the turn is done. The turn starts inside the key handler. */
async function turn(page: Page, key = 'ArrowRight'): Promise<void> {
  const before = await counter(page).textContent();
  await page.keyboard.press(key);
  await expect(counter(page)).not.toHaveText(before!);
  await settle(page);
}

/** What the reader says about its pages: «N из M». */
async function pagesOf(page: Page): Promise<{ at: number; total: number }> {
  const m = /^(\d+) из (\d+)$/.exec((await counter(page).textContent()) ?? '');
  if (!m) throw new Error('the page counter says nothing');
  return { at: Number(m[1]), total: Number(m[2]) };
}

/** The reading place the reader keeps (spec 8.10): a block, an offset in it and the chapter. Page numbers are not kept: they differ between engines and between layouts. */
async function placeOf(page: Page): Promise<{ b: number; o: number; h?: string }> {
  return page.evaluate(
    (id) => (JSON.parse(localStorage.getItem('ers_library_v1')!) as { books: Record<string, { at: { b: number; o: number; h?: string } }> }).books[id].at,
    BOOK,
  );
}

/** Some part of the block `b` is inside a window on display. */
async function blockOnDisplay(page: Page, b: number): Promise<boolean> {
  return page.evaluate((n) =>
    Array.from(document.querySelectorAll('.rd-pg:not(.blank):not(.rd-face .rd-pg) .rd-win')).some((win) => {
      const w = win.getBoundingClientRect();
      const block = win.querySelector(`[data-b="${n}"]`);
      return !!block && Array.from(block.getClientRects()).some((r) => r.right > w.left && r.left < w.right && r.bottom > w.top && r.top < w.bottom);
    }), b);
}

/** Errors the page reports: exceptions and `console.error`. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** The centre of the first element of the selector that is drawn inside a visible window, or null. */
interface Spot { x: number; y: number; h: string | null }

async function pointOf(page: Page, selector: string): Promise<Spot | null> {
  return page.evaluate((sel) => {
    for (const win of Array.from(document.querySelectorAll('.rd-pg:not(.blank):not(.rd-face .rd-pg) .rd-win'))) {
      const w = win.getBoundingClientRect();
      for (const e of Array.from(win.querySelectorAll(sel))) {
        for (const r of Array.from(e.getClientRects())) {
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          if (r.width > 0 && r.height > 0 && x > w.left && x < w.right && y > w.top && y < w.bottom) return { x, y, h: e.getAttribute('data-h') };
        }
      }
    }
    return null;
  }, selector);
}

/** Turns pages with the arrow key until the selector is on display. */
async function reveal(page: Page, selector: string): Promise<Spot> {
  for (;;) {
    const at = await pointOf(page, selector);
    if (at) {
      await settle(page);
      return at;
    }
    const before = await counter(page).textContent();
    await page.keyboard.press('ArrowRight');
    try {
      await expect(counter(page)).not.toHaveText(before!, { timeout: 2000 });
    } catch {
      throw new Error(`${selector} never came on display`);
    }
    await settle(page);
  }
}

test.describe('notes, fold-outs and links', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

  test('a click on a note number shows its source; the button leads to the literature; Esc closes the card first', async ({ page }) => {
    await openBook(page);
    const at = await reveal(page, 'sup.note');
    await page.mouse.click(at.x, at.y);
    const card = page.locator('.rd-note');
    await expect(card).toBeVisible();
    await expect(card.locator('.rd-note-title')).toHaveText(/^Источник \d+$/);
    await expect(card.locator('.rd-note-body')).not.toBeEmpty();
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe(`#/library/${BOOK}`); // the book is still open

    await page.mouse.click(at.x, at.y);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'К списку литературы' }).click();
    await expect(card).toHaveCount(0);
    await expect(page.locator('.rd-pg:not(.blank) .rd-head', { hasText: 'Литература' }).first()).toBeAttached();
  });

  test('the card of note 8 reads as the article gives it', async ({ page }) => {
    await openBook(page);
    // The number 8 is shown in the text; find a page with it.
    const at = await reveal(page, 'sup.note a[data-note="8"]');
    await page.mouse.click(at.x, at.y);
    await expect(page.locator('.rd-note .rd-note-title')).toHaveText('Источник 8');
    await expect(page.locator('.rd-note .rd-note-body')).toContainText('Shoshani, J., Kupsky, W. J., & Marchant, G. H. (2006)');
  });

  test('a click on a diagram opens the fold-out; Esc, «Сложить» and a click beside the sheet close it', async ({ page }) => {
    await openBook(page);
    const at = await reveal(page, 'figure.plate[data-kind="diagram"]');
    await page.mouse.click(at.x, at.y);
    const fold = page.locator('.rd-fold');
    await expect(fold).toBeVisible();
    await expect(fold.locator('pre')).toContainText('ПОПЕРЕЧНОЕ СЕЧЕНИЕ ХОБОТА');
    expect(await fold.locator('pre').evaluate((e) => getComputedStyle(e).fontSize)).toBe('13.5px');
    await page.keyboard.press('Escape');
    await expect(fold).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe(`#/library/${BOOK}`); // Esc closed the fold-out, not the book

    await page.mouse.click(at.x, at.y);
    await fold.getByRole('button', { name: 'Сложить' }).click();
    await expect(fold).toHaveCount(0);

    await page.mouse.click(at.x, at.y);
    await expect(fold).toBeVisible();
    await page.mouse.click(4, 4); // beside the sheet
    await expect(fold).toHaveCount(0);
  });

  test('a link to another book changes the hash to that book, and closing returns to the campus', async ({ page }) => {
    await openBook(page);
    const at = await reveal(page, 'a[data-book]');
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => new URL(page.url()).hash).not.toBe(`#/library/${BOOK}`);
    expect(new URL(page.url()).hash).toMatch(/^#\/library\/anatomy\/[a-z0-9-]+$/);
    // The fixtures hold no such book, so the other book ends in the «not found» card; until it is up an Escape would reach the campus.
    await expect(page.locator('.rd-card')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ers-reader')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('');
  });

  test('a contents row turns to its chapter', async ({ page }) => {
    await openBook(page);
    await page.locator('.rd-bar').getByRole('button', { name: 'Оглавление' }).click();
    await settle(page);
    const row = await reveal(page, '.fm.contents li[data-h]:last-child');
    expect(await pointOf(page, `h2[data-h="${row.h}"]`)).toBeNull(); // the chapter is not on display yet
    await page.mouse.click(row.x, row.y);
    await expect.poll(async () => (await pointOf(page, `h2[data-h="${row.h}"]`)) !== null).toBe(true);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });

  test('a tap on a note shows its card inside the screen; a tap on a diagram opens a full-screen fold-out', async ({ page }) => {
    await openBook(page);
    const at = await reveal(page, 'sup.note');
    await page.touchscreen.tap(at.x, at.y);
    const card = page.locator('.rd-note');
    await expect(card).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y + box.height).toBeLessThanOrEqual(812);
    await page.touchscreen.tap(8, 700); // away from the card
    await expect(card).toHaveCount(0);

    const plate = await reveal(page, 'figure.plate[data-kind="diagram"]');
    await page.touchscreen.tap(plate.x, plate.y);
    const sheet = page.locator('.rd-fold-sheet');
    await expect(sheet).toBeVisible();
    const s = (await sheet.boundingBox())!;
    expect([s.width, s.height]).toEqual([375, 812]);
    await page.getByRole('button', { name: 'Сложить' }).tap();
    await expect(page.locator('.rd-fold')).toHaveCount(0);
  });
});

// ---- layout: every screen ----------------------------------------------------------------------------------------

interface LayoutReport { total: number; headingLast: string[]; clipped: string[]; neighbour: string[]; formulas: number; hiddenFormulas: number }

/**
 * Measures the book's flow, which every window shows a column of: a heading that is the last thing in its column, a
 * line or box cut by the bottom of the window, and anything that reaches into the neighbouring column. Boxes are
 * clipped by the ancestors that clip them (a folded diagram), so only what the reader can see is judged.
 */
async function layoutReport(page: Page): Promise<LayoutReport> {
  return page.evaluate(() => {
    const flow = document.querySelector<HTMLElement>('.rd-measure .flow')!;
    const num = (name: string) => parseFloat(flow.style.getPropertyValue(name));
    const cw = num('--cw');
    const ch = num('--ch');
    const pitch = cw + num('--gap');
    const o = flow.getBoundingClientRect();
    const col = (left: number) => Math.floor((left - o.left + 2) / pitch);
    const firstRect = (e: Element) => e.getClientRects()[0] ?? e.getBoundingClientRect();
    const lastRect = (e: Element) => Array.from(e.getClientRects()).pop() ?? e.getBoundingClientRect();
    const label = (e: Element) => `${e.tagName.toLowerCase()} «${(e.textContent ?? '').trim().slice(0, 40)}»`;

    const headingLast: string[] = [];
    flow.querySelectorAll('h2, h3').forEach((h) => {
      let next = h.nextElementSibling ?? h.parentElement?.nextElementSibling ?? null;
      while (next && next.getClientRects().length === 0) next = next.nextElementSibling;
      const split = col(lastRect(h).left) !== col(firstRect(h).left);
      if (split || !next || col(firstRect(next).left) > col(firstRect(h).left)) headingLast.push(label(h));
    });

    /** The rectangle cut down to what the clipping ancestors leave of it, or null if nothing is left. */
    const visible = (e: Element, r: DOMRect): DOMRect | null => {
      let left = r.left;
      let top = r.top;
      let right = r.right;
      let bottom = r.bottom;
      for (let a: Element | null = e; a && a !== flow; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const b = a.getBoundingClientRect();
        left = Math.max(left, b.left);
        top = Math.max(top, b.top);
        right = Math.min(right, b.right);
        bottom = Math.min(bottom, b.bottom);
      }
      return right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : null;
    };

    const clipped: string[] = [];
    const neighbour: string[] = [];
    const judge = (e: Element, rects: Iterable<DOMRect>) => {
      for (const raw of rects) {
        if (raw.width <= 0 || raw.height <= 0) continue;
        const r = visible(e, raw);
        if (!r) continue;
        // The box of a glyph may reach a few pixels past its line (a drop cap, a heading): only a line below the window is cut.
        if (r.bottom > o.top + ch + 4) clipped.push(label(e));
        const c = col(r.left);
        if (r.right > o.left + c * pitch + cw + 2 || r.left < o.left + c * pitch - 2) neighbour.push(label(e));
      }
    };
    const walker = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const parent = n.parentElement!;
      if (!n.data.trim() || parent.closest('.sentinel, .rd-unf')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      judge(parent, Array.from(range.getClientRects()));
    }
    flow.querySelectorAll('math, pre, img, svg, table, figure').forEach((e) => judge(e, Array.from(e.getClientRects())));

    const formulas = Array.from(flow.querySelectorAll('math'));
    const hiddenFormulas = formulas.filter((m) => {
      const r = m.getBoundingClientRect();
      return r.width <= 0 || r.height <= 0;
    }).length;
    const counted = /(\d+) из (\d+)/.exec(document.querySelector('.rd-count')?.textContent ?? '');
    return { total: counted ? Number(counted[2]) : 0, headingLast, clipped, neighbour, formulas: formulas.length, hiddenFormulas };
  });
}

/** The totals the counter shows during `ms` after the call (the first one included): a layout that changes shows two. */
async function totalsDuring(page: Page, ms: number): Promise<number[]> {
  return page.evaluate(
    (span) =>
      new Promise<number[]>((resolve) => {
        const el = document.querySelector('.rd-count')!;
        const read = () => Number(/из (\d+)/.exec(el.textContent ?? '')?.[1] ?? 0);
        const seen = new Set<number>([read()]);
        const mo = new MutationObserver(() => seen.add(read()));
        mo.observe(el, { childList: true, characterData: true, subtree: true });
        setTimeout(() => {
          mo.disconnect();
          resolve([...seen]);
        }, span);
      }),
    ms,
  );
}

const SCREENS: Array<[number, number]> = [[1920, 1080], [1440, 900], [1280, 720], [820, 1180], [390, 844]];

for (const [w, h] of SCREENS) {
  test(`layout at ${w}×${h}: the page count holds for 2 s, no heading ends a column, no line is cut, nothing crosses into the next column`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const errors = watchErrors(page);
    await openRaw(page);
    expect(await totalsDuring(page, 2000)).toHaveLength(1); // from the first page on display, fonts arriving included
    await laidOut(page);
    const r = await layoutReport(page);
    expect(r.total).toBeGreaterThan(1);
    expect(r.headingLast, 'a heading is the last in its column').toEqual([]);
    expect(r.clipped, 'a line or box is cut by the bottom of the window').toEqual([]);
    expect(r.neighbour, 'something reaches into the neighbouring column').toEqual([]);
    expect(errors).toEqual([]);
  });
}

// ---- the full checklist: a desktop and a phone-sized window ------------------------------------------------------

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  test.describe(`checklist at ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('opens without errors; the document has no repeated id; the formulas have a size and are shown', async ({ page }, info) => {
      const errors = watchErrors(page);
      await openBook(page);
      expect(errors).toEqual([]);
      const repeated = await page.evaluate(() => {
        const seen = new Map<string, number>();
        document.querySelectorAll('[id]').forEach((e) => seen.set(e.id, (seen.get(e.id) ?? 0) + 1));
        return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
      });
      expect(repeated).toEqual([]);

      const r = await layoutReport(page);
      expect(r.formulas).toBeGreaterThan(0);
      expect(r.hiddenFormulas).toBe(0);
      // The page with the formula on display: its box has a size, and the snapshot goes to the report of the run.
      const spot = await reveal(page, 'math');
      expect(spot).not.toBeNull();
      const shown = await page.evaluate(() => {
        const m = Array.from(document.querySelectorAll('.rd-pg:not(.blank) .rd-win math')).find((e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && e.getBoundingClientRect().left >= 0;
        });
        return m ? { w: m.getBoundingClientRect().width, h: m.getBoundingClientRect().height } : null;
      });
      expect(shown).not.toBeNull();
      expect(shown!.w).toBeGreaterThan(0);
      const file = info.outputPath(`formula-${info.project.name}-${w}x${h}.png`);
      await page.screenshot({ path: file });
      await info.attach(`formula-${info.project.name}-${w}x${h}.png`, { path: file, contentType: 'image/png' });
    });

    test('the arrows go to the last page and back to the first', async ({ page }) => {
      test.setTimeout(240_000);
      await openBook(page);
      const start = await pagesOf(page);
      const seen = [start.at];
      for (let i = 0; i < start.total; i++) {
        const before = await counter(page).textContent();
        await page.keyboard.press('ArrowRight');
        await settle(page);
        if ((await counter(page).textContent()) === before) break; // the last spread: nothing more to turn to
        seen.push((await pagesOf(page)).at);
      }
      // Going forward the page number only grows, and the last page of the book was on display at the end.
      expect(seen).toEqual([...seen].sort((a, b) => a - b));
      expect((await pagesOf(page)).at).toBeGreaterThanOrEqual(start.total - 1);
      for (let i = seen.length - 1; i > 0; i--) await turn(page, 'ArrowLeft');
      expect((await pagesOf(page)).at).toBe(start.at);
    });

    test('a turn finishes at once when the tab is hidden', async ({ page }) => {
      await openBook(page);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const before = await counter(page).textContent();
      await page.keyboard.press('ArrowRight');
      // A turn takes 640 ms on a spread and 460 ms on one page: this one does not wait for its animation.
      await expect(counter(page)).not.toHaveText(before!, { timeout: 300 });
    });

    test('after a reload the book opens on the same page', async ({ page }) => {
      await openBook(page);
      await reveal(page, 'h2[data-h]'); // past the front matter, so that the place has a chapter
      for (let i = 0; i < 2; i++) await turn(page);
      const was = await placeOf(page);
      expect(was.h).toBeDefined();
      const printed = await counter(page).textContent();
      await page.reload();
      await expect(page.locator('.rd-pg.sr .rd-folio')).toBeAttached();
      await laidOut(page);
      expect((await placeOf(page)).h).toBe(was.h);
      expect(await blockOnDisplay(page, was.b)).toBe(true);
      await expect(counter(page)).toHaveText(printed!); // the same layout, the same page number
    });
  });
}

// ---- single scenarios --------------------------------------------------------------------------------------------

test.describe('scenarios', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the book opens within 600 ms', async ({ page }) => {
    await serveLibrary(page);
    await page.goto('./');
    await page.waitForFunction(() => '__ERS_GAME__' in window);
    const ms = await page.evaluate(
      (hash) =>
        new Promise<number>((resolve) => {
          const t0 = performance.now();
          const mo = new MutationObserver(() => {
            if (document.querySelector('.rd-pg.sr .rd-folio')) {
              mo.disconnect();
              resolve(performance.now() - t0);
            }
          });
          mo.observe(document.body, { childList: true, subtree: true });
          location.hash = hash;
        }),
      `#/library/${BOOK}`,
    );
    console.log(`open: ${Math.round(ms)} ms`);
    expect(ms).toBeLessThanOrEqual(600);
  });

  test('with the font files refused the book is on the desk within 3.5 s', async ({ page }) => {
    await serveLibrary(page);
    await page.route('**/*.woff2', (r) => r.abort());
    await page.goto('./');
    await page.waitForFunction(() => '__ERS_GAME__' in window);
    const t0 = Date.now();
    await page.evaluate((hash) => {
      location.hash = hash;
    }, `#/library/${BOOK}`);
    await expect(page.locator('.rd-pg.sr .rd-folio')).toBeAttached({ timeout: 3500 });
    expect(Date.now() - t0).toBeLessThanOrEqual(3500);
    expect((await pagesOf(page)).total).toBeGreaterThan(1);
  });

  test('a book that is not in the catalog says «Книга не найдена»; a failed book says «Книга не загрузилась»', async ({ page }) => {
    await serveLibrary(page);
    await page.goto('./#/library/anatomy/nope');
    await expect(page.locator('.rd-card-title')).toHaveText('Книга не найдена');
    await page.keyboard.press('Escape');
    await expect(page.locator('.ers-reader')).toHaveCount(0);

    await page.route('**/elephantology/library/books/**', (r) => r.fulfill({ status: 500, body: '' }));
    await page.goto(`./#/library/${BOOK}`);
    await expect(page.locator('.rd-card-title')).toHaveText('Книга не загрузилась');
    await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
  });

  test('the book that has no headings: no rows in the contents, at least one page, the edges do not break the turn', async ({ page }) => {
    const errors = watchErrors(page);
    await openBook(page, 'anatomy/tiny');
    expect(await page.locator('.rd-measure .fm.contents li').count()).toBe(0);
    const { total } = await pagesOf(page);
    expect(total).toBeGreaterThanOrEqual(1);
    await page.keyboard.press('Home');
    await settle(page);
    const first = await counter(page).textContent();
    await page.keyboard.press('ArrowLeft'); // before the first page
    await settle(page);
    await expect(counter(page)).toHaveText(first!);
    await page.keyboard.press('End');
    await settle(page);
    const last = await counter(page).textContent();
    await page.keyboard.press('ArrowRight'); // after the last page
    await settle(page);
    await expect(counter(page)).toHaveText(last!);
    expect(errors).toEqual([]);
  });

  test('a resize from 1440×900 to 820×1180 keeps the chapter and the block that was on the page', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openBook(page);
    await reveal(page, 'h2[data-h]');
    for (let i = 0; i < 2; i++) await turn(page);
    const before = await placeOf(page);
    expect(before.h).toBeDefined();
    await page.setViewportSize({ width: 820, height: 1180 });
    await expect(page.locator('.rd-book')).toHaveClass(/single/);
    await laidOut(page);
    const after = await placeOf(page);
    expect({ b: after.b, h: after.h }).toEqual({ b: before.b, h: before.h });
    const onDisplay = await blockOnDisplay(page, before.b);
    expect(onDisplay).toBe(true);
  });

  test('with reduced motion the pages change by a fade of 120 ms at most, with no 3D turn', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openBook(page);
    await page.keyboard.press('ArrowRight');
    const turned = await page.evaluate(() =>
      document.getAnimations().map((a) => {
        const effect = a.effect as KeyframeEffect;
        return { props: effect.getKeyframes().flatMap((k) => Object.keys(k)), ms: Number(a.effect?.getTiming().duration) };
      }),
    );
    expect(turned.length).toBeGreaterThan(0);
    for (const t of turned) {
      expect(t.props).not.toContain('transform');
      expect(t.ms).toBeLessThanOrEqual(120);
    }
    expect(await page.locator('.rd-leaf').count()).toBe(0);
  });

  test('the keyboard path: open, ArrowRight, Escape puts focus outside, clears the address, the campus answers the keys', async ({ page }) => {
    await serveLibrary(page);
    await page.goto('./');
    await page.waitForFunction(() => '__ERS_GAME__' in window);
    const game = () => page.evaluate(() => {
      const input = (window as unknown as { __ERS_GAME__: { input: { blockedByModal: boolean; keys: Set<string> } } }).__ERS_GAME__.input;
      return { blocked: input.blockedByModal, right: input.keys.has('ArrowRight') };
    });
    await page.evaluate((hash) => {
      location.hash = hash;
    }, `#/library/${BOOK}`);
    await expect(page.locator('.rd-pg.sr .rd-folio')).toBeAttached();
    await laidOut(page);
    expect((await game()).blocked).toBe(true);
    await turn(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ers-reader')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('');
    expect(await page.evaluate(() => document.activeElement?.closest('.ers-reader') ?? null)).toBeNull();
    await page.keyboard.down('ArrowRight');
    expect(await game()).toEqual({ blocked: false, right: true });
    await page.keyboard.up('ArrowRight');
  });

  test('Space and Enter on a bar button press it; they do not turn the page', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openBook(page);
    const was = await counter(page).textContent();
    const aa = page.getByRole('button', { name: /^Aa/ });
    await aa.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.rd-pop')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.rd-pop')).toHaveCount(0);
    await aa.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.rd-pop')).toBeVisible();
    await settle(page);
    await expect(counter(page)).toHaveText(was!);
  });

  test('Tab and Shift+Tab stay inside an open fold-out', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openBook(page);
    const at = await reveal(page, 'figure.plate[data-kind="diagram"]');
    await page.mouse.click(at.x, at.y);
    await expect(page.locator('.rd-fold')).toBeVisible();
    const inside = () => page.evaluate(() => !!document.activeElement?.closest('.rd-fold'));
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await inside()).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside()).toBe(true);
    }
  });

  test('a plain click event with no pointer type (a screen reader, a script) opens the card of a note', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openBook(page);
    const at = await reveal(page, 'sup.note');
    await page.evaluate(({ x, y }) => {
      document.elementFromPoint(x, y)!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    }, at);
    await expect(page.locator('.rd-note')).toBeVisible();
  });

  test('an https link in a note card opens a new tab and leaves the reader where it is', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.context().route('https://example.org/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>source</title>' }));
    await openBook(page, 'anatomy/tiny');
    const at = await reveal(page, 'sup.note');
    await page.mouse.click(at.x, at.y);
    const link = page.locator('.rd-note a[href^="https:"]');
    await expect(link).toBeVisible();
    const opened = page.waitForEvent('popup');
    await link.click();
    const tab = await opened;
    await tab.waitForLoadState();
    expect(tab.url()).toBe('https://example.org/tiny-source');
    expect(await tab.evaluate(() => window.opener)).toBeNull();
    expect(new URL(page.url()).hash).toBe('#/library/anatomy/tiny');
    await expect(page.locator('.rd-pg.sr .rd-folio')).toBeAttached();
  });

  for (const [what, selector] of [['a note number', 'sup.note'], ['a link to another book', 'a[data-book]']] as const) {
    test(`a drag that selects text and ends on ${what} neither opens nor follows it`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openBook(page);
      const at = await reveal(page, selector);
      const win = await page.evaluate(({ x, y }) => {
        const r = document.elementFromPoint(x, y)!.closest('.rd-win')!.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top };
      }, at);
      // Over the text to the number (from the line above or below it) or to the link (from the far end of its line).
      if (selector === 'sup.note') await page.mouse.move(win.left + 4, at.y - win.top > 60 ? at.y - 30 : at.y + 30);
      else await page.mouse.move(Math.min(win.right - 60, at.x + 150), at.y); // inside the text, away from the page-turn strip at the edge
      await page.mouse.down();
      await page.mouse.move(at.x, at.y, { steps: 8 });
      await page.mouse.up();
      expect(await page.evaluate(() => window.getSelection()?.toString().length ?? 0)).toBeGreaterThan(0);
      await expect(page.locator('.rd-note')).toHaveCount(0);
      expect(new URL(page.url()).hash).toBe(`#/library/${BOOK}`);
    });
  }

  test('a reader who returns to a place in the book is not shown the cover again', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBook(page);
    await turn(page);
    await page.reload();
    await expect(page.locator('.rd-pg.sr .rd-folio')).toBeAttached();
    await expect(page.locator('.rd-cover')).toHaveCount(0);
  });

  test('after a mouse click a bar button lets go of the focus, so Space turns the page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBook(page);
    await page.getByRole('button', { name: /^Лампа/ }).click();
    expect((await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('aria-label'))) ?? '').not.toMatch(/^Лампа/);
    const was = await counter(page).textContent();
    await page.keyboard.press('Space');
    await expect(counter(page)).not.toHaveText(was!);
  });

  test('when «А−» becomes disabled the focus stays in the font menu', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBook(page);
    await page.getByRole('button', { name: /^Aa/ }).click();
    const less = page.getByRole('button', { name: 'Мельче' });
    for (let i = 0; i < 8 && !(await less.isDisabled()); i++) {
      await less.focus();
      await page.keyboard.press('Enter');
      await laidOut(page);
    }
    await expect(less).toBeDisabled();
    expect(await page.evaluate(() => !!document.activeElement?.closest('.rd-pop'))).toBe(true);
  });

  test('on a phone the bookmark menu stays open when the address bar changes the height', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBook(page);
    await page.getByRole('button', { name: /^Ещё/ }).click();
    await page.locator('.rd-pop [data-k="bm"]').click();
    await expect(page.locator('.rd-pop[aria-label="Закладки"]')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 780 });
    await laidOut(page);
    await expect(page.locator('.rd-pop[aria-label="Закладки"]')).toBeVisible();
  });

  test('the «Библиотека» button in the Elephantology card opens the bookshelf overlay (#/library), filters by h2 heading, opens a book, and restores campus state on close', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await serveLibrary(page);
    await page.goto('./');
    await page.waitForFunction(() => '__ERS_GAME__' in window);

    // Open Elephantology building modal on the campus and check the «Библиотека» button
    const beforeState = await page.evaluate(() => {
      const g = (window as unknown as { __ERS_GAME__: { player: { x: number; y: number }; ui: { openBuildingModal: (b: unknown) => void }; storage: { state: { muted: boolean } } } }).__ERS_GAME__;
      g.ui.openBuildingModal({
        id: 'elephantology',
        theme: 'sage',
        kicker: 'Научный исследовательский центр',
        displayTitle: 'Elephantology',
        description: 'Академическая база знаний',
        siteUrl: 'https://drinkbeer228.github.io/elephantology/',
        githubUrl: 'https://github.com/Drinkbeer228/elephantology',
      });
      return { x: g.player.x, y: g.player.y, muted: g.storage.state.muted };
    });

    const libBtn = page.locator('#building-link-library');
    await expect(libBtn).toBeVisible();
    await expect(libBtn).toHaveText(/Библиотека/);
    await libBtn.click();

    // Bookshelf overlay opens at #/library
    await expect(page.locator('.ers-reader.ers-shelf-mode')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('#/library');
    await expect(page.locator('.sh-case')).toHaveCount(10);
    await expect(page.locator('.sh-spine')).toHaveCount(69);
    await expect(page.locator('.sh-ref-book')).toHaveCount(2);
    await expect(page.locator('.sh-lamp')).toBeAttached();
    await expect(page.locator('.sh-pile .rd-cat')).toBeAttached();

    // Filter by h2 heading via top search input
    const search = page.locator('.sh-search-input');
    await search.fill('Гидродинамика');
    await expect(page.locator('.sh-result-card')).toHaveCount(1);
    await expect(page.locator('.sh-chapter-chip').first()).toContainText('Гидродинамика');

    // Clear search and click the trunk book spine to open the book
    await page.keyboard.press('Escape');
    await expect(page.locator('.sh-spine')).toHaveCount(69);
    await page.locator(`.sh-spine[data-book="${BOOK}"]`).click();

    await expect(page.locator('.rd-pg.sr .rd-folio')).toBeAttached();
    await laidOut(page);
    expect(new URL(page.url()).hash).toBe(`#/library/${BOOK}`);

    // Verify «Дальше» on the end page includes Elephantorina and Elephant Keeper links
    await page.keyboard.press('End');
    await settle(page);
    await expect(page.locator('.rd-measure .fm-next li.fm-next-ext a[data-project="elephantorina"]')).toHaveAttribute(
      'href',
      'https://drinkbeer228.github.io/elephantorina/?book=anatomy/muscular-hydrostat-and-trunk-biomechanics',
    );
    await expect(page.locator('.rd-measure .fm-next li.fm-next-ext a[data-project="keeper"]')).toHaveAttribute(
      'href',
      'https://drinkbeer228.github.io/Elephant-keeper-/',
    );

    // Close and verify campus state is restored
    await page.keyboard.press('Escape');
    await expect(page.locator('.ers-reader')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('');
    const afterState = await page.evaluate(() => {
      const g = (window as unknown as { __ERS_GAME__: { player: { x: number; y: number }; input: { blockedByModal: boolean }; ui: { activeModal: string | null }; storage: { state: { muted: boolean } } } }).__ERS_GAME__;
      return { x: g.player.x, y: g.player.y, blocked: g.input.blockedByModal, modal: g.ui.activeModal, muted: g.storage.state.muted };
    });
    expect(afterState).toEqual({ ...beforeState, blocked: false, modal: null });
  });
});
