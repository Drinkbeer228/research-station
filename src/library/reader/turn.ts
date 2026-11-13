/**
 * One page-turn animation with the hang guards of spec section 8.6: waits for `finished`, but never longer than the
 * duration plus 150 ms, and finishes at once when the page is hidden (hidden pages pause animations). The document is
 * a parameter, so nothing here needs a browser global.
 */

export const TURN_EASING = 'cubic-bezier(.36,.06,.24,1)';
const GRACE_MS = 150;

export function runTurn(el: Element, keyframes: Keyframe[], durationMs: number, doc: Document): Promise<void> {
  const anim = el.animate(keyframes, { duration: durationMs, easing: TURN_EASING, fill: 'forwards' });
  return new Promise<void>((resolve) => {
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      doc.removeEventListener('visibilitychange', onVisibility);
      resolve();
    };
    const finishNow = () => {
      try {
        anim.finish();
      } catch {
        // An animation that cannot finish (cancelled, infinite) still must not hold the reader.
      }
      end();
    };
    const onVisibility = () => {
      if (doc.visibilityState === 'hidden') finishNow();
    };
    const timer = setTimeout(finishNow, durationMs + GRACE_MS);
    doc.addEventListener('visibilitychange', onVisibility);
    anim.finished.then(end, end);
    if (doc.visibilityState === 'hidden') finishNow();
  });
}
