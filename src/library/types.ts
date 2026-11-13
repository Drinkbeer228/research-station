// Type-only copy of the contract types of the Elephantology library (spec section 5.1).
// Mirrors elephantology/scripts/library/schema.ts (a18d5fab) and must change together with that schema.
// Types only: no validators, no runtime code. The schema constants are written out as literals.

export interface Contributor {
  name: string;
  role: string;
  affiliation: string | null;
  orcid: string | null;
  url: string | null;
}

export interface Heading {
  level: 2 | 3;
  text: string;
  h: string;
}

export interface BookNote {
  n: string;
  key: string;
  html: string;
  missing: boolean;
}

export interface BookFile {
  schema: 'elephantology.library.book/1';
  id: string;
  contentHash: string;
  html: string;
  notes: BookNote[];
  blocks: number;
}

export interface Discipline {
  id: string;
  name: string;
  order: number;
  description: string;
}

export interface CatalogBook {
  id: string;
  discipline: string;
  kind: 'article' | 'overview' | 'reference';
  title: string;
  shortTitle: string;
  shortTitleFrom: 'frontmatter' | 'derived';
  description: string;
  tags: string[];
  difficulty: string | null;
  evidenceLevel: string | null;
  evidenceBasis: string[];
  readingMinutes: number;
  chars: number;
  lastReviewed: string | null;
  contributors: Contributor[];
  contributorsText: string | null;
  headings: Heading[];
  related: string[];
  siteUrl: string;
  contentUrl: string;
  contentHash: string;
  missingSources: number;
}

export interface CatalogFile {
  schema: 'elephantology.library/1';
  generatedAt: string;
  source: { commit: string; site: string };
  disciplines: Discipline[];
  books: CatalogBook[];
}

export interface BuildIssue {
  book: string;
  kind: 'missing-source' | 'unresolved-link' | 'katex' | 'missing-image' | 'repaired-math';
  detail: string;
}
