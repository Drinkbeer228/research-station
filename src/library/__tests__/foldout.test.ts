import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { closeFoldout, foldoutOpen, openFoldout } from '../reader/foldout';

function dom() {
  const { document, window } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  const root = document.getElementById('root') as unknown as HTMLElement;
  const click = (el: Element, type = 'click') => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  return { document, root, click };
}

test('opens a sheet with the plate and the «Сложить» button', () => {
  const { document, root } = dom();
  const pre = document.createElement('pre');
  pre.textContent = '┌──┐\n└──┘';
  openFoldout(root, pre as unknown as Node, () => {});
  assert.equal(foldoutOpen(root), true);
  const layer = root.querySelector('.rd-fold')!;
  assert.equal(layer.getAttribute('role'), 'dialog');
  assert.equal(layer.getAttribute('aria-modal'), 'true');
  assert.equal(layer.querySelector('.rd-fold-body pre')!.textContent, '┌──┐\n└──┘');
  assert.equal(layer.querySelector('button')!.textContent, 'Сложить');
});

test('«Сложить» closes the sheet and reports it once', () => {
  const { document, root, click } = dom();
  let closed = 0;
  openFoldout(root, document.createElement('pre') as unknown as Node, () => closed++);
  click(root.querySelector('.rd-fold button')!);
  assert.equal(foldoutOpen(root), false);
  assert.equal(closed, 1);
  assert.equal(closeFoldout(root), false);
  assert.equal(closed, 1);
});

test('a click beside the sheet closes it; a click on the sheet does not', () => {
  const { document, root, click } = dom();
  let closed = 0;
  openFoldout(root, document.createElement('pre') as unknown as Node, () => closed++);
  click(root.querySelector('.rd-fold-body')!);
  assert.equal(foldoutOpen(root), true);
  click(root.querySelector('.rd-fold')!);
  assert.equal(foldoutOpen(root), false);
  assert.equal(closed, 1);
});

test('a drag that starts on the sheet and ends beside it does not close it', () => {
  const { document, root, click } = dom();
  openFoldout(root, document.createElement('pre') as unknown as Node, () => {});
  click(root.querySelector('.rd-fold-sheet')!, 'pointerdown');
  click(root.querySelector('.rd-fold')!);
  assert.equal(foldoutOpen(root), true);
});

test('Esc goes through closeFoldout: it closes the top sheet and says whether there was one', () => {
  const { document, root } = dom();
  let closed = 0;
  openFoldout(root, document.createElement('pre') as unknown as Node, () => closed++);
  assert.equal(closeFoldout(root), true);
  assert.equal(closed, 1);
  assert.equal(closeFoldout(root), false);
});

test('opening a second sheet folds the first one', () => {
  const { document, root } = dom();
  let first = 0;
  openFoldout(root, document.createElement('pre') as unknown as Node, () => first++);
  openFoldout(root, document.createElement('pre') as unknown as Node, () => {});
  assert.equal(first, 1);
  assert.equal(root.querySelectorAll('.rd-fold').length, 1);
});
