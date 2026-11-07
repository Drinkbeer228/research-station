/**
 * Reader-side sanitizer for book HTML (spec section 11).
 *
 * The lists below MIRROR, and must stay identical to, Elephantology's
 * `scripts/library/sanitizeSchema.ts` (checked against commit a18d5fab): the same tags, attribute
 * rules, class values and MathML lists. That file is written for rehype-sanitize and hast property
 * names; here the same rules are applied with DOM operations, so `className` is `class`,
 * `colSpan` is `colspan` and `rowSpan` is `rowspan`. If one file changes, change the other.
 *
 * Nothing here touches a browser global: the target `Document` is a parameter.
 */

const HTML_NS = 'http://www.w3.org/1999/xhtml';

/** A rule is a bare attribute name (any value) or [name, ...allowed values] (only those values). */
type Rule = string | [string, ...string[]];

/** MathML that KaTeX (`output: 'mathml'`) emits, with the attributes it sets on each element. */
const MATHML: Record<string, Rule[]> = {
  math: [
    ['xmlns', 'http://www.w3.org/1998/Math/MathML'],
    ['display', 'block'],
  ],
  semantics: [],
  annotation: [['encoding', 'application/x-tex']],
  mrow: [],
  mi: ['mathvariant'],
  mn: ['mathvariant'],
  mo: ['fence', 'lspace', 'mathvariant', 'maxsize', 'minsize', 'rspace', 'separator', 'stretchy'],
  mtext: ['mathvariant'],
  mspace: ['height', 'mathbackground', 'width'],
  msub: [],
  msup: [],
  msubsup: [],
  mfrac: ['linethickness'],
  msqrt: [],
  mroot: [],
  mover: ['accent'],
  munder: ['accentunder'],
  munderover: [],
  mtable: ['columnalign', 'columnlines', 'columnspacing', 'rowlines', 'rowspacing', 'width'],
  mtr: [],
  mtd: ['width'],
  mstyle: ['displaystyle', 'mathcolor', 'scriptlevel'],
  mpadded: ['depth', 'height', 'lspace', 'mathbackground', 'voffset', 'width'],
  mphantom: [],
  menclose: ['notation'],
};

const TAGS = new Set([
  'p', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'br', 'ul', 'ol', 'li', 'blockquote',
  'strong', 'em', 'del', 'sup', 'sub', 'a', 'span',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'figure', 'figcaption', 'pre', 'code', 'img',
  ...Object.keys(MATHML),
]);

/** Attribute rules per element. Any `data-*` attribute is allowed on every element (`'*': ['data*']`). */
const ATTRIBUTES: Record<string, Rule[]> = {
  a: [['href', 'https:', '#'], ['rel', 'noopener'], ['target', '_blank']],
  img: [['src', 'https://drinkbeer228.github.io/'], 'alt', 'width', 'height', ['loading', 'lazy']],
  ol: ['start'],
  th: ['colspan', 'rowspan', 'align'],
  td: ['colspan', 'rowspan', 'align'],
  sup: [['class', 'note']],
  figure: [['class', 'plate']],
  pre: [['class', 'wrap']],
  ...MATHML,
};

/** Rules whose value is checked by prefix (the schema uses a RegExp there), not by equality. */
const PREFIX_RULES = new Set(['a:href', 'img:src']);

/** Rules on space-separated attributes: each token is checked and only allowed ones are kept. */
const TOKEN_RULES = new Set(['class', 'rel']);

/** These elements are only kept inside a `table` (schema `ancestors`). */
const NEEDS_TABLE = new Set(['thead', 'tbody', 'tr', 'th', 'td']);

/** Removed together with their content (schema `strip: ['script']`, plus `style`). */
const DROP_WITH_CONTENT = new Set(['script', 'style']);

/** What the schema leaves of an attribute: the value to write, or null to drop it. */
function allowedValue(tag: string, name: string, value: string): string | null {
  if (name.startsWith('data-')) return value;
  const rule = ATTRIBUTES[tag]?.find((r) => (typeof r === 'string' ? r : r[0]) === name);
  if (rule === undefined) return null;
  if (typeof rule === 'string') return value;
  const [, ...allowed] = rule;
  if (PREFIX_RULES.has(`${tag}:${name}`)) return allowed.some((p) => value.startsWith(p)) ? value : null;
  if (TOKEN_RULES.has(name)) {
    const kept = value.split(/\s+/).filter((t) => allowed.includes(t));
    return kept.length ? kept.join(' ') : null;
  }
  return allowed.includes(value) ? value : null;
}

function copyChildren(from: Node, to: Node, doc: Document, ancestors: string[]): void {
  for (let child = from.firstChild; child; child = child.nextSibling) copyNode(child, to, doc, ancestors);
}

function copyNode(node: Node, to: Node, doc: Document, ancestors: string[]): void {
  if (node.nodeType === 3) {
    to.appendChild(doc.createTextNode(node.nodeValue ?? ''));
    return;
  }
  if (node.nodeType !== 1) return; // comments and the rest are dropped
  const el = node as Element;
  const tag = el.localName.toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) return;
  if (!TAGS.has(tag) || (NEEDS_TABLE.has(tag) && !ancestors.includes('table'))) {
    copyChildren(el, to, doc, ancestors); // unwrap: keep the text, lose the element
    return;
  }
  const out = doc.createElementNS(el.namespaceURI || HTML_NS, tag);
  for (const attr of Array.from(el.attributes)) {
    const value = allowedValue(tag, attr.name.toLowerCase(), attr.value);
    if (value !== null) out.setAttribute(attr.name.toLowerCase(), value);
  }
  // An image whose source was refused would still ask the browser for nothing, but it is an empty box: drop it.
  if (tag === 'img' && !out.hasAttribute('src')) return;
  copyChildren(el, out, doc, [...ancestors, tag]);
  to.appendChild(out);
}

/**
 * Parses `html` in an inert `<template>` (no scripts run, no images load), then rebuilds only what the
 * allow-list permits into `doc`. Disallowed elements are unwrapped, `script` and `style` vanish with
 * their content, and attributes outside the list (ids, handlers, styles) are never copied.
 */
export function sanitizeBookHtml(html: string, doc: Document): DocumentFragment {
  const template = doc.createElement('template');
  template.innerHTML = html;
  const out = doc.createDocumentFragment();
  copyChildren(template.content, out, doc, []);
  return out;
}
