import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env'

export interface StoredFile {
  url: string
  publicId: string
  width?: number
  height?: number
}

export interface Storage {
  upload(file: { buffer: Buffer; mimetype: string }, folder: string): Promise<StoredFile>
  remove(publicId: string): Promise<void>
}

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads')
const LOCAL_PREFIX = 'local:'
/** Images that live elsewhere (e.g. seed data) — never deleted from storage. */
export const EXTERNAL_PREFIX = 'external:'

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic'
}

/** Disk storage for local development when Cloudinary isn't configured. */
const localStorage: Storage = {
  async upload(file, folder) {
    const name = `${randomUUID()}.${EXT[file.mimetype] ?? 'bin'}`
    await mkdir(path.join(UPLOAD_DIR, folder), { recursive: true })
    await writeFile(path.join(UPLOAD_DIR, folder, name), file.buffer)
    return {
      url: `${env.PUBLIC_URL}/uploads/${folder}/${name}`,
      publicId: `${LOCAL_PREFIX}${folder}/${name}`
    }
  },
  async remove(publicId) {
    if (!publicId.startsWith(LOCAL_PREFIX)) return
    const rel = publicId.slice(LOCAL_PREFIX.length)
    const target = path.resolve(UPLOAD_DIR, rel)
    if (!target.startsWith(UPLOAD_DIR)) return // path traversal guard
    await unlink(target).catch(() => undefined)
  }
}

const cloudStorage: Storage = {
  async upload(file, folder) {
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
    const res = await cloudinary.uploader.upload(dataUri, {
      folder: `wildlens/${folder}`,
      resource_type: 'image',
      // Keep originals reasonably sized; front-ends request smaller renditions via URL transforms.
      transformation: [{ width: 2400, height: 2400, crop: 'limit', quality: 'auto', fetch_format: 'auto' }]
    })
    return { url: res.secure_url, publicId: res.public_id, width: res.width, height: res.height }
  },
  async remove(publicId) {
    if (publicId.startsWith(EXTERNAL_PREFIX)) return
    if (publicId.startsWith(LOCAL_PREFIX)) return localStorage.remove(publicId)
    await cloudinary.uploader.destroy(publicId).catch((err) => {
      console.error(`Cloudinary destroy failed for ${publicId}`, err)
    })
  }
}

if (env.cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_KEY,
    api_secret: env.CLOUDINARY_SECRET,
    secure: true
  })
}

export const storage: Storage = env.cloudinaryEnabled ? cloudStorage : localStorage
export const ALLOWED_IMAGE_TYPES = Object.keys(EXT)
