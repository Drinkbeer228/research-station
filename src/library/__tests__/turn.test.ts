import test from 'node:test';
import assert from 'node:assert/strict';
import { runTurn } from '../reader/turn';

/** An element whose `animate()` returns an animation that finishes after `finishAfter` ms (never for Infinity). */
function fakeAnimatable({ finishAfter }: { finishAfter: number }): Element & { finishCalls: number } {
  const el = {
    finishCalls: 0,
    animate() {
      let resolve: () => void = () => {};
      const finished = new Promise<void>((r) => {
        resolve = r;
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (Number.isFinite(finishAfter)) timer = setTimeout(resolve, finishAfter);
      return {
        finished,
        finish() {
          el.finishCalls++;
          clearTimeout(timer);
          resolve();
        },
      };
    },
  };
  return el as unknown as Element & { finishCalls: number };
}

/** A document that can be hidden: `hide()` sets `visibilityState` and fires `visibilitychange`. */
function fakeDoc(): Document & { hide(): void } {
  const target = new EventTarget();
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    hidden: false,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    hide() {
      doc.visibilityState = 'hidden';
      doc.hidden = true;
      target.dispatchEvent(new Event('visibilitychange'));
    },
  };
  return doc as unknown as Document & { hide(): void };
}

test('resolves when the animation finishes', async () => {
  const el = fakeAnimatable({ finishAfter: 10 });
  await runTurn(el, [], 640, fakeDoc());
});

test('does not hang when the animation never finishes', async () => {
  const t0 = Date.now();
  await runTurn(fakeAnimatable({ finishAfter: Infinity }), [], 50, fakeDoc());
  assert.ok(Date.now() - t0 < 400);
});

test('finishes immediately when the page is hidden', async () => {
  const doc = fakeDoc(); const el = fakeAnimatable({ finishAfter: Infinity });
  const p = runTurn(el, [], 10_000, doc);
  doc.hide();
  await p;
  assert.equal(el.finishCalls, 1);
});
