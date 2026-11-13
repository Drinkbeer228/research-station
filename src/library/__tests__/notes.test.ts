import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import type { BookNote } from '../types';
import { MISSING_TEXT, TO_REFS, findNote, hideNote, noteLabel, noteOpen, noteTitle, placeNote, showNote, tidyNoteSpacing } from '../reader/notes';

const NOTES: BookNote[] = [
  { n: '8', key: '8', html: 'См. Shoshani, J., Kupsky, W. J., &#x26; Marchant, G. H. (2006). Elephant brain. <em>Brain Research Bulletin</em>.', missing: false },
  { n: 'Sanders 2010', key: 'ref_sanders_2010', html: '', missing: true },
  { n: '2', key: 'ref_x', html: 'Second', missing: false },
];

function dom(html = '<div id="root"></div>') {
  const { document, window } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  return { document, window, root: document.getElementById('root') as unknown as HTMLElement };
}

test('finds a note by the key of its sup first, then by its number', () => {
  assert.equal(findNote(NOTES, 'ref_sanders_2010', 'Sanders 2010')?.n, 'Sanders 2010');
  assert.equal(findNote(NOTES, 'ref_x', '8')?.n, '2'); // the key decides when both are given
  assert.equal(findNote(NOTES, null, '8')?.key, '8');
  assert.equal(findNote(NOTES, 'nope', null), null);
  assert.equal(findNote(NOTES, null, null), null);
});

test('titles a card «Источник N» and labels a missing source with its original key', () => {
  assert.equal(noteTitle(NOTES[0]), 'Источник 8');
  assert.equal(noteLabel(NOTES[0]), null);
  assert.equal(noteLabel(NOTES[1]), 'Метка в статье: ref_sanders_2010');
  assert.equal(MISSING_TEXT, 'Источник не указан в статье');
  assert.equal(TO_REFS, 'К списку литературы');
});

test('removes the space before a note number and nothing else', () => {
  const { document } = dom();
  const p = document.createElement('p');
  p.innerHTML = 'Хобот <sup class="note" data-key="1"><a data-note="1">1</a></sup> и ещё&nbsp;<sup class="note" data-key="2"><a data-note="2">2</a></sup> <sup class="note" data-key="3"><a data-note="3">3</a></sup> конец';
  tidyNoteSpacing(p as unknown as ParentNode);
  const prevOf = (k: string) => p.querySelector(`sup[data-key="${k}"]`)!.previousSibling!;
  assert.equal((prevOf('1') as Text).nodeValue, 'Хобот');
  assert.equal((prevOf('2') as Text).nodeValue!.endsWith(' '), true, 'a no-break space is kept');
  assert.equal((prevOf('3') as Element).getAttribute('data-key'), '2', 'touching notes have no text between them');
  assert.equal(p.querySelector('sup[data-key="3"]')!.nextSibling!.nodeValue, ' конец', 'the space after a note stays');
});

test('a note at the very start of a block has nothing to trim', () => {
  const { document } = dom();
  const p = document.createElement('p');
  p.innerHTML = '<sup class="note" data-key="1"><a data-note="1">1</a></sup> текст';
  tidyNoteSpacing(p as unknown as ParentNode);
  assert.equal(p.textContent, '1 текст');
});

test('places the card below the number, centred on the click, and keeps it inside the window', () => {
  const view = { w: 1000, h: 700 };
  const size = { w: 360, h: 200 };
  const below = placeNote({ left: 480, top: 300, right: 490, bottom: 312 }, { x: 485, y: 306 }, size, view);
  assert.deepEqual(below, { left: 305, top: 322, above: false });
  const nearEdge = placeNote({ left: 990, top: 300, right: 998, bottom: 312 }, { x: 994, y: 306 }, size, view);
  assert.equal(nearEdge.left, 1000 - 360 - 8);
  const left = placeNote({ left: 2, top: 300, right: 10, bottom: 312 }, { x: 6, y: 306 }, size, view);
  assert.equal(left.left, 8);
  const flipped = placeNote({ left: 480, top: 600, right: 490, bottom: 612 }, { x: 485, y: 606 }, size, view);
  assert.deepEqual([flipped.above, flipped.top], [true, 600 - 10 - 200]);
  const squeezed = placeNote({ left: 480, top: 150, right: 490, bottom: 162 }, { x: 485, y: 156 }, { w: 360, h: 640 }, view);
  assert.equal(squeezed.top, 700 - 640 - 8);
  const phone = placeNote(null, { x: 100, y: 300 }, { w: 359, h: 200 }, { w: 375, h: 812 });
  assert.equal(phone.left, 8);
});

test('shows the text of a source with the button to the literature, once', () => {
  const { root, document } = dom();
  const anchor = document.createElement('sup');
  showNote(root, anchor as unknown as Element, NOTES[0], { x: 10, y: 10 });
  showNote(root, anchor as unknown as Element, NOTES[2], { x: 10, y: 10 });
  assert.equal(root.querySelectorAll('.rd-note').length, 1);
  assert.equal(noteOpen(root), true);
  const card = root.querySelector('.rd-note')!;
  assert.equal(card.querySelector('.rd-note-title')!.textContent, 'Источник 2');
  assert.match(card.querySelector('.rd-note-body')!.textContent!, /Second/);
  assert.equal([...card.querySelectorAll('button')].some((b) => b.textContent === 'К списку литературы'), true);
  hideNote(root);
  assert.equal(noteOpen(root), false);
  hideNote(root); // nothing open: no error
});

test('the card of a source reads as the article gives it', () => {
  const { root, document } = dom();
  showNote(root, document.createElement('sup') as unknown as Element, NOTES[0], { x: 0, y: 0 });
  const text = root.querySelector('.rd-note-body')!.textContent!;
  assert.match(text, /^См\. Shoshani, J\., Kupsky, W\. J\., & Marchant, G\. H\. \(2006\)\. Elephant brain\./);
  assert.equal(root.querySelector('.rd-note-body em')!.textContent, 'Brain Research Bulletin');
});

test('a missing source says so and shows the original label', () => {
  const { root, document } = dom();
  showNote(root, document.createElement('sup') as unknown as Element, NOTES[1], { x: 0, y: 0 });
  const card = root.querySelector('.rd-note')!;
  assert.equal(card.querySelector('.rd-note-title')!.textContent, 'Источник Sanders 2010');
  assert.equal(card.querySelector('.rd-note-missing')!.textContent, 'Источник не указан в статье');
  assert.equal(card.querySelector('.rd-note-label')!.textContent, 'Метка в статье: ref_sanders_2010');
});

test('note HTML goes through the sanitizer before it enters the card', () => {
  const { root, document } = dom();
  const evil: BookNote = { n: '1', key: '1', missing: false, html: 'Ok <img src="https://evil.example/x.png" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)" onclick="x()">link</a> <b>bold</b>' };
  showNote(root, document.createElement('sup') as unknown as Element, evil, { x: 0, y: 0 });
  const html = root.querySelector('.rd-note-body')!.innerHTML;
  assert.doesNotMatch(html, /script|onerror|onclick|javascript:|<img|<b>/i);
  assert.match(html, /link/);
  assert.match(html, /bold/);
});
