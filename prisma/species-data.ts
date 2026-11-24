import type { ConservationStatus, SpeciesGroup } from '@prisma/client'

/**
 * Species catalogue seeded on every `db:seed` (upserted by scientific name).
 * `status` follows the IUCN Red List global assessment. `sensitive` marks species whose
 * exact locations should never be public (poaching / disturbance risk, tiny populations).
 */
export interface SpeciesSeed {
  commonName: string
  scientificName: string
  englishName: string
  group: SpeciesGroup
  status: ConservationStatus
  sensitive?: boolean
  description: string
}

export const SPECIES: SpeciesSeed[] = [
  // ── Species in the demo photos ──
  { commonName: '赤狐', scientificName: 'Vulpes vulpes', englishName: 'Red Fox', group: 'MAMMAL', status: 'LC', description: '分布最廣的野生食肉動物之一，從北極苔原到城市邊緣都能見到。冬季會豎耳聆聽雪下的動靜，再高高躍起撲向獵物。' },
  { commonName: '非洲獅', scientificName: 'Panthera leo', englishName: 'Lion', group: 'MAMMAL', status: 'VU', description: '唯一以群體生活的大型貓科動物，雌獅負責大部分狩獵。棲地流失與人獅衝突使其族群在過去數十年明顯下降。' },
  { commonName: '大貓熊', scientificName: 'Ailuropoda melanoleuca', englishName: 'Giant Panda', group: 'MAMMAL', status: 'VU', description: '分布於中國四川、陝西與甘肅山區的竹林，每天花十多個小時進食竹子。保育成效讓牠在 2016 年由瀕危降為易危。' },
  { commonName: '綠蠵龜', scientificName: 'Chelonia mydas', englishName: 'Green Sea Turtle', group: 'REPTILE', status: 'EN', sensitive: true, description: '成體以海草與藻類為主食，因體內脂肪呈綠色而得名。台灣的小琉球與澎湖是重要的覓食與產卵地，請勿觸摸或追逐。' },
  { commonName: '無尾熊', scientificName: 'Phascolarctos cinereus', englishName: 'Koala', group: 'MAMMAL', status: 'VU', description: '澳洲特有的有袋類，幾乎只吃尤加利葉，一天要睡將近二十小時來節省能量。森林大火與開發是牠們最大的威脅。' },
  { commonName: '花豹', scientificName: 'Panthera pardus', englishName: 'Leopard', group: 'MAMMAL', status: 'VU', description: '適應力極強的獨居貓科動物，常把獵物拖上樹以避開獅子與鬣狗。身上的玫瑰狀斑紋每隻都不同。' },
  { commonName: '普通翠鳥', scientificName: 'Alcedo atthis', englishName: 'Common Kingfisher', group: 'BIRD', status: 'LC', description: '俗稱「釣魚翁」，常停在水邊枝頭伺機俯衝入水捕魚。在台灣的溪流、埤塘與公園水域都很常見。' },
  { commonName: '亞洲象', scientificName: 'Elephas maximus', englishName: 'Asian Elephant', group: 'MAMMAL', status: 'EN', description: '體型比非洲象小，耳朵也較小而圓，只有部分雄象長出象牙。棲地破碎化與人象衝突是主要威脅。' },
  { commonName: '非洲草原象', scientificName: 'Loxodonta africana', englishName: 'African Bush Elephant', group: 'MAMMAL', status: 'EN', sensitive: true, description: '現存最大的陸生動物，由年長母象帶領家族遷徙覓水。象牙盜獵使其族群數量在上個世紀大幅減少。' },
  { commonName: '白犀', scientificName: 'Ceratotherium simum', englishName: 'White Rhinoceros', group: 'MAMMAL', status: 'NT', sensitive: true, description: '寬平的嘴唇適合啃食草地，是現存體型最大的犀牛。犀角盜獵仍然猖獗，因此不公開其精確出沒位置。' },
  { commonName: '浣熊', scientificName: 'Procyon lotor', englishName: 'Raccoon', group: 'MAMMAL', status: 'LC', description: '原產北美洲，前掌靈巧、聰明又好奇，已高度適應城市生活。請勿餵食，以免牠們依賴人類並增加衝突。' },
  { commonName: '白尾鹿', scientificName: 'Odocoileus virginianus', englishName: 'White-tailed Deer', group: 'MAMMAL', status: 'LC', description: '受驚時會翹起白色尾巴向同伴示警，因而得名。廣泛分布於美洲的森林與草地邊緣。' },

  { commonName: '平原斑馬', scientificName: 'Equus quagga', englishName: 'Plains Zebra', group: 'MAMMAL', status: 'NT', description: '分布最廣的斑馬，每隻的條紋都獨一無二。常與牛羚一起隨雨季遷徙，條紋可能有助於散熱與干擾吸血蠅類。' },
  { commonName: '老虎', scientificName: 'Panthera tigris', englishName: 'Tiger', group: 'MAMMAL', status: 'EN', sensitive: true, description: '體型最大的貓科動物，獨居並擁有大面積領域。野外族群在保育努力下近年回升，但盜獵與棲地破碎仍是威脅，出沒位置不公開。' },

  // ── Taiwan ──
  { commonName: '臺灣獼猴', scientificName: 'Macaca cyclopis', englishName: 'Formosan Rock Macaque', group: 'MAMMAL', status: 'LC', description: '台灣唯一的原生靈長類，從平地到海拔三千公尺都有分布。族群已恢復穩定，但請勿餵食以免造成人猴衝突。' },
  { commonName: '山羌', scientificName: 'Muntiacus reevesi', englishName: "Reeves's Muntjac", group: 'MAMMAL', status: 'LC', description: '台灣體型最小的鹿科動物，受驚時會發出像狗吠的叫聲，因此又叫「吠鹿」。常在林道邊清晨或黃昏出沒。' },
  { commonName: '臺灣黑熊', scientificName: 'Ursus thibetanus formosanus', englishName: 'Formosan Black Bear', group: 'MAMMAL', status: 'VU', sensitive: true, description: '胸前有明顯的 V 字形白色斑紋，是台灣最大的陸生哺乳動物。族群稀少且易受陷阱與干擾影響，出沒位置不公開。' },
  { commonName: '藍腹鷴', scientificName: 'Lophura swinhoii', englishName: "Swinhoe's Pheasant", group: 'BIRD', status: 'LC', description: '台灣特有種，雄鳥有寶藍色的身體與白色的背羽，被稱為「台灣國寶鳥」。常在中低海拔闊葉林的林道邊覓食。' },
  { commonName: '臺灣藍鵲', scientificName: 'Urocissa caerulea', englishName: 'Taiwan Blue Magpie', group: 'BIRD', status: 'LC', description: '台灣特有種，擁有長長的藍色尾羽與紅色嘴喙，常成群「長尾陣」飛越山谷。繁殖期會積極護巢，請保持距離。' },
  { commonName: '黑面琵鷺', scientificName: 'Platalea minor', englishName: 'Black-faced Spoonbill', group: 'BIRD', status: 'EN', sensitive: true, description: '以扁平如湯匙的嘴在淺水中左右掃動覓食，全球數量約六千多隻，台南七股是最重要的度冬地。請在指定賞鳥亭觀察。' },
  { commonName: '帝雉', scientificName: 'Syrmaticus mikado', englishName: 'Mikado Pheasant', group: 'BIRD', status: 'NT', description: '台灣特有種，又名黑長尾雉，雄鳥全身深藍黑色並有白色橫紋的長尾。棲息於中高海拔的針闊葉混合林。' },
  { commonName: '石虎', scientificName: 'Prionailurus bengalensis', englishName: 'Leopard Cat', group: 'MAMMAL', status: 'LC', sensitive: true, description: '台灣僅存的原生野生貓科動物，耳後有白斑、額頭有兩條白線。雖然全球評估為無危，台灣族群僅剩數百隻，為一級保育類。' },
  { commonName: '穿山甲', scientificName: 'Manis pentadactyla', englishName: 'Chinese Pangolin', group: 'MAMMAL', status: 'CR', sensitive: true, description: '全身覆蓋鱗片，以螞蟻和白蟻為食，遇到危險會捲成一團。是全球非法走私最嚴重的哺乳動物之一。' },
  { commonName: '領角鴞', scientificName: 'Otus lettia', englishName: 'Collared Scops Owl', group: 'BIRD', status: 'LC', description: '台灣低海拔最常見的貓頭鷹之一，夜晚會發出「霧、霧」的單音叫聲。常利用都市公園的老樹洞築巢。' },
  { commonName: '大冠鷲', scientificName: 'Spilornis cheela', englishName: 'Crested Serpent Eagle', group: 'BIRD', status: 'LC', description: '以蛇類為主食的猛禽，飛行時翼下有明顯的白色橫帶，常在上午乘著熱氣流盤旋鳴叫。' },
  { commonName: '五色鳥', scientificName: 'Psilopogon nuchalis', englishName: 'Taiwan Barbet', group: 'BIRD', status: 'LC', description: '台灣特有種，頭部有藍、黃、紅、黑等鮮豔色塊，叫聲像敲木魚，俗稱「花和尚」。會在枯木上啄洞築巢。' },
  { commonName: '諸羅樹蛙', scientificName: 'Zhangixalus arvalis', englishName: 'Farmland Green Tree Frog', group: 'AMPHIBIAN', status: 'VU', sensitive: true, description: '台灣特有種，僅分布於雲林、嘉義、台南的平原竹林與果園。棲地狹小、容易被採集干擾，位置不公開。' },
  { commonName: '莫氏樹蛙', scientificName: 'Zhangixalus moltrechti', englishName: "Moltrecht's Green Treefrog", group: 'AMPHIBIAN', status: 'LC', description: '台灣特有種，翠綠的身體搭配橘紅色的大腿內側。繁殖期會在水邊產下白色泡沫狀的卵塊。' },
  { commonName: '白頭翁', scientificName: 'Pycnonotus sinensis', englishName: 'Light-vented Bulbul', group: 'BIRD', status: 'LC', description: '頭頂後方有一塊白斑，是台灣西部平地城市與公園最常見的鳥類之一，叫聲多變而響亮。' },
  { commonName: '鳳頭蒼鷹', scientificName: 'Accipiter trivirgatus', englishName: 'Crested Goshawk', group: 'BIRD', status: 'LC', description: '台灣都市中最常見的猛禽，會在公園與校園的大樹上築巢。繁殖期雄鳥會展示蓬鬆的白色尾下覆羽。' },
  { commonName: '臺灣長鬃山羊', scientificName: 'Capricornis swinhoei', englishName: 'Formosan Serow', group: 'MAMMAL', status: 'LC', description: '台灣特有種，擅長在陡峭的岩壁間攀爬，多在中高海拔的森林與崖壁活動，個性謹慎而獨居。' },
  { commonName: '黃喉貂', scientificName: 'Martes flavigula', englishName: 'Yellow-throated Marten', group: 'MAMMAL', status: 'LC', description: '喉部有亮黃色毛皮的中型食肉動物，常在白天成對或小群活動，在中高海拔山區步道偶爾能見到。' },
  { commonName: '赤腹松鼠', scientificName: 'Callosciurus erythraeus', englishName: "Pallas's Squirrel", group: 'MAMMAL', status: 'LC', description: '腹部紅褐色的樹棲松鼠，在台灣低海拔森林與都市公園都很常見，叫聲急促響亮。' },
  { commonName: '臺灣紫嘯鶇', scientificName: 'Myophonus insularis', englishName: 'Taiwan Whistling Thrush', group: 'BIRD', status: 'LC', description: '台灣特有種，全身深藍紫色，常沿著溪流活動，叫聲尖銳如煞車聲，俗稱「琉璃鳥」。' },
  { commonName: '食蛇龜', scientificName: 'Cuora flavomarginata', englishName: 'Yellow-margined Box Turtle', group: 'REPTILE', status: 'EN', sensitive: true, description: '腹甲可以完全閉合的陸棲龜類，因寵物與食用市場的非法捕捉而數量銳減，出沒位置不公開。' },
  { commonName: '櫻花鉤吻鮭', scientificName: 'Oncorhynchus formosanus', englishName: 'Formosan Landlocked Salmon', group: 'FISH', status: 'CR', sensitive: true, description: '冰河時期遺留在台灣的陸封型鮭魚，僅分布於大甲溪上游七家灣溪一帶，是國寶級的保育魚類。' },
  { commonName: '端紫斑蝶', scientificName: 'Euploea mulciber', englishName: 'Striped Blue Crow', group: 'INSECT', status: 'LC', description: '雄蝶前翅在陽光下會閃耀藍紫色光澤，是冬季在南台灣「紫蝶幽谷」群聚越冬的紫斑蝶之一。' }
]
