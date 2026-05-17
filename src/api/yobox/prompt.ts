/**
 * 根据素材数量生成 @image_file_n / @video_file_n / @audio_file_n 标签列表
 * 下标从 1 开始，与 image_urls / video_urls / audio_urls 数组顺序一致
 */
export function buildMultiRefTags(options: {
  imageCount?: number
  videoCount?: number
  audioCount?: number
}): string[] {
  const tags: string[] = []
  const imageCount = options.imageCount ?? 0
  const videoCount = options.videoCount ?? 0
  const audioCount = options.audioCount ?? 0

  for (let i = 1; i <= imageCount; i++) {
    tags.push(`@image_file_${i}`)
  }
  for (let i = 1; i <= videoCount; i++) {
    tags.push(`@video_file_${i}`)
  }
  for (let i = 1; i <= audioCount; i++) {
    tags.push(`@audio_file_${i}`)
  }

  return tags
}

/**
 * 将用户提示词与缺失的 @ 标签合并（已存在的标签不重复添加）
 */
export function mergeMultiRefPrompt(
  userPrompt: string,
  options: {
    imageCount?: number
    videoCount?: number
    audioCount?: number
  },
): string {
  const base = userPrompt.trim()
  const tags = buildMultiRefTags(options)
  if (tags.length === 0) return base

  const missing = tags.filter((tag) => !base.includes(tag))
  if (missing.length === 0) return base

  const suffix = missing.join(', ')
  return base ? `${base} ${suffix}` : suffix
}
