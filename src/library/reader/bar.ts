/**
 * The bar and its menus (spec 8.9): the buttons, the icons and the stateless drawing of the menus. The state they
 * show (font size, lamp, bookmarks) stays with the reader, which passes it in.
 */
export const MIN_FONT = 15;
export const MAX_FONT = 22;

/** Bar icons (shown instead of the words on a phone, spec 8.9). 20 px, stroke only. */
export const ICONS: Record<string, string> = {
  close: '<path d="M5 5l10 10M15 5L5 15"/>',
  toc: '<path d="M4 5h12M4 10h12M4 15h8"/>',
  bookmark: '<path d="M6 3h8v14l-4-3.5L6 17z"/>',
  more: '<circle cx="4.5" cy="10" r="1.3"/><circle cx="10" cy="10" r="1.3"/><circle cx="15.5" cy="10" r="1.3"/>',
  lamp: '<path d="M10 2.5a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9zM7.5 16.5h5"/>',
};

export function element(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A bar button: the words on a desktop, an icon on a phone (CSS decides); `icon` null keeps the words always. */
export function barButton(doc: Document, label: string, icon: string | null, f: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = element(doc, 'button', icon ? 'rd-btn' : 'rd-btn rd-txt') as HTMLButtonElement;
  b.setAttribute('type', 'button');
  b.setAttribute('aria-label', label);
  if (icon) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'rd-ico');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[icon]; // fixed drawing from this file, no data
    b.append(svg);
  }
  b.append(element(doc, 'span', 'rd-lbl', label));
  b.addEventListener('click', (e) => {
    f(b);
    // After a mouse or finger click the button lets go of the focus, so Space turns the page instead of pressing it again.
    if (e.detail > 0 && b.ownerDocument.activeElement === b) b.blur();
  });
  return b;
}

export function popButton(doc: Document, text: string, f: () => void, cls = 'rd-pop-btn'): HTMLButtonElement {
  const b = element(doc, 'button', cls, text) as HTMLButtonElement;
  b.setAttribute('type', 'button');
  b.addEventListener('click', f);
  return b;
}

/** Below the spread (spec 8.9, phones) «Закладка» and «Лампа» are not in the bar: «Ещё» opens a menu with them. */
export function renderMorePop(doc: Document, box: HTMLElement, lampOn: boolean, act: { bookmarks(): void; lamp(): void }): void {
  const bm = popButton(doc, 'Закладка', act.bookmarks);
  bm.dataset.k = 'bm';
  bm.setAttribute('aria-haspopup', 'true');
  const lamp = popButton(doc, lampOn ? 'Лампа: включена' : 'Лампа: выключена', act.lamp);
  lamp.dataset.k = 'lamp';
  lamp.setAttribute('aria-pressed', String(lampOn));
  box.append(bm, lamp);
}

export function renderFontPop(doc: Document, box: HTMLElement, fs: number, explicit: boolean, set: (size: number | null) => void): void {
  const row = element(doc, 'div', 'rd-pop-row');
  const less = popButton(doc, 'А−', () => set(fs - 1), 'rd-pop-btn rd-pop-step');
  less.setAttribute('aria-label', 'Мельче');
  less.dataset.k = 'less';
  less.disabled = fs <= MIN_FONT;
  const more = popButton(doc, 'А+', () => set(fs + 1), 'rd-pop-btn rd-pop-step');
  more.setAttribute('aria-label', 'Крупнее');
  more.dataset.k = 'more';
  more.disabled = fs >= MAX_FONT;
  row.append(less, element(doc, 'span', 'rd-pop-val', `${fs} px`), more);
  const reset = popButton(doc, 'По ширине окна', () => set(null));
  reset.dataset.k = 'reset';
  reset.disabled = !explicit;
  box.append(row, reset);
}
