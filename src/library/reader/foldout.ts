/**
 * Fold-out plates (spec section 8.7): a sheet with the creases of a folded paper, laid over the book. A diagram is
 * set at 13.5 px and scrolls; on a phone the sheet takes the whole screen. The reader owns Esc, so it closes the
 * sheet with `closeFoldout`; «Сложить» and a click beside the sheet close it from in here.
 */
export const FOLD_TITLE = 'Сложить';

const closers = new WeakMap<Element, () => void>();

function el(doc: Document, tag: string, cls: string, text?: string): HTMLElement {
  const e = doc.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const layerOf = (root: HTMLElement): HTMLElement | null => root.querySelector(':scope > .rd-fold');

export function foldoutOpen(root: HTMLElement): boolean {
  return layerOf(root) !== null;
}

/** Closes the sheet on top, if there is one; says whether it did. `onClose` of that sheet runs once. */
export function closeFoldout(root: HTMLElement): boolean {
  const layer = layerOf(root);
  if (!layer) return false;
  const active = root.ownerDocument.activeElement;
  const hadFocus = active !== null && layer.contains(active);
  const onClose = closers.get(layer);
  closers.delete(layer);
  layer.remove();
  if (hadFocus) root.focus({ preventScroll: true });
  onClose?.();
  return true;
}

export function openFoldout(root: HTMLElement, content: Node, onClose: () => void): void {
  closeFoldout(root);
  const doc = root.ownerDocument;
  const layer = el(doc, 'div', 'rd-fold');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', 'Вклейка');
  const sheet = el(doc, 'div', 'rd-fold-sheet');
  const bar = el(doc, 'div', 'rd-fold-bar');
  const fold = el(doc, 'button', 'rd-btn rd-fold-close', FOLD_TITLE);
  fold.setAttribute('type', 'button');
  fold.addEventListener('click', () => closeFoldout(root));
  bar.append(fold);
  const body = el(doc, 'div', 'rd-fold-body');
  body.tabIndex = 0; // keyboard scrolling of a wide diagram
  body.append(content);
  sheet.append(bar, body);
  layer.append(sheet);

  // A drag that starts on the sheet (selecting text) and ends beside it is not a click beside the sheet.
  let downOnSheet = false;
  layer.addEventListener('pointerdown', (e) => {
    downOnSheet = e.target !== layer;
  });
  layer.addEventListener('click', (e) => {
    if (e.target === layer && !downOnSheet) closeFoldout(root);
    downOnSheet = false;
  });

  closers.set(layer, onClose);
  root.append(layer);
  fold.focus({ preventScroll: true });
}
