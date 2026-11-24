import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { storage, ALLOWED_IMAGE_TYPES } from '../../lib/storage'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam } from '../../lib/schemas'
import { imageSelect } from '../../lib/select'
import { assertOwnerOrAdmin, currentUser, requireAuth } from '../../middleware/auth'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true)
    else cb(ApiError.badRequest('image.unsupported_type'))
  }
})

const uploadQuery = z.object({
  folder: z.enum(['photos', 'community', 'articles', 'avatars']).default('photos')
})

export const imageRoutes = Router()

/** POST /api/images?folder=photos — multipart field "images" (1–10 files). */
imageRoutes.post('/', requireAuth, upload.array('images', 10), async (req, res) => {
  const user = currentUser(req)
  const { folder } = parse(uploadQuery, req.query)
  const files = (req.files as Express.Multer.File[] | undefined) ?? []
  if (!files.length) throw ApiError.badRequest('image.none')

  const created = []
  for (const file of files) {
    const stored = await storage.upload(file, folder)
    created.push(
      await prisma.image.create({
        data: { ...stored, ownerId: user.id },
        select: imageSelect
      })
    )
  }
  res.status(201).json(created)
})

imageRoutes.delete('/:id', requireAuth, async (req, res) => {
  const { id } = parse(idParam, req.params)
  const image = await prisma.image.findUnique({ where: { id } })
  if (!image) throw ApiError.notFound('image')
  assertOwnerOrAdmin(currentUser(req), image.ownerId)
  await prisma.image.delete({ where: { id } })
  await storage.remove(image.publicId)
  res.status(204).end()
})
