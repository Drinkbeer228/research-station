/**
 * Cross-project links for the «Дальше» section at the end of a book (spec §5.4, §8.8, Appendix A).
 *
 * - `elephantorina`: the book → lesson pairs of spec Appendix A, checked against
 *   Elephantorina's `src/data/coursesData.ts` (course and lesson ids exist; the label is the
 *   lesson's own title). The link opens that lesson: Elephantorina reads `?course=&lesson=`.
 * - `keeper`: only where Keeper Sim (`cbc436d`, after #20) has the activity — feeding with
 *   rations, cutting vegetables, the hose and washing, skin care, foot care, training, signals,
 *   trust and voice. No link for `veterinary/clinical-welfare-and-protected-contact` (spec §5.4).
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
  'anatomy/muscular-hydrostat-and-trunk-biomechanics': {
    elephantorina: lesson("track-4-evolution", "lesson-3-18-1", "Урок 18.1: Миология хобота, гидростатический скелет, сноркелинг и глоточный мешок"),
    keeper: keeper("тренировка и сигналы кипера"),
  },
  'anatomy/sensory-umwelt-and-multimodal-perception': {
    elephantorina: lesson("track-4-evolution", "lesson-3-17-1", "Урок 17.1: Физика инфразвука, волны Рэлея, тельца Пачини и именные рокоты"),
  },
  'anatomy/skeletal-system-cranial-and-dentition': {
    elephantorina: lesson("track-4-evolution", "lesson-3-19-1", "Урок 19.1: Архитектоника черепа, сотовая пневматизация диплоэ, дентиногенез и полифиодонтия"),
  },
  'anatomy/skeletal-system-appendicular-and-biomechanics': {
    elephantorina: lesson("track-3-veterinary", "lesson-3-5-1", "Урок 5.1: Архитектура автоподия и венозная помпа"),
  },
  'anatomy/digestive-system-macroanatomy-and-vascularization': {
    elephantorina: lesson("track-3-veterinary", "lesson-3-9-1", "Урок 9.1: Заднекишечная ферментация и диетология"),
    keeper: keeper("кормление по рациону и нарезка овощей"),
  },
  'anatomy/urogenital-system-and-reproductive-anatomy': {
    elephantorina: lesson("track-3-veterinary", "lesson-3-13-1", "Урок 13.1: Архитектура эстрального цикла и эндокринология беременности"),
  },
  'veterinary/clinical-podiatry-and-foot-care': {
    elephantorina: lesson("track-3-veterinary", "lesson-3-6-1", "Урок 6.1: Классификация, расчистка и хирургия"),
    keeper: keeper("уход за стопами"),
  },
  'veterinary/eehv-endotheliotropic-herpesvirus-protocols': {
    elephantorina: lesson("track-4-evolution", "lesson-3-21-1", "Урок 21.1: Вирусология EEHV, эндотелиальный коллапс, qPCR-мониторинг и протоколы экстренной терапии"),
  },
  'veterinary/chemical-immobilization-and-anesthesia': {
    elephantorina: lesson("track-3-veterinary", "lesson-3-7-1", "Урок 7.1: Сверхактивные опиоиды и схемы реверсии"),
  },
  'veterinary/gastrointestinal-physiology-and-colic': {
    elephantorina: lesson("track-3-veterinary", "lesson-3-10-1", "Урок 10.1: Дифференциальная диагностика и трансфаунация"),
  },
  'veterinary/clinical-welfare-and-protected-contact': {
    elephantorina: lesson("track-3-veterinary", "lesson-3-12-1", "Урок 12.1: ПТСР у слонов и переход к PC/PRT"),
  },
  'veterinary/elephant-neonatology-and-calves': {
    elephantorina: lesson("track-3-veterinary", "lesson-3-15-1", "Урок 15.1: Первые минуты жизни и искусственное вскармливание"),
  },
  'ethogram/musth-ethology-and-endocrinology': {
    elephantorina: lesson("track-3-veterinary", "lesson-3-11-1", "Урок 11.1: Нейроэндокринология муста и шкала Пула"),
  },
  'ethogram/seismic-and-infrasonic-communication': {
    elephantorina: lesson("track-2-ethology", "lesson-2-1-1", "Урок 1.1: Волна Рэлея и сейсмический шепот"),
  },
  'ethogram/inbreeding-avoidance-and-mate-choice': {
    elephantorina: lesson("track-7-genomics", "lesson-7-34-1", "Урок 34.1: Этиология расселения, генетический анализ Archie et al. (2007, 2009), аллелизм MHC DQA и ольфакторный фенотип"),
  },
  'cognition/cognitive-architecture-and-self-awareness': {
    elephantorina: lesson("track-5-cognition", "lesson-5-25-1", "Урок 25.1: Нейроанатомия самосознания, зеркальный тест Plotnik et al. и гигантские веретенообразные нейроны"),
  },
  'cognition/cooperation-and-problem-solving': {
    elephantorina: lesson("track-5-cognition", "lesson-5-26-1", "Урок 26.1: Парадигма Loose-String Plotnik & de Waal, феномен Кандулы (Foerder 2011) и модификация мухобоек"),
    keeper: keeper("доверие, голос и тренировка"),
  },
  'cognition/empathy-and-mourning-rituals': {
    elephantorina: lesson("track-5-cognition", "lesson-5-27-1", "Урок 27.1: Танатологический этограмм, исследование останков, целенаправленная помощь и алломатеринство"),
  },
  'cognition/spatial-cognition-mental-maps-and-navigation': {
    elephantorina: lesson("track-5-cognition", "lesson-5-28-1", "Урок 28.1: Гиппокампальная когнитивная карта, парадигма Bates et al. (2008), рабочая память и ольфакторные тропы"),
  },
  'ecology/feeding-ecology-nutrition-and-geophagy': {
    elephantorina: lesson("track-6-ecology", "lesson-6-29-1", "Урок 29.1: Спектр Browse vs Graze, микробиом толстого кишечника, физиология геофагии и гидравлика питья"),
    keeper: keeper("кормление по рациону"),
  },
  'ecology/climate-change-and-range-dynamics': {
    elephantorina: lesson("track-6-ecology", "lesson-6-30-1", "Урок 30.1: Предикторы BioClim, алгоритмы максимальной энтропии (MaxEnt), высотный сдвиг и климатические коридоры"),
  },
  'ecology/ecosystem-engineers-and-keystone-ecology': {
    elephantorina: lesson("track-6-ecology", "lesson-6-31-1", "Урок 31.1: Ландшафтный инжиниринг, лесная мегазоохория, гидрологическое бурение и Beehive Fences"),
  },
  'ecology/ecosystem-breakdown-syndrome': {
    elephantorina: lesson("track-6-ecology", "lesson-6-32-1", "Урок 32.1: Трофические каскады дефаунации (Dirzo 2014), Bush Encroachment, углеродный дефицит (Berzaghi 2019) и пожарные циклы"),
  },
  'ecology/comparative-genomics-and-cancer-resistance': {
    elephantorina: lesson("track-7-genomics", "lesson-7-33-1", "Урок 33.1: Парадокс Пето, мультипликация гена TP53, зомби-ретроген LIF6 и гиперчувствительный апоптоз"),
  },
  'conservation/ivory-trade-and-forensic-genetics': {
    elephantorina: lesson("track-7-genomics", "lesson-7-36-1", "Урок 36.1: Судебная экстракция ДНК из дентина, байесовское пространственное картирование Wasser et al., 16-локусная панель STR и картография браконьерских синдикатов"),
  },
  'conservation/spatial-ecology-and-connectivity-corridors': {
    elephantorina: lesson("track-4-evolution", "lesson-4-6-1", "Урок 6.1: Фрагментация ареалов и миграционные коридоры"),
  },
  'conservation/human-elephant-conflict-mitigation': {
    elephantorina: lesson("track-4-evolution", "lesson-4-7-1", "Урок 7.1: Пчелиные изгороди, чили-барьеры и инженерные заграждения"),
  },
  'conservation/translocation-reintroduction-and-metapopulations': {
    elephantorina: lesson("track-4-evolution", "lesson-4-8-1", "Урок 8.1: Транслокация, инбридинг и Genetic Rescue"),
  },
  'conservation/cites-mike-and-anti-poaching-monitoring': {
    elephantorina: lesson("track-4-evolution", "lesson-4-3-1", "Урок 3.1: Программы CITES и эволюционные сдвиги"),
  },
  'taxonomy/proboscidea-evolution-and-phylogeny': {
    elephantorina: lesson("track-4-evolution", "lesson-3-20-1", "Урок 20.1: От Eritherium до Elephantidae: филогенез, бунолофодонтия и Proboscidean Datum Event"),
  },
  'taxonomy/mammuthus-evolution-and-island-dwarfism': {
    elephantorina: lesson("track-4-evolution", "lesson-4-2-1", "Урок 2.1: Биомеханика карликовых форм"),
  },
  'taxonomy/proboscidea-early-evolution-and-stem-groups': {
    elephantorina: lesson("track-8-paleontology", "lesson-8-37-1", "Урок 37.1: Ранний палеоцен Марокко (Gheerbrant 2009), анатомия Eritherium azouzorum, полуводный Moeritherium и филогения Afrotheria"),
  },
  'paleontology/skeletal-paleopathology-and-biomechanics': {
    elephantorina: lesson("track-4-evolution", "lesson-4-4-1", "Урок 4.1: Патоморфология ископаемого скелета"),
  },
  'anatomy/integumentary-system-and-skin-morphology': {
    keeper: keeper("мытьё шлангом и уход за кожей"),
  },
};

export function getBookConnections(bookId: string): BookConnection | undefined {
  return BOOK_CONNECTIONS[bookId];
}
