export const MAX_IMAGE_BYTES = 30 * 1024 * 1024
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024

export const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

export const ACCEPTED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
])

export interface AttachedMedia {
  id: string
  kind: 'image' | 'video'
  file: File
  previewUrl: string
  name: string
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('无法读取文件'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('无法读取文件'))
    reader.readAsDataURL(file)
  })
}

export function createAttachedMedia(file: File): AttachedMedia {
  return {
    id: crypto.randomUUID(),
    kind: file.type.startsWith('video/') ? 'video' : 'image',
    file,
    previewUrl: URL.createObjectURL(file),
    name: file.name,
  }
}

export function validateMediaFile(file: File): string | null {
  if (file.type.startsWith('image/')) {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      return '图片仅支持 JPEG、PNG、WebP、GIF'
    }
    if (file.size > MAX_IMAGE_BYTES) return '图片不能超过 30MB'
    return null
  }
  if (file.type.startsWith('video/')) {
    if (!ACCEPTED_VIDEO_TYPES.has(file.type)) {
      return '视频仅支持 MP4、MOV、WebM'
    }
    if (file.size > MAX_VIDEO_BYTES) return '视频不能超过 30MB'
    return null
  }
  return '不支持的文件类型'
}

export function revokeAttachedMedia(media: AttachedMedia | null | undefined) {
  if (media) URL.revokeObjectURL(media.previewUrl)
}
