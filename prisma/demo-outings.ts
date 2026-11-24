/**
 * Demo layer: members in every region and their field journals (redesign v4 §5).
 *
 * Journals are checklists at the curated places, on dates when the place has records: the
 * species are the ones recorded there in that month (from the imported data), never sensitive
 * ones. Demo photos taken at a place are attached to the matching journal. Members' own photos
 * are few, so most demo journals are checklists with notes; imported photos are never moved
 * under a demo member. Idempotent (journals keyed by author + title).
 */
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import { fetchWeather } from '../src/modules/outings/weather'

const DEMO_PASSWORD = 'wildlens123'
type Lang = 'zh-TW' | 'en'

interface Person {
  email: string
  username: string
  avatarIndex: number
  bio: string
  locale: Lang
  /** [place slug, note?][] — one journal each. */
  outings: [string, string?][]
}

/** Factual bios for the original demo members (replacing the earlier casual ones). */
const BIOS: Record<string, string> = {
  'mei@example.com': '台北的鳥類攝影者，主要在關渡與中海拔林道拍攝，冬季常去北海道。',
  'ken@example.com': '常駐奈洛比，記錄馬賽馬拉與安博塞利的大型哺乳類與猛禽。',
  'yu@example.com': '海岸與濕地生態攝影，多在台灣南部與離島活動。',
  'sam@example.com': 'Photographs urban wildlife and birds around Bristol, usually at first light.',
  'lena@example.com': 'Safari guide; photographs mammal behaviour from vehicles in East and Southern Africa.'
}

const PEOPLE: Person[] = [
  {
    email: 'mei@example.com',
    username: '梅子在野',
    avatarIndex: 3,
    bio: BIOS['mei@example.com']!,
    locale: 'zh-TW',
    outings: [
      ['guandu-nature-park', '漲潮前兩小時抵達，從二號觀察屋開始。潮水把鷸鴴推向北側泥灘，距離約 30 公尺，500mm 端足夠。九點後東側逆光，改到南側步道拍鷺科。'],
      ['dasyueshan'],
      ['aogu-wetland'],
      ['shiretoko']
    ]
  },
  { email: 'yu@example.com', username: '小羽', avatarIndex: 10, bio: BIOS['yu@example.com']!, locale: 'zh-TW', outings: [['kenting', '清晨先到龍鑾潭，水面有薄霧，雁鴨多在中央水域，距離較遠。九點後轉往社頂，林下光線不足，ISO 拉到 3200。'], ['guandu-nature-park'], ['aogu-wetland']] },
  {
    email: 'hsu@example.com',
    username: '許文彥',
    avatarIndex: 2,
    bio: '台中人，週末在大雪山林道與中部濕地記錄鳥類，使用 Nikon Z 系統。',
    locale: 'zh-TW',
    outings: [['dasyueshan', '天亮前從 23K 開始往上，雲層在 35K 以下，上方天氣晴朗。路邊停車點不多，清晨車流少時較好停。雉類在 43K 附近林緣出現一次，停留約五分鐘。'], ['aogu-wetland'], ['guandu-nature-park']]
  },
  {
    email: 'chen@example.com',
    username: '陳品妤',
    avatarIndex: 8,
    bio: '屏東在地，記錄恆春半島的過境猛禽與海岸鳥類。',
    locale: 'zh-TW',
    outings: [['kenting', '社頂一帶的猛禽在早上八點前後起飛，熱氣流形成後高度上升很快。地面拍攝以 200–400mm 為主，鷹柱時改用較廣的焦段。'], ['dasyueshan']]
  },
  {
    email: 'lin@example.com',
    username: '林冠廷',
    avatarIndex: 5,
    bio: '定居札幌，拍攝北海道的濕原與海岸生態，冬季以丹頂鶴與海鵰為主。',
    locale: 'zh-TW',
    outings: [['kushiro-marsh', '清晨氣溫零下，音羽橋上已有十多位攝影者。霧在日出後半小時散去，鶴群移往給餌場前在河道停留約一小時。'], ['shiretoko'], ['kasai-rinkai-park']]
  },
  {
    email: 'ken@example.com',
    username: 'Ken 的鏡頭',
    avatarIndex: 7,
    bio: BIOS['ken@example.com']!,
    locale: 'zh-TW',
    outings: [['maasai-mara', '下午四點出發，獅群在河岸邊的灌叢休息，六點前開始移動。逆光角度適合拍鬃毛輪廓，車停在東側以避免擋住牠們的路線。'], ['amboseli'], ['serengeti']]
  },
  {
    email: 'amani@example.com',
    username: 'Amani Wanjiru',
    avatarIndex: 9,
    bio: 'Nairobi-based guide and photographer covering the Mara and Amboseli ecosystems.',
    locale: 'en',
    outings: [['amboseli', 'Clear morning: Kilimanjaro visible until about 08:30. Most activity around the Enkongo Narok swamp; dust built up on the tracks once the wind picked up after nine.'], ['maasai-mara'], ['serengeti']]
  },
  { email: 'lena@example.com', username: 'Lena Fischer', avatarIndex: 6, bio: BIOS['lena@example.com']!, locale: 'en', outings: [['serengeti', 'Left camp at first light and worked the Seronera river line. Most cats were resting by eight; birds around the kopjes kept us busy until the heat haze set in.'], ['maasai-mara']] },
  { email: 'sam@example.com', username: 'Sam Whitaker', avatarIndex: 3, bio: BIOS['sam@example.com']!, locale: 'en', outings: [['cairngorms', 'Walked the forest track from Glenmore before sunrise. Low light under the pines all morning; most birds were in the clearings by the loch.'], ['donana']] },
  {
    email: 'isla@example.com',
    username: 'Isla MacLeod',
    avatarIndex: 4,
    bio: 'Based in Aviemore. Photographs Highland birds and mammals, and runs winter trips to Varanger.',
    locale: 'en',
    outings: [['cairngorms', 'Frost on the heather and almost no wind. Kept to the forest edge and the reservoir; checked the feeders on the way back.'], ['cairngorms'], ['varanger']]
  },
  {
    email: 'lucia@example.com',
    username: 'Lucía Romero',
    avatarIndex: 1,
    bio: 'Seville-based photographer working mostly in Doñana and the Guadalquivir marshes.',
    locale: 'en',
    outings: [['donana', 'Started on the El Rocío promenade at sunrise; the marsh held more water than last month. Flamingos stayed in the far channels, so this was a day for longer lenses.'], ['donana']]
  },
  {
    email: 'nate@example.com',
    username: 'Nate Holloway',
    avatarIndex: 2,
    bio: 'Bozeman, Montana. Photographs Yellowstone year-round and the Rio Grande refuges in winter.',
    locale: 'en',
    outings: [['yellowstone', 'In Lamar Valley before dawn. Bison along the river, distant wolf activity on the north slopes that we only saw through scopes. Roadside pull-outs filled up by seven.'], ['yellowstone'], ['bosque-del-apache'], ['everglades']]
  },
  {
    email: 'mia@example.com',
    username: 'Mia Thompson',
    avatarIndex: 11,
    bio: 'Adelaide. Photographs Kangaroo Island and the Top End, mostly mammals and waterbirds.',
    locale: 'en',
    outings: [['kangaroo-island', 'Drove the south coast road at dawn. Kangaroos grazing in the paddocks until the sun was up; the afternoon was spent along the beaches.'], ['kangaroo-island'], ['kakadu']]
  },
  {
    email: 'tane@example.com',
    username: 'Tane Rāwiri',
    avatarIndex: 12,
    bio: 'Kaikōura. Photographs seabirds and marine mammals along the peninsula.',
    locale: 'en',
    outings: [['kaikoura', 'Calm sea and good light along the peninsula walkway. Seals hauled out on the rocks below the car park; kept the 20 m distance and shot from the track.'], ['kaikoura']]
  }
]

/** Demo photos attached to a journal: [photo title, author email, place slug]. */
const ATTACH: [string, string, string][] = [
  ['等待時機的翠鳥', 'mei@example.com', 'guandu-nature-park'],
  ['雪地邊的赤狐', 'mei@example.com', 'shiretoko'],
  ['草原之王', 'ken@example.com', 'maasai-mara']
]

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** UTC instant of a local wall time in a zone. */
const zonedUtc = (y: number, m: number, d: number, hh: number, mm: number, tz: string) => {
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(guess))
  const g = (k: string) => Number(parts.find((p) => p.type === k)?.value)
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))
  return new Date(guess - (asUtc - guess))
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export async function seedDemoOutings() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)
  const places = new Map((await prisma.place.findMany({ where: { status: 'CURATED' }, select: { id: true, slug: true, name: true, latitude: true, longitude: true, timezone: true, area: true } })).map((p) => [p.slug, p]))
  let created = 0
  let users = 0
  const now = Date.now()

  for (const person of PEOPLE) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      create: { email: person.email, username: person.username, avatarIndex: person.avatarIndex, bio: person.bio, locale: person.locale, passwordHash, emailVerified: true },
      update: { bio: person.bio },
      select: { id: true, createdAt: true }
    })
    users++
    const usedMonths = new Map<string, Set<number>>()

    for (const [i, [slug, note]] of person.outings.entries()) {
      const place = places.get(slug)
      if (!place) continue
      // Months with records at the place (local time), busiest first; each journal of a person at a place takes a different month.
      const months = await prisma.$queryRaw<{ m: number; n: number }[]>`
        SELECT extract(month from p.taken_at AT TIME ZONE 'UTC' AT TIME ZONE ${place.timezone})::int AS m, count(*)::int AS n
        FROM photo_posts p LEFT JOIN species s ON s.id = p.species_id
        WHERE p.place_id = ${place.id} AND p.taken_at IS NOT NULL AND (s.id IS NULL OR NOT s.sensitive)
        GROUP BY 1 ORDER BY 2 DESC, 1`
      const taken = usedMonths.get(slug) ?? new Set<number>()
      const attach = ATTACH.find(([, email, s]) => email === person.email && s === slug && taken.size === 0)
      const attachPhoto = attach ? await prisma.photoPost.findFirst({ where: { title: attach[0], sourceName: null }, select: { id: true, takenAt: true } }) : null

      let start: Date
      if (attachPhoto?.takenAt) {
        start = new Date(attachPhoto.takenAt.getTime() - 50 * 60_000)
      } else {
        const pick = months.filter((m) => !taken.has(m.m))[(hash(person.email + slug) + i) % Math.max(1, Math.min(3, months.length))] ?? months[0]
        if (!pick) continue
        const day = 3 + (hash(person.email + slug + i) % 24)
        const thisYear = new Date().getUTCFullYear()
        let year = thisYear
        if (zonedUtc(year, pick.m, day, 12, 0, place.timezone).getTime() > now - 2 * 86400_000) year--
        start = zonedUtc(year, pick.m, day, 6, 10 * (hash(slug + i) % 5), place.timezone)
      }
      const localMonth = Number(new Intl.DateTimeFormat('en-US', { timeZone: place.timezone, month: 'numeric' }).format(start))
      const localDay = Number(new Intl.DateTimeFormat('en-US', { timeZone: place.timezone, day: 'numeric' }).format(start))
      taken.add(localMonth)
      usedMonths.set(slug, taken)
      const end = new Date(start.getTime() + (150 + (hash(person.email + i) % 4) * 30) * 60_000)

      const name = (place.name as Record<Lang, string>)[person.locale] ?? (place.name as Record<Lang, string>)['zh-TW']
      const title = person.locale === 'en' ? `${name}, ${localDay} ${MONTHS_EN[localMonth - 1]}` : `${name} ${localMonth}月${localDay}日`

      // Checklist: species recorded at the place within a month of the date (not sensitive), up to 14
      const window = [((localMonth + 10) % 12) + 1, localMonth, (localMonth % 12) + 1]
      const species = await prisma.$queryRaw<{ id: number; group: string }[]>`
        SELECT s.id, s."group"::text AS group, count(*) AS n
        FROM photo_posts p JOIN species s ON s.id = p.species_id
        WHERE p.place_id = ${place.id} AND NOT s.sensitive AND p.taken_at IS NOT NULL
          AND extract(month from p.taken_at AT TIME ZONE 'UTC' AT TIME ZONE ${place.timezone})::int IN (${Prisma.join(window)})
        GROUP BY 1, 2 ORDER BY 3 DESC, 1 LIMIT 14`
      const checklist = species.map((s, k) => {
        const max = s.group === 'BIRD' ? 14 : s.group === 'MAMMAL' ? 6 : 3
        const count = k % 4 === 3 ? null : 1 + (hash(title + s.id) % max)
        return { speciesId: s.id, count, heardOnly: false, note: null }
      })

      const existing = await prisma.outing.findFirst({ where: { authorId: user.id, title }, select: { id: true } })
      const data = {
        title,
        placeId: place.id,
        locationName: name,
        latitude: place.latitude,
        longitude: place.longitude,
        locationPrecision: 'EXACT' as const,
        area: place.area,
        startedAt: start,
        endedAt: end,
        timezone: place.timezone,
        notes: note ? { ops: [{ insert: `${note}\n` }] } : undefined,
        status: 'PUBLISHED' as const,
        publishedAt: new Date(Math.min(end.getTime() + 86400_000, now)),
        language: person.locale
      }
      const outing = existing
        ? await prisma.outing.update({ where: { id: existing.id }, data, select: { id: true } })
        : await prisma.outing.create({ data: { ...data, authorId: user.id, createdAt: data.publishedAt }, select: { id: true } })
      if (!existing) created++
      await prisma.outingSpecies.deleteMany({ where: { outingId: outing.id } })
      if (checklist.length) await prisma.outingSpecies.createMany({ data: checklist.map((c) => ({ ...c, outingId: outing.id })), skipDuplicates: true })
      if (attachPhoto) {
        await prisma.photoPost.update({ where: { id: attachPhoto.id }, data: { outingId: outing.id } })
        const sp = await prisma.photoPost.findUnique({ where: { id: attachPhoto.id }, select: { speciesId: true } })
        if (sp?.speciesId) await prisma.outingSpecies.createMany({ data: [{ outingId: outing.id, speciesId: sp.speciesId }], skipDuplicates: true })
      }
      // Weather where the forecast archive still covers the date (≤ 90 days).
      if (now - end.getTime() < 90 * 86400_000) {
        const weather = await fetchWeather({ latitude: place.latitude, longitude: place.longitude, startedAt: start, endedAt: end, timezone: place.timezone })
        if (weather) await prisma.outing.update({ where: { id: outing.id }, data: { weather: weather as unknown as Prisma.InputJsonObject } })
      }
    }
  }
  // Original members: factual bios
  for (const [email, bio] of Object.entries(BIOS)) await prisma.user.updateMany({ where: { email }, data: { bio } })
  const total = await prisma.outing.count({ where: { author: { email: { endsWith: '@example.com' } } } })
  console.log(`✔ demo journals: ${users} members, ${created} new journals (${total} in total)`)
}
