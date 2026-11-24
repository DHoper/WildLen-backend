/**
 * Base data: order and family of every catalogue species, from prisma/data/inat-taxonomy.json
 * (written by `scripts/import-inat.ts taxonomy`). Offline and idempotent; names fall back to
 * the scientific name when no translation exists.
 */
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../src/lib/prisma'
import { RANK_NAMES_ZH } from './data/taxon-names-zh'
import { SPECIES_TEXTS } from './data/species-texts'

interface Taxonomy {
  species: Record<string, { taxonId: number; order: string | null; family: string | null }>
  ranks: Record<string, { rank: 'order' | 'family'; taxonId: number; zhTW: string | null; en: string | null }>
}

const FILE = path.resolve(__dirname, 'data/inat-taxonomy.json')

export async function applyTaxonomy() {
  if (!fs.existsSync(FILE)) return console.log('• taxonomy file missing; skipped')
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Taxonomy
  const names = (sci: string | null) => {
    if (!sci) return null
    const r = data.ranks[sci]
    return { 'zh-TW': RANK_NAMES_ZH[sci] ?? r?.zhTW ?? sci, en: r?.en ?? sci }
  }
  const taken = new Set<number>()
  let updated = 0
  for (const sp of await prisma.species.findMany({ select: { id: true, scientificName: true, inatTaxonId: true } })) {
    const t = data.species[sp.scientificName]
    if (!t) continue
    const taxonId = sp.inatTaxonId ?? (taken.has(t.taxonId) ? null : t.taxonId)
    if (taxonId) taken.add(taxonId)
    const clash = taxonId && !sp.inatTaxonId ? await prisma.species.findFirst({ where: { inatTaxonId: taxonId, NOT: { id: sp.id } }, select: { id: true } }) : null
    await prisma.species.update({
      where: { id: sp.id },
      data: {
        ...(taxonId && !clash && { inatTaxonId: taxonId }),
        taxonOrder: t.order,
        taxonFamily: t.family,
        orderNames: names(t.order) ?? undefined,
        familyNames: names(t.family) ?? undefined
      }
    })
    updated++
  }
  console.log(`✔ taxonomy: ${updated} species with order and family`)
}

/** Descriptions, field marks and similar species for imported species (only where still empty). */
export async function applySpeciesTexts() {
  const bySci = new Map((await prisma.species.findMany({ select: { id: true, scientificName: true } })).map((s) => [s.scientificName, s.id]))
  let n = 0
  for (const [sci, text] of Object.entries(SPECIES_TEXTS)) {
    const id = bySci.get(sci)
    if (!id) continue
    const sp = await prisma.species.findUnique({ where: { id }, select: { description: true, descriptionEn: true, identification: true, similarSpeciesIds: true } })
    const similar = (text.similar ?? []).flatMap((s) => (bySci.get(s) ? [bySci.get(s)!] : []))
    await prisma.species.update({
      where: { id },
      data: {
        ...(!sp?.description && { description: text.zh }),
        ...(!sp?.descriptionEn && { descriptionEn: text.en }),
        ...(!sp?.identification && text.id && { identification: { 'zh-TW': text.id.zh, en: text.id.en } }),
        ...(!sp?.similarSpeciesIds.length && similar.length && { similarSpeciesIds: similar })
      }
    })
    n++
  }
  console.log(`✔ species texts: ${n} species`)
}
