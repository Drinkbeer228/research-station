/**
 * The reader under real touches (spec sections 3, 12 and 14): Chromium only, a phone-sized window with touch and the
 * mobile viewport, the fingers sent through the DevTools protocol (`Input.dispatchTouchEvent`), as in the check of
 * spec section 3. Firefox and WebKit have no such protocol; the config leaves this file to Chromium.
 */
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BOOK = 'anatomy/muscular-hydrostat-and-trunk-biomechanics';
const FIXTURES = fileURLToPath(new URL('./fixtures/library/', import.meta.url));

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

interface Point { x: number; y: number }

async function serveLibrary(page: Page): Promise<void> {
  await page.route('**/elephantology/library/**', async (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^.*\/elephantology\/library\//, '');
    const file = FIXTURES + rel;
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(file) });
  });
}

/** The campus is up; then the book, by its address, with the cover gone and the layout at rest. */
async function openBook(page: Page): Promise<void> {
  await serveLibrary(page);
  await page.goto('./');
  await page.waitForFunction(() => '__ERS_GAME__' in window);
  await page.evaluate((hash) => {
    location.hash = hash;
  }, `#/library/${BOOK}`);
  await expect(page.locator('.rd-pg.sr .rd-folio')).toBeAttached();
  await expect(page.locator('.rd-cover')).toHaveCount(0, { timeout: 5000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const book = document.querySelector('.rd-book')!;
    await new Promise<void>((resolve) => {
      let timer = setTimeout(done, 300); // longer than the reader's relayout delay (160 ms)
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

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getComputedTiming().iterations === Infinity));
}

const counter = (page: Page) => page.locator('.rd-count');
const scale = (page: Page) => page.evaluate(() => window.visualViewport?.scale ?? 1);

/** Fingers: each call sends the points that are down; `up` lifts them all. */
class Fingers {
  constructor(private readonly cdp: CDPSession) {}
  private send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: Point[]) {
    return this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) });
  }
  down(...points: Point[]) {
    return this.send('touchStart', points);
  }
  move(...points: Point[]) {
    return this.send('touchMove', points);
  }
  up() {
    return this.send('touchEnd', []);
  }
  /** One finger from `a` to `b` in `steps` moves. */
  async swipe(a: Point, b: Point, steps = 8): Promise<void> {
    await this.down(a);
    for (let i = 1; i <= steps; i++) await this.move({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps });
    await this.up();
  }
  /** Two fingers apart around `c`, from `from` px to `to` px between them. */
  async pinch(c: Point, from: number, to: number, steps = 10): Promise<void> {
    const at = (gap: number): [Point, Point] => [{ x: c.x - gap / 2, y: c.y }, { x: c.x + gap / 2, y: c.y }];
    await this.down(...at(from));
    for (let i = 1; i <= steps; i++) await this.move(...at(from + ((to - from) * i) / steps));
    await this.up();
  }
}

async function fingers(page: Page): Promise<Fingers> {
  return new Fingers(await page.context().newCDPSession(page));
}

test('a fold-out scrolls under the finger', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBook(page);
  // Turn to the diagram and open its fold-out with a tap.
  let plate: Point | null = null;
  for (let i = 0; i < 30 && !plate; i++) {
    plate = await page.evaluate(() => {
      for (const fig of Array.from(document.querySelectorAll('.rd-pg:not(.blank) .rd-win figure.plate[data-kind="diagram"]'))) {
        const win = fig.closest('.rd-win')!.getBoundingClientRect();
        const r = fig.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        if (x > win.left && x < win.right && y > win.top && y < win.bottom) return { x, y };
      }
      return null;
    });
    if (!plate) {
      const before = await counter(page).textContent();
      await page.keyboard.press('ArrowRight');
      await expect(counter(page)).not.toHaveText(before!);
      await settle(page);
    }
  }
  expect(plate).not.toBeNull();
  await page.touchscreen.tap(plate!.x, plate!.y);
  const body = page.locator('.rd-fold-body');
  await expect(body).toBeVisible();
  const room = await body.evaluate((e) => ({ x: e.scrollWidth - e.clientWidth, y: e.scrollHeight - e.clientHeight }));
  expect(Math.max(room.x, room.y), 'the diagram must have something to scroll to').toBeGreaterThan(20);
  const box = (await body.boundingBox())!;
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const touch = await fingers(page);
  if (room.x >= room.y) await touch.swipe({ x: c.x + 100, y: c.y }, { x: c.x - 100, y: c.y });
  else await touch.swipe({ x: c.x, y: c.y + 100 }, { x: c.x, y: c.y - 100 });
  await expect.poll(() => body.evaluate((e) => e.scrollLeft + e.scrollTop)).toBeGreaterThan(0);
});

test('a pinch in the book zooms the page; closing the book brings the scale back to 1', async ({ page }) => {
  await openBook(page);
  expect(await scale(page)).toBe(1);
  const touch = await fingers(page);
  await touch.pinch({ x: 195, y: 420 }, 60, 300);
  await expect.poll(() => scale(page)).toBeGreaterThan(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ers-reader')).toHaveCount(0);
  await expect.poll(() => scale(page)).toBe(1);
});

test('on the campus, after the book is closed, a pinch does not zoom', async ({ page }) => {
  await openBook(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ers-reader')).toHaveCount(0);
  const touch = await fingers(page);
  await touch.pinch({ x: 195, y: 420 }, 60, 300);
  // Nothing to wait for: a zoom, if there were one, would be in place by the time the fingers are up.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  expect(await scale(page)).toBe(1);
});

test('a horizontal swipe turns the page; a vertical one does not', async ({ page }) => {
  await openBook(page);
  const touch = await fingers(page);
  const was = await counter(page).textContent();
  await touch.swipe({ x: 350, y: 420 }, { x: 40, y: 420 });
  await expect(counter(page)).not.toHaveText(was!);
  await settle(page);
  const turned = await counter(page).textContent();
  await touch.swipe({ x: 200, y: 640 }, { x: 200, y: 200 });
  await settle(page);
  await expect(counter(page)).toHaveText(turned!);
});

test('a pointerup that never reaches the book does not leave the reader stuck', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBook(page);
  await page.evaluate(() => window.addEventListener('pointerdown', (e) => ((window as unknown as { __pid: number }).__pid = e.pointerId), true));
  const touch = await fingers(page);
  await touch.down({ x: 300, y: 420 });
  await touch.move({ x: 260, y: 420 });
  await touch.move({ x: 200, y: 420 }); // the drag has begun: the reader is busy with it, and a key does not turn the page
  const dragging = await counter(page).textContent();
  await page.keyboard.press('ArrowRight');
  await settle(page);
  await expect(counter(page)).toHaveText(dragging!);
  // The release goes somewhere else: only the window hears of it.
  await page.evaluate(() => {
    const pointerId = (window as unknown as { __pid: number }).__pid;
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId, pointerType: 'touch', isPrimary: true }));
  });
  await settle(page);
  const before = await counter(page).textContent();
  await page.keyboard.press('ArrowRight');
  await expect(counter(page)).not.toHaveText(before!);
  await touch.up();
});
