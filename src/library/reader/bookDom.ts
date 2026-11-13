/**
 * Assembles the pages of a book as one reading flow (spec section 8.1): front matter, body, literature, end matter.
 * Every string from the catalog or the book is set with `textContent`; the only HTML that enters the flow is the
 * sanitized book body and notes. The target `Document` is a parameter, so nothing here needs a browser global.
 */
import type { BookFile, BookNote, CatalogBook, CatalogFile, Contributor } from '../types';
import type { BookMemory } from '../store';
import { getBookConnections } from '../connections';
import { sanitizeBookHtml } from './sanitize';
import { hyphenateTree } from './hyphenate';

export const DISCIPLINE_CODES: Record<string, string> = {
  anatomy: 'АН', veterinary: 'ВЕ', genomics: 'ГЕ', cognition: 'КО', culture: 'КУ',
  conservation: 'ОХ', paleontology: 'ПА', taxonomy: 'ТА', ecology: 'ЭК', ethogram: 'ЭТ',
};

const BOARD = 'Редакция «Слонологии»';
const LIBRARY = 'Научная библиотека Elephant Research Station';
const UNCHANGED = 'Текст, ссылки и источники приведены по статье энциклопедии «Слонология» без изменений.';
const NO_SOURCE = 'источник не указан в статье';

/** The shelfmark, for example 'АН·06': the overview first, then the shelf by short title. '' for books off the shelves. */
export function shelfmark(catalog: CatalogFile, id: string): string {
  const book = catalog.books.find((b) => b.id === id);
  if (!book || book.kind === 'reference') return '';
  const code = DISCIPLINE_CODES[book.discipline];
  if (!code) return '';
  const shelf = catalog.books
    .filter((b) => b.discipline === book.discipline && b.kind !== 'reference')
    .sort((a, b) => (a.kind === 'overview' ? 0 : 1) - (b.kind === 'overview' ? 0 : 1) || a.shortTitle.localeCompare(b.shortTitle, 'ru'));
  const at = shelf.findIndex((b) => b.id === id);
  return `${code}·${String(at + 1).padStart(2, '0')}`;
}

export interface FlowParts { flow: HTMLElement; body: HTMLElement; contents: HTMLElement; end: HTMLElement; sentinel: HTMLElement }

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const isAuthor = (c: Contributor) => c.role.trim().toLowerCase() === 'author' || c.role.trim().toLowerCase() === 'автор';

/** `author` and `editor` (the schema's English values) are shown in Russian; any other role is printed as written. */
function roleLabel(role: string): string {
  const key = role.trim().toLowerCase();
  if (key === 'author') return 'автор';
  if (key === 'editor') return 'редактор';
  return role;
}

/**
 * Verso values in the wording of the Elephantology site (`src/i18n/ru.ts`, `article.*`); the evidence levels are
 * grouped as `ArticleMetadataHeader.getEvidenceLabel` groups them. A value with no entry is printed as written.
 */
const EVIDENCE_LABELS: Record<string, string> = {
  established: 'Высокая доказательность', high: 'Высокая доказательность', // article.evidenceHigh
  moderate: 'Умеренная доказательность', // article.evidenceModerate
  preliminary: 'Предварительные данные', limited: 'Предварительные данные', hypothesis: 'Предварительные данные', // article.evidencePreliminary
};
const BASIS_LABELS: Record<string, string> = {
  peer_reviewed: 'рецензируемые журналы', // article.basisPeerReviewed
  primary_studies: 'первичные исследования', // article.basisPrimaryStudies
  field_reports: 'полевые мониторинги', // article.basisFieldReports
  clinical_guidelines: 'клинические протоколы', // article.basisClinicalGuidelines
};
const DIFFICULTY_LABELS: Record<string, string> = {
  basic: 'Базовый уровень', // article.difficultyBasic
  beginner: 'Базовый уровень', // article.difficultyBasic (controller ruling: no own string on the site)
  intermediate: 'Средний уровень', // article.difficultyIntermediate
  advanced: 'Монографический уровень', // article.difficultyAdvanced
  expert: 'Монографический уровень', // article.difficultyAdvanced (controller ruling: no own string on the site)
};

const label = (map: Record<string, string>, value: string): string => (Object.hasOwn(map, value) ? map[value] : value);

function titlePage(doc: Document, catalog: CatalogFile, entry: CatalogBook): HTMLElement {
  const sec = el(doc, 'section', 'fm title');
  const discipline = entry.kind === 'reference' ? null : catalog.disciplines.find((d) => d.id === entry.discipline)?.name ?? null;
  sec.append(el(doc, 'p', 'fm-series', discipline ? `Слонология · ${discipline}` : 'Слонология'));
  sec.append(el(doc, 'h1', 'fm-title', entry.title));
  if (entry.description) sec.append(el(doc, 'p', 'fm-description', entry.description));
  const authors = entry.contributors.filter(isAuthor);
  let credit = BOARD;
  if (authors.length) credit = authors.map((a) => a.name).join(', ');
  else if (entry.contributorsText) credit = entry.contributorsText;
  sec.append(el(doc, 'p', 'fm-authors', credit));
  sec.append(el(doc, 'p', 'fm-library', LIBRARY));
  return sec;
}

function versoPage(doc: Document, catalog: CatalogFile, entry: CatalogBook): HTMLElement {
  const sec = el(doc, 'section', 'fm verso');
  const dl = el(doc, 'dl');
  const row = (label: string, value: string | null) => {
    if (!value) return;
    dl.append(el(doc, 'dt', undefined, label), el(doc, 'dd', undefined, value));
  };
  row('Шифр', shelfmark(catalog, entry.id));
  row('Уровень доказательности', entry.evidenceLevel && label(EVIDENCE_LABELS, entry.evidenceLevel));
  row('Основания', entry.evidenceBasis.length ? entry.evidenceBasis.map((b) => label(BASIS_LABELS, b)).join(', ') : null);
  row('Редакционный пересмотр', entry.lastReviewed);
  row('Сложность', entry.difficulty && label(DIFFICULTY_LABELS, entry.difficulty));
  row('Время чтения', entry.readingMinutes > 0 ? `${entry.readingMinutes} мин` : null);
  sec.append(dl, el(doc, 'p', 'fm-unchanged', UNCHANGED));
  return sec;
}

function contentsPage(doc: Document, entry: CatalogBook): HTMLElement {
  const sec = el(doc, 'section', 'fm contents');
  sec.append(el(doc, 'h2', 'fm-heading', 'Оглавление'));
  const ol = el(doc, 'ol');
  for (const h of entry.headings.filter((x) => x.level === 2)) {
    const li = el(doc, 'li');
    li.setAttribute('data-h', h.h);
    li.append(el(doc, 'span', 'toc-title', h.text), el(doc, 'span', 'toc-page'));
    ol.append(li);
  }
  sec.append(ol);
  return sec;
}

function bodySection(doc: Document, book: BookFile): HTMLElement {
  const body = el(doc, 'section', 'body');
  body.append(sanitizeBookHtml(book.html, doc));
  hyphenateTree(body);
  return body;
}

function numeric(n: string): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER;
}

function refsSection(doc: Document, notes: BookNote[]): HTMLElement {
  const sec = el(doc, 'section', 'refs');
  if (!notes.length) return sec;
  sec.append(el(doc, 'h2', 'fm-heading', 'Литература'));
  const ol = el(doc, 'ol');
  const sorted = [...notes].sort((a, b) => numeric(a.n) - numeric(b.n) || a.n.localeCompare(b.n));
  for (const note of sorted) {
    const li = el(doc, 'li');
    li.setAttribute('data-n', note.n);
    li.setAttribute('data-key', note.key);
    li.append(el(doc, 'span', 'ref-n', note.n));
    if (note.missing) {
      li.classList.add('missing');
      li.append(el(doc, 'span', 'ref-text', NO_SOURCE));
    } else {
      const text = el(doc, 'span', 'ref-text');
      text.append(sanitizeBookHtml(note.html, doc));
      li.append(text);
    }
    ol.append(li);
  }
  sec.append(ol);
  return sec;
}

function people(doc: Document, list: Contributor[]): HTMLElement {
  const ul = el(doc, 'ul', 'fm-people');
  for (const c of list) {
    const li = el(doc, 'li');
    li.append(el(doc, 'span', 'person-name', c.name), el(doc, 'span', 'person-role', ` · ${roleLabel(c.role)}`));
    if (c.affiliation) li.append(el(doc, 'span', 'person-affiliation', `, ${c.affiliation}`));
    if (c.orcid) li.append(el(doc, 'span', 'person-orcid', `, ORCID ${c.orcid}`));
    if (c.url) li.append(doc.createTextNode(', '), linkTo(doc, c.url, c.url));
    ul.append(li);
  }
  return ul;
}

function linkTo(doc: Document, href: string, text: string): HTMLElement {
  const a = el(doc, 'a', undefined, text);
  a.setAttribute('href', href);
  a.setAttribute('rel', 'noopener');
  return a;
}

function endPage(doc: Document, catalog: CatalogFile, entry: CatalogBook, memory: BookMemory | null): HTMLElement {
  const sec = el(doc, 'section', 'fm end');
  sec.append(el(doc, 'h2', 'fm-heading', 'Выходные сведения'));
  if (entry.contributors.length) sec.append(people(doc, entry.contributors));
  else if (entry.contributorsText) sec.append(el(doc, 'p', 'fm-people', entry.contributorsText));
  sec.append(el(doc, 'p', 'fm-board', BOARD));
  if (entry.lastReviewed) sec.append(el(doc, 'p', 'fm-reviewed', `Редакционный пересмотр: ${entry.lastReviewed}`));
  if (entry.siteUrl) {
    const p = el(doc, 'p', 'fm-site', 'Статья на сайте: ');
    p.append(linkTo(doc, entry.siteUrl, entry.siteUrl));
    sec.append(p);
  }

  const next = entry.related
    .map((id) => catalog.books.find((b) => b.id === id))
    .filter((b): b is CatalogBook => !!b)
    .slice(0, 4);
  const conn = getBookConnections(entry.id);
  if (next.length || conn?.elephantorina || conn?.keeper) {
    const box = el(doc, 'div', 'fm-next');
    box.append(el(doc, 'h3', undefined, 'Дальше'));
    const ul = el(doc, 'ul');
    for (const b of next) {
      const li = el(doc, 'li', undefined, b.title);
      li.setAttribute('data-book', b.id);
      ul.append(li);
    }
    if (conn?.elephantorina) {
      const li = el(doc, 'li', 'fm-next-ext');
      const a = linkTo(doc, conn.elephantorina.url, `Проверить себя · Elephantorina — ${conn.elephantorina.label}`);
      a.setAttribute('data-project', 'elephantorina');
      li.append(a);
      ul.append(li);
    }
    if (conn?.keeper) {
      const li = el(doc, 'li', 'fm-next-ext');
      const a = linkTo(doc, conn.keeper.url, `На практике · Elephant Keeper — ${conn.keeper.label}`);
      a.setAttribute('data-project', 'keeper');
      li.append(a);
      ul.append(li);
    }
    box.append(ul);
    sec.append(box);
  }

  const card = el(doc, 'div', 'fm-card');
  card.append(el(doc, 'h3', undefined, 'Формуляр читателя'));
  const dl = el(doc, 'dl');
  const dates = (label: string, list: string[]) => {
    dl.append(el(doc, 'dt', undefined, label), el(doc, 'dd', undefined, list.length ? list.join(', ') : '—'));
  };
  dates('Открыта', memory?.opened ?? []);
  dates('Дочитана', memory?.finished ?? []);
  card.append(dl);
  sec.append(card);
  return sec;
}

export function buildFlow(doc: Document, catalog: CatalogFile, entry: CatalogBook, book: BookFile, memory: BookMemory | null): FlowParts {
  const flow = el(doc, 'div', 'flow');
  const contents = contentsPage(doc, entry);
  const body = bodySection(doc, book);
  const end = endPage(doc, catalog, entry, memory);
  const sentinel = el(doc, 'div', 'sentinel');
  flow.append(titlePage(doc, catalog, entry), versoPage(doc, catalog, entry), contents, body, refsSection(doc, book.notes), end, sentinel);
  return { flow, body, contents, end, sentinel };
}
