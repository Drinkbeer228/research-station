import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { sanitizeBookHtml } from '../reader/sanitize';

function run(html: string) {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const box = document.createElement('div');
  box.append(sanitizeBookHtml(html, document));
  return box;
}

test('removes scripts, handlers and foreign sources but keeps MathML and data attributes', () => {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const frag = sanitizeBookHtml('<p data-b="0" onclick="x()">А<script>1</script><a href="javascript:alert(1)">в</a><img src="https://evil.example/x.png"><img src="https://drinkbeer228.github.io/elephantology/images/a.jpg"></p><math><mi>V</mi></math>', document);
  const box = document.createElement('div'); box.append(frag);
  assert.equal(box.querySelector('script'), null);
  assert.equal(box.querySelector('[onclick]'), null);
  assert.equal(box.querySelector('a')?.getAttribute('href'), null);
  assert.equal(box.querySelectorAll('img').length, 1);
  assert.equal(box.querySelector('p')?.getAttribute('data-b'), '0');
  assert.ok(box.querySelector('math mi'));
});

test('drops script and style content entirely', () => {
  const box = run('<p>a<script>alert(1)</script><style>p{color:red}</style>b</p>');
  assert.equal(box.textContent, 'ab');
});

test('unwraps disallowed elements and keeps their text', () => {
  const box = run('<p>x <font color="red">y</font> <iframe src="https://evil.example"></iframe><u>z</u></p><div>w</div>');
  assert.equal(box.querySelector('font'), null);
  assert.equal(box.querySelector('u'), null);
  assert.equal(box.querySelector('div'), null);
  assert.equal(box.querySelector('iframe'), null);
  assert.equal(box.textContent, 'x y zw');
});

test('href survives only as https: or #', () => {
  const box = run('<a href="https://x.example/a">1</a><a href="#top">2</a><a href="http://x.example">3</a><a href="javascript:alert(1)">4</a><a href="/rel">5</a>');
  assert.deepEqual([...box.querySelectorAll('a')].map((a) => a.getAttribute('href')), ['https://x.example/a', '#top', null, null, null]);
});

test('src survives only under the Elephantology host, other img attributes follow the list', () => {
  const box = run('<img src="https://drinkbeer228.github.io/x.jpg" alt="a" width="3" height="4" loading="lazy" onerror="x()" srcset="y"><img src="https://drinkbeer228.github.io.evil.example/x.jpg"><img src="data:image/png;base64,AA"><img loading="eager" src="https://drinkbeer228.github.io/y.jpg">');
  const imgs = [...box.querySelectorAll('img')];
  assert.equal(imgs.length, 2);
  assert.equal(imgs[0].getAttribute('alt'), 'a');
  assert.equal(imgs[0].getAttribute('width'), '3');
  assert.equal(imgs[0].getAttribute('height'), '4');
  assert.equal(imgs[0].getAttribute('loading'), 'lazy');
  assert.equal(imgs[0].getAttribute('onerror'), null);
  assert.equal(imgs[0].getAttribute('srcset'), null);
  assert.equal(imgs[1].getAttribute('loading'), null);
});

test('no id, no style, no event handlers anywhere', () => {
  const box = run('<h2 id="x" style="color:red" onmouseover="x()">T</h2><p id="y" class="evil" onclick="x()">a</p>');
  assert.equal(box.querySelector('[id]'), null);
  assert.equal(box.querySelector('[style]'), null);
  assert.equal(box.querySelector('[onmouseover]'), null);
  assert.equal(box.querySelector('[onclick]'), null);
  assert.equal(box.querySelector('p')?.hasAttribute('class'), false);
});

test('keeps class note/plate/wrap only on their own elements', () => {
  const box = run('<sup class="note" data-key="k"><a data-note="1">1</a></sup><figure class="plate"><pre class="wrap">x</pre></figure><sup class="evil">2</sup><figure class="note">f</figure><pre class="plate">p</pre><p class="note">q</p>');
  assert.equal(box.querySelector('sup')?.getAttribute('class'), 'note');
  assert.equal(box.querySelector('sup')?.getAttribute('data-key'), 'k');
  assert.equal(box.querySelector('a')?.getAttribute('data-note'), '1');
  assert.equal(box.querySelectorAll('sup')[1].hasAttribute('class'), false);
  assert.equal(box.querySelector('figure')?.getAttribute('class'), 'plate');
  assert.equal(box.querySelector('figure pre')?.getAttribute('class'), 'wrap');
  assert.equal(box.querySelectorAll('figure')[1].hasAttribute('class'), false);
  assert.equal(box.querySelectorAll('pre')[1].hasAttribute('class'), false);
  assert.equal(box.querySelector('p')?.hasAttribute('class'), false);
});

test('keeps rel=noopener and target=_blank on links, nothing else', () => {
  const box = run('<a href="https://x.example" rel="noopener" target="_blank">1</a><a href="https://x.example" rel="opener" target="_top">2</a>');
  const [a, b] = [...box.querySelectorAll('a')];
  assert.equal(a.getAttribute('rel'), 'noopener');
  assert.equal(a.getAttribute('target'), '_blank');
  assert.equal(b.getAttribute('rel'), null);
  assert.equal(b.getAttribute('target'), null);
});

test('keeps the amended list: h4-h6, del, span, br, hr, ol start, cell align and spans', () => {
  const box = run('<h4>a</h4><h5>b</h5><h6>c</h6><p><del>d</del><span>e</span><br>f</p><hr><ol start="2"><li>g</li></ol><table><thead><tr><th align="left" colspan="2" rowspan="1">h</th></tr></thead><tbody><tr><td align="right">i</td></tr></tbody></table>');
  for (const s of ['h4', 'h5', 'h6', 'del', 'span', 'br', 'hr', 'thead', 'tbody', 'tr', 'th', 'td']) assert.ok(box.querySelector(s), s);
  assert.equal(box.querySelector('ol')?.getAttribute('start'), '2');
  assert.equal(box.querySelector('th')?.getAttribute('align'), 'left');
  assert.equal(box.querySelector('th')?.getAttribute('colspan'), '2');
  assert.equal(box.querySelector('th')?.getAttribute('rowspan'), '1');
  assert.equal(box.querySelector('td')?.getAttribute('align'), 'right');
});

test('drops h1, form controls and other tags outside the list', () => {
  const box = run('<h1>t</h1><form action="https://x.example"><input value="v"><button>b</button></form><svg><circle/></svg><video src="https://drinkbeer228.github.io/v.mp4"></video>');
  for (const s of ['h1', 'form', 'input', 'button', 'svg', 'video']) assert.equal(box.querySelector(s), null, s);
  assert.equal(box.textContent, 'tb');
});

test('keeps MathML tags and their listed attributes only', () => {
  const box = run('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" onload="x()"><semantics><mrow><mi mathvariant="bold" class="k">x</mi><mo stretchy="true" bogus="1">=</mo><mfrac linethickness="0"><mn>1</mn><mn>2</mn></mfrac></mrow><annotation encoding="application/x-tex">x=\\frac12</annotation></semantics></math>');
  const math = box.querySelector('math')!;
  assert.equal(math.getAttribute('xmlns'), 'http://www.w3.org/1998/Math/MathML');
  assert.equal(math.getAttribute('display'), 'block');
  assert.equal(math.getAttribute('onload'), null);
  assert.equal(box.querySelector('mi')?.getAttribute('mathvariant'), 'bold');
  assert.equal(box.querySelector('mi')?.hasAttribute('class'), false);
  assert.equal(box.querySelector('mo')?.getAttribute('stretchy'), 'true');
  assert.equal(box.querySelector('mo')?.getAttribute('bogus'), null);
  assert.equal(box.querySelector('mfrac')?.getAttribute('linethickness'), '0');
  assert.equal(box.querySelector('annotation')?.getAttribute('encoding'), 'application/x-tex');
});

test('MathML attributes with fixed values keep only that value', () => {
  const box = run('<math xmlns="http://evil.example" display="inline"><semantics><annotation encoding="text/html">x</annotation></semantics></math>');
  assert.equal(box.querySelector('math')?.getAttribute('xmlns'), null);
  assert.equal(box.querySelector('math')?.getAttribute('display'), null);
  assert.equal(box.querySelector('annotation')?.getAttribute('encoding'), null);
});

test('returns a fragment with nothing from comments', () => {
  const box = run('<!-- hi --><p>a</p>');
  assert.equal(box.innerHTML, '<p>a</p>');
});
