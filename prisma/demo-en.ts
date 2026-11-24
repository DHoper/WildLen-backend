/**
 * English demo content: translations of the editorial articles, plus photos and a poll
 * from English-speaking demo members (their forum threads live in forum-data.ts).
 * Everything here is inserted idempotently (matched by title).
 */

export interface ArticleTranslationSeed {
  /** Title of the zh-TW article this translates. */
  source: string
  title: string
  subtitle: string
  body: string[]
}

export const ARTICLE_TRANSLATIONS: ArticleTranslationSeed[] = [
  {
    source: '在知床半島，與赤狐的十分鐘',
    title: 'Ten Minutes with a Red Fox in Shiretoko',
    subtitle: 'The wild northeastern tip of Hokkaido taught me how to wait quietly',
    body: [
      'At half past four in the morning the fog over Shiretoko still hadn’t lifted. We were moving slowly along the coastline when our guide stopped and pointed to a flash of orange at the edge of the grass.',
      '## Distance is the best respect you can show',
      'Red foxes are curious animals, but that doesn’t mean they welcome company. We stayed more than twenty metres away the whole time, worked with long lenses, and never fed or called to it.',
      'Ten minutes later it yawned, turned, and vanished into the birch forest. They were the quietest — and most satisfying — ten minutes of my life.'
    ]
  },
  {
    source: '野生動物攝影入門：從器材到心態',
    title: 'Getting Started in Wildlife Photography: Gear and Mindset',
    subtitle: 'You don’t need a giant lens on day one — learn to read light and animals first',
    body: [
      'Many people assume wildlife photography demands an expensive super-telephoto. In reality, patience and observation matter far more when you are starting out.',
      '## Gear: good enough is good enough',
      'A body with fast autofocus and a 100–400mm zoom will handle most situations. More important than the gear itself is knowing it well, so you never have to look down at your settings when the moment comes.',
      '## Light: dawn and dusk',
      'Animals are most active early and late in the day, and that is when the light is softest. Harsh midday light flattens fur and throws shadows around the eyes.',
      '## Mindset: the animal’s welfare always comes first',
      'If your presence changes an animal’s behaviour — it stops feeding, becomes alert or moves away — you are too close.'
    ]
  },
  {
    source: '森林正在消失：我們還能做什麼？',
    title: 'Our Forests Are Disappearing. What Can We Still Do?',
    subtitle: 'Conservation that starts with everyday choices',
    body: [
      'Every minute, primary forest the size of dozens of football pitches disappears from the planet. A forest is more than trees — it is home to countless species.',
      '## Choose certified products',
      'Looking for sustainable-forestry certifications such as FSC when you buy paper or wooden furniture is the most direct way to help.',
      '## Take part in citizen science',
      'Sharing your field observations — the way you share photos and locations on WildLens — helps researchers track how species distributions are changing.'
    ]
  },
  {
    source: '翠鳥的獵魚瞬間',
    title: 'The Kingfisher’s Strike',
    subtitle: 'Morning field notes from Guandu Nature Park',
    body: [
      'Kingfishers perch on a waterside branch, lock on to a fish, and dive — the whole strike is over in less than a second.',
      'To catch it you need a shutter speed of 1/2000 s or faster and burst mode, with focus pre-set on the water just below its favourite perch.'
    ]
  },
  {
    source: '沙漠裡的生命力',
    title: 'Life in the Desert',
    subtitle: 'The red-rock canyons look empty — they are anything but',
    body: [
      'By day the desert is unsettlingly quiet. After dark, lizards, foxes, owls and countless insects take the stage.',
      '## A note on night photography',
      'Use a red headlamp to keep disturbance to a minimum, and avoid firing a flash straight at animals for long periods.'
    ]
  }
]

export interface PhotoSeed {
  by: string
  img: string[]
  title: string
  place: string
  lat: number
  lng: number
  desc: string
  species: string
  takenAt: string
  exif: Record<string, string | number>
}

export const EN_PHOTOS: PhotoSeed[] = [
  {
    by: 'sam',
    img: ['1557008075-7f2c5efa4cfd'],
    title: 'City fox after the rain',
    place: 'Bristol, United Kingdom',
    lat: 51.45,
    lng: -2.59,
    desc: 'This vixen has been crossing the same allotments at dawn for weeks. I sat on an upturned crate twenty metres off and let her decide how close to come.',
    species: 'Vulpes vulpes',
    takenAt: '2026-03-14T06:52:00+00:00',
    exif: { camera: 'Sony α7 IV', lens: 'FE 100-400mm F4.5-5.6 GM OSS', focalLength: '400mm', aperture: 'f/5.6', shutterSpeed: '1/500s', iso: 3200 }
  },
  {
    by: 'lena',
    img: ['1501706362039-c06b2d715385'],
    title: 'Plains zebra, close and calm',
    place: 'Kruger National Park, South Africa',
    lat: -24.39,
    lng: 31.77,
    desc: 'Converted to black and white because the stripes deserve it. The herd was grazing next to the S100 and completely ignored our vehicle.',
    species: 'Equus quagga',
    takenAt: '2026-06-02T08:15:00+02:00',
    exif: { camera: 'Canon EOS R6 Mark II', lens: 'RF100-500mm F4.5-7.1 L IS USM', focalLength: '214mm', aperture: 'f/5.6', shutterSpeed: '1/1000s', iso: 400 }
  },
  {
    by: 'lena',
    img: ['1549480017-d76466a4b7e8'],
    title: 'Tigress on the ridge',
    place: 'Rajasthan, India',
    lat: 26.02,
    lng: 76.5,
    desc: 'She walked out of the ravine, paused on the rocks for maybe fifteen seconds, and was gone. Exact location withheld — tigers are a sensitive species on WildLens.',
    species: 'Panthera tigris',
    takenAt: '2026-04-11T16:40:00+05:30',
    exif: { camera: 'Canon EOS R6 Mark II', lens: 'RF100-500mm F4.5-7.1 L IS USM', focalLength: '500mm', aperture: 'f/7.1', shutterSpeed: '1/800s', iso: 1000 }
  }
]

/** Cross-language comments on demo photos (by photo title). */
export const EN_PHOTO_COMMENTS: { photo: string; by: string; text: string }[] = [
  { photo: '雪地邊的赤狐', by: 'sam', text: 'Gorgeous backlight. Same species as my Bristol fox, but this one looks far better fed!' },
  { photo: 'City fox after the rain', by: 'mei', text: '好美的晨光！Love how calm she looks.' },
  { photo: 'Plains zebra, close and calm', by: 'ken', text: 'The B&W conversion works so well here. Which camp were you staying at?' },
  { photo: 'Tigress on the ridge', by: 'yu', text: 'Thank you for keeping the location private 🙏' }
]

export const EN_POLL = {
  by: 'sam',
  title: 'What do you use to keep your gear dry in the field?',
  description: 'Rain covers, plastic bags, an umbrella clamp… what actually works for you?',
  options: ['Dedicated rain cover', 'Plastic bag + rubber band', 'Umbrella clamp', 'I just shoot and dry it later']
}
