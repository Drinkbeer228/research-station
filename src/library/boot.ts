import { parseRoute } from './router';

// Marks the history entry this page was loaded on, so closing a book knows whether to go back or replace.
try {
  const s: unknown = history.state;
  history.replaceState({ ...(typeof s === 'object' && s !== null ? s : {}), ersLoad: performance.timeOrigin }, '');
} catch {
  // A history that refuses state only costs the back-or-replace choice on close.
}

let seq = 0;

/** Removes the book hash: back if the book was opened inside the page, in place if the page was loaded on it. */
function leave(): void {
  if ((history.state as { ersLoad?: number } | null)?.ersLoad === performance.timeOrigin) history.replaceState(history.state, '', location.pathname + location.search);
  else history.back();
}

/** The reader chunk did not load (offline, or an old page after a deploy): the reader's own «no network» message. */
function offline(): void {
  const d = document.createElement('div');
  d.setAttribute('role', 'alertdialog');
  d.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(44,48,46,.55);font:15px/1.45 system-ui,sans-serif;color:#2C302E';
  d.innerHTML = '<div style="max-width:420px;background:#F4F1EA;border:2px solid #2C302E;border-radius:14px;padding:20px 22px"><h2 style="margin:0 0 8px;font-size:20px">Книга не загрузилась</h2><p style="margin:0 0 16px">Нет связи с библиотекой. Проверьте подключение и попробуйте ещё раз.</p><button type="button">Повторить</button> <button type="button">Закрыть</button></div>';
  const [retry, close] = Array.from(d.querySelectorAll('button'));
  for (const b of [retry, close]) b.style.cssText = 'height:40px;padding:0 16px;border:1.5px solid #2C302E;border-radius:10px;background:#E8E4DA;font:inherit;cursor:pointer';
  const input = (window as unknown as { __ERS_GAME__?: { input?: { blockedByModal: boolean } } }).__ERS_GAME__?.input;
  const blocked = input?.blockedByModal ?? false;
  if (input) input.blockedByModal = true;
  let open = true;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
      leave();
    }
  };
  const dismiss = () => {
    if (!open) return;
    open = false;
    d.remove();
    removeEventListener('hashchange', dismiss);
    removeEventListener('keydown', onKey, true);
    if (input) input.blockedByModal = blocked;
  };
  addEventListener('hashchange', dismiss);
  addEventListener('keydown', onKey, true);
  retry.onclick = () => {
    dismiss();
    route();
  };
  close.onclick = () => {
    dismiss();
    leave();
  };
  document.body.append(d);
  retry.focus();
}

function route(): void {
  // Every route change supersedes the previous one, so a chunk that resolves late opens nothing stale.
  const n = ++seq;
  const r = parseRoute(location.hash);
  if (!r) return;
  import('./reader/open').then(
    (m) => {
      if (n !== seq) return;
      if (r.kind === 'book') return m.openBookRoute(r.id);
      return m.openHallRoute(r.kind === 'catalog' ? r.q : undefined);
    },
    () => {
      if (n === seq) offline();
    },
  );
}

addEventListener('hashchange', route);
route();
