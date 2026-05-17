import { yoboxRequest } from './client'
import { mergeMultiRefPrompt } from './prompt'
import type {
  CreateYoboxMultiRefTaskRequest,
  CreateYoboxTaskOptions,
  CreateYoboxTaskResponse,
  YoboxMultiRefModel,
  YoboxRatio,
  YoboxResolution,
} from './types'
import {
  YOBOX_DEFAULT_MODE,
  YOBOX_DEFAULT_MODEL,
} from './types'

const CREATE_TASK_PATH = '/async/tasks'

export interface CreateYoboxMultiRefTaskInput {
  /** 用户描述；若未手写 @ 标签，将按素材数量自动追加 */
  prompt: string
  model?: YoboxMultiRefModel
  image_urls?: string[]
  video_urls?: string[]
  audio_urls?: string[]
  resolution?: YoboxResolution
  ratio?: YoboxRatio
  duration?: number
  webhook_url?: string
  /** 是否在 prompt 中自动补全 @ 标签，默认 true */
  autoAppendTags?: boolean
  /**
   * 是否提交 resolution 字段。文档写可选默认 720p，但平台异步计费常要求显式传；
   * 若账户未开通对应渠道，传 resolution 可能返回 UNAUTHORIZED。
   */
  sendResolution?: boolean
}

/**
 * 创建 Yobox Multi-Ref 异步视频生成任务
 *
 * POST /async/tasks
 * @see Multi-Ref Video Generation API（yobox / seedance-2-official2）
 */
export function createYoboxMultiRefTask(
  input: CreateYoboxMultiRefTaskInput,
  options: CreateYoboxTaskOptions = {},
): Promise<CreateYoboxTaskResponse> {
  const imageUrls = input.image_urls ?? []
  const videoUrls = input.video_urls ?? []
  const audioUrls = input.audio_urls ?? []

  if (imageUrls.length === 0 && videoUrls.length === 0 && audioUrls.length === 0) {
    throw new Error(
      '至少提供一张参考图或一条参考视频（image_urls / video_urls / audio_urls）',
    )
  }

  const prompt =
    input.autoAppendTags === false
      ? input.prompt.trim()
      : mergeMultiRefPrompt(input.prompt, {
          imageCount: imageUrls.length,
          videoCount: videoUrls.length,
          audioCount: audioUrls.length,
        })

  if (!prompt) {
    throw new Error('prompt 不能为空')
  }

  const body: CreateYoboxMultiRefTaskRequest = {
    model: input.model ?? YOBOX_DEFAULT_MODEL,
    mode: YOBOX_DEFAULT_MODE,
    prompt,
    auto_review: true,
    ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
    ...(videoUrls.length > 0 ? { video_urls: videoUrls } : {}),
    ...(audioUrls.length > 0 ? { audio_urls: audioUrls } : {}),
    ...(input.sendResolution !== false && input.resolution
      ? { resolution: input.resolution }
      : {}),
    ...(input.ratio ? { ratio: input.ratio } : {}),
    ...(input.duration != null ? { duration: input.duration } : {}),
    ...(input.webhook_url ? { webhook_url: input.webhook_url } : {}),
  }

  const { apiKey, baseUrl, signal } = options
  return yoboxRequest<CreateYoboxTaskResponse>(CREATE_TASK_PATH, {
    method: 'POST',
    apiKey,
    baseUrl,
    signal,
    body,
  })
}
