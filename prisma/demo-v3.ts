/**
 * Demo content for challenges, field trips and critiques. Idempotent: challenges by slug,
 * trips by title, critiques by (photo, reviewer). Dates are relative to "now" so the
 * challenge phases (open / voting / ended / upcoming) always look right.
 */
import type { PrismaClient, TripDifficulty } from '@prisma/client'

const DAY = 24 * 3600_000
const at = (days: number, hour = 0) => new Date(Date.now() + days * DAY + hour * 3600_000)
const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`

interface ChallengeSeed {
  slug: string
  title: { 'zh-TW': string; en: string }
  brief: { 'zh-TW': string; en: string }
  rules: { 'zh-TW': string[]; en: string[] }
  cover: string
  /** CSS object-position for the cover crop. */
  coverPosition?: string
  start: number
  submitEnd: number
  voteEnd: number
  entries: { by: string; photo: string }[]
  /** Votes as [voter, photo title]. */
  votes?: [string, string][]
}

const COMMON_RULES = {
  'zh-TW': ['限投稿本人拍攝的野生動物照片，每人最多 3 件', '不得使用誘餌、播放叫聲或以任何方式干擾動物', '投票期間每人 3 票，不得投給自己的作品'],
  en: ['Your own photographs of wild animals only, up to 3 entries', 'No bait, call playback or disturbance of any kind', '3 votes per person during voting; no votes for your own entries']
}

export const CHALLENGES: ChallengeSeed[] = [
  {
    slug: 'golden-hour',
    title: { 'zh-TW': '晨昏時刻', en: 'Golden Hour' },
    brief: {
      'zh-TW': '主題：日出後與日落前約一小時內拍攝的野生動物。評選重點：低角度光線的方向與色溫運用，以及主體與環境的關係。',
      en: 'Theme: wildlife photographed within about an hour after sunrise or before sunset. Judging: use of low-angle light, its direction and colour temperature, and the relationship between subject and setting.'
    },
    rules: COMMON_RULES,
    cover: '1516426122078-c23e76319801',
    start: -5,
    submitEnd: 9,
    voteEnd: 16,
    entries: [
      { by: 'yu', photo: '黃昏的白尾鹿' },
      { by: 'ken', photo: '草原之王' },
      { by: 'mei', photo: '雪地邊的赤狐' },
      { by: 'lena', photo: 'Tigress on the ridge' }
    ]
  },
  {
    slug: 'eye-contact',
    title: { 'zh-TW': '眼神交會', en: 'Eye Contact' },
    brief: {
      'zh-TW': '主題：動物視線朝向鏡頭的畫面。評選重點：眼部合焦的精準度、表情與姿態，以及背景處理。',
      en: 'Theme: the animal looking towards the camera. Judging: precise focus on the eye, expression and posture, and handling of the background.'
    },
    rules: COMMON_RULES,
    cover: '1557008075-7f2c5efa4cfd',
    coverPosition: '50% 18%',
    start: -20,
    submitEnd: -2,
    voteEnd: 5,
    entries: [
      { by: 'sam', photo: 'City fox after the rain' },
      { by: 'mei', photo: '好奇的浣熊' },
      { by: 'ken', photo: '樹上午睡的花豹' },
      { by: 'lena', photo: 'Plains zebra, close and calm' },
      { by: 'yu', photo: '尤加利樹上的無尾熊' }
    ],
    votes: [
      ['mei', 'City fox after the rain'],
      ['ken', 'Plains zebra, close and calm'],
      ['yu', '好奇的浣熊']
    ]
  },
  {
    slug: 'wild-city',
    title: { 'zh-TW': '城市裡的野生', en: 'The Wild City' },
    brief: {
      'zh-TW': '主題：於城市、公園或住宅區等人為環境中拍攝的野生動物。評選重點：人與野生動物共存的脈絡、構圖與環境敘事。',
      en: 'Theme: wildlife photographed in cities, parks or residential areas. Judging: the context of coexistence, composition and how the setting is conveyed.'
    },
    rules: COMMON_RULES,
    cover: '1497752531616-c3afd9760a11',
    start: -45,
    submitEnd: -25,
    voteEnd: -18,
    entries: [
      { by: 'sam', photo: 'City fox after the rain' },
      { by: 'mei', photo: '好奇的浣熊' },
      { by: 'mei', photo: '等待時機的翠鳥' }
    ],
    votes: [
      ['ken', 'City fox after the rain'],
      ['yu', 'City fox after the rain'],
      ['lena', 'City fox after the rain'],
      ['mei', 'City fox after the rain'],
      ['ken', '好奇的浣熊'],
      ['lena', '好奇的浣熊'],
      ['sam', '好奇的浣熊'],
      ['yu', '等待時機的翠鳥'],
      ['sam', '等待時機的翠鳥']
    ]
  },
  {
    slug: 'night-shift',
    title: { 'zh-TW': '夜行者', en: 'Night Shift' },
    brief: {
      'zh-TW': '主題：夜間活動的野生動物。評選重點：低光源條件下的曝光控制與主體呈現，以及對動物干擾的降低。',
      en: 'Theme: nocturnal wildlife. Judging: exposure control and rendering of the subject in low light, and keeping disturbance to a minimum.'
    },
    rules: {
      'zh-TW': [...COMMON_RULES['zh-TW'], '須使用紅光或低亮度光源，避免連續閃光直射'],
      en: [...COMMON_RULES.en, 'Use red or low-intensity light; avoid repeated direct flash']
    },
    cover: '1500530855697-b586d89ba3ee',
    start: 12,
    submitEnd: 30,
    voteEnd: 37,
    entries: []
  }
]

interface TripSeed {
  by: string
  title: string
  description: string
  start: Date
  end: Date
  meetingPoint: string
  lat: number
  lng: number
  capacity: number
  difficulty: TripDifficulty
  targets: string[]
  gear: string
  members: string[]
  waitlist?: string[]
  /** Use this existing forum thread as the discussion instead of creating one. */
  discussionTitle?: string
  album?: string[]
}

/** Local wall-clock time `hh` on the day `days` from now, for a UTC offset in hours. */
const localDay = (days: number, hh: number, mm: number, offset: number) => {
  const d = new Date(Date.now() + days * DAY)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh - offset, mm))
}

export const TRIPS: TripSeed[] = [
  {
    by: 'yu',
    title: '關渡清晨水鳥攝影散步',
    description: '週末清晨在關渡自然公園外圍步道慢慢走，主要目標是翠鳥與冬候鳥。適合新手：會分享對焦模式與安全距離的設定。集合後先簡短說明觀察守則，全程不播放鳥音、不靠近巢位。',
    start: localDay(6, 6, 0, 8),
    end: localDay(6, 10, 0, 8),
    meetingPoint: '關渡自然公園 遊客中心前',
    lat: 25.1197,
    lng: 121.4677,
    capacity: 8,
    difficulty: 'EASY',
    targets: ['Alcedo atthis', 'Pycnonotus sinensis'],
    gear: '100–400mm 以上鏡頭、單腳架、防蚊液、輕便雨衣',
    members: ['ken', 'sam', 'mei']
  },
  {
    by: 'mei',
    title: '大雪山林道清晨鳥類攝影（帝雉、藍腹鷴）',
    description: '預計清晨 5 點從台中出發，開車上大雪山林道，沿途在 23K、35K、50K 停留。目標是帝雉與藍腹鷴，需要耐心等待，中午前下山。山區清晨溫度低，請準備保暖衣物。',
    start: localDay(13, 5, 0, 8),
    end: localDay(13, 13, 0, 8),
    meetingPoint: '台中 東勢 大雪山林道入口',
    lat: 24.2783,
    lng: 120.8962,
    capacity: 4,
    difficulty: 'MODERATE',
    targets: ['Syrmaticus mikado', 'Lophura swinhoii', 'Urocissa caerulea'],
    gear: '400mm 以上長焦、高感光表現好的機身、保暖外套、頭燈（紅光）',
    members: ['ken', 'yu', 'lena'],
    waitlist: ['sam'],
    discussionTitle: '大雪山林道清晨鳥類攝影（帝雉、藍腹鷴）'
  },
  {
    by: 'lena',
    title: 'Kruger sunrise drive — photographers’ vehicle',
    description: 'A private open vehicle set up for photographers: bean bags on every seat, engine off at sightings, and no rushing. We leave Skukuza when the gate opens and follow the H4-1 along the Sabie River. Expect elephants and a good chance of leopard.',
    start: localDay(30, 5, 30, 2),
    end: localDay(30, 11, 0, 2),
    meetingPoint: 'Skukuza Rest Camp, main gate',
    lat: -24.9964,
    lng: 31.5928,
    capacity: 6,
    difficulty: 'MODERATE',
    targets: ['Panthera pardus', 'Loxodonta africana', 'Panthera leo'],
    gear: 'Bean bag (provided), 100–500mm or longer, a wide lens for landscapes, warm layers for the morning',
    members: ['ken', 'sam']
  },
  {
    by: 'mei',
    title: '關渡冬季翠鳥觀察',
    description: '在關渡的水塘邊守候翠鳥，練習預對焦與高速快門。感謝大家準時集合，也謝謝分享鏡頭設定的夥伴！',
    start: new Date('2026-02-20T22:30:00Z'),
    end: new Date('2026-02-21T02:30:00Z'),
    meetingPoint: '關渡自然公園 主建築',
    lat: 25.1197,
    lng: 121.4677,
    capacity: 6,
    difficulty: 'EASY',
    targets: ['Alcedo atthis'],
    gear: '長焦鏡頭、腳架',
    members: ['yu', 'ken'],
    album: ['等待時機的翠鳥']
  }
]

export const CRITIQUE_REQUESTS = ['好奇的浣熊', 'City fox after the rain', '森林中的大象', '黃昏的白尾鹿']

export const CRITIQUES: { photo: string; by: string; scores: [number, number, number, number]; comment: string }[] = [
  { photo: 'City fox after the rain', by: 'lena', scores: [4, 4, 5, 4], comment: 'Tack-sharp eyes and the wet tarmac gives a lovely texture. I’d crop a little off the left to remove the bright patch.' },
  { photo: 'City fox after the rain', by: 'mei', scores: [3, 4, 5, 4], comment: '眼神對焦很準！背景的亮點有點搶戲，可以試試再壓低一點機位，讓背景更乾淨。' },
  { photo: '森林中的大象', by: 'mei', scores: [4, 3, 4, 3], comment: '構圖很穩，但林下光線偏平。如果能等到側光，皮膚的皺褶紋理會更立體。' },
  { photo: '黃昏的白尾鹿', by: 'sam', scores: [5, 5, 4, 4], comment: 'Beautiful rim light on the antlers. Exposure is spot on for the highlights — maybe lift the shadows a touch on the face.' },
  { photo: '黃昏的白尾鹿', by: 'ken', scores: [4, 5, 4, 5], comment: '逆光輪廓非常漂亮，時機也抓得好。下次可以試試留多一點鹿面向的空間。' }
]

/**
 * Copy corrections for demo content created by earlier seed versions (idempotent):
 * renamed titles, reworded texts and the challenges' current briefs, rules and crops.
 */
export async function correctDemoContent(prisma: PrismaClient) {
  const RENAMES: [string, string][] = [
    ['【揪團】12 月中大雪山林道賞鳥（帝雉、藍腹鷴）', '大雪山林道清晨鳥類攝影（帝雉、藍腹鷴）'],
    ['海龜被塑膠吸管卡住的影片讓我好難過', '海龜誤食塑膠：日常可行的減塑做法']
  ]
  for (const [from, to] of RENAMES) {
    await prisma.communityPost.updateMany({ where: { title: from }, data: { title: to } })
    await prisma.trip.updateMany({ where: { title: from }, data: { title: to } })
  }
  const turtleBody = '海龜誤食塑膠的影像並不少見。日常可行的做法包括自備餐具、參與淨灘、選擇包裝較少的商品；也歡迎分享其他經驗。'
  await prisma.communityPost.updateMany({
    where: { title: '海龜誤食塑膠：日常可行的減塑做法', excerpt: { contains: '一起從小事開始吧' } },
    data: { content: { ops: [{ insert: `${turtleBody}\n` }] }, excerpt: turtleBody }
  })
  await prisma.photoPost.updateMany({ where: { description: '清晨在知床遇見的赤狐，毛色在逆光下像燃燒的火焰。牠在原地停留了好幾分鐘，最後慢慢走回森林。' }, data: { description: '清晨於知床半島海岸遇見的赤狐，逆光下毛色呈橘紅色。個體停留數分鐘後走回森林。' } })
  await prisma.poll.updateMany({ where: { title: '你最想親眼看到的野生動物是？' }, data: { title: '下一次野外拍攝，最希望記錄到的物種？', description: null } })
  for (const c of CHALLENGES) {
    await prisma.challenge.updateMany({ where: { slug: c.slug }, data: { title: c.title, brief: c.brief, rules: c.rules, coverPosition: c.coverPosition ?? '50% 50%' } })
  }
}

export async function seedCommunityV3(prisma: PrismaClient, uid: (who: string) => number) {
  const photoId = async (title: string) => (await prisma.photoPost.findFirst({ where: { title }, select: { id: true } }))?.id

  // Challenges
  let challenges = 0
  for (const c of CHALLENGES) {
    if (await prisma.challenge.findUnique({ where: { slug: c.slug }, select: { id: true } })) continue
    const row = await prisma.challenge.create({
      data: { slug: c.slug, title: c.title, brief: c.brief, rules: c.rules, coverUrl: unsplash(c.cover), coverPosition: c.coverPosition ?? '50% 50%', startsAt: at(c.start), submitEndsAt: at(c.submitEnd), voteEndsAt: at(c.voteEnd) }
    })
    const entryByTitle = new Map<string, number>()
    for (const [i, e] of c.entries.entries()) {
      const pid = await photoId(e.photo)
      if (!pid) continue
      const entry = await prisma.challengeEntry.create({
        data: { challengeId: row.id, photoPostId: pid, userId: uid(e.by), createdAt: at(c.start + 1 + i) }
      })
      entryByTitle.set(e.photo, entry.id)
    }
    for (const [voter, title] of c.votes ?? []) {
      const entryId = entryByTitle.get(title)
      if (entryId) await prisma.challengeVote.create({ data: { entryId, challengeId: row.id, userId: uid(voter) } })
    }
    challenges++
  }

  // Trips
  let trips = 0
  const speciesRows = await prisma.species.findMany({ select: { id: true, scientificName: true } })
  const speciesId = new Map(speciesRows.map((s) => [s.scientificName, s.id]))
  for (const t of TRIPS) {
    if (await prisma.trip.findFirst({ where: { title: t.title }, select: { id: true } })) continue
    const language = /[一-鿿]/.test(t.title) ? 'zh-TW' : 'en'
    const existing = t.discussionTitle ? await prisma.communityPost.findFirst({ where: { title: t.discussionTitle }, select: { id: true } }) : null
    const discussion =
      existing ??
      (await prisma.communityPost.create({
        data: {
          title: t.title,
          content: { ops: [{ insert: `${t.description}\n` }] },
          excerpt: Array.from(t.description).slice(0, 140).join(''),
          language,
          categoryKey: 'meetups',
          authorId: uid(t.by),
          createdAt: new Date(Math.min(Date.now(), t.start.getTime()) - 5 * DAY),
          lastActivityAt: new Date(Math.min(Date.now(), t.start.getTime()) - 5 * DAY)
        },
        select: { id: true }
      }))
    const trip = await prisma.trip.create({
      data: {
        title: t.title,
        description: t.description,
        organizerId: uid(t.by),
        startsAt: t.start,
        endsAt: t.end,
        meetingPoint: t.meetingPoint,
        latitude: t.lat,
        longitude: t.lng,
        capacity: t.capacity,
        difficulty: t.difficulty,
        targetSpeciesIds: t.targets.flatMap((n) => speciesId.get(n) ?? []),
        gear: t.gear,
        language,
        discussionId: discussion.id
      }
    })
    const members = [{ who: t.by, status: 'GOING' as const }, ...t.members.map((who) => ({ who, status: 'GOING' as const })), ...(t.waitlist ?? []).map((who) => ({ who, status: 'WAITLIST' as const }))]
    for (const [i, m] of members.entries()) {
      await prisma.tripMember.create({ data: { tripId: trip.id, userId: uid(m.who), status: m.status, createdAt: new Date(Date.now() - (members.length - i) * 3600_000) } })
    }
    for (const title of t.album ?? []) {
      await prisma.photoPost.updateMany({ where: { title }, data: { tripId: trip.id } })
    }
    trips++
  }

  // Critiques
  await prisma.photoPost.updateMany({ where: { title: { in: CRITIQUE_REQUESTS } }, data: { critiqueRequested: true } })
  let critiques = 0
  for (const c of CRITIQUES) {
    const pid = await photoId(c.photo)
    if (!pid) continue
    const [composition, light, focus, moment] = c.scores
    const userId = uid(c.by)
    const exists = await prisma.critique.findUnique({ where: { photoPostId_userId: { photoPostId: pid, userId } }, select: { id: true } })
    if (exists) continue
    await prisma.critique.create({ data: { photoPostId: pid, userId, composition, light, focus, moment, comment: c.comment } })
    critiques++
  }
  console.log(`✔ community v3 demo: ${challenges} challenges, ${trips} trips, ${critiques} critiques`)
}
