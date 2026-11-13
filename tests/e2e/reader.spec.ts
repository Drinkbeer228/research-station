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

async function openBook(page: Page): Promise<void> {
  await serveLibrary(page);
  await page.goto(`./#/library/${BOOK}`);
  await expect(page.locator('.rd-pg.sr .rd-folio')).toBeAttached();
  // The cover swings open first; with reduced motion it does not exist.
  await expect(page.locator('.rd-cover')).toHaveCount(0, { timeout: 5000 });
  // Fonts that arrive late lay the book out again, which puts a card away: let that settle before the test acts.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

/** Waits until no turn or fade is running (a click during a turn is ignored; the reader's own animations are finite). */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getComputedTiming().iterations === Infinity));
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
  for (let i = 0; i < 60; i++) {
    const at = await pointOf(page, selector);
    if (at) {
      await settle(page);
      return at;
    }
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    await settle(page);
  }
  throw new Error(`${selector} never came on display`);
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
    await page.keyboard.press('Escape');
    await expect(page.locator('.ers-reader')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('');
  });

  test('a contents row turns to its chapter', async ({ page }) => {
    await openBook(page);
    const row = await reveal(page, '.fm.contents li[data-h]');
    await page.mouse.click(row.x, row.y);
    // The chapter of that row is now on display.
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
