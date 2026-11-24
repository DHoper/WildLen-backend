/**
 * Gear catalogue seed: bodies, lenses and teleconverters common in wildlife photography.
 * Specs follow the manufacturers' published figures (weights without tripod collar
 * where the maker lists both). `aliases` are extra EXIF strings; the brand + model
 * name itself is always matched too (see src/modules/gear/normalize.ts).
 */
import type { GearType } from '@prisma/client'

export interface GearSeed {
  type: GearType
  brand: string
  model: string
  mount: string
  focal?: [number, number]
  aperture?: [number, number]
  magnification?: number
  sensor?: string
  megapixels?: number
  maxFps?: number
  weightG: number
  year: number
  aliases?: string[]
}

const FF = 'Full frame'
const APSC = 'APS-C'
const M43 = 'Micro Four Thirds'

export const GEAR: GearSeed[] = [
  // ── Bodies ──
  { type: 'CAMERA', brand: 'Canon', model: 'EOS R5', mount: 'Canon RF', sensor: FF, megapixels: 45, maxFps: 20, weightG: 738, year: 2020 },
  { type: 'CAMERA', brand: 'Canon', model: 'EOS R5 Mark II', mount: 'Canon RF', sensor: FF, megapixels: 45, maxFps: 30, weightG: 746, year: 2024 },
  { type: 'CAMERA', brand: 'Canon', model: 'EOS R6 Mark II', mount: 'Canon RF', sensor: FF, megapixels: 24.2, maxFps: 40, weightG: 670, year: 2022 },
  { type: 'CAMERA', brand: 'Canon', model: 'EOS R7', mount: 'Canon RF', sensor: APSC, megapixels: 32.5, maxFps: 30, weightG: 612, year: 2022 },
  { type: 'CAMERA', brand: 'Canon', model: 'EOS R3', mount: 'Canon RF', sensor: FF, megapixels: 24.1, maxFps: 30, weightG: 1015, year: 2021 },
  { type: 'CAMERA', brand: 'Nikon', model: 'Z9', mount: 'Nikon Z', sensor: FF, megapixels: 45.7, maxFps: 20, weightG: 1340, year: 2021, aliases: ['NIKON Z 9'] },
  { type: 'CAMERA', brand: 'Nikon', model: 'Z8', mount: 'Nikon Z', sensor: FF, megapixels: 45.7, maxFps: 20, weightG: 910, year: 2023, aliases: ['NIKON Z 8'] },
  { type: 'CAMERA', brand: 'Nikon', model: 'Z6III', mount: 'Nikon Z', sensor: FF, megapixels: 24.5, maxFps: 20, weightG: 760, year: 2024, aliases: ['NIKON Z6_3', 'Nikon Z6 III'] },
  { type: 'CAMERA', brand: 'Nikon', model: 'D500', mount: 'Nikon F', sensor: APSC, megapixels: 20.9, maxFps: 10, weightG: 860, year: 2016 },
  { type: 'CAMERA', brand: 'Sony', model: 'α1', mount: 'Sony E', sensor: FF, megapixels: 50.1, maxFps: 30, weightG: 737, year: 2021, aliases: ['ILCE-1', 'Sony Alpha 1'] },
  { type: 'CAMERA', brand: 'Sony', model: 'α9 III', mount: 'Sony E', sensor: FF, megapixels: 24.6, maxFps: 120, weightG: 702, year: 2023, aliases: ['ILCE-9M3'] },
  { type: 'CAMERA', brand: 'Sony', model: 'α7 IV', mount: 'Sony E', sensor: FF, megapixels: 33, maxFps: 10, weightG: 658, year: 2021, aliases: ['ILCE-7M4'] },
  { type: 'CAMERA', brand: 'Sony', model: 'α6700', mount: 'Sony E', sensor: APSC, megapixels: 26, maxFps: 11, weightG: 493, year: 2023, aliases: ['ILCE-6700'] },
  { type: 'CAMERA', brand: 'OM System', model: 'OM-1', mount: 'Micro Four Thirds', sensor: M43, megapixels: 20.4, maxFps: 120, weightG: 599, year: 2022 },
  { type: 'CAMERA', brand: 'OM System', model: 'OM-1 Mark II', mount: 'Micro Four Thirds', sensor: M43, megapixels: 20.4, maxFps: 120, weightG: 599, year: 2024 },
  { type: 'CAMERA', brand: 'OM System', model: 'TG-7', mount: 'Fixed lens', sensor: '1/2.33"', megapixels: 12, maxFps: 20, weightG: 249, year: 2023 },
  { type: 'CAMERA', brand: 'Fujifilm', model: 'X-H2S', mount: 'Fujifilm X', sensor: APSC, megapixels: 26.1, maxFps: 40, weightG: 660, year: 2022 },

  // ── Lenses: Canon RF ──
  { type: 'LENS', brand: 'Canon', model: 'RF 100-500mm F4.5-7.1 L IS USM', mount: 'Canon RF', focal: [100, 500], aperture: [4.5, 7.1], weightG: 1370, year: 2020 },
  { type: 'LENS', brand: 'Canon', model: 'RF 200-800mm F6.3-9 IS USM', mount: 'Canon RF', focal: [200, 800], aperture: [6.3, 9], weightG: 2050, year: 2023 },
  { type: 'LENS', brand: 'Canon', model: 'RF 100-400mm F5.6-8 IS USM', mount: 'Canon RF', focal: [100, 400], aperture: [5.6, 8], weightG: 635, year: 2021 },
  { type: 'LENS', brand: 'Canon', model: 'RF 600mm F11 IS STM', mount: 'Canon RF', focal: [600, 600], aperture: [11, 11], weightG: 930, year: 2020 },
  { type: 'LENS', brand: 'Canon', model: 'RF 800mm F11 IS STM', mount: 'Canon RF', focal: [800, 800], aperture: [11, 11], weightG: 1260, year: 2020 },
  { type: 'LENS', brand: 'Canon', model: 'RF 600mm F4 L IS USM', mount: 'Canon RF', focal: [600, 600], aperture: [4, 4], weightG: 3090, year: 2021 },

  // ── Lenses: Nikon ──
  { type: 'LENS', brand: 'Nikon', model: 'NIKKOR Z 180-600mm f/5.6-6.3 VR', mount: 'Nikon Z', focal: [180, 600], aperture: [5.6, 6.3], weightG: 2140, year: 2023 },
  { type: 'LENS', brand: 'Nikon', model: 'NIKKOR Z 100-400mm f/4.5-5.6 VR S', mount: 'Nikon Z', focal: [100, 400], aperture: [4.5, 5.6], weightG: 1355, year: 2021 },
  { type: 'LENS', brand: 'Nikon', model: 'NIKKOR Z 400mm f/4.5 VR S', mount: 'Nikon Z', focal: [400, 400], aperture: [4.5, 4.5], weightG: 1245, year: 2022 },
  { type: 'LENS', brand: 'Nikon', model: 'NIKKOR Z 600mm f/6.3 VR S', mount: 'Nikon Z', focal: [600, 600], aperture: [6.3, 6.3], weightG: 1470, year: 2023 },
  { type: 'LENS', brand: 'Nikon', model: 'NIKKOR Z 800mm f/6.3 VR S', mount: 'Nikon Z', focal: [800, 800], aperture: [6.3, 6.3], weightG: 2385, year: 2022 },
  { type: 'LENS', brand: 'Nikon', model: 'AF-S NIKKOR 200-500mm f/5.6E ED VR', mount: 'Nikon F', focal: [200, 500], aperture: [5.6, 5.6], weightG: 2300, year: 2015 },
  { type: 'LENS', brand: 'Nikon', model: 'AF-S NIKKOR 500mm f/5.6E PF ED VR', mount: 'Nikon F', focal: [500, 500], aperture: [5.6, 5.6], weightG: 1460, year: 2018 },

  // ── Lenses: Sony E ──
  { type: 'LENS', brand: 'Sony', model: 'FE 200-600mm F5.6-6.3 G OSS', mount: 'Sony E', focal: [200, 600], aperture: [5.6, 6.3], weightG: 2115, year: 2019, aliases: ['SEL200600G'] },
  { type: 'LENS', brand: 'Sony', model: 'FE 100-400mm F4.5-5.6 GM OSS', mount: 'Sony E', focal: [100, 400], aperture: [4.5, 5.6], weightG: 1395, year: 2016, aliases: ['SEL100400GM'] },
  { type: 'LENS', brand: 'Sony', model: 'FE 400-800mm F6.3-8 G OSS', mount: 'Sony E', focal: [400, 800], aperture: [6.3, 8], weightG: 2475, year: 2025, aliases: ['SEL400800G'] },
  { type: 'LENS', brand: 'Sony', model: 'FE 600mm F4 GM OSS', mount: 'Sony E', focal: [600, 600], aperture: [4, 4], weightG: 3040, year: 2019, aliases: ['SEL600F40GM'] },
  { type: 'LENS', brand: 'Sony', model: 'FE 70-200mm F2.8 GM OSS II', mount: 'Sony E', focal: [70, 200], aperture: [2.8, 2.8], weightG: 1045, year: 2021, aliases: ['SEL70200GM2'] },

  // ── Lenses: OM System / Olympus ──
  { type: 'LENS', brand: 'OM System', model: 'M.Zuiko Digital ED 150-400mm F4.5 TC1.25x IS PRO', mount: 'Micro Four Thirds', focal: [150, 400], aperture: [4.5, 4.5], weightG: 1875, year: 2021, aliases: ['M.Zuiko 150-400mm F4.5 TC1.25x IS PRO', 'OLYMPUS M.150-400mm F4.5 TC1.25x IS PRO'] },
  { type: 'LENS', brand: 'OM System', model: 'M.Zuiko Digital ED 300mm F4.0 IS PRO', mount: 'Micro Four Thirds', focal: [300, 300], aperture: [4, 4], weightG: 1270, year: 2016, aliases: ['OLYMPUS M.300mm F4.0'] },
  { type: 'LENS', brand: 'OM System', model: 'M.Zuiko Digital ED 100-400mm F5.0-6.3 IS', mount: 'Micro Four Thirds', focal: [100, 400], aperture: [5, 6.3], weightG: 1120, year: 2020, aliases: ['OLYMPUS M.100-400mm F5.0-6.3'] },

  // ── Lenses: Fujifilm ──
  { type: 'LENS', brand: 'Fujifilm', model: 'XF150-600mmF5.6-8 R LM OIS WR', mount: 'Fujifilm X', focal: [150, 600], aperture: [5.6, 8], weightG: 1605, year: 2022 },
  { type: 'LENS', brand: 'Fujifilm', model: 'XF100-400mmF4.5-5.6 R LM OIS WR', mount: 'Fujifilm X', focal: [100, 400], aperture: [4.5, 5.6], weightG: 1375, year: 2016 },

  // ── Lenses: third party ──
  { type: 'LENS', brand: 'Sigma', model: '150-600mm F5-6.3 DG DN OS | Sports', mount: 'Sony E / L-Mount', focal: [150, 600], aperture: [5, 6.3], weightG: 2100, year: 2021, aliases: ['150-600mm F5-6.3 DG DN OS | Sports 021'] },
  { type: 'LENS', brand: 'Sigma', model: '60-600mm F4.5-6.3 DG DN OS | Sports', mount: 'Sony E / L-Mount', focal: [60, 600], aperture: [4.5, 6.3], weightG: 2495, year: 2023 },
  { type: 'LENS', brand: 'Tamron', model: '150-500mm F/5-6.7 Di III VC VXD', mount: 'Sony E', focal: [150, 500], aperture: [5, 6.7], weightG: 1725, year: 2021, aliases: ['A057'] },
  { type: 'LENS', brand: 'Tamron', model: '50-400mm F/4.5-6.3 Di III VC VXD', mount: 'Sony E', focal: [50, 400], aperture: [4.5, 6.3], weightG: 1155, year: 2022, aliases: ['A067'] },

  // ── Teleconverters ──
  { type: 'TELECONVERTER', brand: 'Canon', model: 'Extender RF 1.4x', mount: 'Canon RF', magnification: 1.4, weightG: 225, year: 2020 },
  { type: 'TELECONVERTER', brand: 'Canon', model: 'Extender RF 2x', mount: 'Canon RF', magnification: 2, weightG: 340, year: 2020 },
  { type: 'TELECONVERTER', brand: 'Nikon', model: 'Z TELECONVERTER TC-1.4x', mount: 'Nikon Z', magnification: 1.4, weightG: 190, year: 2020 },
  { type: 'TELECONVERTER', brand: 'Sony', model: 'FE 1.4x Teleconverter', mount: 'Sony E', magnification: 1.4, weightG: 167, year: 2016, aliases: ['SEL14TC'] },
  { type: 'TELECONVERTER', brand: 'OM System', model: 'M.Zuiko Digital 2x Teleconverter MC-20', mount: 'Micro Four Thirds', magnification: 2, weightG: 150, year: 2019, aliases: ['MC-20'] }
]

export { gearSlug } from '../src/modules/gear/normalize'
