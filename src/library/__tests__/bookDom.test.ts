import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { buildFlow, shelfmark } from '../reader/bookDom';
import type { BookFile, CatalogBook, CatalogFile } from '../types';

// Anatomy shelf with the short titles of spec section 16.
const ANATOMY: Array<[string, string]> = [
  ['cardiovascular-system-and-hemodynamics', 'Сердце и кровоток'],
  ['digestive-system-macroanatomy-and-vascularization', 'Пищеварительный тракт'],
  ['index', 'Анатомия: обзор'],
  ['integumentary-system-and-skin-morphology', 'Кожа'],
  ['microbiome-and-hindgut-fermentation', 'Микробиом'],
  ['muscular-hydrostat-and-trunk-biomechanics', 'Хобот'],
  ['respiratory-system-and-vocal-tract', 'Дыхание и голос'],
  ['sensory-umwelt-and-multimodal-perception', 'Органы чувств'],
  ['skeletal-system-appendicular-and-biomechanics', 'Скелет и походка'],
  ['skeletal-system-cranial-and-dentition', 'Череп и зубы'],
  ['urogenital-system-and-reproductive-anatomy', 'Размножение'],
];

function makeEntry(over: Partial<CatalogBook> = {}): CatalogBook {
  return {
    id: 'anatomy/muscular-hydrostat-and-trunk-biomechanics', discipline: 'anatomy', kind: 'article',
    title: 'Мышечный гидростат', shortTitle: 'Хобот', shortTitleFrom: 'frontmatter', description: 'Описание',
    tags: [], difficulty: 'средняя', evidenceLevel: 'B', evidenceBasis: ['обзоры', 'измерения'],
    readingMinutes: 12, chars: 1000, lastReviewed: '2026-01-05', contributors: [], contributorsText: null,
    headings: [{ level: 2, text: 'Мышцы', h: 'm' }, { level: 3, text: 'Волокна', h: 'v' }],
    related: [], siteUrl: '/article/anatomy/x/', contentUrl: 'books/x.json', contentHash: 'h', missingSources: 0,
    ...over,
  };
}

const fixtureCatalog: CatalogFile = {
  schema: 'elephantology.library/1', generatedAt: '2026-01-01', source: { commit: 'c', site: 's' },
  disciplines: [{ id: 'anatomy', name: 'Анатомия', order: 1, description: '' }],
  books: ANATOMY.map(([slug, shortTitle]) => makeEntry({
    id: `anatomy/${slug}`, shortTitle, kind: slug === 'index' ? 'overview' : 'article',
  })),
};

function build(entryOver: Partial<CatalogBook> = {}, bookOver: Partial<BookFile> = {}) {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const entry = makeEntry(entryOver);
  const book: BookFile = {
    schema: 'elephantology.library.book/1', id: entry.id, contentHash: 'h',
    html: '<h2 data-h="m" id="x">Мышцы</h2><p id="y">Текст</p>', notes: [], blocks: 2, ...bookOver,
  };
  return buildFlow(document, fixtureCatalog, entry, book, null);
}

test('credits the editorial board when no authors are given', () => {
  const p = build({ contributors: [], contributorsText: null });
  assert.match(p.flow.querySelector('.fm.title')!.textContent!, /Редакция «Слонологии»/);
});

test('credits real authors and editors when given', () => {
  const p = build({ contributors: [
    { name: 'Анна Слонова', role: 'author', affiliation: 'Станция', orcid: '0000-0002-1825-0097', url: null },
    { name: 'Борис Хоботов', role: 'научный редактор', affiliation: null, orcid: null, url: null },
  ] });
  assert.match(p.flow.querySelector('.fm.title')!.textContent!, /Анна Слонова/);
  assert.doesNotMatch(p.flow.querySelector('.fm.title')!.textContent!, /Борис Хоботов/);
  const end = p.end.textContent!;
  assert.match(end, /Анна Слонова/); assert.match(end, /Станция/); assert.match(end, /0000-0002-1825-0097/);
  assert.match(end, /научный редактор/); assert.match(end, /Редакция «Слонологии»/);
});

test('shows the legacy author string as is', () => {
  assert.match(build({ contributors: [], contributorsText: 'Иванов И. И., Петров П. П.' }).flow.querySelector('.fm.title')!.textContent!, /Иванов И\. И\., Петров П\. П\./);
});

test('marks missing sources in the bibliography', () => {
  const p = build({}, { notes: [{ n: '1', key: '1', html: 'Kier 1985', missing: false }, { n: '134', key: '134', html: '', missing: true }] });
  assert.match(p.flow.querySelector('.refs')!.textContent!, /источник не указан в статье/);
});

test('orders notes by number', () => {
  const p = build({}, { notes: [{ n: '10', key: '10', html: 'B', missing: false }, { n: '2', key: '2', html: 'A', missing: false }] });
  assert.deepEqual([...p.flow.querySelectorAll('.refs li')].map((li) => li.getAttribute('data-n')), ['2', '10']);
});

test('computes shelfmarks from shelf order', () => {
  assert.equal(shelfmark(fixtureCatalog, 'anatomy/index'), 'АН·01');
  assert.equal(shelfmark(fixtureCatalog, 'anatomy/muscular-hydrostat-and-trunk-biomechanics'), 'АН·10');
});

test('reference books have no shelfmark and no discipline on the title page', () => {
  const ref = makeEntry({ id: 'glossary', kind: 'reference', discipline: 'reference' });
  const cat = { ...fixtureCatalog, books: [...fixtureCatalog.books, ref] };
  assert.equal(shelfmark(cat, 'glossary'), '');
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const p = buildFlow(document, cat, ref, { schema: 'elephantology.library.book/1', id: 'glossary', contentHash: 'h', html: '<p>а</p>', notes: [], blocks: 1 }, null);
  assert.doesNotMatch(p.flow.querySelector('.fm.verso')!.textContent!, /Шифр/);
  assert.match(p.flow.querySelector('.fm.title')!.textContent!, /Слонология/);
  assert.doesNotMatch(p.flow.querySelector('.fm.title')!.textContent!, /·/);
});

test('strips ids from book html', () => {
  assert.equal(build().flow.querySelectorAll('[id]').length, 0);
});

test('orders sections and exposes the parts', () => {
  const p = build();
  const order = [...p.flow.children].map((c) => c.className);
  assert.deepEqual(order, ['fm title', 'fm verso', 'fm contents', 'body', 'refs', 'fm end', 'sentinel']);
  assert.equal(p.body, p.flow.querySelector('.body'));
  assert.equal(p.contents.querySelectorAll('[data-h]').length, 1);
});

test('shows the reader card with dates and sets metadata as text, not markup', () => {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const entry = makeEntry({ title: '<b>x</b>' });
  const book: BookFile = { schema: 'elephantology.library.book/1', id: entry.id, contentHash: 'h', html: '<p>а</p>', notes: [], blocks: 1 };
  const p = buildFlow(document, fixtureCatalog, entry, book, { hash: 'h', at: null, bookmarks: [], opened: ['2026-02-01'], finished: ['2026-02-03'] });
  assert.equal(p.flow.querySelector('.fm.title b'), null);
  assert.match(p.end.textContent!, /Формуляр читателя/);
  assert.match(p.end.textContent!, /2026-02-01/);
  assert.match(p.end.textContent!, /2026-02-03/);
});

test('shows contributor roles in Russian', () => {
  const p = build({ contributors: [
    { name: 'Анна Слонова', role: 'author', affiliation: null, orcid: null, url: null },
    { name: 'Борис Хоботов', role: 'Editor', affiliation: null, orcid: null, url: null },
    { name: 'Вера Бивнева', role: 'научный редактор', affiliation: null, orcid: null, url: null },
  ] });
  const end = p.end.textContent!;
  assert.match(end, /Анна Слонова · автор/);
  assert.match(end, /Борис Хоботов · редактор/);
  assert.match(end, /Вера Бивнева · научный редактор/);
  assert.doesNotMatch(end, /author|[Ee]ditor/);
});

test('shows verso metadata in the site\'s Russian wording, unknown values as written', () => {
  const dd = (over: Partial<CatalogBook>) => {
    const p = build(over);
    return Array.from(p.flow.querySelectorAll('.fm.verso dt')).map((dt) => `${dt.textContent}: ${dt.nextElementSibling!.textContent}`);
  };
  const rows = dd({ evidenceLevel: 'established', evidenceBasis: ['peer_reviewed', 'primary_studies', 'field_reports', 'clinical_guidelines'], difficulty: 'advanced' });
  assert.ok(rows.includes('Уровень доказательности: Высокая доказательность'));
  assert.ok(rows.includes('Основания: рецензируемые журналы, первичные исследования, полевые мониторинги, клинические протоколы'));
  assert.ok(rows.includes('Сложность: Монографический уровень'));
  assert.ok(dd({ evidenceLevel: 'moderate', difficulty: 'basic' }).includes('Уровень доказательности: Умеренная доказательность'));
  assert.ok(dd({ evidenceLevel: 'hypothesis', difficulty: 'intermediate' }).includes('Уровень доказательности: Предварительные данные'));
  assert.ok(dd({ difficulty: 'intermediate' }).includes('Сложность: Средний уровень'));
  assert.ok(dd({ difficulty: 'basic' }).includes('Сложность: Базовый уровень'));
  assert.ok(dd({ difficulty: 'beginner' }).includes('Сложность: Базовый уровень'));
  assert.ok(dd({ difficulty: 'expert' }).includes('Сложность: Монографический уровень'));
  const unknown = dd({ evidenceLevel: 'contested', evidenceBasis: ['peer_reviewed', 'archive'], difficulty: 'pro' });
  assert.ok(unknown.includes('Уровень доказательности: contested'));
  assert.ok(unknown.includes('Основания: рецензируемые журналы, archive'));
  assert.ok(unknown.includes('Сложность: pro'));
});

test('omits the Литература heading when a book has no notes', () => {
  const p = build({}, { notes: [] });
  assert.equal(p.flow.querySelector('.refs h2'), null);
});

test('filters unknown related book ids before taking up to 4 related books and includes Elephantorina and Keeper links', () => {
  const p = build({
    id: 'anatomy/muscular-hydrostat-and-trunk-biomechanics',
    related: [
      'anatomy/non-existent-1',
      'anatomy/non-existent-2',
      'anatomy/cardiovascular-system-and-hemodynamics',
      'anatomy/digestive-system-macroanatomy-and-vascularization',
      'anatomy/integumentary-system-and-skin-morphology',
      'anatomy/respiratory-system-and-vocal-tract',
    ],
  });
  const bookItems = [...p.end.querySelectorAll('.fm-next li[data-book]')];
  assert.equal(bookItems.length, 4);
  const extLinks = [...p.end.querySelectorAll('.fm-next li.fm-next-ext a')];
  assert.equal(extLinks.length, 2);
  assert.match(extLinks[0].getAttribute('href')!, /^https:\/\/drinkbeer228\.github\.io\/elephantorina\/\?book=anatomy\/muscular-hydrostat-and-trunk-biomechanics$/);
  assert.match(extLinks[0].textContent!, /Проверить себя · Elephantorina/);
  assert.equal(extLinks[1].getAttribute('href'), 'https://drinkbeer228.github.io/Elephant-keeper-/');
  assert.match(extLinks[1].textContent!, /На практике · Elephant Keeper/);
});

test('only https: addresses become links', async () => {
  const { isHttps } = await import('../reader/bookDom');
  assert.equal(isHttps('https://drinkbeer228.github.io/elephantology/article/a/'), true);
  assert.equal(isHttps('javascript:alert(1)'), false);
  assert.equal(isHttps('http://example.org/'), false);
  assert.equal(isHttps('not a url'), false);
});
