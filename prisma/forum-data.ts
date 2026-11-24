/** Forum boards and demo threads for the seed. */

export interface CategorySeed {
  key: string
  name: { 'zh-TW': string; en: string }
  description: { 'zh-TW': string; en: string }
  color: string
  icon: string
  adminOnly?: boolean
}

export const CATEGORIES: CategorySeed[] = [
  {
    key: 'identification',
    name: { 'zh-TW': '物種鑑定求助', en: 'ID Help' },
    description: { 'zh-TW': '拍到不認識的物種？附上照片與時間地點，請社群幫忙鑑定。', en: "Spotted something you can't name? Share photos, date and place, and let the community help identify it." },
    color: '#22577a',
    icon: '🔍'
  },
  {
    key: 'beginners',
    name: { 'zh-TW': '新手提問', en: 'Beginner Questions' },
    description: { 'zh-TW': '剛開始接觸野生動物攝影或自然觀察？任何問題都歡迎發問。', en: 'New to wildlife photography or nature watching? No question is too basic.' },
    color: '#4f735e',
    icon: '🌱'
  },
  {
    key: 'techniques',
    name: { 'zh-TW': '拍攝技巧', en: 'Techniques' },
    description: { 'zh-TW': '構圖、光線、對焦與後製——交流拍攝野生動物的技巧與心得。', en: 'Composition, light, focus and editing: share what works when photographing wildlife.' },
    color: '#c47f2c',
    icon: '📷'
  },
  {
    key: 'gear',
    name: { 'zh-TW': '器材討論', en: 'Gear' },
    description: { 'zh-TW': '機身、鏡頭、望遠鏡與野外裝備的選購與使用經驗。', en: 'Bodies, lenses, binoculars and field kit: buying advice and hands-on experience.' },
    color: '#7c6a58',
    icon: '🔭'
  },
  {
    key: 'field-reports',
    name: { 'zh-TW': '野外紀錄', en: 'Field Reports' },
    description: { 'zh-TW': '分享你的野外觀察、旅程紀錄與難忘的相遇。', en: 'Share your field observations, trip reports and memorable encounters.' },
    color: '#566e3d',
    icon: '🥾'
  },
  {
    key: 'conservation',
    name: { 'zh-TW': '保育議題', en: 'Conservation' },
    description: { 'zh-TW': '棲地、保育政策與拍攝倫理——討論我們能為野生動物做什麼。', en: 'Habitats, policy and field ethics: what we can do for wildlife.' },
    color: '#9c3f2b',
    icon: '🌏'
  },
  {
    key: 'meetups',
    name: { 'zh-TW': '外拍活動', en: 'Field Trips' },
    description: { 'zh-TW': '賞鳥、夜觀、潛水與野外攝影活動的公告與行前討論。', en: 'Announcements and planning for birding walks, night surveys, dives and photo outings.' },
    color: '#8a5a9e',
    icon: '🚐'
  },
  {
    key: 'announcements',
    name: { 'zh-TW': '站務公告', en: 'Announcements' },
    description: { 'zh-TW': 'WildLens 官方公告、功能更新與社群守則。', en: 'Official WildLens news, feature updates and community guidelines.' },
    color: '#1d2b24',
    icon: '📣',
    adminOnly: true
  }
]

/** Boards for the four original demo posts (matched by title). */
export const DEMO_POST_BOARDS: Record<string, { categoryKey: string; type: 'DISCUSSION' | 'QUESTION' }> = {
  '新手求問：拍鳥要用多快的快門？': { categoryKey: 'techniques', type: 'QUESTION' },
  '分享：第一次去非洲 safari 的行前準備清單': { categoryKey: 'gear', type: 'DISCUSSION' },
  '海龜誤食塑膠：日常可行的減塑做法': { categoryKey: 'conservation', type: 'DISCUSSION' },
  '台灣有哪些適合觀察野生動物的步道？': { categoryKey: 'beginners', type: 'QUESTION' }
}

export type Who = 'admin' | 'mei' | 'ken' | 'yu' | 'sam' | 'lena'

export interface ReplySeed {
  by: Who
  text: string
  /** Hours after the thread was posted. */
  at: number
  likes?: Who[]
  replies?: Omit<ReplySeed, 'replies'>[]
  accepted?: boolean
}

export interface ThreadSeed {
  by: Who
  board: string
  type?: 'DISCUSSION' | 'QUESTION'
  pinned?: boolean
  title: string
  /** Chinese tag labels (converted to keys by the seed). */
  tags: string[]
  body: string[]
  daysAgo: number
  views: number
  likes: Who[]
  replies: ReplySeed[]
}

export const THREADS: ThreadSeed[] = [
  {
    by: 'admin',
    board: 'announcements',
    pinned: true,
    title: '歡迎來到 WildLens 討論區：發文前請先讀這篇',
    tags: ['環境保育'],
    body: [
      '歡迎加入！這裡是野生動物攝影者與自然觀察者交流的地方。為了讓討論區對人與動物都友善，請先花一分鐘看看以下幾點：',
      '## 選對看板',
      '不認識的物種請到「物種鑑定求助」，並盡量附上拍攝日期、地點（縣市即可）與多角度照片；器材與技巧問題各有專屬看板。',
      '## 保護敏感物種',
      '請勿在文中公開石虎、黑面琵鷺、穿山甲等敏感物種的精確位置；需要時以縣市或「北部山區」等描述即可。',
      '## 提問記得採納解答',
      '發問時選擇「提問」類型，問題解決後點選最有幫助的回覆為「解答」，之後遇到同樣問題的人就能快速找到答案。'
    ],
    daysAgo: 20,
    views: 412,
    likes: ['mei', 'ken', 'yu'],
    replies: [
      { by: 'mei', text: '感謝整理！敏感物種位置那點真的很重要，之前在別的社團看過有人公開石虎出沒點，很擔心。', at: 5, likes: ['ken', 'yu', 'admin'] },
      {
        by: 'ken',
        text: '請問「提問」和「討論」的差別是？我想分享器材心得應該選哪個？',
        at: 9,
        replies: [{ by: 'admin', text: '心得分享選「討論」就好；「提問」適合有明確答案、希望有人解決的問題，例如鑑定或設定問題。', at: 11, likes: ['ken'] }]
      }
    ]
  },
  {
    by: 'yu',
    board: 'identification',
    type: 'QUESTION',
    title: '關渡看到一隻停在水邊的藍色小鳥，是翠鳥嗎？',
    tags: ['鳥類', '溪河湖泊'],
    body: [
      '上週六早上在關渡自然公園的水塘邊拍到，大小大概跟麻雀差不多，背部是很亮的藍綠色，肚子是橘色，嘴巴又長又尖。',
      '牠停在枯枝上一動也不動，過了幾分鐘突然衝進水裡又飛回來。請問這是翠鳥嗎？還是其他種類？'
    ],
    daysAgo: 6,
    views: 186,
    likes: ['mei', 'ken'],
    replies: [
      {
        by: 'mei',
        text: '從描述看是普通翠鳥（Alcedo atthis）沒錯！藍綠色背、橘色腹部、長嘴，加上停棲後俯衝入水的行為都很典型。如果下嘴是紅色的就是母鳥，全黑是公鳥，可以放大照片看看。',
        at: 2,
        likes: ['yu', 'ken', 'admin'],
        accepted: true,
        replies: [
          { by: 'yu', text: '放大看下嘴是橘紅色的，所以是母鳥！謝謝，學到了 🙏', at: 4, likes: ['mei'] },
          { by: 'ken', text: '補充：關渡的翠鳥很固定會停同幾根枝頭，早上 7–9 點去機率最高。', at: 6, likes: ['yu'] }
        ]
      },
      { by: 'ken', text: '另一個可能是蒼翡翠，但那個體型大很多、胸口是白色，應該不是。', at: 3 }
    ]
  },
  {
    by: 'ken',
    board: 'identification',
    type: 'QUESTION',
    title: '陽明山步道晚上拍到的綠色樹蛙，是莫氏還是台北樹蛙？',
    tags: ['兩棲動物', '夜間攝影', '山林'],
    body: [
      '昨晚在陽明山二子坪步道的水溝邊拍到，全身翠綠，眼睛是金色的。只拍到背面和側面，沒拍到大腿內側。',
      '查了圖鑑覺得莫氏樹蛙和台北樹蛙都很像，請問有什麼明顯的分辨方式嗎？'
    ],
    daysAgo: 2,
    views: 74,
    likes: ['yu'],
    replies: [
      {
        by: 'yu',
        text: '最好分的是大腿內側：莫氏樹蛙是橘紅色帶黑斑，台北樹蛙是黃色。另外季節也有參考價值，台北樹蛙主要在冬天繁殖。',
        at: 3,
        likes: ['ken', 'mei'],
        replies: [{ by: 'ken', text: '那下次要想辦法拍到側腹和大腿內側了，謝謝！現在是 11 月，台北樹蛙好像也說得通…', at: 5 }]
      },
      { by: 'mei', text: '可以聽叫聲！莫氏是「呱—呱—」連續的，台北樹蛙比較像「咯咯咯」。有錄音的話更好判斷。', at: 8, likes: ['ken'] }
    ]
  },
  {
    by: 'mei',
    board: 'techniques',
    title: '夜觀時怎麼拍才不會打擾動物？我的紅光手電筒心得',
    tags: ['夜間攝影', '攝影技巧', '環境保育'],
    body: [
      '這半年常跑夜觀，整理一下自己摸索出來的做法，也想聽聽大家的經驗：',
      '## 光源',
      '找路用紅光頭燈；拍照時用低亮度的持續燈，從側面打光，盡量不要直射眼睛，更不要長時間用閃光燈連拍。',
      '## 設定',
      'ISO 3200–6400、f/4、1/60 左右，靠防手震撐住。寧可有一點雜訊，也不要靠近到讓動物逃走。'
    ],
    daysAgo: 9,
    views: 233,
    likes: ['ken', 'yu', 'admin'],
    replies: [
      {
        by: 'ken',
        text: '推紅光！另外我會固定拍一張就移開光源，讓動物有時間恢復。對貓頭鷹尤其重要。',
        at: 4,
        likes: ['mei', 'yu'],
        replies: [{ by: 'mei', text: '同意，「拍一張就移開」應該寫進守則裡 😂', at: 6, likes: ['ken'] }]
      },
      { by: 'yu', text: '請問持續燈大家都用哪一款？我現在用手機手電筒，色溫好難調。', at: 10 },
      { by: 'admin', text: '很棒的整理！之後會參考這篇補充到社群守則的「夜間觀察」段落。', at: 26, likes: ['mei'] }
    ]
  },
  {
    by: 'ken',
    board: 'gear',
    title: '第一支超望遠：100-400 還是 150-600？',
    tags: ['攝影技巧', '鳥類'],
    body: [
      '預算大概五萬內，主要拍台灣的鳥，偶爾去國外拍大型動物。猶豫 100-400 比較輕、好帶上山，150-600 焦段比較長。',
      '想問有用過的朋友，實際在野外哪個比較常用得到？'
    ],
    daysAgo: 4,
    views: 158,
    likes: ['mei'],
    replies: [
      { by: 'mei', text: '我兩支都用過。拍台灣山鳥我會選 150-600，很多鳥都在樹冠層，400 常常不夠。但重量真的差很多，要有心理準備。', at: 2, likes: ['ken', 'yu'] },
      {
        by: 'yu',
        text: '如果會常爬山或出國，100-400 + 1.4x 加倍鏡也是一個彈性的組合。',
        at: 5,
        likes: ['ken'],
        replies: [
          { by: 'ken', text: '加倍鏡對對焦速度影響大嗎？', at: 6 },
          { by: 'yu', text: '光圈會小一級，暗的時候會慢一點，白天拍停棲的鳥幾乎沒差。', at: 8, likes: ['ken'] }
        ]
      },
      { by: 'admin', text: '也可以考慮先租借兩支各用一個週末，實際背上山感受一下再決定。', at: 20, likes: ['ken', 'mei'] }
    ]
  },
  {
    by: 'yu',
    board: 'field-reports',
    title: '七股黑面琵鷺度冬紀錄：今年來得特別早',
    tags: ['鳥類', '沼澤', '遷徙'],
    body: [
      '上週末到台南七股的賞鳥亭，已經可以看到不少黑面琵鷺，比去年早了快兩週。牠們大多在睡覺，偶爾會集體起飛換位置，非常壯觀。',
      '提醒大家：請待在賞鳥亭和步道上觀察，不要為了拍近照走進魚塭或堤防，群體受驚起飛很耗體力。'
    ],
    daysAgo: 3,
    views: 201,
    likes: ['mei', 'ken', 'admin'],
    replies: [
      { by: 'mei', text: '好棒！請問大概幾點去光線最好？想帶家人去看。', at: 3, replies: [{ by: 'yu', text: '早上 8 點前或下午 3 點後，順光而且鳥比較活躍。記得帶望遠鏡！', at: 4, likes: ['mei'] }] },
      { by: 'ken', text: '感謝提醒不要靠近，之前看到有人拿空拍機去拍，真的很誇張。', at: 7, likes: ['yu', 'mei'] }
    ]
  },
  {
    by: 'mei',
    board: 'meetups',
    title: '大雪山林道清晨鳥類攝影（帝雉、藍腹鷴）',
    tags: ['鳥類', '山林', '野外探險'],
    body: [
      '預計 12/14（六）清晨 5 點從台中出發，開車上大雪山林道，一路找帝雉、藍腹鷴、栗背林鴝，中午前下山。',
      '目前車上還有 2 個位子，油錢分攤。新手也歡迎，我可以分享望遠鏡。有興趣請留言！'
    ],
    daysAgo: 1,
    views: 96,
    likes: ['ken', 'yu'],
    replies: [
      { by: 'ken', text: '+1！我可以自己開車跟，順便多載兩個人。', at: 2, likes: ['mei'] },
      {
        by: 'yu',
        text: '我是新手可以參加嗎？需要準備什麼？',
        at: 4,
        replies: [{ by: 'mei', text: '當然可以！保暖衣物（山上清晨很冷）、雨衣、早餐，有相機就帶，沒有也沒關係。', at: 5, likes: ['yu'] }]
      }
    ]
  },
  {
    by: 'ken',
    board: 'conservation',
    title: '路殺問題：石虎與山羌，我們能做什麼？',
    tags: ['環境保育', '陸生動物', '嚴重議題'],
    body: [
      '這個月在苗栗山區的縣道就看到兩起路殺，其中一隻疑似是石虎。很難過，也想了解除了放慢車速，一般人還能做什麼？'
    ],
    daysAgo: 7,
    views: 167,
    likes: ['mei', 'yu', 'admin'],
    replies: [
      { by: 'yu', text: '可以把路殺紀錄回報到「路殺社」，資料會用來評估哪些路段需要設置動物通道或警示標誌。', at: 2, likes: ['ken', 'mei', 'admin'] },
      { by: 'mei', text: '晨昏和夜間開山路時放慢到 40 以下，是最直接的方法。也可以支持地方的友善農作產品。', at: 6, likes: ['ken'] }
    ]
  },
  {
    by: 'sam',
    board: 'identification',
    type: 'QUESTION',
    title: 'Small raptor over a Bristol park — sparrowhawk or kestrel?',
    tags: ['鳥類', '動物行為', '歐洲'],
    body: [
      'Saw this bird dash low along a hedge line and ambush a group of starlings. Grey back, barred chest, long tail, and it never hovered.',
      'My first thought was kestrel, but the behaviour felt wrong. Any ideas from the photos?'
    ],
    daysAgo: 4,
    views: 97,
    likes: ['lena', 'mei'],
    replies: [
      {
        by: 'lena',
        text: 'Low hedge-hopping ambush plus a barred chest and no hovering points strongly to a Eurasian sparrowhawk (Accipiter nisus). Kestrels hover and have a spotted, warmer-toned chest.',
        at: 3,
        likes: ['sam', 'ken'],
        accepted: true,
        replies: [{ by: 'sam', text: 'That makes total sense — thanks Lena!', at: 5, likes: ['lena'] }]
      },
      { by: 'mei', text: '台灣也有類似的松雀鷹（Accipiter virgatus），一樣是低飛突襲小鳥的獵人。Same hunting style, smaller bird.', at: 9, likes: ['sam'] }
    ]
  },
  {
    by: 'lena',
    board: 'techniques',
    title: 'Shooting from a safari vehicle: my bean bag and window-mount setup',
    tags: ['攝影技巧', '非洲', '野外探險'],
    body: [
      'After eight seasons guiding in the Lowveld, here is what I recommend to guests who want sharp photos from the vehicle.',
      '## Bean bag over everything',
      'A two-chamber bean bag filled on arrival (rice or dried beans) beats any clamp. It moulds to the door frame and you can swing a 600mm lens freely.',
      '## Turn off the engine — and ask',
      'Ask your guide to switch the engine off before you shoot. Vibration ruins long exposures, and quieter vehicles disturb the animals less.',
      '## Stay inside',
      'Never stand up or lean out for a better angle. It breaks the outline animals are used to and it can be genuinely dangerous.'
    ],
    daysAgo: 8,
    views: 264,
    likes: ['ken', 'sam', 'yu'],
    replies: [
      {
        by: 'ken',
        text: 'Totally agree on the bean bag. 在馬賽馬拉我也是用豆袋，比夾具穩太多了。',
        at: 4,
        likes: ['lena'],
        replies: [{ by: 'lena', text: 'Exactly! And it doubles as a pillow on long drives 😄', at: 6, likes: ['ken'] }]
      },
      { by: 'sam', text: 'Saving this for my first trip next spring. Do you fill the bag yourself or buy one pre-filled?', at: 20 }
    ]
  },
  {
    by: 'sam',
    board: 'conservation',
    title: 'Urban wildlife needs dark skies too',
    tags: ['環境保育', '夜間攝影', '動物行為'],
    body: [
      'Our city recently switched to brighter LED street lights, and I have noticed far fewer bats along the river.',
      'Has anyone worked with their local council on wildlife-friendly lighting? I would love to hear what arguments actually persuaded them.'
    ],
    daysAgo: 2,
    views: 58,
    likes: ['yu'],
    replies: [
      { by: 'yu', text: 'Warm-coloured (amber) lights and shielding the fixtures downward made a big difference in a coastal project I joined for nesting turtles.', at: 7, likes: ['sam'] }
    ]
  }
]
