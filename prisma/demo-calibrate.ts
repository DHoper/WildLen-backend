/**
 * Demo layer: corrections to the kept Unsplash demo photos (redesign v4 §5).
 *
 * - Species that can't be confirmed from the picture go back to "needs ID".
 * - Animals that are clearly captive are flagged.
 * - Records of sensitive species get blurred locations (same rule as uploads).
 * - Photos inside a curated place are attached to it, when the record may be tied to a place.
 *
 * Idempotent; keyed by title (old and new titles are both recognised).
 */
import { prisma } from '../src/lib/prisma'
import { refreshQuality } from '../src/modules/photos/quality'
import { effectivePrecision } from '../src/modules/photos/location'
import { exposesPlace } from '../src/modules/places/privacy'
import { placesAt } from '../src/modules/places/refs'

/** Species label not supported by the photo. Optional new title/description where the old one named the species. */
const UNCERTAIN: { titles: string[]; title?: string; description?: string }[] = [
  {
    titles: ['小琉球的綠蠵龜', '小琉球浮潛時遇到的海龜'],
    title: '小琉球浮潛時遇到的海龜',
    description: '在小琉球浮潛時遇到的海龜。種類還需要確認，歡迎協助鑑定。請與海龜保持至少三公尺距離，不觸摸、不追逐。'
  },
  // Ear shape suggests an African elephant, but the record says Sri Lanka.
  { titles: ['森林中的大象'] },
  // Head and lip shape look like a black rhino rather than the white rhino it was labelled as.
  { titles: ['犀牛母子'] }
]

/** Clearly captive: breeding centre, sanctuary, or an enclosure fence in frame. */
const CAPTIVE = ['專心吃竹子的大貓熊', '尤加利樹上的無尾熊', '樹上午睡的花豹']

export async function calibrateDemoPhotos() {
  const touched: number[] = []
  for (const u of UNCERTAIN) {
    const rows = await prisma.photoPost.findMany({ where: { title: { in: u.titles }, sourceName: null }, select: { id: true } })
    for (const r of rows) {
      await prisma.photoPost.update({ where: { id: r.id }, data: { speciesId: null, ...(u.title && { title: u.title }), ...(u.description && { description: u.description }) } })
      touched.push(r.id)
    }
  }
  const captive = await prisma.photoPost.findMany({ where: { title: { in: CAPTIVE }, sourceName: null }, select: { id: true } })
  await prisma.photoPost.updateMany({ where: { id: { in: captive.map((c) => c.id) } }, data: { captive: true, placeId: null } })
  touched.push(...captive.map((c) => c.id))

  // Location rule for sensitive species, then places
  const demo = await prisma.photoPost.findMany({
    where: { sourceName: null, author: { email: { endsWith: '@example.com' } } },
    select: { id: true, latitude: true, longitude: true, locationPrecision: true, captive: true, placeId: true, species: { select: { sensitive: true } } }
  })
  let blurred = 0
  let placed = 0
  for (const p of demo) {
    const locationPrecision = effectivePrecision(p.locationPrecision, p.species)
    const inside = (await placesAt(p.latitude, p.longitude)).find((pl) => pl.status === 'CURATED' && pl.distanceKm <= pl.radiusM / 1000)
    const placeId = inside && exposesPlace({ ...p, locationPrecision }) ? inside.id : null
    if (locationPrecision !== p.locationPrecision || placeId !== p.placeId) {
      await prisma.photoPost.update({ where: { id: p.id }, data: { locationPrecision, placeId } })
      touched.push(p.id)
      if (locationPrecision !== p.locationPrecision) blurred++
      if (placeId && placeId !== p.placeId) placed++
    }
  }
  touched.push(...(await seedDemoIdentifications()))
  await refreshQuality(...touched)
  console.log(`✔ demo photos calibrated: ${UNCERTAIN.length} back to needs-ID, ${captive.length} captive, ${blurred} blurred, ${placed} attached to places`)
}

/**
 * Identifications between demo members on demo photos only (never on imported records):
 * second opinions on photos whose species is clear from the picture, and two open cases
 * where members disagree.
 */
const DEMO_IDS: { title: string; by: string; species: string; comment?: string }[] = [
  { title: '雪地邊的赤狐', by: 'sam', species: 'Vulpes vulpes' },
  { title: '等待時機的翠鳥', by: 'yu', species: 'Alcedo atthis', comment: '橘色腹部與藍綠色背羽，嘴全黑，為雄鳥。' },
  { title: '草原之王', by: 'lena', species: 'Panthera leo' },
  { title: 'Plains zebra, close and calm', by: 'ken', species: 'Equus quagga', comment: 'Broad stripes reaching under the belly: plains zebra rather than Grévy’s.' },
  { title: '好奇的浣熊', by: 'sam', species: 'Procyon lotor' },
  // Open cases
  { title: '森林中的大象', by: 'lena', species: 'Loxodonta africana', comment: 'The large ears reaching below the jaw and the concave back look African, not Asian.' },
  { title: '森林中的大象', by: 'yu', species: 'Elephas maximus', comment: '拍攝地記錄在斯里蘭卡，那裡只有亞洲象；需要原始照片的 EXIF 或地點才能確認。' },
  { title: '小琉球浮潛時遇到的海龜', by: 'mei', species: 'Chelonia mydas', comment: '小琉球最常見的是綠蠵龜，但這張看不清楚嘴喙形狀。' }
]

async function seedDemoIdentifications() {
  const touched: number[] = []
  for (const d of DEMO_IDS) {
    const [photo, user, species] = await Promise.all([
      prisma.photoPost.findFirst({ where: { title: d.title, sourceName: null }, select: { id: true, authorId: true } }),
      prisma.user.findUnique({ where: { email: `${d.by}@example.com` }, select: { id: true } }),
      prisma.species.findUnique({ where: { scientificName: d.species }, select: { id: true } })
    ])
    if (!photo || !user || !species || photo.authorId === user.id) continue
    await prisma.identification.upsert({
      where: { photoPostId_userId: { photoPostId: photo.id, userId: user.id } },
      create: { photoPostId: photo.id, userId: user.id, speciesId: species.id, comment: d.comment ?? null },
      update: { speciesId: species.id, comment: d.comment ?? null }
    })
    touched.push(photo.id)
  }
  return touched
}
