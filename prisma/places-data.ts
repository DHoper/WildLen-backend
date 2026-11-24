/**
 * Curated places (base data, kept in production). Six regional clusters, 3–4 places each.
 * Text is factual: what the place is, what lives there, how to get there, field etiquette.
 * Opening hours and fees change; the site shows "check with the managing authority".
 */
import type { PlaceKind } from '@prisma/client'

export type AreaKey = 'taiwan' | 'japan' | 'east-africa' | 'europe' | 'north-america' | 'oceania'
type L<T = string> = { 'zh-TW': T; en: T }

export interface PlaceSeed {
  slug: string
  area: AreaKey
  name: L
  kind: PlaceKind
  countryCode: string
  region: L
  latitude: number
  longitude: number
  radiusM: number
  timezone: string
  description: L
  access: L<{ transport: string; hours?: string }>
  guidelines: L<string[]>
}

export const PLACES: PlaceSeed[] = [
  // ── Taiwan ──
  {
    slug: 'guandu-nature-park',
    area: 'taiwan',
    name: { 'zh-TW': '關渡自然公園', en: 'Guandu Nature Park' },
    kind: 'WETLAND',
    countryCode: 'TW',
    region: { 'zh-TW': '臺北市北投區', en: 'Beitou, Taipei' },
    latitude: 25.117,
    longitude: 121.47,
    radiusM: 2000,
    timezone: 'Asia/Taipei',
    description: {
      'zh-TW': '位於淡水河與基隆河交會處的濕地保護區，由泥灘、草澤與埤塘組成。秋冬是候鳥季，常見雁鴨、鷸鴴與鷺科；翠鳥與紅冠水雞全年可見。',
      en: 'A wetland reserve at the confluence of the Tamsui and Keelung rivers, made up of mudflats, marsh and ponds. Autumn and winter bring migrant ducks, shorebirds and herons; kingfishers and moorhens are present year-round.'
    },
    access: {
      'zh-TW': { transport: '捷運淡水信義線關渡站步行約 15 分鐘。', hours: '週一休園，其餘開放時間依園方公告。' },
      en: { transport: 'About 15 minutes on foot from Guandu MRT station (Tamsui–Xinyi line).', hours: 'Closed on Mondays; other opening hours as announced by the park.' }
    },
    guidelines: {
      'zh-TW': ['泥灘上的鷸鴴對人影敏感，請在觀察屋或步道上拍攝，不要走下泥灘。', '漲潮前後鳥群會被推向岸邊，是拍攝鷸鴴距離最近的時段。', '請勿餵食或以聲音誘引鳥類。'],
      en: ['Shorebirds on the mudflats are wary of silhouettes: shoot from the hides and paths, never walk onto the mud.', 'The rising tide pushes birds towards the shore, the best time for close shorebird shots.', 'Do not feed birds or attract them with playback.']
    }
  },
  {
    slug: 'dasyueshan',
    area: 'taiwan',
    name: { 'zh-TW': '大雪山林道', en: 'Dasyueshan Forest Road' },
    kind: 'FOREST',
    countryCode: 'TW',
    region: { 'zh-TW': '臺中市和平區', en: 'Heping, Taichung' },
    latitude: 24.27,
    longitude: 120.96,
    radiusM: 9000,
    timezone: 'Asia/Taipei',
    description: {
      'zh-TW': '210 林道從東勢上升至海拔約 2,600 公尺的大雪山國家森林遊樂區，是臺灣中海拔鳥類攝影的經典路線。帝雉、藍腹鷴與多種臺灣特有種鳥類常在清晨與傍晚出現在林道邊緣。',
      en: "Forest road 210 climbs from Dongshi to the Dasyueshan National Forest Recreation Area at about 2,600 m, a classic route for Taiwan's mid-elevation birds. Mikado and Swinhoe's pheasants and several endemic species often feed along the road edges at dawn and dusk."
    },
    access: {
      'zh-TW': { transport: '沿線大眾運輸班次有限，多數攝影者自行開車，由東勢轉 210 林道上山。', hours: '遊樂區開放時間與入園費用依林業及自然保育署公告；颱風或豪雨後林道常有交通管制。' },
      en: { transport: 'Public transport is limited; most photographers drive up road 210 from Dongshi.', hours: 'Opening hours and fees as announced by the Forestry and Nature Conservation Agency; the road is often closed after typhoons or heavy rain.' }
    },
    guidelines: {
      'zh-TW': ['請勿以食物或誘餌吸引雉類。', '林道上停車請靠邊並避開彎道，不要佔用車道等待。', '雲霧常在上午後半升起，清晨光線最穩定。'],
      en: ['Do not attract pheasants with food or bait.', 'Park well off the road and away from bends; do not wait in the traffic lane.', 'Cloud usually rises by late morning; light is most reliable at dawn.']
    }
  },
  {
    slug: 'aogu-wetland',
    area: 'taiwan',
    name: { 'zh-TW': '鰲鼓濕地森林園區', en: 'Aogu Wetland Forest Park' },
    kind: 'WETLAND',
    countryCode: 'TW',
    region: { 'zh-TW': '嘉義縣東石鄉', en: 'Dongshi, Chiayi County' },
    latitude: 23.505,
    longitude: 120.15,
    radiusM: 4500,
    timezone: 'Asia/Taipei',
    description: {
      'zh-TW': '臺灣西南沿海規模最大的濕地之一，由海埔新生地上的廢棄農地轉型而成。冬季有大量雁鴨與鷸鴴，黑面琵鷺也在此度冬。',
      en: "One of the largest wetlands on Taiwan's south-west coast, converted from reclaimed farmland. Winter brings large flocks of ducks and shorebirds, and black-faced spoonbills winter here."
    },
    access: {
      'zh-TW': { transport: '需自行開車或騎車；園區範圍大，各觀景台之間需以車代步。' },
      en: { transport: 'Drive or cycle; the park is large and its viewing platforms are far apart.' }
    },
    guidelines: {
      'zh-TW': ['觀景台與堤岸是主要拍攝位置，鳥群距離遠，建議 500mm 以上焦段。', '請勿進入周邊魚塭的私有堤岸。'],
      en: ['Platforms and embankments are the main positions; birds are distant, so 500 mm or longer is recommended.', 'Do not enter the private embankments of the surrounding fish ponds.']
    }
  },
  {
    slug: 'kenting',
    area: 'taiwan',
    name: { 'zh-TW': '墾丁國家公園', en: 'Kenting National Park' },
    kind: 'PROTECTED_AREA',
    countryCode: 'TW',
    region: { 'zh-TW': '屏東縣恆春半島', en: 'Hengchun Peninsula, Pingtung' },
    latitude: 21.97,
    longitude: 120.78,
    radiusM: 12000,
    timezone: 'Asia/Taipei',
    description: {
      'zh-TW': '臺灣最南端的國家公園，涵蓋珊瑚礁海岸、熱帶季風林與龍鑾潭濕地。秋季是灰面鵟鷹與赤腹鷹的過境高峰，龍鑾潭冬季有雁鴨棲息。',
      en: "Taiwan's southernmost national park, spanning coral-reef coast, tropical monsoon forest and the Longluan Lake wetland. Autumn is peak passage for grey-faced buzzards and Chinese sparrowhawks; Longluan Lake holds wintering ducks."
    },
    access: {
      'zh-TW': { transport: '高鐵左營站轉乘墾丁快線；園區景點分散，建議租車或騎車。' },
      en: { transport: 'Kenting Express bus from Zuoying HSR station; sites are spread out, so a car or scooter helps.' }
    },
    guidelines: {
      'zh-TW': ['秋季過境期清晨可在社頂一帶觀察猛禽起飛。', '國家公園範圍內禁止餵食野生動物；生態保護區需申請才能進入。'],
      en: ['During autumn passage, raptors lift off at dawn around Sheding.', 'Feeding wildlife is prohibited in the national park; ecological protection areas require a permit.']
    }
  },
  // ── Japan ──
  {
    slug: 'shiretoko',
    area: 'japan',
    name: { 'zh-TW': '知床', en: 'Shiretoko' },
    kind: 'PROTECTED_AREA',
    countryCode: 'JP',
    region: { 'zh-TW': '北海道斜里町、羅臼町', en: 'Shari & Rausu, Hokkaido' },
    latitude: 44.07,
    longitude: 145.1,
    radiusM: 25000,
    timezone: 'Asia/Tokyo',
    description: {
      'zh-TW': '北海道東北端的半島，2005 年列為世界自然遺產。棕熊、梅花鹿、赤狐與毛腿漁鴞在此棲息；冬季羅臼外海的流冰帶來虎頭海鵰與白尾海鵰。',
      en: "A peninsula at the north-east tip of Hokkaido, inscribed as a World Natural Heritage site in 2005. Brown bears, sika deer, red foxes and Blakiston's fish owls live here; in winter the drift ice off Rausu brings Steller's and white-tailed sea eagles."
    },
    access: {
      'zh-TW': { transport: '女滿別機場開車約 2 小時至宇登呂。', hours: '知床橫斷道路冬季（約 11 月至隔年 4 月）封閉。' },
      en: { transport: 'About 2 hours by car from Memanbetsu Airport to Utoro.', hours: 'The Shiretoko Pass road is closed in winter (roughly November to April).' }
    },
    guidelines: {
      'zh-TW': ['路邊出現棕熊時請留在車內，不要下車接近。', '禁止餵食赤狐等任何野生動物。'],
      en: ['If a bear is by the road, stay in the car and do not approach on foot.', 'Never feed foxes or any other wildlife.']
    }
  },
  {
    slug: 'kushiro-marsh',
    area: 'japan',
    name: { 'zh-TW': '釧路濕原', en: 'Kushiro Marsh' },
    kind: 'WETLAND',
    countryCode: 'JP',
    region: { 'zh-TW': '北海道釧路市、鶴居村', en: 'Kushiro & Tsurui, Hokkaido' },
    latitude: 43.17,
    longitude: 144.3,
    radiusM: 20000,
    timezone: 'Asia/Tokyo',
    description: {
      'zh-TW': '日本最大的濕原，國家公園面積約 2.9 萬公頃。冬季丹頂鶴聚集在鶴居村與阿寒的給餌場，是拍攝鶴群求偶舞的主要地點。',
      en: "Japan's largest marsh, protected as a national park of about 29,000 ha. In winter red-crowned cranes gather at feeding sites in Tsurui and Akan, the main places to photograph their courtship dances."
    },
    access: {
      'zh-TW': { transport: '釧路機場開車約 30 至 60 分鐘可到各觀察點。' },
      en: { transport: 'Viewing sites are 30–60 minutes by car from Kushiro Airport.' }
    },
    guidelines: {
      'zh-TW': ['清晨在音羽橋拍攝霧中鶴群時，請勿佔用車道。', '給餌場請在劃定的觀察區內拍攝。'],
      en: ['When photographing cranes in the mist from Otowa Bridge at dawn, keep off the roadway.', 'At feeding sites, stay inside the marked viewing areas.']
    }
  },
  {
    slug: 'kasai-rinkai-park',
    area: 'japan',
    name: { 'zh-TW': '葛西臨海公園', en: 'Kasai Rinkai Park' },
    kind: 'URBAN_PARK',
    countryCode: 'JP',
    region: { 'zh-TW': '東京都江戶川區', en: 'Edogawa, Tokyo' },
    latitude: 35.64,
    longitude: 139.86,
    radiusM: 2500,
    timezone: 'Asia/Tokyo',
    description: {
      'zh-TW': '位於東京灣岸的都市公園，園內鳥類園有淡水池與汽水池兩處濕地。冬季有雁鴨、鸕鷀與鷸鴴，翠鳥全年可見。',
      en: 'A bayside park in Tokyo whose bird sanctuary has a freshwater and a brackish lagoon. Winter brings ducks, cormorants and shorebirds; common kingfishers are present year-round.'
    },
    access: {
      'zh-TW': { transport: 'JR 京葉線葛西臨海公園站出站即達。', hours: '鳥類園觀察中心的開放時間依園方公告。' },
      en: { transport: 'Next to Kasai-Rinkai-Kōen station on the JR Keiyō line.', hours: 'Opening hours of the bird sanctuary centre as announced by the park.' }
    },
    guidelines: {
      'zh-TW': ['觀察窗與觀察小屋是主要拍攝位置，請勿越過圍欄進入濕地。', '請勿餵食鳥類。'],
      en: ['Shoot from the hides and viewing windows; do not cross the fences into the wetland.', 'Do not feed the birds.']
    }
  },
  // ── East Africa ──
  {
    slug: 'maasai-mara',
    area: 'east-africa',
    name: { 'zh-TW': '馬賽馬拉國家保護區', en: 'Maasai Mara National Reserve' },
    kind: 'PROTECTED_AREA',
    countryCode: 'KE',
    region: { 'zh-TW': '肯亞納羅克郡', en: 'Narok County, Kenya' },
    latitude: -1.5,
    longitude: 35.15,
    radiusM: 30000,
    timezone: 'Africa/Nairobi',
    description: {
      'zh-TW': '與坦尚尼亞塞倫蓋提相連的草原保護區。牛羚大遷徙約在 7 至 10 月渡過馬拉河，獅、獵豹與花豹全年可見。',
      en: "A savanna reserve contiguous with Tanzania's Serengeti. The wildebeest migration crosses the Mara River roughly from July to October; lions, cheetahs and leopards are seen year-round."
    },
    access: {
      'zh-TW': { transport: '奈洛比威爾遜機場搭小飛機約 1 小時，或開車約 5 至 6 小時。' },
      en: { transport: "About 1 hour by light aircraft from Nairobi's Wilson Airport, or 5–6 hours by road." }
    },
    guidelines: {
      'zh-TW': ['保護區內必須留在車上，越野行駛僅限允許的區域。', '不要阻擋狩獵中動物的行進路線。'],
      en: ['Stay in the vehicle; off-road driving only where permitted.', 'Never block the path of hunting animals.']
    }
  },
  {
    slug: 'serengeti',
    area: 'east-africa',
    name: { 'zh-TW': '塞倫蓋提國家公園', en: 'Serengeti National Park' },
    kind: 'PROTECTED_AREA',
    countryCode: 'TZ',
    region: { 'zh-TW': '坦尚尼亞北部', en: 'Northern Tanzania' },
    latitude: -2.42,
    longitude: 34.85,
    radiusM: 40000,
    timezone: 'Africa/Dar_es_Salaam',
    description: {
      'zh-TW': '面積約 1.5 萬平方公里的草原國家公園，本頁範圍以中部塞羅內拉河谷為中心。塞羅內拉全年有大型貓科動物，12 至 3 月南部草原是牛羚產仔季。',
      en: 'Some 15,000 km² of savanna; this page covers the central Seronera valley, where big cats are present year-round. From December to March the southern plains host the wildebeest calving season.'
    },
    access: {
      'zh-TW': { transport: '阿魯沙搭小飛機至塞羅內拉跑道，或經恩哥羅恩哥羅開車約 8 小時。' },
      en: { transport: 'Light aircraft from Arusha to the Seronera airstrip, or about 8 hours by road via Ngorongoro.' }
    },
    guidelines: {
      'zh-TW': ['留在車上，與動物保持距離，不要阻擋其行進路線。', '乾季塵土大，請在車內更換鏡頭。'],
      en: ['Stay in the vehicle, keep your distance and never block animals.', 'Dust is heavy in the dry season: change lenses inside the vehicle.']
    }
  },
  {
    slug: 'amboseli',
    area: 'east-africa',
    name: { 'zh-TW': '安博塞利國家公園', en: 'Amboseli National Park' },
    kind: 'PROTECTED_AREA',
    countryCode: 'KE',
    region: { 'zh-TW': '肯亞卡加多郡', en: 'Kajiado County, Kenya' },
    latitude: -2.65,
    longitude: 37.26,
    radiusM: 20000,
    timezone: 'Africa/Nairobi',
    description: {
      'zh-TW': '位於吉力馬札羅山北麓的國家公園，以大象群與晴天時的雪山背景聞名。園內沼澤吸引河馬、鵜鶘與多種水鳥。',
      en: 'A national park at the northern foot of Kilimanjaro, known for its elephant herds and the snow-capped backdrop on clear mornings. Its swamps draw hippos, pelicans and many waterbirds.'
    },
    access: {
      'zh-TW': { transport: '奈洛比開車約 4 小時，或搭小飛機。' },
      en: { transport: 'About 4 hours by road from Nairobi, or by light aircraft.' }
    },
    guidelines: {
      'zh-TW': ['清晨雲層較少，是拍攝吉力馬札羅背景的時段。', '留在車上，與象群保持距離。'],
      en: ['Mornings are usually clearest for a Kilimanjaro backdrop.', 'Stay in the vehicle and give elephant herds room.']
    }
  },
  // ── Europe ──
  {
    slug: 'cairngorms',
    area: 'europe',
    name: { 'zh-TW': '凱恩戈姆國家公園', en: 'Cairngorms National Park' },
    kind: 'MOUNTAIN',
    countryCode: 'GB',
    region: { 'zh-TW': '蘇格蘭高地', en: 'Scottish Highlands' },
    latitude: 57.15,
    longitude: -3.75,
    radiusM: 30000,
    timezone: 'Europe/London',
    description: {
      'zh-TW': '英國面積最大的國家公園，涵蓋高原、古老的喀里多尼亞松林與湖泊。赤松鼠、雪兔、西方松雞與蘇格蘭交嘴雀在此棲息。',
      en: "The UK's largest national park, with high plateaux, ancient Caledonian pinewood and lochs. Red squirrels, mountain hares, capercaillie and Scottish crossbills live here."
    },
    access: {
      'zh-TW': { transport: '愛丁堡或格拉斯哥搭火車至阿維莫爾（Aviemore）約 3 小時。' },
      en: { transport: 'About 3 hours by train from Edinburgh or Glasgow to Aviemore.' }
    },
    guidelines: {
      'zh-TW': ['西方松雞族群稀少且易受干擾，繁殖期請遠離求偶場；本站自動模糊其位置。', '高原天氣變化快，冬季上山需有雪地裝備。'],
      en: ['Capercaillie are scarce and easily disturbed: keep away from leks in the breeding season. WildLens blurs their locations.', 'Plateau weather changes fast; winter ascents need snow equipment.']
    }
  },
  {
    slug: 'donana',
    area: 'europe',
    name: { 'zh-TW': '多尼亞納國家公園', en: 'Doñana National Park' },
    kind: 'WETLAND',
    countryCode: 'ES',
    region: { 'zh-TW': '西班牙安達魯西亞', en: 'Andalusia, Spain' },
    latitude: 37.08,
    longitude: -6.45,
    radiusM: 25000,
    timezone: 'Europe/Madrid',
    description: {
      'zh-TW': '瓜達幾維河口的濕地與沙丘保護區，是歐洲重要的候鳥中繼站。大紅鸛、白琵鷺與西班牙帝鵰在此棲息，伊比利亞猞猁分布於園區周邊。',
      en: "A wetland and dune reserve at the mouth of the Guadalquivir, one of Europe's key stopovers for migrating birds. Greater flamingos, Eurasian spoonbills and Spanish imperial eagles live here, and Iberian lynx range in and around the park."
    },
    access: {
      'zh-TW': { transport: '塞維亞開車約 1 小時至埃爾羅西奧（El Rocío）。', hours: '核心區僅能參加官方導覽車進入。' },
      en: { transport: 'About 1 hour by car from Seville to El Rocío.', hours: 'The core area can only be entered on official guided tours.' }
    },
    guidelines: {
      'zh-TW': ['埃爾羅西奧濕地邊的步道是拍攝水鳥的公開位置。', '伊比利亞猞猁屬瀕危物種，本站自動模糊其位置。'],
      en: ['The promenade along the El Rocío marsh is the public spot for waterbirds.', 'The Iberian lynx is endangered; WildLens blurs its locations automatically.']
    }
  },
  {
    slug: 'varanger',
    area: 'europe',
    name: { 'zh-TW': '瓦朗厄爾半島', en: 'Varanger Peninsula' },
    kind: 'COAST',
    countryCode: 'NO',
    region: { 'zh-TW': '挪威芬馬克', en: 'Finnmark, Norway' },
    latitude: 70.3,
    longitude: 30.3,
    radiusM: 45000,
    timezone: 'Europe/Oslo',
    description: {
      'zh-TW': '挪威東北端的北極海岸。冬末春初，小絨鴨與王絨鴨聚集在港灣；夏季霍爾諾亞島（Hornøya）的峭壁上有北極海鸚與三趾鷗繁殖。',
      en: "An Arctic coast in north-east Norway. In late winter and early spring Steller's and king eiders gather in the harbours; in summer puffins and kittiwakes breed on the cliffs of Hornøya."
    },
    access: {
      'zh-TW': { transport: '經奧斯陸轉機至瓦德瑟（Vadsø）或瓦爾德（Vardø）。' },
      en: { transport: 'Fly via Oslo to Vadsø or Vardø.' }
    },
    guidelines: {
      'zh-TW': ['12 月至 1 月中旬為極夜，幾乎沒有日照。', '海況差時請勿到防波堤外側。'],
      en: ['Polar night lasts from December to mid-January, with almost no daylight.', 'Stay off the outer breakwaters in rough seas.']
    }
  },
  // ── North America ──
  {
    slug: 'yellowstone',
    area: 'north-america',
    name: { 'zh-TW': '黃石國家公園', en: 'Yellowstone National Park' },
    kind: 'PROTECTED_AREA',
    countryCode: 'US',
    region: { 'zh-TW': '美國懷俄明州', en: 'Wyoming, USA' },
    latitude: 44.7,
    longitude: -110.45,
    radiusM: 45000,
    timezone: 'America/Denver',
    description: {
      'zh-TW': '世界第一座國家公園。拉馬爾河谷與海登河谷是觀察灰狼、美洲野牛、灰熊與叉角羚的主要地點，冬季積雪讓動物集中在低海拔谷地。',
      en: "The world's first national park. The Lamar and Hayden valleys are the main places to watch grey wolves, bison, grizzly bears and pronghorn; winter snow concentrates animals in the low valleys."
    },
    access: {
      'zh-TW': { transport: '博茲曼或傑克森機場開車 1.5 至 2 小時。', hours: '冬季多數道路封閉，只有北門至東北門的道路全年通行。' },
      en: { transport: '1.5–2 hours by car from Bozeman or Jackson airports.', hours: 'Most roads close in winter; only the North to Northeast Entrance road is open year-round.' }
    },
    guidelines: {
      'zh-TW': ['園方規定與熊、狼保持至少 100 碼（約 91 公尺），與其他動物至少 25 碼（約 23 公尺）。', '路邊停車請完全離開車道。'],
      en: ['Park rules: stay at least 100 yards (91 m) from bears and wolves and 25 yards (23 m) from other animals.', 'Pull completely off the road before stopping.']
    }
  },
  {
    slug: 'bosque-del-apache',
    area: 'north-america',
    name: { 'zh-TW': '博斯克德爾阿帕奇野生動物保護區', en: 'Bosque del Apache National Wildlife Refuge' },
    kind: 'WETLAND',
    countryCode: 'US',
    region: { 'zh-TW': '美國新墨西哥州', en: 'New Mexico, USA' },
    latitude: 33.8,
    longitude: -106.89,
    radiusM: 8000,
    timezone: 'America/Denver',
    description: {
      'zh-TW': '格蘭河畔的濕地保護區。11 月至 2 月有上萬隻沙丘鶴與雪雁度冬，清晨群體起飛是著名的攝影場面。',
      en: 'A wetland refuge on the Rio Grande. From November to February tens of thousands of sandhill cranes and snow geese winter here, and the mass lift-off at dawn is a well-known subject.'
    },
    access: {
      'zh-TW': { transport: '阿布奎基開車約 1.5 小時。' },
      en: { transport: 'About 1.5 hours by car from Albuquerque.' }
    },
    guidelines: {
      'zh-TW': ['日出前約 30 分鐘到觀景台等待群體起飛。', '保護區內只能在指定道路與步道停留。'],
      en: ['Be at a viewing deck about 30 minutes before sunrise for the lift-off.', 'Stay on designated roads and trails inside the refuge.']
    }
  },
  {
    slug: 'everglades',
    area: 'north-america',
    name: { 'zh-TW': '大沼澤地國家公園', en: 'Everglades National Park' },
    kind: 'WETLAND',
    countryCode: 'US',
    region: { 'zh-TW': '美國佛羅里達州', en: 'Florida, USA' },
    latitude: 25.4,
    longitude: -80.62,
    radiusM: 25000,
    timezone: 'America/New_York',
    description: {
      'zh-TW': '北美最大的亞熱帶荒野保護區。安亨加步道（Anhinga Trail）的木棧道可近距離拍攝美洲短吻鱷、美洲蛇鵜與多種鷺科鳥類；乾季（12 月至 4 月）動物集中在水源周邊。',
      en: 'The largest subtropical wilderness in North America. The Anhinga Trail boardwalk gives close views of American alligators, anhingas and herons; in the dry season (December–April) wildlife concentrates around the remaining water.'
    },
    access: {
      'zh-TW': { transport: '邁阿密開車約 1 小時至恩斯特・寇伊遊客中心（Ernest F. Coe）。' },
      en: { transport: 'About 1 hour by car from Miami to the Ernest F. Coe Visitor Center.' }
    },
    guidelines: {
      'zh-TW': ['不要接近或餵食短吻鱷。', '雨季（5 月至 11 月）蚊蟲多，動物也較分散。'],
      en: ['Do not approach or feed alligators.', 'The wet season (May–November) brings mosquitoes and more dispersed wildlife.']
    }
  },
  // ── Oceania ──
  {
    slug: 'kangaroo-island',
    area: 'oceania',
    name: { 'zh-TW': '袋鼠島', en: 'Kangaroo Island' },
    kind: 'OTHER',
    countryCode: 'AU',
    region: { 'zh-TW': '澳洲南澳州', en: 'South Australia' },
    latitude: -35.8,
    longitude: 137.25,
    radiusM: 50000,
    timezone: 'Australia/Adelaide',
    description: {
      'zh-TW': '澳洲第三大島，島上沒有狐狸與兔子，袋鼠、無尾熊、針鼴與澳洲海獅族群穩定。2019 至 2020 年的森林大火燒毀島上近半面積，西部植被仍在恢復。',
      en: "Australia's third-largest island, free of foxes and rabbits; kangaroos, koalas, echidnas and Australian sea lions are common. The 2019–20 bushfires burnt nearly half the island, and vegetation in the west is still recovering."
    },
    access: {
      'zh-TW': { transport: '從傑維斯角（Cape Jervis）搭渡輪約 45 分鐘，或從阿得雷德搭機。' },
      en: { transport: 'About 45 minutes by ferry from Cape Jervis, or fly from Adelaide.' }
    },
    guidelines: {
      'zh-TW': ['海豹灣（Seal Bay）的海獅群只能參加導覽進入海灘。', '黃昏後有袋類動物常在路上，請減速行駛。'],
      en: ['The sea lion colony at Seal Bay can only be visited on guided beach tours.', 'Marsupials are often on the roads after dusk; drive slowly.']
    }
  },
  {
    slug: 'kakadu',
    area: 'oceania',
    name: { 'zh-TW': '卡卡杜國家公園', en: 'Kakadu National Park' },
    kind: 'PROTECTED_AREA',
    countryCode: 'AU',
    region: { 'zh-TW': '澳洲北領地', en: 'Northern Territory, Australia' },
    latitude: -12.8,
    longitude: 132.55,
    radiusM: 45000,
    timezone: 'Australia/Darwin',
    description: {
      'zh-TW': '澳洲最大的國家公園，由原住民傳統擁有者與政府共同管理。黃水（Yellow Water）濕地有河口鱷、鵲雁與多種鷺科鳥類，乾季（5 月至 10 月）是主要拍攝季節。',
      en: "Australia's largest national park, jointly managed by its Aboriginal traditional owners and the government. The Yellow Water wetlands hold saltwater crocodiles, magpie geese and many herons; the dry season (May–October) is the main shooting season."
    },
    access: {
      'zh-TW': { transport: '達爾文開車約 3 小時。', hours: '雨季部分道路與景點封閉。' },
      en: { transport: 'About 3 hours by car from Darwin.', hours: 'Some roads and sites close in the wet season.' }
    },
    guidelines: {
      'zh-TW': ['河口鱷出沒的水域禁止下水，岸邊請保持距離。', '尊重原住民文化遺址的參訪規定。'],
      en: ['Never enter water where saltwater crocodiles occur, and keep back from the edge.', 'Follow the visiting rules at Aboriginal cultural sites.']
    }
  },
  {
    slug: 'kaikoura',
    area: 'oceania',
    name: { 'zh-TW': '凱庫拉', en: 'Kaikōura' },
    kind: 'COAST',
    countryCode: 'NZ',
    region: { 'zh-TW': '紐西蘭坎特伯雷', en: 'Canterbury, New Zealand' },
    latitude: -42.42,
    longitude: 173.68,
    radiusM: 15000,
    timezone: 'Pacific/Auckland',
    description: {
      'zh-TW': '深海峽谷緊鄰海岸，讓抹香鯨、暗色斑紋海豚與信天翁可以在近岸觀察。半島步道沿線有紐西蘭海狗棲息。',
      en: 'A deep submarine canyon close to shore brings sperm whales, dusky dolphins and albatrosses within easy reach. New Zealand fur seals haul out along the peninsula walkway.'
    },
    access: {
      'zh-TW': { transport: '基督城開車約 2.5 小時。' },
      en: { transport: 'About 2.5 hours by car from Christchurch.' }
    },
    guidelines: {
      'zh-TW': ['與海狗保持至少 20 公尺，不要站在牠們與海之間。', '賞鯨船出航與否取決於海況，請預留備用日。'],
      en: ['Keep at least 20 m from fur seals and never stand between them and the sea.', 'Whale-watching trips depend on sea conditions; allow a spare day.']
    }
  }
]

export const AREAS: { key: AreaKey; name: L }[] = [
  { key: 'taiwan', name: { 'zh-TW': '台灣', en: 'Taiwan' } },
  { key: 'japan', name: { 'zh-TW': '日本', en: 'Japan' } },
  { key: 'east-africa', name: { 'zh-TW': '東非', en: 'East Africa' } },
  { key: 'europe', name: { 'zh-TW': '歐洲', en: 'Europe' } },
  { key: 'north-america', name: { 'zh-TW': '北美', en: 'North America' } },
  { key: 'oceania', name: { 'zh-TW': '大洋洲', en: 'Oceania' } }
]
