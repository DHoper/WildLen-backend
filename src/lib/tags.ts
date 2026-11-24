/**
 * Shared topic-tag catalogue, served via GET /api/v1/meta/tags.
 * Content stores tag *keys* (e.g. `birds`); labels are localised for display.
 *
 * Three groups: species groups, photography & topics, and regions (aligned with the site's
 * areas). Keys from the earlier catalogue are mapped by LEGACY_TAGS (see migrateTags).
 */
interface Label {
  'zh-TW': string
  en: string
}
interface TagGroup {
  key: string
  color: string
  label: Label
  tags: { key: string; label: Label }[]
}

const tag = (key: string, zh: string, en: string) => ({ key, label: { 'zh-TW': zh, en } })

export const TAG_GROUPS: readonly TagGroup[] = [
  {
    key: 'taxa',
    color: '#566e3d',
    label: { 'zh-TW': '類群', en: 'Species groups' },
    tags: [
      tag('birds', '鳥類', 'Birds'),
      tag('mammals', '哺乳類', 'Mammals'),
      tag('reptiles', '爬行類', 'Reptiles'),
      tag('amphibians', '兩棲類', 'Amphibians'),
      tag('fish', '魚類', 'Fish'),
      tag('insects', '昆蟲', 'Insects'),
      tag('marine-life', '海洋生物', 'Marine life')
    ]
  },
  {
    key: 'craft',
    color: '#875b4a',
    label: { 'zh-TW': '拍攝與主題', en: 'Photography & topics' },
    tags: [
      tag('behaviour', '行為紀錄', 'Behaviour'),
      tag('in-flight', '飛行', 'In flight'),
      tag('portraits', '生態肖像', 'Portraits'),
      tag('habitat', '棲地與環境', 'Habitat'),
      tag('night', '夜間攝影', 'Night'),
      tag('macro', '微距攝影', 'Macro'),
      tag('underwater', '水下攝影', 'Underwater'),
      tag('technique', '攝影技巧', 'Technique'),
      tag('migration', '遷徙', 'Migration'),
      tag('conservation', '保育', 'Conservation')
    ]
  },
  {
    key: 'region',
    color: '#c98b2b',
    label: { 'zh-TW': '地區', en: 'Regions' },
    tags: [
      tag('taiwan', '台灣', 'Taiwan'),
      tag('japan', '日本', 'Japan'),
      tag('asia', '亞洲其他地區', 'Other Asia'),
      tag('east-africa', '東非', 'East Africa'),
      tag('africa', '非洲其他地區', 'Other Africa'),
      tag('europe', '歐洲', 'Europe'),
      tag('north-america', '北美', 'North America'),
      tag('south-america', '南美', 'South America'),
      tag('oceania', '大洋洲', 'Oceania'),
      tag('antarctica', '南極', 'Antarctica')
    ]
  }
]

export const ALL_TAGS: ReadonlySet<string> = new Set(TAG_GROUPS.flatMap((g) => g.tags.map((t) => t.key)))

/** Earlier catalogue: key, zh label, and the key it maps to (null = dropped). */
export const LEGACY_TAGS: { key: string; zh: string; to: string | null }[] = [
  { key: 'ecosystems', zh: '生態系', to: 'habitat' },
  { key: 'aquatic-life', zh: '水生生物', to: 'marine-life' },
  { key: 'land-animals', zh: '陸生動物', to: 'mammals' },
  { key: 'arthropods', zh: '節肢動物', to: 'insects' },
  { key: 'amphibians', zh: '兩棲動物', to: 'amphibians' },
  { key: 'plants', zh: '植物', to: null },
  { key: 'endangered-species', zh: '瀕危物種', to: 'conservation' },
  { key: 'dangerous-animals', zh: '危險動物', to: null },
  { key: 'animal-behavior', zh: '動物行為', to: 'behaviour' },
  { key: 'unusual-behavior', zh: '奇特行為', to: 'behaviour' },
  { key: 'photography-tips', zh: '攝影技巧', to: 'technique' },
  { key: 'wildlife-reserves', zh: '野生動物保護區', to: 'habitat' },
  { key: 'ocean', zh: '海洋', to: 'marine-life' },
  { key: 'rivers-lakes', zh: '溪河湖泊', to: 'habitat' },
  { key: 'mountains', zh: '山林', to: 'habitat' },
  { key: 'forest', zh: '森林', to: 'habitat' },
  { key: 'grassland', zh: '草原', to: 'habitat' },
  { key: 'snow', zh: '雪地', to: 'habitat' },
  { key: 'desert', zh: '沙漠', to: 'habitat' },
  { key: 'islands', zh: '海島', to: 'habitat' },
  { key: 'wetlands', zh: '沼澤', to: 'habitat' },
  { key: 'landscapes', zh: '自然風景', to: 'habitat' },
  { key: 'night-photography', zh: '夜間攝影', to: 'night' },
  { key: 'expeditions', zh: '野外探險', to: null },
  { key: 'geography', zh: '地理風貌', to: null },
  { key: 'global-ecology', zh: '全球生態', to: 'conservation' },
  { key: 'critical-issues', zh: '嚴重議題', to: 'conservation' },
  { key: 'conservation', zh: '環境保育', to: 'conservation' },
  { key: 'australia', zh: '澳大利亞', to: 'oceania' },
  { key: 'africa', zh: '非洲', to: 'africa' },
  { key: 'asia', zh: '亞洲', to: 'asia' },
  { key: 'south-america', zh: '南美洲', to: 'south-america' },
  { key: 'north-america', zh: '北美洲', to: 'north-america' },
  { key: 'europe', zh: '歐洲', to: 'europe' },
  { key: 'antarctica', zh: '南極洲', to: 'antarctica' },
  { key: 'migration', zh: '遷徙', to: 'migration' },
  { key: 'macro', zh: '微距攝影', to: 'macro' },
  { key: 'birds', zh: '鳥類', to: 'birds' },
  { key: 'fish', zh: '魚類', to: 'fish' }
]
const LEGACY = new Map(LEGACY_TAGS.map((t) => [t.key, t.to]))

/** Maps keys from the earlier catalogue, drops unknown ones, removes duplicates. */
export const migrateTags = (tags: string[]) => [
  ...new Set(tags.flatMap((k) => (ALL_TAGS.has(k) ? [k] : LEGACY.has(k) ? (LEGACY.get(k) ? [LEGACY.get(k)!] : []) : [])))
]
