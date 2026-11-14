/**
 * Cross-project links for the «Дальше» section at the end of a book (spec §5.4, §8.8).
 *
 * - `elephantorina`: books that have a test in Elephantorina. The link is `?book=<id>`: Elephantorina
 *   keeps tests per library book and opens that book's test page. The list mirrors Elephantorina's
 *   question bank (`src/bank` there; its `npm run coverage` lists covered books) — add a book here
 *   when its test appears there.
 * - `keeper`: only where Keeper Sim (`cbc436d`, after #20) has the activity — feeding with
 *   rations, cutting vegetables, the hose and washing, skin care, foot care, training, signals,
 *   trust and voice. No link for `veterinary/clinical-welfare-and-protected-contact` (spec §5.4).
 */

export interface ElephantorinaConnection {
  label: string;
  url: string;
}

export interface KeeperConnection {
  label: string;
  url: string;
}

export interface BookConnection {
  elephantorina?: ElephantorinaConnection;
  keeper?: KeeperConnection;
}

const ELEPHANTORINA_BASE = 'https://drinkbeer228.github.io/elephantorina/';
const KEEPER_URL = 'https://drinkbeer228.github.io/Elephant-keeper-/';

/** Books with a test in Elephantorina. */
export const ELEPHANTORINA_BOOKS: readonly string[] = [
  'anatomy/digestive-system-macroanatomy-and-vascularization',
  'anatomy/muscular-hydrostat-and-trunk-biomechanics',
  'anatomy/sensory-umwelt-and-multimodal-perception',
  'anatomy/skeletal-system-appendicular-and-biomechanics',
  'anatomy/skeletal-system-cranial-and-dentition',
  'anatomy/urogenital-system-and-reproductive-anatomy',
  'cognition/cognitive-architecture-and-self-awareness',
  'cognition/cooperation-and-problem-solving',
  'cognition/empathy-and-mourning-rituals',
  'cognition/spatial-cognition-mental-maps-and-navigation',
  'conservation/cites-mike-and-anti-poaching-monitoring',
  'conservation/human-elephant-conflict-mitigation',
  'conservation/ivory-trade-and-forensic-genetics',
  'conservation/spatial-ecology-and-connectivity-corridors',
  'conservation/translocation-reintroduction-and-metapopulations',
  'culture/china-elephant-retreat-and-environmental-history',
  'culture/sacred-white-elephants-inbreeding-and-captive-genetics',
  'ecology/climate-change-and-range-dynamics',
  'ecology/comparative-genomics-and-cancer-resistance',
  'ecology/ecosystem-breakdown-syndrome',
  'ecology/ecosystem-engineers-and-keystone-ecology',
  'ecology/feeding-ecology-nutrition-and-geophagy',
  'ecology/paleoecology-and-megafaunal-extinction',
  'ethogram/inbreeding-avoidance-and-mate-choice',
  'ethogram/musth-ethology-and-endocrinology',
  'ethogram/seismic-and-infrasonic-communication',
  'paleontology/paleogenomics-vs-paleoproteomics-systematics',
  'paleontology/skeletal-paleopathology-and-biomechanics',
  'taxonomy/deinotheriidae-evolution-and-functional-morphology',
  'taxonomy/gomphotheriidae-and-amebelodontidae-evolution',
  'taxonomy/mammuthus-evolution-and-island-dwarfism',
  'taxonomy/palaeoloxodon-evolution-and-gigantism',
  'taxonomy/proboscidea-early-evolution-and-stem-groups',
  'taxonomy/proboscidea-evolution-and-phylogeny',
  'veterinary/chemical-immobilization-and-anesthesia',
  'veterinary/clinical-podiatry-and-foot-care',
  'veterinary/clinical-welfare-and-protected-contact',
  'veterinary/eehv-endotheliotropic-herpesvirus-protocols',
  'veterinary/elephant-neonatology-and-calves',
  'veterinary/gastrointestinal-physiology-and-colic',
];

/** Keeper Sim activity per book. */
const KEEPER_ACTIVITIES: Readonly<Record<string, string>> = {
  'anatomy/muscular-hydrostat-and-trunk-biomechanics': 'тренировка и сигналы кипера',
  'anatomy/digestive-system-macroanatomy-and-vascularization': 'кормление по рациону и нарезка овощей',
  'veterinary/clinical-podiatry-and-foot-care': 'уход за стопами',
  'cognition/cooperation-and-problem-solving': 'доверие, голос и тренировка',
  'ecology/feeding-ecology-nutrition-and-geophagy': 'кормление по рациону',
  'anatomy/integumentary-system-and-skin-morphology': 'мытьё шлангом и уход за кожей',
};

export function elephantorinaTest(bookId: string): ElephantorinaConnection {
  return { label: 'тест по этой книге', url: `${ELEPHANTORINA_BASE}?book=${encodeURIComponent(bookId).replace(/%2F/g, "/")}` };
}

export const BOOK_CONNECTIONS: Readonly<Record<string, BookConnection>> = (() => {
  const out: Record<string, BookConnection> = {};
  for (const id of ELEPHANTORINA_BOOKS) out[id] = { elephantorina: elephantorinaTest(id) };
  for (const [id, label] of Object.entries(KEEPER_ACTIVITIES)) out[id] = { ...out[id], keeper: { label, url: KEEPER_URL } };
  return out;
})();

export function getBookConnections(bookId: string): BookConnection | undefined {
  return BOOK_CONNECTIONS[bookId];
}
