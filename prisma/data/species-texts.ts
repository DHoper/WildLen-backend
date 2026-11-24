/**
 * Short species descriptions for imported species (base data), keyed by scientific name.
 * Written only where the facts are well established (range, habitat, size, habits); field marks
 * (`id`) only for groups that are commonly confused and have standard distinguishing features.
 * `similar` lists scientific names shown side by side on the species page.
 * Applied only where the species has no text yet, so editors' changes are kept.
 */
export interface SpeciesText {
  zh: string
  en: string
  id?: { zh: string; en: string }
  similar?: string[]
}

export const SPECIES_TEXTS: Record<string, SpeciesText> = {
  // ── Herons, egrets, ibises ──
  'Ardea cinerea': {
    zh: '歐亞大陸與非洲廣泛分布的大型鷺科鳥類，體長約 90 公分。常靜立在淺水邊等待魚類，台灣主要為冬候鳥。',
    en: 'A large heron, about 90 cm long, widespread across Eurasia and Africa. It hunts fish by standing still in shallow water; in Taiwan it is mainly a winter visitor.'
  },
  'Egretta garzetta': {
    zh: '小型白色鷺鳥，廣泛分布於歐亞大陸、非洲與澳洲的濕地、河口與水田。',
    en: 'A small white egret of wetlands, estuaries and rice fields across Eurasia, Africa and Australia.',
    id: { zh: '嘴黑色、腳黑色而趾黃色；繁殖期頭後有兩根細長飾羽。', en: 'Black bill and black legs with yellow feet; two long plumes on the nape in the breeding season.' },
    similar: ['Ardea alba', 'Ardea intermedia', 'Ardea coromanda']
  },
  'Ardea alba': {
    zh: '體型最大的白色鷺鳥，體長可達 1 公尺，分布於南極以外各大洲的濕地。',
    en: 'The largest white egret, up to about 1 m long, found in wetlands on every continent except Antarctica.',
    id: { zh: '嘴裂（嘴角黃色線條）延伸到眼睛後方；腳與趾全黑；非繁殖期嘴黃色。', en: 'The gape line extends behind the eye; legs and feet all black; bill yellow outside the breeding season.' },
    similar: ['Egretta garzetta', 'Ardea intermedia']
  },
  'Ardea intermedia': {
    zh: '中型白色鷺鳥，分布於非洲、南亞、東亞到澳洲的濕地與水田。',
    en: 'A medium-sized white egret of wetlands and rice fields from Africa and South Asia to East Asia and Australia.',
    id: { zh: '嘴裂只到眼睛下方，嘴較短；體型介於小白鷺與大白鷺之間；腳黑色。', en: 'The gape line ends below the eye and the bill is shorter; size between Little and Great Egret; black legs.' },
    similar: ['Ardea alba', 'Egretta garzetta']
  },
  'Ardea coromanda': {
    zh: '常跟隨牛隻或農機覓食昆蟲的小型鷺鳥，分布於南亞、東亞到澳洲。',
    en: 'A small heron that often follows cattle or farm machinery to catch insects, found from South and East Asia to Australia.',
    id: { zh: '嘴短而粗、黃色，頸較短；繁殖期頭、頸與背部呈橙黃色。', en: 'Short, thick yellow bill and a short neck; orange-buff on the head, neck and back in the breeding season.' },
    similar: ['Egretta garzetta', 'Ardea intermedia']
  },
  'Egretta sacra': {
    zh: '棲息在岩岸與珊瑚礁海岸的鷺鳥，分布於西太平洋與印度洋沿岸，有深灰色與白色兩種色型。',
    en: 'A heron of rocky shores and coral coasts around the western Pacific and Indian Ocean, occurring in dark grey and white forms.'
  },
  'Nycticorax caledonicus': {
    zh: '分布於澳洲、紐幾內亞與太平洋島嶼的夜鷺，成鳥背部為肉桂色，白天多在樹叢中休息。',
    en: 'A night heron of Australia, New Guinea and Pacific islands; adults have a cinnamon back and roost in trees by day.'
  },
  'Plegadis falcinellus': {
    zh: '廣泛分布的䴉科鳥類，羽色深栗色帶綠紫色金屬光澤，以下彎的長嘴在淺水中覓食。',
    en: 'A widespread ibis with dark chestnut plumage glossed green and purple, feeding with its long down-curved bill in shallow water.'
  },
  'Threskiornis aethiopicus': {
    zh: '原生於撒哈拉以南非洲的白色䴉鳥，頭與頸裸露呈黑色；在台灣等地為外來種。',
    en: 'A white ibis native to sub-Saharan Africa with a bare black head and neck; introduced populations exist elsewhere, including Taiwan.'
  },
  'Phoenicopterus roseus': {
    zh: '分布最廣的紅鸛，見於非洲、南歐與南亞的鹽沼與潟湖，常成大群濾食。',
    en: 'The most widespread flamingo, found on salt pans and lagoons in Africa, southern Europe and South Asia, usually filter-feeding in large flocks.'
  },
  'Anhinga novaehollandiae': {
    zh: '分布於澳洲與新幾內亞的蛇鵜，常在水中只露出細長的頸部游泳，捕魚後在枝頭展翅晾乾。',
    en: 'A darter of Australia and New Guinea that swims with only its slender neck above water and dries its wings on perches after fishing.'
  },
  // ── Waterfowl ──
  'Anas zonorhyncha': {
    zh: '東亞常見的留鳥型鴨類，雌雄羽色相近，台灣全年可見於濕地與河川。',
    en: 'A common East Asian duck with similar males and females, present year-round on Taiwan’s wetlands and rivers.',
    id: { zh: '嘴黑色而嘴尖黃色；臉部有深色貫眼線與頰線；身體深褐色。', en: 'Black bill with a yellow tip; dark eye-stripe and cheek line; dark brown body.' },
    similar: ['Anas platyrhynchos']
  },
  'Anas platyrhynchos': {
    zh: '北半球分布最廣的鴨類，雄鳥頭部金屬綠色，雌鳥褐色，許多家鴨品種源自本種。',
    en: 'The most widespread duck in the Northern Hemisphere; males have a glossy green head and females are brown. Many domestic ducks descend from it.',
    id: { zh: '雌鳥嘴橙色帶深色斑；翼鏡藍紫色，前後有白邊。', en: 'Females have an orange bill with a dark saddle; blue speculum bordered with white on both sides.' },
    similar: ['Anas zonorhyncha']
  },
  'Spatula clypeata': {
    zh: '以寬大的匙狀嘴濾食水面浮游生物的鴨類，北半球繁殖，冬季南遷。',
    en: 'A duck that filters plankton from the surface with its broad, spoon-shaped bill; it breeds across the Northern Hemisphere and winters to the south.'
  },
  'Anser caerulescens': {
    zh: '在北極苔原繁殖的雁鴨，冬季成大群南遷到北美洲，有白色與藍灰色兩種色型。',
    en: 'A goose that breeds on the Arctic tundra and winters in large flocks across North America, in white and blue-grey forms.'
  },
  'Histrionicus histrionicus': {
    zh: '在湍急溪流繁殖、冬季到岩岸海域度冬的海鴨，雄鳥藍灰色並有白色與栗色斑紋。',
    en: 'A sea duck that breeds on fast-flowing rivers and winters along rocky coasts; males are slate blue with white and chestnut markings.'
  },
  'Somateria mollissima': {
    zh: '北半球寒帶海岸的大型海鴨，雌鳥拔下的絨羽用來築巢，也是商業羽絨的來源。',
    en: 'A large sea duck of northern coasts; females line their nests with their own down, which is also collected commercially.'
  },
  'Dendrocygna viduata': {
    zh: '分布於非洲與南美洲熱帶濕地的樹鴨，臉部白色，常發出清亮的哨音。',
    en: 'A whistling-duck of tropical wetlands in Africa and South America with a white face and a clear whistling call.'
  },
  'Anseranas semipalmata': {
    zh: '澳洲北部與新幾內亞濕地的大型水鳥，自成鵲雁科，趾間只有部分蹼。',
    en: 'A large waterbird of wetlands in northern Australia and New Guinea, the only member of its family, with only partly webbed feet.'
  },
  'Tachybaptus ruficollis': {
    zh: '小型鸊鷉，分布於歐亞大陸與非洲，常在池塘中潛水捕食小魚與水生昆蟲。',
    en: 'A small grebe of Eurasia and Africa that dives in ponds for small fish and aquatic insects.'
  },
  // ── Shorebirds, gulls, seabirds ──
  'Himantopus himantopus': {
    zh: '腳特別細長的粉紅色涉禽，黑白分明，常在淺水濕地與魚塭覓食。',
    en: 'A black-and-white wader with very long pink legs, feeding in shallow wetlands and fish ponds.'
  },
  'Calidris maritima': {
    zh: '在北極繁殖的濱鷸，冬季棲息在北大西洋沿岸的岩礁，常在浪花間覓食。',
    en: 'A sandpiper that breeds in the Arctic and winters on rocky North Atlantic shores, feeding among the breaking waves.'
  },
  'Pluvialis fulva': {
    zh: '在西伯利亞與阿拉斯加繁殖、遷徙距離很長的鴴科鳥類，台灣為冬候鳥，常見於草地與泥灘。',
    en: 'A long-distance migrant plover that breeds in Siberia and Alaska; in Taiwan it winters on grassland and mudflats.'
  },
  'Haematopus longirostris': {
    zh: '澳洲沿海沙灘與河口的蠣鷸，以長而紅的嘴撬開貝類。',
    en: 'An oystercatcher of Australian beaches and estuaries that opens shellfish with its long red bill.',
    id: { zh: '上半身黑色、下腹純白，黑白分界清楚。', en: 'Black upperparts and clean white underparts with a sharp border.' },
    similar: ['Haematopus unicolor']
  },
  'Haematopus unicolor': {
    zh: '紐西蘭特有的蠣鷸，羽色從全黑到黑白相間都有。',
    en: 'An oystercatcher endemic to New Zealand whose plumage ranges from all black to pied.',
    id: { zh: '全黑或黑白相間；黑白型的分界常較模糊。', en: 'All black or pied; pied birds often show a smudged border between black and white.' },
    similar: ['Haematopus longirostris']
  },
  'Actophilornis africanus': {
    zh: '撒哈拉以南非洲濕地的水雉，以極長的趾在浮葉植物上行走。',
    en: 'A jacana of sub-Saharan African wetlands that walks on floating vegetation with its very long toes.'
  },
  'Larus schistisagus': {
    zh: '在東北亞沿岸繁殖的大型鷗類，冬季可見於北海道與日本沿海。',
    en: 'A large gull that breeds on Northeast Asian coasts and winters around Hokkaido and Japan.',
    id: { zh: '背部深石板灰色；腳粉紅色。', en: 'Dark slate-grey back; pink legs.' },
    similar: ['Larus argentatus']
  },
  'Larus argentatus': {
    zh: '西北歐沿海與城市常見的大型鷗類，食性廣，會在港口與垃圾場覓食。',
    en: 'A large gull common on northwest European coasts and in towns, feeding widely, including at harbours and landfill sites.',
    id: { zh: '背部淺灰色；腳粉紅色；嘴黃色帶紅點。', en: 'Pale grey back; pink legs; yellow bill with a red spot.' },
    similar: ['Larus schistisagus']
  },
  'Macronectes halli': {
    zh: '南大洋的大型鸌類，翼展可達 2 公尺，兼具掠食與食腐習性。',
    en: 'A large petrel of the Southern Ocean with a wingspan of up to about 2 m, both a predator and a scavenger.'
  },
  // ── Cranes ──
  'Grus japonensis': {
    zh: '東亞最大型的鶴之一，日本北海道的族群全年留居，冬季聚集在釧路一帶的給餌場。',
    en: 'One of the largest cranes in East Asia; the Hokkaido population is resident and gathers at feeding sites around Kushiro in winter.'
  },
  'Balearica regulorum': {
    zh: '東非與南非草原濕地的鶴類，頭頂有金黃色冠羽，是烏干達國徽上的鳥。',
    en: 'A crane of grassland and wetlands in eastern and southern Africa with a golden crown, the national bird of Uganda.'
  },
  // ── Raptors ──
  'Haliaeetus albicilla': {
    zh: '歐亞大陸北部的大型海鵰，常在海岸與大型湖泊捕魚，冬季可見於北海道。',
    en: 'A large eagle of northern Eurasia that fishes along coasts and large lakes; it winters in Hokkaido.',
    id: { zh: '身體褐色、頭部較淡；尾羽白色呈楔形；嘴黃色。', en: 'Brown body with a paler head; white, wedge-shaped tail; yellow bill.' },
    similar: ['Haliaeetus pelagicus']
  },
  'Haliaeetus pelagicus': {
    zh: '世界最重的鵰之一，在俄羅斯遠東繁殖，冬季隨流冰到北海道知床與根室一帶。',
    en: 'One of the heaviest eagles, breeding in the Russian Far East and wintering with the drift ice around Shiretoko and Nemuro in Hokkaido.',
    id: { zh: '嘴特別粗大、橙黃色；肩部與腿部白色。', en: 'Massive orange-yellow bill; white shoulders and thighs.' },
    similar: ['Haliaeetus albicilla']
  },
  'Buteo lineatus': {
    zh: '北美東部與加州林地的鵟，成鳥肩部紅褐色，常在溪流與濕地附近活動。',
    en: 'A buteo of woodland in eastern North America and California; adults have rufous shoulders and often hunt near streams and swamps.'
  },
  // ── Passerines & others ──
  'Cyanistes caeruleus': {
    zh: '歐洲常見的小型山雀，頭頂藍色，常在花園與林地活動，也會使用巢箱。',
    en: 'A small, common European tit with a blue crown, found in gardens and woodland and readily using nest boxes.'
  },
  'Parus cinereus': {
    zh: '分布於南亞到東亞的山雀，常見於林地、公園與庭院，以昆蟲與種子為食。',
    en: 'A tit found from South to East Asia in woodland, parks and gardens, feeding on insects and seeds.'
  },
  'Certhia familiaris': {
    zh: '在樹幹上螺旋向上攀爬覓食的小型鳥，分布於歐亞大陸溫帶森林。',
    en: 'A small bird that climbs tree trunks in spirals while foraging, found in temperate forests across Eurasia.'
  },
  'Cyanopica cooki': {
    zh: '伊比利半島特有的鵲類，成群在橡樹林與松林中活動。',
    en: 'A magpie endemic to the Iberian Peninsula that moves in groups through oak and pine woodland.'
  },
  'Agelaius phoeniceus': {
    zh: '北美洲最常見的鳥類之一，雄鳥黑色、肩部紅黃色，繁殖期在蘆葦叢中鳴唱占地盤。',
    en: 'One of North America’s most abundant birds; males are black with red-and-yellow shoulders and sing from reeds to hold territories.'
  },
  'Callipepla gambelii': {
    zh: '美國西南部沙漠的鶉類，頭頂有向前彎的黑色冠羽，常成群在灌叢下活動。',
    en: 'A quail of the deserts of the southwestern United States with a forward-curving black topknot, usually in groups under shrubs.'
  },
  'Spodiopsar cineraceus': {
    zh: '東亞的椋鳥，臉頰白色，冬季常成大群在農地與城市覓食。',
    en: 'An East Asian starling with white cheeks that forms large flocks on farmland and in towns in winter.'
  },
  'Eurocephalus ruppelli': {
    zh: '東非乾燥疏林的鵙類，頭頂白色，常數隻成群停在樹梢。',
    en: 'A shrike of dry East African woodland with a white crown, often perched in small groups on treetops.'
  },
  'Yuhina brunneiceps': {
    zh: '台灣特有種鳥類，頭頂有褐色冠羽，常成群在中海拔森林活動。',
    en: 'A bird endemic to Taiwan with a brown crest, usually in flocks in mid-elevation forest.'
  },
  'Trochalopteron morrisonianum': {
    zh: '台灣特有種鳥類，分布於高海拔森林與箭竹林，常在步道邊覓食，不太怕人。',
    en: 'A bird endemic to Taiwan’s high-elevation forest and dwarf bamboo, often feeding along trails and fairly approachable.'
  },
  'Heterophasia auricularis': {
    zh: '台灣特有種鳥類，有白色的眼後飾羽，常見於中海拔森林，冬季會降遷。',
    en: 'A bird endemic to Taiwan with white ear plumes, common in mid-elevation forest and moving lower in winter.'
  },
  'Niltava vivida': {
    zh: '台灣與中國南部的鶲科鳥類，雄鳥上背藍色、腹部橙黃色，台灣分布於中海拔森林。',
    en: 'A flycatcher of Taiwan and southern China; males are blue above and orange below. In Taiwan it lives in mid-elevation forest.'
  },
  // ── Mammals ──
  'Crocuta crocuta': {
    zh: '撒哈拉以南非洲最常見的大型肉食動物，成群狩獵也會食腐，群體由雌性主導。',
    en: 'The most common large carnivore in sub-Saharan Africa, hunting in groups as well as scavenging; clans are led by females.'
  },
  'Eudorcas thomsonii': {
    zh: '東非草原的小型羚羊，體側有一道黑色橫紋，常與牛羚、斑馬一同遷徙。',
    en: 'A small gazelle of the East African plains with a black stripe along its flank, often moving with wildebeest and zebra.'
  },
  'Papio anubis': {
    zh: '分布最廣的狒狒，見於非洲赤道帶的草原與疏林，群體可達上百隻。',
    en: 'The most widespread baboon, found in savanna and open woodland across equatorial Africa, in troops of up to a hundred or more.',
    id: { zh: '體型粗壯、毛色橄欖灰；成年雄性頸部有鬃毛。', en: 'Heavily built with olive-grey fur; adult males have a mane.' },
    similar: ['Papio cynocephalus']
  },
  'Papio cynocephalus': {
    zh: '東非南部與中部疏林草原的狒狒，安博塞利有長期的研究族群。',
    en: 'A baboon of savanna woodland in eastern and central Africa; Amboseli has a long-studied population.',
    id: { zh: '體型較修長、腿長，毛色黃褐色；雄性沒有明顯鬃毛。', en: 'Slimmer and long-legged with yellowish-brown fur; males lack a pronounced mane.' },
    similar: ['Papio anubis']
  },
  'Madoqua cavendishi': {
    zh: '東非灌叢中的小型羚羊，體高約 35–45 公分，常成對生活並以糞堆標記領域。',
    en: 'A tiny antelope of East African bush, about 35–45 cm at the shoulder, usually living in pairs and marking territory with dung middens.'
  },
  'Heterohyrax brucei': {
    zh: '棲息在非洲岩石丘陵的蹄兔，常成群在岩石上曬太陽。',
    en: 'A hyrax of rocky outcrops in Africa that basks in groups on the rocks.'
  },
  'Sciurus vulgaris': {
    zh: '歐亞大陸針葉林與混合林的松鼠，在英國因外來的灰松鼠而大量減少，蘇格蘭高地是重要棲地。',
    en: 'A squirrel of coniferous and mixed forest across Eurasia; in Britain it has declined because of introduced grey squirrels, and the Scottish Highlands remain a stronghold.'
  },
  'Antilocapra americana': {
    zh: '北美西部草原特有的有蹄類，是北美陸地上跑得最快的動物之一。',
    en: 'A hoofed mammal unique to the grasslands of western North America and one of its fastest land animals.'
  },
  'Bos bison': {
    zh: '北美最大型的陸生哺乳類，曾因獵殺幾近滅絕，黃石國家公園保有野生族群。',
    en: 'North America’s largest land mammal, once hunted almost to extinction; Yellowstone holds a wild population.'
  },
  'Cervus canadensis': {
    zh: '北美與東亞的大型鹿類，秋季發情期雄鹿會發出高亢的叫聲。',
    en: 'A large deer of North America and East Asia; in the autumn rut, males give a loud, high-pitched bugle.'
  },
  'Canis latrans': {
    zh: '適應力極強的北美犬科動物，分布從荒野延伸到城市郊區。',
    en: 'A highly adaptable North American canid whose range extends from wilderness into suburbs.'
  },
  'Pecari tajacu': {
    zh: '分布於美國西南部到南美洲的西貒，成群活動，以植物根莖與仙人掌為食。',
    en: 'A peccary found from the southwestern United States to South America, living in groups and feeding on roots and cacti.'
  },
  'Arctocephalus forsteri': {
    zh: '澳洲南部與紐西蘭沿岸的海狗，常在岩岸上休息，凱庫拉半島有大型族群。',
    en: 'A fur seal of southern Australian and New Zealand coasts, often resting on rocky shores; the Kaikōura Peninsula has a large colony.'
  },
  'Neophoca cinerea': {
    zh: '澳洲特有的海獅，屬瀕危物種，袋鼠島的海豹灣有重要的繁殖族群。',
    en: 'A sea lion endemic to Australia and listed as endangered; Seal Bay on Kangaroo Island has an important breeding colony.'
  },
  'Aethalodelphis obscurus': {
    zh: '南半球溫帶海域的小型海豚，常成大群活動並躍出水面，凱庫拉外海全年可見。',
    en: 'A small dolphin of temperate southern seas that travels in large groups and often leaps clear of the water; it is seen off Kaikōura year-round.'
  },
  // ── Reptiles & amphibians ──
  'Crocodylus niloticus': {
    zh: '非洲最大的鱷魚，棲息於河流、湖泊與沼澤，在牛羚渡河時捕食。',
    en: 'Africa’s largest crocodile, living in rivers, lakes and swamps and taking prey at wildebeest river crossings.'
  },
  'Crocodylus porosus': {
    zh: '現存體型最大的爬行動物，分布於東南亞到澳洲北部的河口與沿海，可進入海水。',
    en: 'The largest living reptile, found in estuaries and coasts from Southeast Asia to northern Australia, and able to travel at sea.'
  },
  'Alligator mississippiensis': {
    zh: '美國東南部淡水沼澤與河流的大型鱷類，大沼澤地國家公園常可近距離觀察。',
    en: 'A large crocodilian of freshwater marshes and rivers in the southeastern United States, often seen at close range in the Everglades.'
  },
  'Varanus rosenbergi': {
    zh: '澳洲南部的巨蜥，常在白蟻丘中產卵，袋鼠島有族群。',
    en: 'A monitor lizard of southern Australia that often lays its eggs in termite mounds; Kangaroo Island has a population.'
  },
  'Diploderma swinhonis': {
    zh: '台灣特有的攀蜥，常見於低海拔樹幹與欄杆，雄性背部有黃色縱紋。',
    en: 'A lizard endemic to Taiwan, common on tree trunks and railings at low elevation; males have a yellow stripe along the back.'
  },
  'Eutropis longicaudata': {
    zh: '台灣與東南亞的石龍子，尾巴特別長，常在草叢與石縫間活動。',
    en: 'A skink of Taiwan and Southeast Asia with a particularly long tail, active among grass and rock crevices.'
  },
  'Anolis sagrei': {
    zh: '原生於古巴與巴哈馬的蜥蜴，已引入美國佛羅里達、台灣等地。',
    en: 'A lizard native to Cuba and the Bahamas, introduced to Florida, Taiwan and elsewhere.',
    id: { zh: '體色褐色，背部常有菱形斑或縱紋；喉扇橙紅色、邊緣黃色。', en: 'Brown, often with diamond or striped markings on the back; orange-red dewlap with a yellow edge.' },
    similar: ['Anolis carolinensis']
  },
  'Anolis carolinensis': {
    zh: '美國東南部原生的變色蜥，可在綠色與褐色之間變換體色。',
    en: 'An anole native to the southeastern United States that can change between green and brown.',
    id: { zh: '體色多為鮮綠色，可轉為褐色；喉扇粉紅色。', en: 'Usually bright green, changing to brown; pink dewlap.' },
    similar: ['Anolis sagrei']
  },
  'Bufo bufo': {
    zh: '歐洲分布最廣的蟾蜍，春季會集體遷移到固定的池塘繁殖。',
    en: 'Europe’s most widespread toad, migrating in numbers to the same breeding ponds each spring.'
  }
}
