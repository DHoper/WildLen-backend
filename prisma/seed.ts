/**
 * Seeds the database.
 *
 *   npm run db:seed            → ensures the admin account from ADMIN_EMAIL / ADMIN_PASSWORD
 *                                and upserts the species catalogue and forum boards
 *   npm run db:seed -- --demo  → also inserts demo users, articles, photos, posts and polls
 *
 * Demo data is only inserted into an empty database (no photo posts yet). Existing demo
 * photos created before species / EXIF existed are back-filled (matched by title), and
 * the demo forum threads are added when missing (also matched by title).
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { PrismaClient, type LocationPrecision, type Prisma } from '@prisma/client'
import { SPECIES } from './species-data'
import { DESCRIPTIONS_EN } from './species-data-en'
import { LEGACY_TAGS, TAG_GROUPS } from '../src/lib/tags'
import { detectLanguage } from '../src/lib/language'
import { CATEGORIES, DEMO_POST_BOARDS, THREADS, type Who } from './forum-data'
import { ARTICLE_TRANSLATIONS, EN_PHOTOS, EN_PHOTO_COMMENTS, EN_POLL } from './demo-en'
import { correctDemoContent, seedCommunityV3 } from './demo-v3'
import { seedGear } from './demo-gear'
import { seedPlaces } from './places'
import { applySpeciesTexts, applyTaxonomy } from './taxonomy'
import { backfillTags } from '../src/modules/places/backfill'
import { calibrateDemoPhotos } from './demo-calibrate'
import { seedDemoOutings } from './demo-outings'
import { relinkPhotoGear } from '../src/modules/gear/normalize'
import { refreshQuality } from '../src/modules/photos/quality'
import { prisma as appPrisma } from '../src/lib/prisma'

/** Demo content is written with Chinese tag labels; the database stores tag keys. */
// Demo data was written with the earlier tag labels; those map to current keys (or are dropped).
const TAG_KEYS = new Map<string, string | null>([...LEGACY_TAGS.map((t) => [t.zh, t.to] as const), ...TAG_GROUPS.flatMap((g) => g.tags.map((t) => [t.label['zh-TW'], t.key] as const))])
const tagKeys = (labels: string[]) => [
  ...new Set(
    labels.flatMap((label) => {
      if (!TAG_KEYS.has(label)) throw new Error(`Unknown tag in seed: ${label}`)
      const key = TAG_KEYS.get(label)
      return key ? [key] : []
    })
  )
]

const prisma = new PrismaClient()

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`
const delta = (...paragraphs: string[]) => ({
  ops: paragraphs.flatMap((p) =>
    p.startsWith('## ')
      ? [{ insert: p.slice(3) }, { insert: '\n', attributes: { header: 2 } }]
      : [{ insert: `${p}\n` }]
  )
})
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@wildlens.dev').toLowerCase()
  const password = process.env.ADMIN_PASSWORD ?? 'change-me-please'
  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', emailVerified: true },
    create: {
      email,
      username: 'WildLens 編輯部',
      passwordHash: await bcrypt.hash(password, 12),
      role: 'ADMIN',
      emailVerified: true,
      avatarIndex: 1,
      bio: 'WildLens 官方帳號'
    }
  })
  console.log(`✔ admin account: ${email}`)
  return admin
}

async function seedSpecies() {
  for (const { sensitive = false, ...sp } of SPECIES) {
    const descriptionEn = DESCRIPTIONS_EN[sp.scientificName] ?? null
    // Existing rows are left untouched so edits made by admins survive re-seeding…
    await prisma.species.upsert({
      where: { scientificName: sp.scientificName },
      update: {},
      create: { ...sp, sensitive, descriptionEn }
    })
    // …except for filling in an English description that is still missing.
    await prisma.species.updateMany({
      where: { scientificName: sp.scientificName, descriptionEn: null },
      data: { descriptionEn }
    })
  }
  console.log(`✔ species catalogue: ${SPECIES.length} species`)
}

/** Forum boards: created by the migration, kept in sync here. */
async function seedCategories() {
  for (const [position, { adminOnly = false, ...c }] of CATEGORIES.entries()) {
    const data = { ...c, adminOnly, position: position + 1 }
    await prisma.forumCategory.upsert({ where: { key: c.key }, update: data, create: data })
  }
  console.log(`✔ forum boards: ${CATEGORIES.length}`)
}

const DEMO_PASSWORD = 'wildlens123'
const DEMO_PEOPLE = [
  { email: 'mei@example.com', username: '梅子在野', avatarIndex: 3, bio: '週末都在山裡，相機比水壺重。', interests: ['鳥類', '山林', '微距攝影'] },
  { email: 'ken@example.com', username: 'Ken 的鏡頭', avatarIndex: 7, bio: '非洲草原狂熱者，夢想是拍到花豹打哈欠。', interests: ['非洲', '草原', '動物行為'] },
  { email: 'yu@example.com', username: '小羽', avatarIndex: 10, bio: '潛水 + 攝影，海龜是我的本命。', interests: ['海洋', '水生生物', '環境保育'] },
  { email: 'sam@example.com', username: 'Sam Whitaker', avatarIndex: 3, bio: 'Urban wildlife and birds around Bristol. Usually out before sunrise.', interests: ['鳥類', '動物行為', '歐洲'], locale: 'en' },
  { email: 'lena@example.com', username: 'Lena Fischer', avatarIndex: 6, bio: 'Safari guide in the South African Lowveld. Patience over megapixels.', interests: ['非洲', '草原', '攝影技巧'], locale: 'en' }
]

// Field-record metadata of the demo photos, keyed by title.
const R5 = { camera: 'Canon EOS R5', lens: 'RF100-500mm F4.5-7.1 L IS USM' }
const Z9 = { camera: 'Nikon Z9', lens: 'NIKKOR Z 180-600mm f/5.6-6.3 VR' }
const A1 = { camera: 'Sony α1', lens: 'FE 200-600mm F5.6-6.3 G OSS' }
const OM = { camera: 'OM System OM-1', lens: 'M.Zuiko 150-400mm F4.5 TC1.25x IS PRO' }
interface PhotoMeta {
  species: string // scientific name
  takenAt: string
  exif: Prisma.InputJsonObject
  precision?: LocationPrecision
}
const DEMO_PHOTO_META: Record<string, PhotoMeta> = {
  雪地邊的赤狐: { species: 'Vulpes vulpes', takenAt: '2026-01-18T06:42:00+09:00', exif: { ...R5, focalLength: '500mm', aperture: 'f/7.1', shutterSpeed: '1/1600s', iso: 800 } },
  草原之王: { species: 'Panthera leo', takenAt: '2025-08-22T17:55:00+03:00', exif: { ...Z9, focalLength: '420mm', aperture: 'f/6.3', shutterSpeed: '1/1000s', iso: 640 } },
  專心吃竹子的大貓熊: { species: 'Ailuropoda melanoleuca', takenAt: '2026-04-09T10:20:00+08:00', exif: { ...R5, focalLength: '300mm', aperture: 'f/6.3', shutterSpeed: '1/500s', iso: 1600 } },
  小琉球的綠蠵龜: { species: 'Chelonia mydas', takenAt: '2026-07-03T09:15:00+08:00', exif: { camera: 'OM System TG-7', lens: '4.5-18mm', focalLength: '4.5mm', aperture: 'f/2.0', shutterSpeed: '1/250s', iso: 200 }, precision: 'APPROX' },
  尤加利樹上的無尾熊: { species: 'Phascolarctos cinereus', takenAt: '2025-10-12T15:30:00+10:00', exif: { ...A1, focalLength: '400mm', aperture: 'f/6.3', shutterSpeed: '1/640s', iso: 1000 } },
  樹上午睡的花豹: { species: 'Panthera pardus', takenAt: '2025-09-05T13:10:00+03:00', exif: { ...Z9, focalLength: '600mm', aperture: 'f/6.3', shutterSpeed: '1/2000s', iso: 400 } },
  等待時機的翠鳥: { species: 'Alcedo atthis', takenAt: '2026-02-21T07:05:00+08:00', exif: { ...OM, focalLength: '500mm', aperture: 'f/5.6', shutterSpeed: '1/3200s', iso: 1600 } },
  森林中的大象: { species: 'Elephas maximus', takenAt: '2026-06-14T16:40:00+05:30', exif: { ...A1, focalLength: '250mm', aperture: 'f/5.6', shutterSpeed: '1/800s', iso: 800 } },
  乞力馬札羅山下的象: { species: 'Loxodonta africana', takenAt: '2025-08-26T07:30:00+03:00', exif: { ...R5, focalLength: '135mm', aperture: 'f/8', shutterSpeed: '1/1250s', iso: 400 } },
  犀牛母子: { species: 'Ceratotherium simum', takenAt: '2026-05-19T08:10:00+02:00', exif: { ...Z9, focalLength: '500mm', aperture: 'f/7.1', shutterSpeed: '1/1600s', iso: 800 }, precision: 'APPROX' },
  好奇的浣熊: { species: 'Procyon lotor', takenAt: '2026-09-27T18:45:00-04:00', exif: { ...A1, focalLength: '300mm', aperture: 'f/5.6', shutterSpeed: '1/500s', iso: 3200 } },
  'City fox after the rain': { species: 'Vulpes vulpes', takenAt: '2026-03-14T06:52:00+00:00', exif: { camera: 'Sony α7 IV', lens: 'FE 100-400mm F4.5-5.6 GM OSS', focalLength: '400mm', aperture: 'f/5.6', shutterSpeed: '1/500s', iso: 3200 } },
  'Plains zebra, close and calm': { species: 'Equus quagga', takenAt: '2026-06-02T08:15:00+02:00', exif: { camera: 'Canon EOS R6 Mark II', lens: 'RF100-500mm F4.5-7.1 L IS USM', focalLength: '214mm', aperture: 'f/5.6', shutterSpeed: '1/1000s', iso: 400 } },
  'Tigress on the ridge': { species: 'Panthera tigris', takenAt: '2026-04-11T16:40:00+05:30', exif: { camera: 'Canon EOS R6 Mark II', lens: 'RF100-500mm F4.5-7.1 L IS USM', focalLength: '500mm', aperture: 'f/7.1', shutterSpeed: '1/800s', iso: 1000 }, precision: 'APPROX' },
  黃昏的白尾鹿: { species: 'Odocoileus virginianus', takenAt: '2025-11-08T17:20:00-07:00', exif: { ...R5, focalLength: '400mm', aperture: 'f/7.1', shutterSpeed: '1/800s', iso: 1250 } }
}

const speciesIdByName = async () => {
  const rows = await prisma.species.findMany({ select: { id: true, scientificName: true } })
  return new Map(rows.map((r) => [r.scientificName, r.id]))
}

const photoMetaData = (title: string, speciesIds: Map<string, number>) => {
  const meta = DEMO_PHOTO_META[title]
  if (!meta) return {}
  return {
    speciesId: speciesIds.get(meta.species) ?? null,
    takenAt: new Date(meta.takenAt),
    exif: meta.exif,
    locationPrecision: meta.precision ?? 'EXACT'
  }
}

/** Fills species / takenAt / EXIF on demo photos created before those fields existed. */
async function backfillDemoPhotos() {
  const speciesIds = await speciesIdByName()
  let updated = 0
  for (const title of Object.keys(DEMO_PHOTO_META)) {
    const { count } = await prisma.photoPost.updateMany({
      where: { title, speciesId: null },
      data: photoMetaData(title, speciesIds)
    })
    updated += count
  }
  console.log(`✔ demo photos back-filled: ${updated}`)
}

async function seedDemo(adminId: number) {
  if ((await prisma.photoPost.count()) > 0) {
    console.log('• demo data skipped (database already has content)')
    await backfillDemoPhotos()
    await prisma.user.updateMany({
      where: { email: { in: ['mei@example.com', 'ken@example.com', 'yu@example.com'] } },
      data: { emailVerified: true }
    })
    return
  }
  const speciesIds = await speciesIdByName()
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)
  const users = []
  for (const p of DEMO_PEOPLE) {
    users.push(
      await prisma.user.create({ data: { ...p, interests: tagKeys(p.interests), passwordHash, emailVerified: true } })
    )
  }
  const [mei, ken, yu] = users as [typeof users[0], typeof users[0], typeof users[0]]

  // ── Articles ──
  const articles = [
    {
      title: '在知床半島，與赤狐的十分鐘',
      subtitle: '北海道最東端的荒野，教會我如何安靜地等待',
      cover: '1469474968028-56623f02e42e',
      tags: ['陸生動物', '動物行為', '亞洲', '森林'],
      body: [
        '清晨四點半，知床的霧還沒散。我們沿著海岸線緩慢前進，嚮導忽然停下腳步，指向草叢邊一抹橘紅。',
        '## 保持距離，是對野生動物最好的尊重',
        '赤狐是好奇的動物，但這不代表牠們歡迎打擾。我們全程維持二十公尺以上的距離，使用長焦鏡頭，並且不餵食、不發出聲音引誘。',
        '十分鐘後，牠打了個哈欠，轉身消失在白樺林裡。那是我這輩子最安靜、也最滿足的十分鐘。'
      ]
    },
    {
      title: '野生動物攝影入門：從器材到心態',
      subtitle: '不必一開始就買大砲，先學會讀懂光線與動物',
      cover: '1504870712357-65ea720d6078',
      tags: ['攝影技巧', '野外探險'],
      body: [
        '很多人以為野生動物攝影一定要昂貴的超望遠鏡頭，其實入門最重要的是耐心與觀察。',
        '## 器材：夠用就好',
        '一台對焦快速的機身、一支 100–400mm 的變焦鏡，就能應付大多數情境。比起器材，更重要的是熟悉它，在關鍵瞬間不必低頭看設定。',
        '## 光線：清晨與黃昏',
        '動物在晨昏最活躍，光線也最柔和。正午的頂光會讓毛髮失去層次，並在眼睛周圍形成陰影。',
        '## 心態：動物的福祉永遠優先',
        '如果你的存在讓動物改變了行為——停止進食、警戒、離開——那就是你靠得太近了。'
      ]
    },
    {
      title: '森林正在消失：我們還能做什麼？',
      subtitle: '從日常選擇開始的保育行動',
      cover: '1441974231531-c6227db76b6e',
      tags: ['環境保育', '森林', '全球生態', '嚴重議題'],
      body: [
        '每一分鐘，地球上都有相當於數十個足球場面積的原始森林消失。森林不只是樹，它是無數物種的家。',
        '## 選擇有認證的產品',
        '購買紙製品與木製家具時，留意 FSC 等永續森林認證，是最直接的支持方式。',
        '## 參與公民科學',
        '上傳你的野外觀察紀錄——就像在 WildLens 分享照片與地點——能幫助研究者掌握物種分布的變化。'
      ]
    },
    {
      title: '翠鳥的獵魚瞬間',
      subtitle: '關渡自然公園的晨間觀察筆記',
      cover: '1444464666168-49d633b86797',
      tags: ['鳥類', '溪河湖泊', '奇特行為', '亞洲'],
      body: [
        '翠鳥被稱為「釣魚郎」，牠會停在水邊枝頭，鎖定目標後俯衝入水，整個過程不到一秒。',
        '想拍到這一幕，需要 1/2000 秒以上的快門與連拍，並預先對焦在牠常停留的枝頭下方水面。'
      ]
    },
    {
      title: '沙漠裡的生命力',
      subtitle: '看似荒蕪的紅岩峽谷，其實熱鬧非凡',
      cover: '1500530855697-b586d89ba3ee',
      tags: ['沙漠', '地理風貌', '北美洲', '自然風景'],
      body: [
        '白天的沙漠安靜得令人不安，但入夜後，蜥蜴、狐狸、貓頭鷹與無數昆蟲才真正登場。',
        '## 夜間攝影提醒',
        '使用紅光頭燈以減少對動物的干擾，並避免長時間以閃光燈直射。'
      ]
    }
  ]
  for (const [i, a] of articles.entries()) {
    const url = unsplash(a.cover)
    const article = await prisma.article.create({
      data: {
        title: a.title,
        subtitle: a.subtitle,
        coverImageUrl: url,
        content: delta(...a.body),
        tags: tagKeys(a.tags),
        status: 'PUBLISHED',
        authorId: adminId,
        viewCount: 120 + i * 37,
        publishedAt: daysAgo(i * 4 + 1),
        createdAt: daysAgo(i * 4 + 1)
      }
    })
    await prisma.image.create({ data: { url, publicId: `external:article-${article.id}`, articleId: article.id } })
  }

  // ── Photo posts ──
  const photos = [
    { by: mei, img: ['1474511320723-9a56873867b5', '1516934024742-b461fba47600'], title: '雪地邊的赤狐', place: '日本北海道 知床半島', lat: 44.07, lng: 145.12, desc: '清晨於知床半島海岸遇見的赤狐，逆光下毛色呈橘紅色。個體停留數分鐘後走回森林。' },
    { by: ken, img: ['1546182990-dffeafbe841d'], title: '草原之王', place: '肯亞 馬賽馬拉國家保護區', lat: -1.49, lng: 35.14, desc: '傍晚巡視領地的雄獅，鬃毛被夕陽染成金色。嚮導說牠是這一帶獅群的首領。' },
    { by: mei, img: ['1564349683136-77e08dba1ef7'], title: '專心吃竹子的大貓熊', place: '中國四川 臥龍自然保護區', lat: 31.03, lng: 103.18, desc: '一天要吃十幾公斤竹子的大貓熊，專注的樣子讓人看了心情很好。' },
    { by: yu, img: ['1437622368342-7a3d73a34c8f'], title: '小琉球的綠蠵龜', place: '台灣 屏東 小琉球', lat: 22.34, lng: 120.37, desc: '在小琉球浮潛時遇到的綠蠵龜，請記得與海龜保持至少三公尺距離，不觸摸、不追逐。' },
    { by: yu, img: ['1459262838948-3e2de6c1ec80', '1550358864-518f202c02ba'], title: '尤加利樹上的無尾熊', place: '澳大利亞 昆士蘭 布里斯本', lat: -27.47, lng: 153.02, desc: '無尾熊一天要睡將近二十小時，難得拍到牠醒著抱著樹幹張望。' },
    { by: ken, img: ['1456926631375-92c8ce872def'], title: '樹上午睡的花豹', place: '坦尚尼亞 塞倫蓋提國家公園', lat: -2.33, lng: 34.83, desc: '花豹習慣把獵物拖到樹上，飽餐後就直接在枝幹上午睡。' },
    { by: mei, img: ['1444464666168-49d633b86797'], title: '等待時機的翠鳥', place: '台灣 台北 關渡自然公園', lat: 25.12, lng: 121.47, desc: '在水邊守了兩個小時，終於等到翠鳥停在最喜歡的那根枝頭。' },
    { by: ken, img: ['1549366021-9f761d450615'], title: '森林中的大象', place: '斯里蘭卡 明內里亞國家公園', lat: 8.03, lng: 80.82, desc: '從密林中緩緩走出的大象，耳朵輕輕擺動，非常沉穩。' },
    { by: ken, img: ['1557050543-4d5f4e07ef46'], title: '乞力馬札羅山下的象', place: '肯亞 安博塞利國家公園', lat: -2.65, lng: 37.26, desc: '安博塞利的象群以巨大的象牙聞名，這頭成年公象正朝水源地前進。' },
    { by: yu, img: ['1535338454770-8be927b5a00b'], title: '犀牛母子', place: '南非 克魯格國家公園', lat: -23.99, lng: 31.55, desc: '母犀牛帶著小犀牛在草原上覓食。犀牛仍面臨嚴重的盜獵威脅，每一頭都非常珍貴。' },
    { by: mei, img: ['1497752531616-c3afd9760a11'], title: '好奇的浣熊', place: '加拿大 多倫多 高地公園', lat: 43.65, lng: -79.38, desc: '城市公園裡的浣熊一點都不怕人，但還是請不要餵食野生動物。' },
    { by: yu, img: ['1484406566174-9da000fda645'], title: '黃昏的白尾鹿', place: '美國 黃石國家公園', lat: 44.43, lng: -110.59, desc: '金色時刻的白尾鹿，鹿角在逆光下輪廓分明。' }
  ]
  const photoIds: number[] = []
  for (const [i, p] of photos.entries()) {
    const post = await prisma.photoPost.create({
      data: {
        title: p.title,
        description: p.desc,
        language: detectLanguage(p.title, p.desc),
        locationName: p.place,
        latitude: p.lat,
        longitude: p.lng,
        authorId: p.by.id,
        ...photoMetaData(p.title, speciesIds),
        viewCount: 40 + ((i * 53) % 300),
        createdAt: daysAgo(i * 2)
      }
    })
    photoIds.push(post.id)
    for (const [pos, id] of p.img.entries()) {
      await prisma.image.create({
        data: { url: unsplash(id), publicId: `external:photo-${post.id}-${pos}`, position: pos, photoPostId: post.id, ownerId: p.by.id }
      })
    }
  }

  // ── Community posts ──
  const posts = [
    { by: mei, title: '新手求問：拍鳥要用多快的快門？', tags: ['鳥類', '攝影技巧'], body: '最近開始拍鳥，停棲的時候還好，但一飛起來就全糊了。大家拍飛羽通常用多快的快門呢？' },
    { by: ken, title: '分享：第一次去非洲 safari 的行前準備清單', tags: ['非洲', '野外探險', '草原'], body: '整理了一份清單給想去東非的朋友：防塵袋、豆袋（車上當腳架）、備用電池至少三顆、中性色衣物……歡迎補充！' },
    { by: yu, title: '海龜誤食塑膠：日常可行的減塑做法', tags: ['海洋', '環境保育', '嚴重議題'], body: '海龜誤食塑膠的影像並不少見。日常可行的做法包括自備餐具、參與淨灘、選擇包裝較少的商品；也歡迎分享其他經驗。' },
    { by: mei, title: '台灣有哪些適合觀察野生動物的步道？', tags: ['山林', '亞洲', '陸生動物'], body: '想利用週末去走走，最好是有機會看到台灣獼猴、山羌或藍腹鷴的地方，大家有推薦嗎？' }
  ]
  for (const [i, p] of posts.entries()) {
    await prisma.communityPost.create({
      data: {
        title: p.title,
        content: delta(p.body),
        excerpt: p.body.slice(0, 140),
        tags: tagKeys(p.tags),
        ...(DEMO_POST_BOARDS[p.title] ?? { categoryKey: 'field-reports' }),
        authorId: p.by.id,
        viewCount: 20 + i * 11,
        createdAt: daysAgo(i * 3)
      }
    })
  }

  // ── Polls ──
  const poll1 = await prisma.poll.create({
    data: {
      title: '下一次野外拍攝，最希望記錄到的物種？',
      endsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      authorId: ken.id,
      options: { create: ['雪豹', '藍鯨', '大貓熊', '北極熊'].map((text, position) => ({ text, position })) }
    },
    include: { options: true }
  })
  await prisma.poll.create({
    data: {
      title: '野外攝影時你最常用的焦段？',
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      authorId: mei.id,
      options: { create: ['70–200mm', '100–400mm', '150–600mm', '600mm 以上定焦'].map((text, position) => ({ text, position })) }
    }
  })
  const [o1, o2] = poll1.options
  await prisma.pollBallot.createMany({
    data: [
      { userId: mei.id, pollId: poll1.id, optionId: o1!.id },
      { userId: yu.id, pollId: poll1.id, optionId: o2!.id }
    ]
  })

  // ── Engagement ──
  for (const [i, photoId] of photoIds.entries()) {
    const likers = users.filter((_, j) => (i + j) % 2 === 0)
    await prisma.like.createMany({ data: likers.map((u) => ({ userId: u.id, photoPostId: photoId })) })
  }
  await prisma.comment.createMany({
    data: [
      { content: '光線太美了！請問是用什麼鏡頭拍的？', authorId: ken.id, photoPostId: photoIds[0]! },
      { content: '100–400mm，在車上用豆袋架著拍的～', authorId: mei.id, photoPostId: photoIds[0]! },
      { content: '好想去馬賽馬拉！', authorId: yu.id, photoPostId: photoIds[1]! },
      { content: '牠的表情好療癒 🐼', authorId: ken.id, photoPostId: photoIds[2]! }
    ]
  })
  console.log(`✔ demo data: ${users.length} users, ${articles.length} articles, ${photos.length} photos, ${posts.length} posts, 2 polls`)
  console.log('  demo user password: wildlens123')
}

/**
 * Demo forum: puts the original demo posts on their boards, then adds the demo threads
 * (with replies, nested replies, likes and an accepted answer) that don't exist yet.
 */
async function seedForum(adminId: number) {
  for (const [title, board] of Object.entries(DEMO_POST_BOARDS)) {
    await prisma.communityPost.updateMany({ where: { title, categoryKey: 'field-reports' }, data: board })
  }
  // Demo accounts may have been deleted (e.g. while testing account deletion): restore them.
  const ids: Partial<Record<Who, number>> = { admin: adminId }
  let restored = 0
  for (const person of DEMO_PEOPLE) {
    const existing = await prisma.user.findUnique({ where: { email: person.email }, select: { id: true } })
    const user =
      existing ??
      (await prisma.user.create({
        data: { ...person, interests: tagKeys(person.interests), passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12), emailVerified: true },
        select: { id: true }
      }))
    if (!existing) restored++
    ids[person.email.split('@')[0] as Who] = user.id
  }
  if (restored) console.log(`✔ demo users restored: ${restored}`)
  const uid = (who: Who) => ids[who]!
  const hours = (base: Date, h: number) => new Date(base.getTime() + h * 60 * 60 * 1000)

  let created = 0
  for (const t of THREADS) {
    if (await prisma.communityPost.findFirst({ where: { title: t.title }, select: { id: true } })) continue
    const createdAt = daysAgo(t.daysAgo)
    const text = t.body.filter((b) => !b.startsWith('## ')).join(' ')
    const post = await prisma.communityPost.create({
      data: {
        title: t.title,
        content: delta(...t.body),
        excerpt: text.length > 140 ? `${text.slice(0, 140)}…` : text,
        language: detectLanguage(t.title, text),
        tags: tagKeys(t.tags),
        categoryKey: t.board,
        type: t.type ?? 'DISCUSSION',
        pinned: t.pinned ?? false,
        authorId: uid(t.by),
        viewCount: t.views,
        createdAt,
        lastActivityAt: createdAt
      }
    })
    await prisma.like.createMany({ data: t.likes.map((who) => ({ userId: uid(who), communityPostId: post.id })) })

    let last = createdAt
    let acceptedId: number | null = null
    const addComment = async (r: { by: Who; text: string; at: number; likes?: Who[] }, parentId: number | null) => {
      const at = hours(createdAt, r.at)
      if (at > last) last = at
      const c = await prisma.comment.create({
        data: { content: r.text, authorId: uid(r.by), communityPostId: post.id, parentId, createdAt: at }
      })
      if (r.likes?.length) await prisma.like.createMany({ data: r.likes.map((who) => ({ userId: uid(who), commentId: c.id })) })
      return c.id
    }
    for (const r of t.replies) {
      const id = await addComment(r, null)
      if (r.accepted) acceptedId = id
      for (const child of r.replies ?? []) await addComment(child, id)
    }
    await prisma.communityPost.update({ where: { id: post.id }, data: { lastActivityAt: last, acceptedCommentId: acceptedId } })
    created++
  }
  console.log(`✔ demo forum threads added: ${created}`)
}

/** The original zh-TW demo photos, used to restore ones that were deleted (matched by title). */
const RESTORABLE_PHOTOS = [
  { by: 'mei', img: ['1474511320723-9a56873867b5', '1516934024742-b461fba47600'], title: '雪地邊的赤狐', place: '日本北海道 知床半島', lat: 44.07, lng: 145.12, desc: '清晨於知床半島海岸遇見的赤狐，逆光下毛色呈橘紅色。個體停留數分鐘後走回森林。' },
  { by: 'ken', img: ['1546182990-dffeafbe841d'], title: '草原之王', place: '肯亞 馬賽馬拉國家保護區', lat: -1.49, lng: 35.14, desc: '傍晚巡視領地的雄獅，鬃毛被夕陽染成金色。嚮導說牠是這一帶獅群的首領。' },
  { by: 'mei', img: ['1564349683136-77e08dba1ef7'], title: '專心吃竹子的大貓熊', place: '中國四川 臥龍自然保護區', lat: 31.03, lng: 103.18, desc: '一天要吃十幾公斤竹子的大貓熊，專注的樣子讓人看了心情很好。' },
  { by: 'mei', img: ['1444464666168-49d633b86797'], title: '等待時機的翠鳥', place: '台灣 台北 關渡自然公園', lat: 25.12, lng: 121.47, desc: '在水邊守了兩個小時，終於等到翠鳥停在最喜歡的那根枝頭。' },
  { by: 'mei', img: ['1497752531616-c3afd9760a11'], title: '好奇的浣熊', place: '加拿大 多倫多 高地公園', lat: 43.65, lng: -79.38, desc: '城市公園裡的浣熊一點都不怕人，但還是請不要餵食野生動物。' }
]

/**
 * Bilingual demo content (idempotent, matched by title):
 * English versions of the editorial articles linked as translations, photos and a poll
 * from the English-speaking members, cross-language comments, and any original demo
 * photos that are missing.
 */
async function seedInternational() {
  const people = await prisma.user.findMany({
    where: { email: { in: DEMO_PEOPLE.map((p) => p.email) } },
    select: { id: true, email: true }
  })
  const uid = (who: string) => {
    const u = people.find((p) => p.email === `${who}@example.com`)
    if (!u) throw new Error(`demo user missing: ${who}`)
    return u.id
  }

  // Article translations
  let translated = 0
  for (const tr of ARTICLE_TRANSLATIONS) {
    if (await prisma.article.findFirst({ where: { title: tr.title }, select: { id: true } })) continue
    const source = await prisma.article.findFirst({ where: { title: tr.source, locale: 'zh-TW' } })
    if (!source) continue
    const group = source.translationGroup ?? randomUUID()
    if (!source.translationGroup) await prisma.article.update({ where: { id: source.id }, data: { translationGroup: group } })
    const article = await prisma.article.create({
      data: {
        title: tr.title,
        subtitle: tr.subtitle,
        coverImageUrl: source.coverImageUrl,
        content: delta(...tr.body),
        tags: source.tags,
        status: source.status,
        locale: 'en',
        translationGroup: group,
        authorId: source.authorId,
        viewCount: Math.round(source.viewCount * 0.6),
        publishedAt: source.publishedAt,
        createdAt: source.createdAt
      }
    })
    await prisma.image.create({ data: { url: source.coverImageUrl, publicId: `external:article-${article.id}`, articleId: article.id } })
    translated++
  }

  // Photos: English members' photos + restore missing originals
  const speciesIds = await speciesIdByName()
  let photos = 0
  const all = [...RESTORABLE_PHOTOS, ...EN_PHOTOS.map((p) => ({ ...p }))]
  for (const [i, p] of all.entries()) {
    if (await prisma.photoPost.findFirst({ where: { title: p.title }, select: { id: true } })) continue
    const authorId = uid(p.by)
    const post = await prisma.photoPost.create({
      data: {
        title: p.title,
        description: p.desc,
        language: detectLanguage(p.title, p.desc),
        locationName: p.place,
        latitude: p.lat,
        longitude: p.lng,
        authorId,
        ...photoMetaData(p.title, speciesIds),
        viewCount: 60 + ((i * 47) % 240),
        createdAt: daysAgo(1 + i * 2)
      }
    })
    for (const [pos, id] of p.img.entries()) {
      await prisma.image.create({
        data: { url: unsplash(id), publicId: `external:photo-${post.id}-${pos}`, position: pos, photoPostId: post.id, ownerId: authorId }
      })
    }
    const likers = people.filter((u) => u.id !== authorId).slice(0, 2 + (i % 3))
    await prisma.like.createMany({ data: likers.map((u) => ({ userId: u.id, photoPostId: post.id })), skipDuplicates: true })
    photos++
  }

  // Cross-language comments
  for (const c of EN_PHOTO_COMMENTS) {
    const photo = await prisma.photoPost.findFirst({ where: { title: c.photo }, select: { id: true } })
    if (!photo) continue
    const exists = await prisma.comment.findFirst({ where: { photoPostId: photo.id, content: c.text }, select: { id: true } })
    if (!exists) await prisma.comment.create({ data: { content: c.text, authorId: uid(c.by), photoPostId: photo.id } })
  }

  // English poll
  if (!(await prisma.poll.findFirst({ where: { title: EN_POLL.title }, select: { id: true } }))) {
    const poll = await prisma.poll.create({
      data: {
        title: EN_POLL.title,
        description: EN_POLL.description,
        endsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        authorId: uid(EN_POLL.by),
        options: { create: EN_POLL.options.map((text, position) => ({ text, position })) }
      },
      include: { options: true }
    })
    await prisma.pollBallot.createMany({
      data: [
        { userId: uid('lena'), pollId: poll.id, optionId: poll.options[0]!.id },
        { userId: uid('ken'), pollId: poll.id, optionId: poll.options[1]!.id },
        { userId: uid('mei'), pollId: poll.id, optionId: poll.options[0]!.id }
      ]
    })
  }
  console.log(`✔ bilingual demo content: ${translated} article translations, ${photos} photos`)
}

/**
 * Grades photos that have no identifications yet (see src/modules/photos/quality.ts:
 * with only the author's vote a photo is never CONFIRMED).
 */
async function gradeUnidentifiedPhotos() {
  // The app's own rule, so captive animals and imported records are graded the same way as on upload.
  const ids = (await prisma.photoPost.findMany({ select: { id: true } })).map((p) => p.id)
  await refreshQuality(...ids)
}

async function main() {
  const admin = await ensureAdmin()
  await seedSpecies()
  await seedCategories()
  await seedGear(prisma)
  await seedPlaces()
  await applyTaxonomy()
  await applySpeciesTexts()
  console.log(`✔ tags mapped to the current catalogue: ${await backfillTags()} rows updated`)
  if (process.argv.includes('--demo')) {
    await correctDemoContent(prisma)
    await seedDemo(admin.id)
    await seedForum(admin.id)
    await seedInternational()
    const people = await prisma.user.findMany({ where: { email: { in: DEMO_PEOPLE.map((p) => p.email) } }, select: { id: true, email: true } })
    const uid = (who: string) => {
      const u = people.find((p) => p.email === `${who}@example.com`)
      if (!u) throw new Error(`demo user missing: ${who}`)
      return u.id
    }
    await seedCommunityV3(prisma, uid)
    await calibrateDemoPhotos()
    await seedDemoOutings()
    await gradeUnidentifiedPhotos()
  }
  const linked = await relinkPhotoGear()
  console.log(`✔ photo gear links: ${linked.updated} updated of ${linked.checked}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => Promise.all([prisma.$disconnect(), appPrisma.$disconnect()]))
