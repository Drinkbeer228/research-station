/**
 * Curated cross-project links for the «Дальше» section at the end of a book (spec §5.4, §8.8, Appendix A).
 *
 * Every key is a verified book id from `catalog.json`.
 * - `elephantorina`: deep-link to the matching course track and lesson in Elephantorina.
 * - `keeper`: link to Elephant Keeper Simulator where the topic is practiced hands-on
 *   (explicitly excluding `veterinary/clinical-welfare-and-protected-contact` per spec §5.4).
 */

export interface ElephantorinaConnection {
  course: string;
  lesson: string;
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

function lesson(course: string, lessonId: string, label: string): ElephantorinaConnection {
  return {
    course,
    lesson: lessonId,
    label,
    url: `${ELEPHANTORINA_BASE}?course=${encodeURIComponent(course)}&lesson=${encodeURIComponent(lessonId)}`,
  };
}

function keeper(label: string): KeeperConnection {
  return { label, url: KEEPER_URL };
}

export const BOOK_CONNECTIONS: Readonly<Record<string, BookConnection>> = {
  // Taxonomy & Evolution
  'taxonomy/index': {
    elephantorina: lesson('track-species', 'les-three-species', 'Урок «Три современных вида слонов»'),
  },
  'taxonomy/proboscidea-evolution-and-phylogeny': {
    elephantorina: lesson('track-evolution', 'les-ancestors', 'Урок «Древние предки хоботных»'),
  },
  'taxonomy/proboscidea-early-evolution-and-stem-groups': {
    elephantorina: lesson('track-evolution', 'les-ancestors', 'Урок «Палеогеновые предки и меритерий»'),
  },
  'taxonomy/proboscidea-paleontology-and-trunk-evolution': {
    elephantorina: lesson('track-evolution', 'les-ancestors', 'Урок «Эволюция хобота и смены зубов»'),
  },
  'taxonomy/mammuthus-evolution-and-island-dwarfism': {
    elephantorina: lesson('track-evolution', 'les-mammoth', 'Урок «Мамонты и островная карликовость»'),
  },
  'taxonomy/palaeoloxodon-evolution-and-gigantism': {
    elephantorina: lesson('track-evolution', 'les-dwarfs', 'Урок «Гигантизм и карликовые слоны островов»'),
  },

  // Anatomy & Physiology
  'anatomy/muscular-hydrostat-and-trunk-biomechanics': {
    elephantorina: lesson('track-anatomy', 'les-trunk', 'Урок «Хобот как мышечный гидростат»'),
    keeper: keeper('Осмотр хобота и таргет-тренинг в слоновнике'),
  },
  'anatomy/skeletal-system-cranial-and-dentition': {
    elephantorina: lesson('track-anatomy', 'les-teeth', 'Урок «Череп, бивни и конвейерная смена зубов»'),
  },
  'anatomy/skeletal-system-appendicular-and-biomechanics': {
    elephantorina: lesson('track-anatomy', 'les-skeleton', 'Урок «Скелет конечностей и биомеханика шага»'),
    keeper: keeper('Контроль походки и нагрузки на суставы во время смены'),
  },
  'anatomy/integumentary-system-and-skin-morphology': {
    elephantorina: lesson('track-anatomy', 'les-skin', 'Урок «Кожа, микротрещины и терморегуляция»'),
    keeper: keeper('Купание, грязевые ванны и уход за кожей слоних'),
  },
  'anatomy/cardiovascular-system-and-hemodynamics': {
    elephantorina: lesson('track-anatomy', 'les-heart', 'Урок «Сердце и особенности гемодинамики»'),
  },
  'anatomy/digestive-system-macroanatomy-and-vascularization': {
    elephantorina: lesson('track-anatomy', 'les-digestion', 'Урок «Пищеварительный тракт гигантов»'),
    keeper: keeper('Составление суточного рациона SlonVet и контроль поедаемости'),
  },
  'anatomy/microbiome-and-hindgut-fermentation': {
    elephantorina: lesson('track-anatomy', 'les-digestion', 'Урок «Ферментация клетчатки и микробиом»'),
  },
  'anatomy/respiratory-system-and-vocal-tract': {
    elephantorina: lesson('track-anatomy', 'les-respiration', 'Урок «Дыхательная система и вокальный тракт»'),
  },
  'anatomy/sensory-umwelt-and-multimodal-perception': {
    elephantorina: lesson('track-anatomy', 'les-senses', 'Урок «Сенсорный умвельт и органы чувств»'),
  },
  'anatomy/urogenital-system-and-reproductive-anatomy': {
    elephantorina: lesson('track-anatomy', 'les-reproduction', 'Урок «Репродуктивная анатомия и цикл»'),
  },

  // Ethogram
  'ethogram/fission-fusion-social-structure': {
    elephantorina: lesson('track-behavior', 'les-matriarchy', 'Урок «Матриархат и социальные связи стада»'),
  },
  'ethogram/seismic-and-infrasonic-communication': {
    elephantorina: lesson('track-behavior', 'les-infrasound', 'Урок «Инфразвук и сейсмическая связь»'),
    keeper: keeper('Наблюдение за вокализацией и позами слоних'),
  },
  'ethogram/musth-ethology-and-endocrinology': {
    elephantorina: lesson('track-behavior', 'les-musth', 'Урок «Эндокринология и поведение в состоянии муста»'),
  },

  // Cognition
  'cognition/neuroanatomy-brain-architecture-and-memory': {
    elephantorina: lesson('track-behavior', 'les-brain', 'Урок «Архитектура мозга и долговременная память»'),
  },
  'cognition/spatial-cognition-mental-maps-and-navigation': {
    elephantorina: lesson('track-behavior', 'les-memory', 'Урок «Пространственная память и мысленные карты»'),
  },
  'cognition/cognitive-architecture-and-self-awareness': {
    elephantorina: lesson('track-behavior', 'les-mirror', 'Урок «Самосознание и зеркальный тест»'),
  },
  'cognition/cooperation-and-problem-solving': {
    elephantorina: lesson('track-behavior', 'les-tools', 'Урок «Кооперация, решение задач и орудия»'),
    keeper: keeper('Выстраивание доверия и совместные задачи с кипером'),
  },
  'cognition/empathy-and-mourning-rituals': {
    elephantorina: lesson('track-behavior', 'les-empathy', 'Урок «Эмпатия и социальная поддержка»'),
  },
  'cognition/cognitive-thanatology-empathy-and-grief-rituals': {
    elephantorina: lesson('track-behavior', 'les-grief', 'Урок «Танатология и реакция на утрату»'),
  },

  // Veterinary (note: `veterinary/clinical-welfare-and-protected-contact` intentionally has no Keeper link per spec §5.4)
  'veterinary/clinical-podiatry-and-foot-care': {
    keeper: keeper('Ежедневный подиатрический осмотр подошвы и расчистка в слоновнике'),
  },
  'veterinary/gastrointestinal-physiology-and-colic': {
    keeper: keeper('Контроль поения, перистальтики и профилактика колик'),
  },

  // Ecology
  'ecology/ecosystem-engineers-and-keystone-ecology': {
    elephantorina: lesson('track-ecology', 'les-engineer', 'Урок «Слоны как экосистемные инженеры»'),
  },
  'ecology/feeding-ecology-nutrition-and-geophagy': {
    elephantorina: lesson('track-ecology', 'les-diet', 'Урок «Кормовая экология, бюджет времени и геофагия»'),
    keeper: keeper('Расчёт грубых кормов, веточного корма и минеральной подкормки'),
  },
  'ecology/ontogeny-and-life-history': {
    elephantorina: lesson('track-behavior', 'les-calf', 'Урок «Онтогенез и взросление слонят»'),
  },
  'ecology/thermoregulation-and-climate-stress-biophysics': {
    elephantorina: lesson('track-anatomy', 'les-skin', 'Урок «Биофизика терморегуляции»'),
    keeper: keeper('Режим охлаждения и поения в жаркую смену'),
  },

  // Conservation
  'conservation/spatial-ecology-and-connectivity-corridors': {
    elephantorina: lesson('track-ecology', 'les-migration', 'Урок «Миграционные коридоры и связанность среды»'),
  },
  'conservation/ivory-trade-and-forensic-genetics': {
    elephantorina: lesson('track-conservation', 'les-poaching', 'Урок «Криминалистическая генетика и борьба с браконьерством»'),
  },
  'conservation/human-elephant-conflict-mitigation': {
    elephantorina: lesson('track-conservation', 'les-conflict', 'Урок «Смягчение конфликта человека и слона»'),
  },
  'conservation/cites-mike-and-anti-poaching-monitoring': {
    elephantorina: lesson('track-conservation', 'les-protection', 'Урок «Международная охрана СИТЕС и мониторинг MIKE»'),
  },

  // Culture
  'culture/war-elephants-history-tactics-and-veterinary': {
    elephantorina: lesson('track-history', 'les-hannibal', 'Урок «Боевые слоны древности и переход Ганнибала»'),
  },
};

export function getBookConnections(bookId: string): BookConnection | undefined {
  return BOOK_CONNECTIONS[bookId];
}
