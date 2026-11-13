import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { SHY, hyphenateWord, hyphenateTree, cleanCopiedText, installCopyCleaner } from '../reader/hyphenate';

test('hyphenates long Cyrillic words', () => {
  const s = (w: string) => hyphenateWord(w).split(SHY).join('|');
  assert.equal(s('колоссальной'), 'ко|лос|саль|ной');
  assert.equal(s('мышечного'), 'мы|шеч|но|го');
  assert.equal(s('концентрацией'), 'кон|цен|тра|ци|ей');
  assert.equal(s('подъезд'), 'подъ|езд');
  assert.equal(s('Слонология'), 'Сло|но|ло|гия');
});

test('SHY is the soft hyphen', () => {
  assert.equal(SHY, '\u00AD');
});

test('leaves short, Latin and protected text alone', () => {
  const { document } = parseHTML('<div><p>хобот Elephantidae колоссальной</p><pre>колоссальной</pre><h2>колоссальной</h2></div>');
  hyphenateTree(document.querySelector('div')!);
  assert.equal(document.querySelector('pre')!.textContent, 'колоссальной');
  assert.equal(document.querySelector('h2')!.textContent, 'колоссальной');
  assert.equal(document.querySelector('p')!.textContent, 'хобот Elephantidae ко\u00ADлос\u00ADсаль\u00ADной');
});

test('skips code, math, sup, h1, h3, .fm and [data-note], and everything inside them', () => {
  const w = 'колоссальной';
  const { document } = parseHTML(`<div><code>${w}</code><math><mtext>${w}</mtext></math><sup>${w}<em>${w}</em></sup><h1>${w}</h1><h3>${w}</h3><section class="fm title"><p>${w}</p></section><a data-note="1">${w}</a><p>${w}<em>${w}</em></p></div>`);
  hyphenateTree(document.querySelector('div')!);
  const hy = 'ко\u00ADлос\u00ADсаль\u00ADной';
  for (const sel of ['code', 'math', 'sup', 'sup em', 'h1', 'h3', '.fm p', '[data-note]']) {
    assert.equal(document.querySelector(sel)!.textContent, sel === 'sup' ? w + w : w, sel);
  }
  assert.equal(document.querySelector('div > p')!.textContent, hy + hy);
});

test('hyphenates every text node and leaves non-letter characters alone', () => {
  const { document } = parseHTML('<div><p>(колоссальной), 12345678 и <em>концентрацией</em>.</p></div>');
  hyphenateTree(document.querySelector('div')!);
  assert.equal(document.querySelector('p')!.textContent, '(ко\u00ADлос\u00ADсаль\u00ADной), 12345678 и кон\u00ADцен\u00ADтра\u00ADци\u00ADей.');
});

test('copied text has no soft hyphens', () => {
  assert.equal(cleanCopiedText('ко\u00ADлос\u00ADсаль\u00ADной мышцы'), 'колоссальной мышцы');
  assert.equal(cleanCopiedText('\u00AD\u00AD'), '');
});

function copyFixture(selected: string) {
  const { document, window } = parseHTML('<div id="r"><p>x</p></div>');
  (window as any).getSelection = () => ({ toString: () => selected });
  const root = document.querySelector('#r') as HTMLElement;
  const copy = () => {
    const data: Record<string, string> = {};
    const ev: any = new window.Event('copy', { bubbles: true, cancelable: true });
    ev.clipboardData = { setData: (t: string, v: string) => { data[t] = v; } };
    root.dispatchEvent(ev);
    return { data, prevented: ev.defaultPrevented };
  };
  return { root, copy };
}

test('copy handler puts the cleaned selection on the clipboard and can be removed', () => {
  const { root, copy } = copyFixture('ко\u00ADлос\u00ADсаль\u00ADной');
  const off = installCopyCleaner(root);
  const first = copy();
  assert.deepEqual(first.data, { 'text/plain': 'колоссальной' });
  assert.equal(first.prevented, true);
  off();
  const second = copy();
  assert.deepEqual(second.data, {});
  assert.equal(second.prevented, false);
});

test('copy handler leaves an empty selection to the browser', () => {
  const { root, copy } = copyFixture('');
  installCopyCleaner(root);
  const r = copy();
  assert.deepEqual(r.data, {});
  assert.equal(r.prevented, false);
});
