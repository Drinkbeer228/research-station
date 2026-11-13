/**
 * Russian hyphenation for justified columns, and the copy handler that undoes it.
 * The rules are the `HY` array of the reader prototype (`prototype/preview.template.html`).
 * Nothing here touches a browser global: the tree to work on is a parameter.
 */

export const SHY = '­';

const CYRILLIC = '[абвгдеёжзийклмнопрстуфхцчшщъыьэюя]';
const VOWEL = '[аеёиоуыэюя]';
const CONSONANT = '[бвгджзклмнпрстфхцчшщ]';
const SIGN = '[йъь]';

/** Each rule puts a soft hyphen after its first group when its lookahead follows. Applied in order. */
const HY: RegExp[] = [
  [SIGN, CYRILLIC + CYRILLIC],
  [VOWEL, VOWEL + CYRILLIC],
  [VOWEL + CONSONANT, CONSONANT + VOWEL],
  [CONSONANT + VOWEL, CONSONANT + VOWEL],
  [VOWEL + CONSONANT, CONSONANT + CONSONANT + VOWEL],
  [VOWEL + CONSONANT + CONSONANT, CONSONANT + CONSONANT + VOWEL],
].map(([x, y]) => new RegExp(`(${x})(?=${y})`, 'gi'));

export function hyphenateWord(word: string): string {
  for (const rule of HY) word = word.replace(rule, `$1${SHY}`);
  return word;
}

const LONG_WORD = /[А-Яа-яЁё]{6,}/g;

const SKIP_TAGS = new Set(['pre', 'code', 'math', 'sup', 'h1', 'h2', 'h3']);

function isProtected(el: Element): boolean {
  return SKIP_TAGS.has(el.localName.toLowerCase()) || el.classList.contains('fm') || el.hasAttribute('data-note');
}

/** Hyphenates the Cyrillic words of 6+ letters in every text node under `root`, in place. */
export function hyphenateTree(root: Node): void {
  if (root.nodeType === 3) {
    root.nodeValue = (root.nodeValue ?? '').replace(LONG_WORD, hyphenateWord);
    return;
  }
  if (root.nodeType === 1 && isProtected(root as Element)) return;
  for (let child = root.firstChild; child; child = child.nextSibling) hyphenateTree(child);
}

export function cleanCopiedText(text: string): string {
  return text.split(SHY).join('');
}

/** On `copy` inside `root`, puts the selection without soft hyphens on the clipboard. Returns the remover. */
export function installCopyCleaner(root: HTMLElement): () => void {
  const onCopy = (event: Event) => {
    const text = root.ownerDocument.defaultView?.getSelection?.()?.toString() ?? '';
    const data = (event as ClipboardEvent).clipboardData;
    if (!text || !data) return;
    data.setData('text/plain', cleanCopiedText(text));
    event.preventDefault();
  };
  root.addEventListener('copy', onCopy);
  return () => root.removeEventListener('copy', onCopy);
}
