/**
 * Traditional Chinese names for imported taxa: ones missing on iNaturalist (transcribed from the
 * Simplified names, using Taiwan's usual renderings) and corrections. Takes precedence over iNaturalist.
 * Keyed by iNaturalist taxon id.
 */
export const TAXON_NAMES_ZH: Record<number, string> = {
  1406: '黑腹翎鶉',
  4088: '白頂信天翁',
  4168: '花斑鸌',
  4197: '霍氏巨鸌',
  4292: '點斑鸕鷀',
  4390: '太平洋鷗',
  4582: '冠水雉',
  4846: '澳洲斑蠣鷸',
  5305: '白頭海鵰',
  5407: '嘯鳶',
  6895: '尖羽樹鴨',
  6905: '鵲雁',
  6915: '黑嘴天鵝',
  7150: '澳洲灰雁',
  31132: '姆萬扎鬣蜥',
  36514: '綠安樂蜥',
  41752: '紐西蘭海狗',
  41759: '澳洲海獅',
  43088: '黃斑岩蹄兔',
  72965: '毛腿漁鴞',
  143853: '北美喜鵲',
  204533: '銀鷗',
  438022: '緋紅鴝鶲',
  797597: '紋尾鬣蜥',
  904173: '佛州食魚蝮',
  1430935: '卡文迪什犬羚',
  1453434: '尤金袋鼠',
  // corrections
  3739: '埃及聖䴉',
  4848: '紐西蘭蠣鷸',
  25591: '歐洲林蛙',
  26068: '鹹水鱷',
  201031: '非洲禿鸛'
}

/** Orders and families: missing on iNaturalist, or corrected (keyed by scientific name). */
export const RANK_NAMES_ZH: Record<string, string> = {
  Odontophoridae: '齒鶉科',
  Coraciidae: '佛法僧科',
  Haematopodidae: '蠣鷸科',
  Anseranatidae: '鵲雁科',
  Procaviidae: '蹄兔科',
  Phoenicopteriformes: '紅鶴目',
  Petroicidae: '澳鴝科',
  Pholidota: '鱗甲目',
  Alligatoridae: '短吻鱷科'
}

/** Catalogue names that iNaturalist files under another name (renamed, or a subspecies of). */
export const TAXON_ALIASES: Record<string, string> = {
  'Ursus thibetanus formosanus': 'Ursus thibetanus',
  'Accipiter trivirgatus': 'Lophospiza trivirgata',
  'Oncorhynchus formosanus': 'Oncorhynchus masou'
}
