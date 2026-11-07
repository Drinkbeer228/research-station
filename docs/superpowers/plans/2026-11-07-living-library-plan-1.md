# Живая библиотека — план 1: сверка, срочное в Elephantology, данные и одна книга

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elephantology публикует библиотеку как статичные данные, а Research Station открывает по ссылке одну полноценную книгу «Хобот» поверх кампуса во всех трёх движках и на телефоне.

**Architecture:**

- Скрипт сборки Elephantology превращает `docs/*.md` в `dist/library/catalog.json` и `dist/library/books/<cat>/<slug>.json`. Он использует парсер сайта и конвейер unified с KaTeX MathML и санитизацией.
- Research Station получает ленивый модуль `src/library/**`. Он грузит данные, собирает книгу в DOM, раскладывает её CSS-колонками и показывает разворот с перелистыванием.
- Кампус в `index.html` на этом этапе не меняется, кроме одного тега `<script type="module">`.

**Tech Stack:**

- Elephantology: TypeScript, Vite 8, React 19, vitest, `tsx`, unified/remark/rehype, KaTeX 0.16.47, `image-size`.
- Research Station: TypeScript 7, Vite 8, `node:test` через `tsx`, `linkedom`, `@playwright/test` 1.65, `@fontsource-variable/source-serif-4`, подмножество JetBrains Mono 2.304.

**Spec:** `docs/superpowers/specs/2026-11-07-living-library-design.md`. Читать вместе с этим планом.

**Место в работе.** Это первый из четырёх планов:

| План | Этапы спецификации | Когда пишется |
|---|---|---|
| 1 (этот) | 0 — сверка, 1 — срочное в Elephantology, 2 — данные и одна книга | Сейчас |
| 2 | 3 — читальный зал | После приёмки этапа 2 |
| 3 | 4 — каталог и все книги | После приёмки этапа 3 |
| 4 | 5 — связи | После приёмки этапа 4 |

Следующие планы пишутся после приёмки предыдущего этапа, когда известны итоги сверки.

## Global Constraints

- Текст статей не меняется. Меняется только отображение (раздел 4 спецификации, принцип 5).
- Книги-заглушки, выдуманные авторы и выдуманные источники запрещены.
- Схемы данных: `"elephantology.library/1"` для каталога и `"elephantology.library.book/1"` для книги. Пути: `dist/library/catalog.json`, `dist/library/books/<cat>/<slug>.json`.
- Research Station: `base` `/research-station/`; адрес данных `VITE_LIBRARY_BASE`, по умолчанию `/elephantology/library/`.
- Ключ памяти `ers_library_v1`. Пределы: 60 книг, 20 дат на список, 50 закладок на книгу, кегль 15–22 px.
- Шрифты: семейство `'Source Serif 4 Variable'` (Fontsource) и `'Book Mono'` из `src/library/fonts/book-mono.woff2` (подмножество JetBrains Mono 2.304, все знаки шириной 600).
- Книги: KaTeX с `output: 'mathml'`, без CSS KaTeX. Сайт Elephantology: KaTeX с CSS из пакета `katex`.
- Бюджеты: `boot.ts` ≤ 5 КБ gzip; ленивый код ≤ 60 КБ gzip; шрифты книги ≤ 200 КБ; открытие книги ≤ 600 мс на компьютере.
- Перелистывание: 640 мс на развороте, 460 мс на одной странице. При «меньше движения» — затухание 120 мс.
- Весь интерфейс на русском.
- Кампус ведёт себя как раньше: позиция, звук, настройки, здания, список проектов.
- PDF из `docs/assets/books` нигде не публикуются.
- Push, merge и PR — только с явного согласия автора. Research Station работает на текущей ветке (выбор автора). Elephantology — ветки `fix/math-and-pdfs` (этап 1) и `feature/library-data` (этап 2).
- Сообщения коммитов заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Хранилище недоступно или переполнено** (приватный режим, запрет cookies, квота). Библиотека работает без памяти и не падает. Тест в Task 14.
2. **Ссылка на несуществующую книгу, мусор в адресе, нет сети, 404 книги.** Понятное сообщение, кампус работает. Тесты в Tasks 12, 13 и 23.
3. **Статья изменилась после того, как читатель запомнил место** (другой `contentHash`). Открывается тот же раздел по `data-h`, иначе та же доля книги. Тест в Task 21.
4. **Поворот телефона или изменение окна посреди чтения.** Раскладка пересчитывается, читатель остаётся на том же месте. Тест в Task 23.
5. **Шрифты не загрузились или грузятся медленно.** Книга раскладывается запасным шрифтом не позже чем через 3 с, а после позднего прихода шрифтов перераскладывается с сохранением места. Тесты в Tasks 15 и 23.

---

## Этап 0. Сверка

### Task 0: Сверка с актуальными репозиториями

Пути, номера строк и коммиты в спецификации и в этом плане — снимок на 2026-11-07. Эта задача подтверждает их или обновляет до начала кода.

**Files:**
- Create: клон `elephantology/` в папке сессии рядом с `research-station/` (`git clone https://github.com/Drinkbeer228/elephantology.git`)
- Modify: `research-station/docs/superpowers/specs/2026-11-07-living-library-design.md` — раздел 3 и таблица раздела 5.2, если что-то поменялось
- Modify: `research-station/docs/superpowers/plans/2026-11-07-living-library-plan-1.md` — пути в Tasks 1–11, если что-то поменялось

**Interfaces:**
- Produces: подтверждённые пути. Ниже — то, на что опираются следующие задачи.

| Что проверить | Ожидается на снимке |
|---|---|
| `git -C elephantology rev-parse --short HEAD` | `43b0f0e` или новее. Если новее — пройти таблицу полностью. |
| Рендер текста статьи | `src/article/ArticleContentRenderer.tsx`, `remarkPlugins={[remarkGfm]}` в строке 47, `rehypePlugins` нет |
| Разбор frontmatter | `src/content/frontmatterParser.ts`, `authors` в строках 82–83 |
| `import.meta.glob` при загрузке модуля | `src/content/documentLoader.ts:6` |
| `resolveDocumentKey` и `LEGACY_SLUG_MAP` | `src/content/documentLoader.ts` |
| `cleanArticleMarkdownBody`, `slugifyHeading` | `src/services/referenceService.ts` |
| `ACADEMIC_CATEGORIES` | `src/data/categories.ts` |
| Скрипт `build` | `vite build && node seo-helper.js … && node prerender.js …` |
| Копирование PDF | `prerender.js:147-148` |
| Валидатор запускается при импорте | `scripts/validate-content.js:258` |
| Статьи | 68 файлов `docs/*/*.md`, 5 из них `index.md` |
| Research Station | Строки из таблицы раздела 5.2 спецификации (`grep -n` по образцу в разделе 3) |

- [ ] **Step 1: Клонировать Elephantology и снять факты**

Run (для каждой строки таблицы):

```bash
git -C elephantology log --oneline -1
grep -n "remarkPlugins\|rehypePlugins" elephantology/src/article/ArticleContentRenderer.tsx
grep -n "import.meta.glob" elephantology/src/content/*.ts
grep -n "authors" elephantology/src/content/frontmatterParser.ts
grep -n "books" elephantology/prerender.js
ls elephantology/docs/*/*.md | wc -l
```

Expected: значения из таблицы.

- [ ] **Step 2: Если что-то отличается — обновить спецификацию и план, затем остановиться и показать автору различия**

Договорённости не меняются: формат данных раздела 5.1, поведение и приёмка. Меняются только адреса.

- [ ] **Step 3: Commit**

```bash
git -C research-station add docs/superpowers
git -C research-station commit -m "docs: refresh living library snapshot after verification"
```

Если ничего не поменялось — коммита нет, итог записывается в отчёт задачи.

---

## Этап 1. Срочное в Elephantology (ветка `fix/math-and-pdfs`)

### Task 1: Формулы на сайте

**Files:**
- Modify: `elephantology/src/article/ArticleContentRenderer.tsx` — импорт плагинов и CSS, `remarkPlugins` и `rehypePlugins` у `ReactMarkdown`
- Modify: `elephantology/package.json` — прямая зависимость `"katex": "^0.16.47"`
- Test: `elephantology/src/lib/__tests__/articleMath.test.tsx`

**Interfaces:**
- Consumes: `ArticleContentRenderer` (named export), `LanguageProvider` из `src/i18n/LanguageContext.tsx`
- Produces: ничего для других задач

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { ArticleContentRenderer } from '../../article/ArticleContentRenderer';

describe('ArticleContentRenderer math', () => {
  it('renders inline and display math with KaTeX', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <ArticleContentRenderer
          bodyMarkdown={'где $V$ — объём хобота.\n\n$$V = \\pi \\cdot r^2 \\cdot L = \\text{const}$$'}
          references={[]}
          category="anatomy"
          onSelectArticle={() => {}}
        />
      </LanguageProvider>,
    );
    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-display');
    expect(html).not.toContain('$V$');
    expect(html).not.toContain('$$');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd elephantology && npx vitest run src/lib/__tests__/articleMath.test.tsx`
Expected: FAIL. Вывод содержит `$V$`.

- [ ] **Step 3: Подключить `remark-math`, `rehype-katex` и CSS KaTeX**

В `remarkPlugins` добавить `remarkMath` после `remarkGfm`, в `rehypePlugins` — `rehypeKatex`. В начале файла — `import 'katex/dist/katex.min.css'`. `rehype-raw`, который был в `11c941c`, не возвращать: для формул он не нужен.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run`
Expected: PASS — 36 тестов (35 прежних и новый).

- [ ] **Step 5: Проверить сборку и страницу**

Run: `npm run typecheck && npm run build && npx vite preview --port 4320`, открыть `http://localhost:4320/elephantology/article/anatomy/muscular-hydrostat-and-trunk-biomechanics/`.
Expected: формула `V = π·r²·L = const` выглядит так же, как на живом сайте; в DOM 5 элементов `.katex`.

- [ ] **Step 6: Commit**

```bash
git add src/article/ArticleContentRenderer.tsx src/lib/__tests__/articleMath.test.tsx package.json package-lock.json
git commit -m "fix: restore math rendering in article renderer"
```

### Task 2: Остановить публикацию PDF

**Files:**
- Modify: `elephantology/prerender.js:147-148` — копирование `docs/assets/books` только при `PUBLISH_SOURCE_PDFS=1`, иначе строка лога `Source PDFs are not published (set PUBLISH_SOURCE_PDFS=1 after rights are confirmed).`

**Interfaces:**
- Produces: `dist/` без каталога `docs/`

- [ ] **Step 1: Проверить, что сейчас PDF попадают в сборку**

Run: `npm run build && ls dist/docs/assets/books | wc -l`
Expected: `18`

- [ ] **Step 2: Обернуть копирование в проверку переменной окружения**

- [ ] **Step 3: Проверить, что их больше нет**

Run: `rm -rf dist && npm run build && test ! -e dist/docs && echo NO-PDFS`
Expected: `NO-PDFS` и строка лога из Files.

- [ ] **Step 4: Commit**

```bash
git add prerender.js
git commit -m "fix: stop publishing source PDFs until rights are confirmed"
```

### Task 3: Выкладка этапа 1

- [ ] **Step 1: Открыть PR `fix/math-and-pdfs` → `main` после согласия автора**
- [ ] **Step 2: После merge дождаться выкладки**

Run: `gh run list -R Drinkbeer228/elephantology --limit 1`
Expected: `success`

- [ ] **Step 3: Проверить живой сайт**

Run:

```bash
curl -sI https://drinkbeer228.github.io/elephantology/docs/assets/books/2022EEHV.pdf | head -1
```

Expected: `HTTP/2 404`. Страница статьи про хобот показывает формулы.

---

## Этап 2. Данные в Elephantology (ветка `feature/library-data`)

### Task 4: Чистый модуль `resolveDocumentKey`

Скрипт сборки не может импортировать `documentLoader.ts`, потому что тот вызывает `import.meta.glob` при загрузке.

**Files:**
- Create: `elephantology/src/content/resolveDocumentKey.ts` — функция `resolveDocumentKey` и `LEGACY_SLUG_MAP`, перенесённые без изменений
- Modify: `elephantology/src/content/documentLoader.ts` — реэкспорт `export { resolveDocumentKey, LEGACY_SLUG_MAP } from './resolveDocumentKey'`
- Test: `elephantology/src/lib/__tests__/resolveDocumentKey.test.ts`

**Interfaces:**
- Produces: `resolveDocumentKey(requestedPath: string, modulesKeys: string[]): string | null`. Модуль не использует `import.meta.glob`, поэтому импортируется из Node.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { resolveDocumentKey } from '../../content/resolveDocumentKey';

const keys = ['/docs/anatomy/muscular-hydrostat-and-trunk-biomechanics.md', '/docs/anatomy/index.md', '/docs/veterinary/clinical-podiatry-and-foot-care.md'];

describe('resolveDocumentKey (pure)', () => {
  it('resolves relative article links', () => {
    expect(resolveDocumentKey('../anatomy/muscular-hydrostat-and-trunk-biomechanics.md', keys)).toBe(keys[0]);
  });
  it('resolves legacy slugs', () => {
    expect(resolveDocumentKey('foot_care', keys)).toBe(keys[2]);
  });
  it('returns null for unknown paths', () => {
    expect(resolveDocumentKey('nothing-like-this', keys)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/resolveDocumentKey.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Перенести функцию и карту, в `documentLoader.ts` оставить реэкспорт**
- [ ] **Step 4: Run all tests**

Run: `npx vitest run && npm run typecheck`
Expected: PASS — 39 тестов.

- [ ] **Step 5: Commit**

```bash
git add src/content/resolveDocumentKey.ts src/content/documentLoader.ts src/lib/__tests__/resolveDocumentKey.test.ts
git commit -m "refactor: move resolveDocumentKey into an import-safe module"
```

### Task 5: Авторы и редакторы во frontmatter

**Files:**
- Modify: `elephantology/src/types.ts` — `Contributor` и поля `contributors`, `contributorsText` в `ArticleMetadata`
- Modify: `elephantology/src/content/frontmatterParser.ts:82-83` — разбор строковой и списковой форм `authors`, разбор `editors`
- Test: `elephantology/src/lib/__tests__/frontmatterContributors.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Contributor { name: string; role: string; affiliation: string | null; orcid: string | null; url: string | null }
// ArticleMetadata: authors?: string (как раньше); contributors: Contributor[]; contributorsText?: string
```

`role`: `'author'` для `authors`; для `editors` — значение поля `role` или `'editor'`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../markdown';

const fm = (yaml: string) => parseFrontmatter(`---\ntitle: T\n${yaml}\n---\n\nТекст`).metadata;

describe('contributors', () => {
  it('keeps the legacy string form as is', () => {
    const m = fm('authors: "Иванов И. И., Петров П. П."');
    expect(m.authors).toBe('Иванов И. И., Петров П. П.');
    expect(m.contributorsText).toBe('Иванов И. И., Петров П. П.');
    expect(m.contributors).toEqual([]);
  });
  it('parses authors and editors lists', () => {
    const m = fm('authors:\n  - name: "Анна Слонова"\n    affiliation: "Станция"\n    orcid: "0000-0002-1825-0097"\neditors:\n  - name: "Борис Хоботов"\n    role: "научный редактор"\n  - name: "Вера Бивнева"');
    expect(m.contributors).toEqual([
      { name: 'Анна Слонова', role: 'author', affiliation: 'Станция', orcid: '0000-0002-1825-0097', url: null },
      { name: 'Борис Хоботов', role: 'научный редактор', affiliation: null, orcid: null, url: null },
      { name: 'Вера Бивнева', role: 'editor', affiliation: null, orcid: null, url: null },
    ]);
    expect(m.authors).toBe('Анна Слонова');
  });
  it('skips entries without a name', () => {
    expect(fm('authors:\n  - affiliation: "X"').contributors).toEqual([]);
  });
  it('has no contributors when fields are absent', () => {
    const m = fm('category: anatomy');
    expect(m.contributors).toEqual([]);
    expect(m.authors).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/frontmatterContributors.test.ts`
Expected: FAIL — `contributors` is undefined.

- [ ] **Step 3: Реализовать разбор**

`authors` для сайта при списковой форме — имена авторов (`role: 'author'`) через `", "`.

- [ ] **Step 4: Run all tests and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS — 43 теста.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/content/frontmatterParser.ts src/lib/__tests__/frontmatterContributors.test.ts
git commit -m "feat: support structured authors and editors in frontmatter"
```

### Task 6: Проверка авторов в валидаторе

**Files:**
- Create: `elephantology/scripts/lib/contributors.js` — `export function contributorErrors(frontmatter: object): string[]`
- Modify: `elephantology/scripts/validate-content.js` — для каждой статьи добавить ошибки из `contributorErrors`
- Test: `elephantology/scripts/lib/__tests__/contributors.test.js`

**Interfaces:**
- Produces: `contributorErrors(fm)` → список текстов ошибок; пустой массив, если ошибок нет.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { contributorErrors } from '../contributors.js';

describe('contributorErrors', () => {
  it('accepts valid lists and the legacy string', () => {
    expect(contributorErrors({ authors: [{ name: 'Анна', orcid: '0000-0002-1825-009X', url: 'https://example.org' }] })).toEqual([]);
    expect(contributorErrors({ authors: 'Иванов И. И.' })).toEqual([]);
    expect(contributorErrors({})).toEqual([]);
  });
  it('reports empty names, bad ORCID, non-https URL and duplicates', () => {
    const errors = contributorErrors({
      authors: [{ name: ' ' }, { name: 'Анна', orcid: '1234' }, { name: 'Анна', url: 'http://x' }],
      editors: [{ name: 'Борис' }],
    });
    expect(errors).toEqual([
      'authors[0]: name is empty',
      'authors[1]: orcid must match 0000-0000-0000-000X',
      'authors[2]: url must start with https://',
      'authors[2]: duplicate name "Анна"',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/__tests__/contributors.test.js`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать и подключить в `validate-content.js`**

ORCID: `/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/`.

- [ ] **Step 4: Run tests and the validator**

Run: `npx vitest run && node scripts/validate-content.js`
Expected: PASS; валидатор выдаёт тот же итог, что и до изменения: в статьях пока нет авторов.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib scripts/validate-content.js
git commit -m "feat: validate structured authors and editors"
```

### Task 7: Конвейер книги `renderBook`

**Files:**
- Create: `elephantology/scripts/library/schema.ts` — типы контракта и проверки
- Create: `elephantology/scripts/library/renderBook.ts` — конвейер Markdown → HTML книги
- Create: `elephantology/scripts/library/notes.ts` — remark-плагин сносок
- Create: `elephantology/scripts/library/blocks.ts` — rehype-плагин блоков, вклеек, ссылок, изображений, атрибутов
- Create: `elephantology/scripts/library/sanitizeSchema.ts` — схема `rehype-sanitize` (раздел 11 спецификации плюс MathML)
- Create: `elephantology/src/lib/remarkDisplayMath.ts` — remark-плагин: абзац, в котором только формула `$$…$$`, становится выключной формулой (таблица «Преобразования» спецификации)
- Modify: `elephantology/package.json` — devDependencies: `tsx@^4.23.15`, `unified`, `remark-parse`, `remark-rehype`, `rehype-stringify`, `image-size@^2.1.0`
- Test: `elephantology/scripts/library/__tests__/renderBook.test.ts`, `elephantology/scripts/library/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: `cleanArticleMarkdownBody`, `slugifyHeading` (`src/services/referenceService.ts`); `ReferenceItem` и `Contributor` (`src/types.ts`, Task 5)
- Produces (`src/lib/remarkDisplayMath.ts`): `export function remarkDisplayMath(): (tree: Root, file: VFile) => void` — в конвейере книги сразу после `remark-math`. Сайт его пока не подключает: это решает автор.
- Produces (`schema.ts`):

```ts
export const CATALOG_SCHEMA = 'elephantology.library/1';
export const BOOK_SCHEMA = 'elephantology.library.book/1';
export interface Heading { level: 2 | 3; text: string; h: string }
export interface BookNote { n: string; key: string; html: string; missing: boolean }
export interface BookFile { schema: typeof BOOK_SCHEMA; id: string; contentHash: string; html: string; notes: BookNote[]; blocks: number }
export interface Discipline { id: string; name: string; order: number; description: string }
export interface CatalogBook { id: string; discipline: string; kind: 'article' | 'overview' | 'reference'; title: string; shortTitle: string; shortTitleFrom: 'frontmatter' | 'derived'; description: string; tags: string[]; difficulty: string | null; evidenceLevel: string | null; evidenceBasis: string[]; readingMinutes: number; chars: number; lastReviewed: string | null; contributors: Contributor[]; contributorsText: string | null; headings: Heading[]; related: string[]; siteUrl: string; contentUrl: string; contentHash: string; missingSources: number }
export interface CatalogFile { schema: typeof CATALOG_SCHEMA; generatedAt: string; source: { commit: string; site: string }; disciplines: Discipline[]; books: CatalogBook[] }
export interface BuildIssue { book: string; kind: 'missing-source' | 'unresolved-link' | 'katex' | 'missing-image'; detail: string }
export function validateCatalog(x: unknown): string[];
export function validateBook(x: unknown): string[];
```

- Produces (`renderBook.ts`):

```ts
export interface RenderInput { id: string; body: string; frontmatterRefs: ReferenceItem[]; resolveLink(href: string, fromId: string): string | null; siteBase: string; imageSize(publicPath: string): { width: number; height: number } | null }
export interface RenderResult { html: string; notes: BookNote[]; blocks: number; headings: Heading[]; missingSources: number; issues: BuildIssue[] }
export function renderBook(input: RenderInput): Promise<RenderResult>;
export function classifyCodeBlock(text: string): { kind: 'diagram' | 'wrap'; cols: number; lines: number };
export function missingNoteLabel(key: string): string;
```

Конвейер: `cleanArticleMarkdownBody` → разбивка `[^a, ^b]` на `[^a][^b]` вне блоков кода → `remark-parse` → `remark-gfm` → `remark-math` → `remarkDisplayMath` → `notes.ts` → `remark-rehype` (без собственного раздела сносок) → `rehype-katex` (`output: 'mathml'`, `throwOnError: false`) → `blocks.ts` → `rehype-sanitize` (`sanitizeSchema.ts`) → `rehype-stringify`. Ошибки KaTeX (элементы `.katex-error`) идут в `issues` с видом `katex`.

Правила (раздел 5.1 спецификации):

- **Номера сносок.** Числовые метки сохраняют свой номер. Именованные получают номера по первому упоминанию начиная с `max(числовые) + 1`. Повторное упоминание даёт тот же номер.
- **Ссылка в тексте:** `<sup class="note"><a data-note="N">N</a></sup>`.
- **Сноска без определения:** если в `frontmatterRefs` есть такой `id`, текст сноски — `title`, `authors` и `year` оттуда. Иначе `<sup class="note" data-missing="" data-key="KEY">LABEL</sup>`, где LABEL — `missingNoteLabel(KEY)`: для числовых ключей сам номер, для `ref_автор_год` — «Автор год», иначе ключ как есть.
- **Ссылка `.md`:** через `resolveLink` в `<a data-book="cat/slug">`; если не разрешилась — `<span>` с тем же текстом и запись `unresolved-link`.
- **Внешние ссылки:** `rel="noopener"`, `target="_blank"`.
- **Изображения:** `src = siteBase + путь`, `width` и `height` из `imageSize`, `loading="lazy"`.
- **Блоки кода:** `classifyCodeBlock` — `wrap`, если самая длинная строка длиннее 118 знаков и в тексте нет символов `─│┌┐└┘├┤┬┴┼═║╔╗╚╝╭╮▼▲►◄→←↑↓█▓▒`, иначе `diagram`. `diagram` → `<figure class="plate" data-kind="diagram" data-cols data-lines><pre>`, `wrap` → `<pre class="wrap">`.
- **Таблицы:** `<figure class="plate" data-kind="table">`.
- **Выключные формулы.** Абзац, в котором нет ничего, кроме одной формулы, записанной как `$$…$$`, заменяется узлом `math` с теми же `data`, что `remark-math` даёт блоку `$$` на отдельных строках; `rehype-katex` выводит его как `<math display="block">`. Запись `$$` узнаётся по исходному тексту на месте узла (`position`). Формулы `$…$` и `$$…$$` внутри текста остаются строчными. Так записаны все 32 выключные формулы корпуса.
- **Атрибуты:** у дочерних элементов корня `data-b="0…n-1"`, у `h2` и `h3` — `data-h` из `slugifyHeading`. Атрибутов `id` в выходе нет.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { renderBook, classifyCodeBlock, missingNoteLabel } from '../renderBook';

const base = { id: 'anatomy/test', frontmatterRefs: [], siteBase: 'https://drinkbeer228.github.io/elephantology', resolveLink: (h: string) => (h.includes('skeletal') ? 'anatomy/skeletal-system-cranial-and-dentition' : null), imageSize: () => ({ width: 2816, height: 1536 }) };
const render = (body: string, extra = {}) => renderBook({ ...base, body, ...extra });

describe('renderBook', () => {
  it('renders math as MathML', async () => {
    const r = await render('где $V$ — объём.\n\n$$V = \\pi r^2$$');
    expect(r.html).toContain('<math');
    expect(r.html).not.toContain('$');
  });
  it('renders a paragraph that is only a $$ formula as display math', async () => {
    const r = await render('Объём $$V$$ и $r$ в тексте.\n\n$$V = \\pi r^2$$');
    expect(r.html.match(/<math/g)).toHaveLength(3);
    expect(r.html.match(/<math[^>]*display="block"/g)).toHaveLength(1);
  });
  it('splits grouped citations', async () => {
    const r = await render('Факт [^a, ^b].\n\n[^a]: Источник А.\n[^b]: Источник Б.');
    expect(r.html.match(/class="note"/g)).toHaveLength(2);
    expect(r.html).not.toContain('[^');
  });
  it('keeps numeric labels and numbers named ones after them', async () => {
    const r = await render('А [^3]. Б [^ref_x]. В [^3].\n\n[^3]: Три.\n[^ref_x]: Икс.');
    expect(r.notes.map((n) => [n.n, n.key])).toEqual([['3', '3'], ['4', 'ref_x']]);
  });
  it('marks missing sources without inventing them', async () => {
    const r = await render('А [^134]. Б [^ref_shoshani_1996].');
    expect(r.html).toContain('data-missing="" data-key="134">134</sup>');
    expect(r.html).toContain('>Shoshani 1996</sup>');
    expect(r.missingSources).toBe(2);
    expect(r.issues.filter((i) => i.kind === 'missing-source')).toHaveLength(2);
  });
  it('fills a missing source from frontmatter references', async () => {
    const r = await render('А [^ref_burn_2011].', { frontmatterRefs: [{ id: 'ref_burn_2011', title: 'Modelling the illegal killing of elephants in Africa', authors: 'Burn R. W. et al.', year: '2011' }] });
    expect(r.notes[0]).toMatchObject({ key: 'ref_burn_2011', missing: false });
    expect(r.notes[0].html).toContain('Modelling the illegal killing');
  });
  it('turns article links into book links and drops unresolved ones', async () => {
    const r = await render('[Череп](../anatomy/skeletal-system-cranial-and-dentition.md) и [нет](../x/none.md)');
    expect(r.html).toContain('data-book="anatomy/skeletal-system-cranial-and-dentition"');
    expect(r.html).not.toContain('none.md');
    expect(r.issues.some((i) => i.kind === 'unresolved-link')).toBe(true);
  });
  it('makes images absolute with dimensions', async () => {
    const r = await render('![Схема](/images/anatomy/proboscis.jpg)');
    expect(r.html).toContain('src="https://drinkbeer228.github.io/elephantology/images/anatomy/proboscis.jpg"');
    expect(r.html).toContain('width="2816"');
    expect(r.html).toContain('height="1536"');
  });
  it('wraps diagrams and tables as plates, numbers blocks, has no ids', async () => {
    const r = await render('## 1. Раздел\n\nТекст.\n\n```text\n┌──┐\n└──┘\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(r.html).toContain('<figure class="plate" data-kind="diagram" data-cols="4" data-lines="2">');
    expect(r.html).toContain('<figure class="plate" data-kind="table">');
    expect(r.html).toContain('data-h="1-раздел"');
    expect(r.blocks).toBe(4);
    expect(r.html).not.toMatch(/\sid="/);
  });
  it('strips scripts and event handlers', async () => {
    const r = await render('Текст <img src=x onerror=alert(1)> <script>alert(1)</script>');
    expect(r.html).not.toContain('onerror');
    expect(r.html).not.toContain('<script');
  });
});

describe('classifyCodeBlock', () => {
  it('detects prose that was fenced by mistake', () => {
    expect(classifyCodeBlock('- [CLINICAL GUIDANCE] ' + 'а'.repeat(390)).kind).toBe('wrap');
    expect(classifyCodeBlock('┌' + '─'.repeat(130) + '┐').kind).toBe('diagram');
  });
});

describe('missingNoteLabel', () => {
  it('derives readable labels', () => {
    expect(missingNoteLabel('134')).toBe('134');
    expect(missingNoteLabel('ref_shoshani_1996')).toBe('Shoshani 1996');
    expect(missingNoteLabel('weird-key')).toBe('weird-key');
  });
});
```

В `schema.test.ts`:

- правильный пример каталога из раздела 5.1 спецификации даёт `[]`;
- каталог без `books`, с `schema: "x"` или с книгой без `contentHash` даёт непустые ошибки;
- то же для книги.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/library`
Expected: FAIL — модули не найдены.

- [ ] **Step 3: Реализовать `schema.ts`, `notes.ts`, `blocks.ts`, `sanitizeSchema.ts`, `renderBook.ts`**
- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/library && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/library src/lib/remarkDisplayMath.ts package.json package-lock.json
git commit -m "feat: render articles into sanitized library books"
```

### Task 8: Каталог `buildLibrary`

**Files:**
- Create: `elephantology/scripts/library/buildLibrary.ts`
- Create: `elephantology/scripts/library/shortTitle.ts`
- Test: `elephantology/scripts/library/__tests__/buildLibrary.test.ts` (фикстура — временный каталог с четырьмя файлами)
- Test: `elephantology/scripts/library/__tests__/shortTitle.test.ts`

**Interfaces:**
- Consumes: `renderBook`, `validateCatalog`, `validateBook` (Task 7); `parseFrontmatter` (Task 5); `resolveDocumentKey` (Task 4); `ACADEMIC_CATEGORIES`
- Produces:

```ts
export interface BuildOptions { docsDir: string; publicDir: string; outDir: string; siteBase: string; commit: string; now: string }
export interface BuildReport { books: number; articles: number; katexErrors: number; schemaErrors: string[]; issues: BuildIssue[] }
export function buildLibrary(opts: BuildOptions): Promise<{ catalog: CatalogFile; report: BuildReport }>;
export function deriveShortTitle(title: string): string;
```

Правила (раздел 5.1 спецификации):

- **Вид книги:** `index.md` — `overview`; `glossary.md` и `bibliography.md` — `reference` с `discipline: "reference"`; `docs/index.md` пропускается.
- **Связи:** `related` — разрешённые `related_knowledge` плюс разрешённые ссылки раздела «Связанные знания», без повторов и без самой книги.
- **Хеш:** `contentHash` — `"sha256:"` и первые 12 шестнадцатеричных знаков SHA-256 от `html + JSON.stringify(notes)`.
- **Адреса:** `siteUrl` — `${siteBase}/article/${id}/`; `contentUrl` — `books/${id}.json`.
- **Короткое название:** `deriveShortTitle` берёт часть до `:`. Если она длиннее 40 знаков, режет по последнему пробелу в первых 41 знаке. Затем убирает конечную пунктуацию и конечные слова из двух букв и короче.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { deriveShortTitle } from '../shortTitle';

describe('deriveShortTitle', () => {
  it.each([
    ['Иммуногеномика Elephantidae', 'Иммуногеномика Elephantidae'],
    ['Клиническая миология, биомеханика мышечного гидростата и нейросенсорный контроль хобота (Proboscis) у Elephantidae: архитектоника', 'Клиническая миология, биомеханика'],
    ['Мониторинг CITES, программа MIKE и криминалистика браконьерства слоновой кости', 'Мониторинг CITES, программа MIKE'],
  ])('%s', (title, expected) => expect(deriveShortTitle(title)).toBe(expected));
});
```

В `buildLibrary.test.ts` фикстура — четыре файла:

- `anatomy/a.md` с `short_title: Хобот`, `authors`-списком и `related_knowledge` на `anatomy/b.md`;
- `anatomy/b.md` без `short_title`;
- `anatomy/index.md`;
- `glossary.md`.

Утверждения:

- `catalog.schema === 'elephantology.library/1'`, `report.books === 4`, `report.articles === 3`;
- у `anatomy/a`: `shortTitleFrom === 'frontmatter'`, `contributors[0].role === 'author'`, `related` равно `['anatomy/b']`, `contentUrl === 'books/anatomy/a.json'`, `contentHash` подходит под `/^sha256:[0-9a-f]{12}$/`;
- у `anatomy/b` `shortTitleFrom === 'derived'`, у `anatomy/index` `kind === 'overview'`, у `glossary` `kind === 'reference'`;
- файл `outDir/books/anatomy/a.json` существует и проходит `validateBook`, а `report.schemaErrors` пуст.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/library`
Expected: FAIL на новых тестах.

- [ ] **Step 3: Реализовать `shortTitle.ts` и `buildLibrary.ts`**
- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/library
git commit -m "feat: build the library catalog from docs"
```

### Task 9: Подключение к сборке и прогон на всех статьях

**Files:**
- Create: `elephantology/scripts/build-library.ts` — CLI с аргументами `--docs=./docs --public=./public --out=./dist/library --site=https://drinkbeer228.github.io/elephantology`. `commit` — `GITHUB_SHA` или `git rev-parse --short HEAD`.
- Modify: `elephantology/package.json` — скрипт `"build:library": "tsx scripts/build-library.ts --docs=./docs --public=./public --out=./dist/library --site=https://drinkbeer228.github.io/elephantology"` и `&& npm run build:library` в конце `build`

**Interfaces:**
- Produces: `dist/library/**`. Код выхода 1, если `schemaErrors.length > 0`, `books < articles` или `katexErrors > 0`. В конце печатается отчёт: число книг, ошибки KaTeX, сноски без источника по статьям, неразрешённые ссылки.

- [ ] **Step 1: Run the build**

Run: `npm run build`
Expected:

- выход 0;
- в отчёте 70 книг (68 статей и 2 справочника), `katexErrors: 0`;
- в топе сносок без источника `ecology/ontogeny-and-life-history`, `veterinary/clinical-welfare-and-protected-contact` и `conservation/spatial-ecology-and-connectivity-corridors`;
- PDF в `dist/` нет.

- [ ] **Step 2: Проверить размеры**

Run: `ls -l dist/library/catalog.json && gzip -c dist/library/catalog.json | wc -c && du -sh dist/library/books`
Expected: `catalog.json` ≤ 250 КБ сырого и ≤ 60 КБ gzip. Если больше — убрать из каталога `headings` уровня 3 и записать это в отчёт задачи.

- [ ] **Step 3: Сохранить фикстуру для Research Station**

Run:

```bash
mkdir -p ../research-station/tests/e2e/fixtures/library/books/anatomy
cp dist/library/catalog.json ../research-station/tests/e2e/fixtures/library/
cp dist/library/books/anatomy/muscular-hydrostat-and-trunk-biomechanics.json ../research-station/tests/e2e/fixtures/library/books/anatomy/
```

Expected: два файла на месте.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-library.ts package.json
git commit -m "build: publish library data with the site"
```

### Task 10: Короткие названия

**Files:**
- Create: `elephantology/docs/short-titles.review.md` — таблица из 68 строк: `id`, полное название, предлагаемое короткое. Правила: до 24 знаков, простыми словами, без латинских терминов, если есть русское слово. Пример — названия стеллажа «Анатомия» из раздела 16 спецификации.
- Modify (после утверждения): frontmatter 68 статей — строка `short_title: …`
- Delete (после внесения): `docs/short-titles.review.md`

- [ ] **Step 1: Подготовить таблицу и показать автору**
- [ ] **Step 2: После утверждения внести `short_title`**
- [ ] **Step 3: Проверить**

Run: `npm run build && node -e "const c=require('./dist/library/catalog.json');console.log(c.books.filter(b=>b.kind!=='reference'&&b.shortTitleFrom!=='frontmatter').length)"`
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: add short titles for library spines"
```

### Task 11: Выкладка данных

- [ ] **Step 1: Открыть PR `feature/library-data` → `main` после согласия автора**
- [ ] **Step 2: После merge проверить**

Run: `curl -s https://drinkbeer228.github.io/elephantology/library/catalog.json | head -c 120`
Expected: `{"schema":"elephantology.library/1"`

---

## Этап 2. Одна книга в Research Station (текущая ветка)

### Task 12: Каркас, маршруты и тесты

**Files:**
- Create: `research-station/src/library/config.ts` — `export const LIBRARY_BASE: string` из `import.meta.env.VITE_LIBRARY_BASE ?? '/elephantology/library/'`, всегда с `/` в конце
- Create: `research-station/src/library/router.ts`
- Create: `research-station/src/library/boot.ts` — слушает `hashchange` и загрузку. На маршрут `book` вызывает `import('./reader/open').then(m => m.openBookRoute(id))`, на остальные пока ничего не делает.
- Modify: `research-station/index.html:4667` — перед `</body>` добавить `<script type="module" src="/src/library/boot.ts"></script>`
- Modify: `research-station/package.json` — `"test": "tsx --test src/campusLogic.test.ts src/library/__tests__/*.test.ts"`; devDependencies `linkedom@^0.18.15`, `@playwright/test@^1.65.0`
- Modify: `research-station/vite.config.ts` — `build.manifest: true` (для проверки бюджетов в Task 23)
- Test: `research-station/src/library/__tests__/router.test.ts`

**Interfaces:**
- Produces:

```ts
export type Route = { kind: 'hall' } | { kind: 'catalog'; q: string } | { kind: 'book'; id: string };
export function parseRoute(hash: string): Route | null;
export function bookHash(id: string): string; // '#/library/' + id
```

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, bookHash } from '../router';

test('parses library routes', () => {
  assert.deepEqual(parseRoute('#/library'), { kind: 'hall' });
  assert.deepEqual(parseRoute('#/library/catalog?q=%D1%85%D0%BE%D0%B1%D0%BE%D1%82'), { kind: 'catalog', q: 'хобот' });
  assert.deepEqual(parseRoute('#/library/anatomy/muscular-hydrostat-and-trunk-biomechanics'), { kind: 'book', id: 'anatomy/muscular-hydrostat-and-trunk-biomechanics' });
});

test('rejects garbage', () => {
  for (const h of ['', '#', '#/other', '#/library/../x', '#/library/a/b/c', '#/library/ANATOMY/x y', '#/library/<script>/x']) {
    assert.equal(parseRoute(h), null, h);
  }
});

test('builds book hashes', () => {
  assert.equal(bookHash('anatomy/x'), '#/library/anatomy/x');
});
```

Допустимый `id`: `^[a-z]+/[a-z0-9-]+$`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm install && npm test`
Expected: FAIL — модуль `../router` не найден. Шесть тестов `campusLogic` проходят.

- [ ] **Step 3: Реализовать `router.ts`, `config.ts`, `boot.ts`, тег в `index.html`**
- [ ] **Step 4: Run tests and build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: PASS. В `dist/assets` есть отдельный файл для `boot`. Кампус в `npx vite preview` работает как раньше.

- [ ] **Step 5: Commit**

```bash
git add src/library index.html package.json vite.config.ts
git commit -m "feat: add library boot module and routes"
```

### Task 13: Контракт и загрузка данных

**Files:**
- Create: `research-station/src/library/types.ts` — копия типов из `elephantology/scripts/library/schema.ts` (Task 7), с комментарием, что это договорённость раздела 5.1 спецификации
- Create: `research-station/src/library/api.ts`
- Test: `research-station/src/library/__tests__/api.test.ts`

**Interfaces:**
- Consumes: `Store` (Task 14) — тип импортируется из `../store`
- Produces:

```ts
export class LibraryError extends Error { readonly kind: 'network' | 'schema' | 'notfound' }
export interface CatalogResult { catalog: CatalogFile; stale: boolean }
export function loadCatalog(deps: { fetch: typeof fetch; store: Store; base?: string }): Promise<CatalogResult>;
export function loadBook(entry: CatalogBook, deps: { fetch: typeof fetch; base?: string }): Promise<BookFile>;
```

- [ ] **Step 1: Write the failing tests**

```ts
test('loads the catalog and caches it', async () => {
  const store = memoryStore();
  const r = await loadCatalog({ fetch: okJson(catalogFixture), store });
  assert.equal(r.stale, false);
  assert.equal(store.read().catalogCache?.catalog.schema, 'elephantology.library/1');
});
test('falls back to the cached catalog when offline', async () => {
  const store = memoryStore({ catalogCache: { generatedAt: 'x', catalog: catalogFixture } });
  const r = await loadCatalog({ fetch: failing(), store });
  assert.equal(r.stale, true);
});
test('reports network errors without a cache', async () => {
  await assert.rejects(loadCatalog({ fetch: failing(), store: memoryStore() }), { kind: 'network' });
});
test('rejects unknown schemas', async () => {
  await assert.rejects(loadCatalog({ fetch: okJson({ ...catalogFixture, schema: 'elephantology.library/2' }), store: memoryStore() }), { kind: 'schema' });
});
test('reports a missing book as notfound', async () => {
  await assert.rejects(loadBook(catalogFixture.books[0], { fetch: status(404) }), { kind: 'notfound' });
});
```

Помощники `memoryStore`, `okJson`, `failing`, `status` живут в `src/library/__tests__/helpers.ts`. `catalogFixture` читается из `tests/e2e/fixtures/library/catalog.json` (Task 9).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL на новых тестах.

- [ ] **Step 3: Реализовать `types.ts` и `api.ts`**

Адреса: `base + 'catalog.json'` и `base + entry.contentUrl`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/library
git commit -m "feat: load library catalog and books"
```

### Task 14: Память читателя

**Files:**
- Create: `research-station/src/library/store.ts`
- Test: `research-station/src/library/__tests__/store.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Anchor { b: number; o: number; h?: string; f?: number }
export interface BookMemory { hash: string; at: Anchor | null; bookmarks: Array<Anchor & { t: string }>; opened: string[]; finished: string[] }
export interface LibraryState { v: 1; current: { book: string; seat: number | null } | null; books: Record<string, BookMemory>; settings: { fontSize: number; theme: 'paper' | 'lamp' }; catalogCache: { generatedAt: string; catalog: CatalogFile } | null }
export interface Store { read(): LibraryState; write(mutate: (s: LibraryState) => void): void }
export function createStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null, key?: string): Store; // key по умолчанию 'ers_library_v1'
```

- [ ] **Step 1: Write the failing tests**

```ts
test('starts with defaults and survives corrupt data', () => {
  const s = createStore(fakeStorage({ ers_library_v1: '{not json' }));
  assert.deepEqual(s.read().settings, { fontSize: 17, theme: 'paper' });
});
test('keeps working when storage throws', () => {
  const s = createStore(throwingStorage());
  s.write((st) => { st.settings.fontSize = 20; });
  assert.equal(s.read().settings.fontSize, 20);
});
test('clamps font size and caps histories', () => {
  const s = createStore(fakeStorage());
  s.write((st) => {
    st.settings.fontSize = 40;
    for (let i = 0; i < 70; i++) st.books['a/b' + i] = { hash: 'h', at: null, bookmarks: [], opened: ['2026-11-' + String((i % 28) + 1).padStart(2, '0')], finished: [] };
    st.books['a/b0'].opened = Array.from({ length: 30 }, (_, i) => '2026-10-' + String(i + 1).padStart(2, '0'));
  });
  const st = s.read();
  assert.equal(st.settings.fontSize, 22);
  assert.equal(Object.keys(st.books).length, 60);
  assert.ok(Object.values(st.books).every((b) => b.opened.length <= 20 && b.bookmarks.length <= 50));
});
```

Вытесняются книги с самой старой последней датой в `opened`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Реализовать `store.ts`**

Чтение и запись в `try/catch`; если хранилище бросает исключение — память в переменной.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/library/store.ts src/library/__tests__/store.test.ts
git commit -m "feat: persist reader memory safely"
```

### Task 15: Шрифты книги

**Files:**
- Create: `research-station/scripts/subset-mono.sh` — скачивает `JetBrainsMono-2.304.zip` с `https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip`, собирает набор символов из ASCII, кириллицы U+0400–045F, U+2013, U+2014, U+2022, U+2030, U+2190–2193, U+2248, U+2500–259F, U+25A0, U+25B2, U+25BA, U+25BC, U+25C4, U+25CF, U+03B1, U+00A0–00FF и вызывает `pyftsubset … --flavor=woff2 --layout-features=''`
- Create: `research-station/src/library/fonts/book-mono.woff2` — результат скрипта, около 7,6 КБ
- Create: `research-station/src/library/fonts/OFL-JetBrainsMono.txt` — лицензия из архива
- Create: `research-station/src/library/reader/fonts.ts`
- Modify: `research-station/package.json` — зависимость `@fontsource-variable/source-serif-4@^5.3.1`
- Test: `research-station/src/library/__tests__/fonts.test.ts`

**Interfaces:**
- Produces:

```ts
export const SERIF = 'Source Serif 4 Variable';
export const MONO = 'Book Mono';
export function loadBookFonts(fs: number, fonts: Pick<FontFaceSet, 'load'>, timeoutMs?: number): Promise<{ ok: boolean }>; // timeoutMs по умолчанию 3000
```

Загружаются `400 ${fs}px "${SERIF}"`, `600 ${fs}px "${SERIF}"`, `italic 400 ${fs}px "${SERIF}"`, `400 13px "${MONO}"` с образцом `'Слон Elephant ┌─┐'`. Стили Fontsource (latin, latin-ext, cyrillic, cyrillic-ext, прямое и курсив) и `@font-face` для `Book Mono` импортирует ленивый модуль читалки, а не `boot.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
test('requests every face the book uses', async () => {
  const calls: string[] = [];
  const r = await loadBookFonts(17, { load: async (f: string) => { calls.push(f); return []; } } as any);
  assert.deepEqual(calls, ['400 17px "Source Serif 4 Variable"', '600 17px "Source Serif 4 Variable"', 'italic 400 17px "Source Serif 4 Variable"', '400 13px "Book Mono"']);
  assert.equal(r.ok, true);
});
test('gives up after the timeout instead of hanging', async () => {
  const t0 = Date.now();
  const r = await loadBookFonts(17, { load: () => new Promise(() => {}) } as any, 50);
  assert.equal(r.ok, false);
  assert.ok(Date.now() - t0 < 500);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Собрать подмножество и проверить ширину знаков**

Run: `bash scripts/subset-mono.sh && python3 -c "from fontTools.ttLib import TTFont;f=TTFont('src/library/fonts/book-mono.woff2');print(sorted({f['hmtx'][g][0] for g in f.getGlyphOrder() if g!='.notdef'}))"`
Expected: `[600]`, размер файла меньше 10 КБ.

- [ ] **Step 4: Реализовать `fonts.ts`**
- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/subset-mono.sh src/library/fonts src/library/reader/fonts.ts src/library/__tests__/fonts.test.ts package.json
git commit -m "feat: add book fonts and diagram mono subset"
```

### Task 16: Санитайзер и переносы

**Files:**
- Create: `research-station/src/library/reader/sanitize.ts`
- Create: `research-station/src/library/reader/hyphenate.ts`
- Create: `research-station/docs/hyphenation-review.md` — 300 слов корпуса с переносами, для проверки глазами
- Test: `research-station/src/library/__tests__/sanitize.test.ts`, `research-station/src/library/__tests__/hyphenate.test.ts`

**Interfaces:**
- Produces:

```ts
export function sanitizeBookHtml(html: string, doc: Document): DocumentFragment;
export const SHY = '­';
export function hyphenateWord(word: string): string;
export function hyphenateTree(root: Node): void;
export function cleanCopiedText(text: string): string; // убирает SHY
export function installCopyCleaner(root: HTMLElement): () => void; // слушает 'copy' на root и кладёт в буфер cleanCopiedText(выделение); возвращает функцию снятия
```

Санитайзер — allowlist из раздела 11 спецификации. `src` допускается только с `https://drinkbeer228.github.io/`.

Переносы — правила Христова из `preview.template.html` (массив `HY`), только для кириллических слов от 6 букв. Пропускаются `pre`, `code`, `math`, `sup`, `h1`, `h2`, `h3`, `.fm`, `[data-note]`.

- [ ] **Step 1: Write the failing tests**

```ts
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

test('hyphenates long Cyrillic words', () => {
  const s = (w: string) => hyphenateWord(w).split(SHY).join('|');
  assert.equal(s('колоссальной'), 'ко|лос|саль|ной');
  assert.equal(s('мышечного'), 'мы|шеч|но|го');
  assert.equal(s('концентрацией'), 'кон|цен|тра|ци|ей');
  assert.equal(s('подъезд'), 'подъ|езд');
  assert.equal(s('Слонология'), 'Сло|но|ло|гия');
});
test('leaves short, Latin and protected text alone', () => {
  const { document } = parseHTML('<div><p>хобот Elephantidae колоссальной</p><pre>колоссальной</pre><h2>колоссальной</h2></div>');
  hyphenateTree(document.querySelector('div')!);
  assert.equal(document.querySelector('pre')!.textContent, 'колоссальной');
  assert.equal(document.querySelector('h2')!.textContent, 'колоссальной');
  assert.equal(document.querySelector('p')!.textContent, 'хобот Elephantidae ко­лос­саль­ной');
});
test('copied text has no soft hyphens', () => {
  assert.equal(cleanCopiedText('ко­лос­саль­ной мышцы'), 'колоссальной мышцы');
});
```

`parseHTML` берётся из `linkedom`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Реализовать оба модуля**
- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Проверка качества переносов**

Собрать 300 случайных слов от 6 букв из HTML всех книг (`dist/library` Elephantology), с фиксированным зерном. Записать их с переносами в `docs/hyphenation-review.md` и отметить слова с переносами против русских правил.

Порог: больше 6 ошибочных слов (2%) — заменить правила на шаблоны `hyphen/ru` и пройти шаги 3–5 заново. Таблицу показать автору.

- [ ] **Step 6: Commit**

```bash
git add src/library/reader/sanitize.ts src/library/reader/hyphenate.ts src/library/__tests__ docs/hyphenation-review.md
git commit -m "feat: sanitize book html and hyphenate Russian text"
```

### Task 17: Книга в DOM

**Files:**
- Create: `research-station/src/library/reader/bookDom.ts`
- Test: `research-station/src/library/__tests__/bookDom.test.ts`

**Interfaces:**
- Consumes: `sanitizeBookHtml`, `hyphenateTree` (Task 16); `BookMemory` (Task 14); типы (Task 13)
- Produces:

```ts
export const DISCIPLINE_CODES: Record<string, string>; // anatomy:'АН', veterinary:'ВЕ', genomics:'ГЕ', cognition:'КО', culture:'КУ', conservation:'ОХ', paleontology:'ПА', taxonomy:'ТА', ecology:'ЭК', ethogram:'ЭТ'
export function shelfmark(catalog: CatalogFile, id: string): string; // 'АН·06': обзор первым, дальше по shortTitle, localeCompare('ru')
export interface FlowParts { flow: HTMLElement; body: HTMLElement; contents: HTMLElement; end: HTMLElement; sentinel: HTMLElement }
export function buildFlow(doc: Document, catalog: CatalogFile, entry: CatalogBook, book: BookFile, memory: BookMemory | null): FlowParts;
```

Порядок секций во `flow`: `.fm.title`, `.fm.verso`, `.fm.contents`, `.body`, `.refs` (литература), `.fm.end` (выходные сведения и формуляр), `.sentinel`. Тексты страниц — из таблицы раздела 8.1 спецификации.

- [ ] **Step 1: Write the failing tests**

```ts
test('credits the editorial board when no authors are given', () => {
  const p = build({ contributors: [], contributorsText: null });
  assert.match(p.flow.querySelector('.fm.title')!.textContent!, /Редакция «Слонологии»/);
});
test('credits real authors and editors when given', () => {
  const p = build({ contributors: [{ name: 'Анна Слонова', role: 'author', affiliation: 'Станция', orcid: '0000-0002-1825-0097', url: null }, { name: 'Борис Хоботов', role: 'научный редактор', affiliation: null, orcid: null, url: null }] });
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
test('computes shelfmarks from shelf order', () => {
  assert.equal(shelfmark(fixtureCatalog, 'anatomy/index'), 'АН·01');
  assert.equal(shelfmark(fixtureCatalog, 'anatomy/muscular-hydrostat-and-trunk-biomechanics'), 'АН·10');
});
test('strips ids from book html', () => {
  assert.equal(build().flow.querySelectorAll('[id]').length, 0);
});
```

`build(entryOverrides?, bookOverrides?)` — помощник на `linkedom`. Его `fixtureCatalog` содержит книги стеллажа «Анатомия» с короткими названиями из раздела 16 спецификации.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Реализовать `bookDom.ts`**
- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/library/reader/bookDom.ts src/library/__tests__/bookDom.test.ts
git commit -m "feat: assemble book pages from library data"
```

### Task 18: Раскладка

**Files:**
- Create: `research-station/src/library/reader/paginate.ts`
- Test: `research-station/src/library/__tests__/paginate.test.ts`

**Interfaces:**
- Consumes: `FlowParts` (Task 17)
- Produces:

```ts
export interface Geometry { spread: boolean; W: number; H: number; fs: number; lh: number; pt: number; pb: number; po: number; pi: number; cw: number; ch: number; gap: number }
export function computeGeometry(vw: number, vh: number, fs: number): Geometry;
export function defaultFontSize(vw: number): number; // 16 при vw < 560, иначе 17
export function plateFit(cols: number, cw: number, fs: number): { fontPx: number; fold: boolean };
export function pageIndex(leftOffset: number, g: Geometry): number;
export function headingsToPush(items: Array<{ heading: boolean; col: number; split: boolean }>): number[];
export interface Layout { pages: number; bodyStart: number; endStart: number; chapters: Array<{ text: string; h: string; page: number }> }
export function layoutFlow(parts: FlowParts, g: Geometry): Layout;
```

Формулы — раздел 8.2 спецификации:

- разворот, если `vw >= 860 && vw / vh > 1.04`; поля разворота 56/52/44/56, одной страницы 46/46/22/22;
- `lh = round(fs * 1.5)`, промежуток колонок `gap = 120`;
- `plateFit`: `fontPx = min(fs * 0.76, (cw − 8) / (cols * 0.602))`, `fold = fontPx < 9.8`;
- `pageIndex = floor((leftOffset + 2) / (cw + gap))`.

`layoutFlow` применяет шаги 3–6 раздела 8.5:

- вклейки получают кегль из `plateFit`, в режиме вклейки превью сжимается до остатка колонки, если остаётся хотя бы 6 строк;
- «держать со следующим» — до 4 проходов через `headingsToPush`;
- начало текста справа на развороте;
- число страниц по `sentinel`;
- главы.

- [ ] **Step 1: Write the failing tests**

```ts
test('geometry matches the measured preview', () => {
  assert.deepEqual(pick(computeGeometry(1440, 900, 17)), { spread: true, W: 578, H: 826, lh: 26, cw: 478, ch: 702 });
  assert.deepEqual(pick(computeGeometry(1920, 1080, 17)), { spread: true, W: 672, H: 960, lh: 26, cw: 572, ch: 832 });
  assert.deepEqual(pick(computeGeometry(375, 812, 16)), { spread: false, W: 361, H: 585, lh: 24, cw: 317, ch: 480 });
  assert.deepEqual(pick(computeGeometry(820, 1180, 17)), { spread: false, W: 640, H: 1037, lh: 26, cw: 596, ch: 936 });
});
test('plates fold below 9.8px', () => {
  assert.deepEqual(plateFit(60, 478, 17), { fontPx: 12.92, fold: false });
  assert.deepEqual(plateFit(86, 478, 17), { fontPx: 9.08, fold: true });
});
test('pushes headings stranded at a column end or split across columns', () => {
  assert.deepEqual(headingsToPush([
    { heading: false, col: 3, split: false }, { heading: true, col: 3, split: false }, { heading: false, col: 4, split: false },
    { heading: true, col: 5, split: true }, { heading: false, col: 6, split: false },
    { heading: true, col: 7, split: false }, { heading: false, col: 7, split: false },
  ]), [1, 3]);
});
test('maps offsets to pages', () => {
  const g = computeGeometry(1440, 900, 17);
  assert.equal(pageIndex(0, g), 0); assert.equal(pageIndex(595, g), 0); assert.equal(pageIndex(596, g), 1); assert.equal(pageIndex(1194, g), 2);
});
```

`pick` — помощник, оставляющий указанные поля; `fontPx` округляется до сотых.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Реализовать `paginate.ts`**

`layoutFlow` проверяется в браузерах в Task 23.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/library/reader/paginate.ts src/library/__tests__/paginate.test.ts
git commit -m "feat: paginate books with CSS columns"
```

### Task 19: Читалка — оверлей, окна, перелистывание

**Files:**
- Create: `research-station/src/library/reader/reader.ts`
- Create: `research-station/src/library/reader/turn.ts`
- Create: `research-station/src/library/reader/open.ts`
- Create: `research-station/src/library/reader/reader.css`
- Test: `research-station/src/library/__tests__/turn.test.ts`

**Interfaces:**
- Consumes: все задачи 13–18
- Produces:

```ts
export function runTurn(el: Element, keyframes: Keyframe[], durationMs: number, doc: Document): Promise<void>;
export interface ReaderOptions { doc: Document; root: HTMLElement; catalog: CatalogFile; entry: CatalogBook; book: BookFile; store: Store; reducedMotion: boolean; onClose(): void }
export class Reader { constructor(o: ReaderOptions); open(): Promise<void>; close(): void; turn(dir: 1 | -1): Promise<void>; goToPage(page: number): void; readonly page: number; readonly pages: number }
export function openBookRoute(id: string): Promise<void>;
```

`runTurn` завершается при `finished`, по таймауту `durationMs + 150` или сразу при `visibilitychange` в скрытое состояние (тогда вызывает `finish()`).

`Reader`:

- показывает окна — копии `flow` с `aria-hidden="true"` и `inert`: два на развороте, одно на одной странице; окна листа создаются при первом перелистывании;
- рисует колонтитулы и колонцифры (раздел 8.1), края блока, форзац, буквицу у первого абзаца, обложку, которая откидывается при открытии;
- управление: стрелки, `PageUp`/`PageDown`, пробел, `Home`/`End`, края 13%; на сенсорных экранах лист следует за пальцем и доворачивается, если пройдено больше 35% ширины или палец двигался быстрее 0,5 px/мс; `pointercancel` отменяет жест без перелистывания;
- `Esc` закрывает самый верхний слой.

`openBookRoute`:

- грузит каталог и книгу, ставит `blockedByModal = true` у `window.__ERS_GAME__.input`;
- закрытие убирает хеш через `history.back()`, если книгу открыли переходом внутри страницы, иначе через `history.replaceState`;
- неизвестный `id` даёт карточку «Книга не найдена» со ссылкой на каталог Elephantology, ошибка сети — «Книга не загрузилась» с кнопками «Повторить» и «Открыть на сайте».

- [ ] **Step 1: Write the failing tests**

```ts
test('resolves when the animation finishes', async () => {
  const el = fakeAnimatable({ finishAfter: 10 });
  await runTurn(el, [], 640, fakeDoc());
});
test('does not hang when the animation never finishes', async () => {
  const t0 = Date.now();
  await runTurn(fakeAnimatable({ finishAfter: Infinity }), [], 50, fakeDoc());
  assert.ok(Date.now() - t0 < 400);
});
test('finishes immediately when the page is hidden', async () => {
  const doc = fakeDoc(); const el = fakeAnimatable({ finishAfter: Infinity });
  const p = runTurn(el, [], 10_000, doc);
  doc.hide();
  await p;
  assert.equal(el.finishCalls, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Реализовать `turn.ts`, `reader.ts`, `open.ts`, `reader.css`**

Вид — по черновику `library-preview.html`: стол, лампа, стопка с котом, бумага, рамка 1,6 px цвета `#2C302E`. Длительности — из Global Constraints. Выключная формула `math[display="block"]` стоит по центру, с отступом в пол-строки сверху и снизу, и не разрывается между страницами.

- [ ] **Step 4: Run tests and look at the book**

Run: `npm test && npm run dev`, открыть `http://localhost:3000/research-station/#/library/anatomy/muscular-hydrostat-and-trunk-biomechanics` с `VITE_LIBRARY_BASE`, указывающим на локальную сборку Elephantology.
Expected: обложка откидывается, видны титул, оборот, оглавление и текст с правой страницы; стрелки листают; `Esc` возвращает на кампус, и ходьба работает.

- [ ] **Step 5: Commit**

```bash
git add src/library/reader src/library/__tests__/turn.test.ts
git commit -m "feat: open a book as a two-page spread with page turns"
```

### Task 20: Сноски, вклейки, литература

**Files:**
- Create: `research-station/src/library/reader/notes.ts`
- Create: `research-station/src/library/reader/foldout.ts`
- Modify: `research-station/src/library/reader/reader.ts` — обработчики кликов по `a[data-note]`, `figure.plate`, `a[data-book]`

**Interfaces:**
- Produces:

```ts
export function showNote(root: HTMLElement, anchor: Element, note: BookNote, at: { x: number; y: number }): void;
export function hideNote(root: HTMLElement): void;
export function openFoldout(root: HTMLElement, content: Node, onClose: () => void): void;
```

- **Сноска.** Карточка «Источник N» с текстом из `BookNote.html` (уже прошедшим санитайзер) и кнопкой «К списку литературы». Для `missing` — «Источник не указан в статье» и исходная метка.
- **Вклейка.** Лист со сгибами, `pre` 13,5 px, кнопка «Сложить», закрытие по `Esc` и клику мимо листа.
- **`a[data-book]`** открывает другую книгу маршрутом `bookHash`. На этапе 2 книг в каталоге больше одной, но проверяется одна.

- [ ] **Step 1: Добавить в `tests/e2e/reader.spec.ts` проверки для Task 23**

Нажатие на номер сноски показывает её текст. Нажатие на схему открывает вклейку, `Esc` закрывает. Ссылка на другую книгу меняет хеш на `#/library/anatomy/…`.

- [ ] **Step 2: Реализовать `notes.ts`, `foldout.ts` и обработчики**
- [ ] **Step 3: Посмотреть в браузере**

На странице со схемой поперечного сечения хобота — кнопка «Развернуть вклейку», вклейка с ровными линиями псевдографики. Карточка сноски 8 — «Shoshani, J., Kupsky, W. J., & Marchant, G. H. (2006)…».

- [ ] **Step 4: Commit**

```bash
git add src/library/reader tests/e2e
git commit -m "feat: show notes and fold-out plates"
```

### Task 21: Кегль, лампа, закладки, место чтения

**Files:**
- Create: `research-station/src/library/reader/position.ts`
- Modify: `research-station/src/library/reader/reader.ts` — кнопки «Закрыть» (на этапе 3 в зале она станет «← На стол»), «Оглавление», «Закладка», «Aa», «Лампа»; счётчик «N из M». «Вернуть на полку» появится на этапе 3, когда будет полка.
- Test: `research-station/src/library/__tests__/position.test.ts`

**Interfaces:**
- Consumes: `Anchor`, `BookMemory` (Task 14); `Layout`, `Geometry` (Task 18)
- Produces:

```ts
export function chooseRestorePage(memory: BookMemory | null, book: BookFile, layout: Layout, locate: (a: Anchor) => number | null): number;
export function anchorAt(page: number, layout: Layout, firstBlockOnPage: (p: number) => { b: number; o: number } | null): Anchor;
export function isFinished(page: number, layout: Layout): boolean; // страница выходных сведений видна
```

`chooseRestorePage`:

- хеш совпал и `locate` нашёл блок — этот блок;
- иначе глава с тем же `h`;
- иначе `round(f * (pages − 1))`;
- иначе начало текста (`bodyStart`).

- [ ] **Step 1: Write the failing tests**

```ts
const layout = { pages: 20, bodyStart: 4, endStart: 18, chapters: [{ text: '1.', h: 'a', page: 4 }, { text: '2.', h: 'b', page: 9 }] };
const book = { contentHash: 'sha256:111111111111' } as BookFile;
const mem = (hash: string, at: Anchor) => ({ hash, at, bookmarks: [], opened: [], finished: [] });

test('restores the exact block when the book is unchanged', () => {
  assert.equal(chooseRestorePage(mem('sha256:111111111111', { b: 42, o: 0, h: 'b', f: 0.5 }), book, layout, () => 11), 11);
});
test('falls back to the same chapter when the book changed', () => {
  assert.equal(chooseRestorePage(mem('sha256:222222222222', { b: 42, o: 0, h: 'b', f: 0.5 }), book, layout, () => null), 9);
});
test('falls back to the same share of the book', () => {
  assert.equal(chooseRestorePage(mem('sha256:222222222222', { b: 42, o: 0, h: 'gone', f: 0.5 }), book, layout, () => null), 10);
});
test('starts at the text for a new reader', () => {
  assert.equal(chooseRestorePage(null, book, layout, () => null), 4);
});
test('detects the colophon page', () => {
  assert.equal(isFinished(17, layout), false); assert.equal(isFinished(18, layout), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Реализовать `position.ts` и кнопки**

Место сохраняется при каждом перелистывании и закрытии. Дата в `opened` ставится при открытии, в `finished` — при `isFinished`. Кегль 15–22 px с перераскладкой и сохранением якоря. «Лампа» переключает `theme: 'lamp'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/library/reader src/library/__tests__/position.test.ts
git commit -m "feat: remember reading position, bookmarks and settings"
```

### Task 22: Телефон и доступность

**Files:**
- Create: `research-station/src/library/reader/mobile.ts`
- Modify: `research-station/src/library/reader/reader.ts` — режим чтения, линейная копия для чтецов, фокус, объявление страниц
- Modify: `research-station/src/library/reader/reader.css` — правила касаний раздела 12 спецификации
- Test: `research-station/src/library/__tests__/mobile.test.ts`

**Interfaces:**
- Produces:

```ts
export const ROOT_CLASS = 'ers-library-open';
export const READING_VIEWPORT = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
export function enterReadingMode(doc: Document): () => void; // возвращает функцию восстановления; вызовы вкладываются со счётчиком
```

В CSS:

- `html.ers-library-open, html.ers-library-open body { touch-action: manipulation }`;
- текст книги и карточек — `user-select: text; -webkit-user-select: text`;
- вклейка и карточки — `overflow: auto; overscroll-behavior: contain`;
- поверхность книги — `touch-action: pan-y pinch-zoom`.

Линейная копия текста лежит в `.sr-only` с `role="document"`. Смена страницы объявляется через `aria-live="polite"`: «Страница N из M».

- [ ] **Step 1: Write the failing tests**

```ts
const CAMPUS = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
test('lifts root restrictions and restores them', () => {
  const { document } = parseHTML(`<html><head><meta name="viewport" content="${CAMPUS}"></head><body></body></html>`);
  const restore = enterReadingMode(document);
  assert.ok(document.documentElement.classList.contains('ers-library-open'));
  assert.equal(document.querySelector('meta[name=viewport]')!.getAttribute('content'), READING_VIEWPORT);
  restore();
  assert.ok(!document.documentElement.classList.contains('ers-library-open'));
  assert.equal(document.querySelector('meta[name=viewport]')!.getAttribute('content'), CAMPUS);
});
test('nests safely', () => {
  const { document } = parseHTML(`<html><head><meta name="viewport" content="${CAMPUS}"></head><body></body></html>`);
  const outer = enterReadingMode(document); const inner = enterReadingMode(document);
  inner();
  assert.ok(document.documentElement.classList.contains('ers-library-open'));
  outer();
  assert.equal(document.querySelector('meta[name=viewport]')!.getAttribute('content'), CAMPUS);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Реализовать `mobile.ts` и подключить к `Reader.open`/`close`, добавить фокус и объявления**

После закрытия фокус возвращается на `document.body`, если книгу открыли по ссылке, иначе на элемент, который её открыл. Ловушка фокуса держит Tab внутри оверлея.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/library/reader src/library/__tests__/mobile.test.ts
git commit -m "feat: make the reader usable on phones and with assistive tech"
```

### Task 23: Приёмка в браузерах и бюджеты

**Files:**
- Create: `research-station/playwright.config.ts` — проекты `chromium`, `firefox`, `webkit`. `webServer`: `npm run build && npx vite preview --port 4317 --strictPort`, `baseURL` `http://localhost:4317/research-station/`.
- Create: `research-station/tests/e2e/reader.spec.ts`
- Create: `research-station/tests/e2e/touch.spec.ts` — только Chromium, `hasTouch`, `isMobile`, касания через CDP `Input.dispatchTouchEvent`, как в проверке из раздела 3 спецификации
- Create: `research-station/tests/e2e/fixtures/library/books/anatomy/tiny.json` и запись в `catalog.json` фикстуры — синтетическая книга без заголовков, на одну страницу
- Create: `research-station/scripts/check-budgets.mjs` — читает `dist/.vite/manifest.json` и считает gzip `boot` и ленивого куска `reader/open`
- Modify: `research-station/package.json` — `"test:e2e": "playwright test"`, `"check:budgets": "node scripts/check-budgets.mjs"`

Данные подставляются через `page.route('**/elephantology/library/**')` из `tests/e2e/fixtures/library`.

- [ ] **Step 1: Write the e2e tests**

`reader.spec.ts` проходит пять экранов: 1920×1080, 1440×900, 1280×720, 820×1180, 390×844.

- открытие по `#/library/anatomy/muscular-hydrostat-and-trunk-biomechanics`; в консоли нет ошибок;
- число страниц не меняется в течение 2 с после открытия;
- ни один `h2`/`h3` не стоит последним в колонке;
- у документа нет повторяющихся `id`;
- нет строк, обрезанных низом окна, и ничего не залезает в соседнюю колонку;
- формулы видны: у `math` ненулевые размеры; снимок страницы с формулой в каждом движке;
- проход до конца стрелками и обратно;
- перелистывание при `page.evaluate(() => Object.defineProperty(document, 'hidden', { value: true }))` и событии `visibilitychange` завершается;
- после перезагрузки книга открывается на той же странице;
- изменение размера окна с 1440×900 до 820×1180 посреди книги сохраняет раздел и номер блока;
- шрифты, заблокированные через `page.route('**/*.woff2', r => r.abort())`, дают книгу не позже чем через 3,5 с;
- `#/library/anatomy/nope` показывает «Книга не найдена»; при ответе 500 на книгу — «Книга не загрузилась»;
- книга `tiny` открывается: в оглавлении нет строк, страниц ≥ 1, перелистывание на краях не ломается;
- с `reducedMotion: 'reduce'` страницы меняются без 3D-поворота;
- путь с клавиатуры: открыть, `ArrowRight`, `Escape` — фокус вне оверлея, хеш пуст, кампус отвечает на клавиши.

`touch.spec.ts`:

- вклейка прокручивается пальцем;
- щипок в книге даёт `visualViewport.scale > 1`, после закрытия масштаб равен 1;
- горизонтальный свайп перелистывает, вертикальный нет;
- на кампусе после закрытия щипок не масштабирует.

- [ ] **Step 2: Run**

Run: `npx playwright install chromium firefox webkit && npm run test:e2e`
Expected: все тесты проходят во всех трёх проектах.

- [ ] **Step 3: Check budgets**

Run: `npm run build && npm run check:budgets`
Expected: `boot ≤ 5 KB gzip`, `reader ≤ 60 KB gzip`, шрифты latin+cyrillic прямое+курсив и `book-mono` ≤ 200 КБ. Открытие книги в `reader.spec.ts` на 1440×900 ≤ 600 мс во всех движках.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests scripts/check-budgets.mjs package.json
git commit -m "test: browser acceptance for the first library book"
```

### Task 24: Телефоны и приёмка этапа

- [ ] **Step 1: Проверка на настоящих устройствах — iPhone с Safari и Android с Chrome**

Сборка Research Station выкладывается в ветку предпросмотра или раздаётся с компьютера в локальной сети, по согласию автора. Чек-лист:

- [ ] книга открывается по ссылке, обложка откидывается;
- [ ] свайп перелистывает в обе стороны;
- [ ] щипок увеличивает текст, после закрытия кампус не увеличен;
- [ ] долгое нажатие выделяет слово, копирование даёт текст без мягких переносов;
- [ ] вклейка разворачивается и прокручивается пальцем;
- [ ] карточка сноски открывается и закрывается;
- [ ] поворот экрана сохраняет место;
- [ ] возврат на кампус: ходьба джойстиком работает.

- [ ] **Step 2: Показать автору книгу и отчёты Tasks 9, 16 и 23, получить согласие на этап 3**
- [ ] **Step 3: PR Research Station — только после согласия автора**
