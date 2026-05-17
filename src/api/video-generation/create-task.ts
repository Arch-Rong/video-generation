import { arkRequest } from '../client'
import type {
  AudioContentRole,
  AudioUrlContentItem,
  CreateVideoGenerationTaskOptions,
  CreateVideoGenerationTaskRequest,
  CreateVideoGenerationTaskResponse,
  ImageContentRole,
  ImageUrlContentItem,
  TextContentItem,
  VideoContentRole,
  VideoUrlContentItem,
} from './types'

const CREATE_TASK_PATH = '/contents/generations/tasks'

/**
 * 创建视频生成任务
 *
 * @see https://www.volcengine.com/docs/82379/1520757
 * POST /api/v3/contents/generations/tasks
 */
export function createVideoGenerationTask(
  request: CreateVideoGenerationTaskRequest,
  options: CreateVideoGenerationTaskOptions = {},
): Promise<CreateVideoGenerationTaskResponse> {
  const { apiKey, baseUrl, signal } = options
  return arkRequest<CreateVideoGenerationTaskResponse>(CREATE_TASK_PATH, {
    method: 'POST',
    apiKey,
    baseUrl,
    signal,
    body: request,
  })
}

/** 文本提示词 */
export function textContent(text: string): TextContentItem {
  return { type: 'text', text }
}

/**
 * 图片输入。`role` 可选：
 * - Seedance 1.5 图生视频：单图可不传 role（官方示例）
 * - Seedance 2.0 多模态：传 `reference_image`
 * - 首尾帧：传 `first_frame` / `last_frame`
 */
export function imageUrlContent(
  url: string,
  role?: ImageContentRole,
): ImageUrlContentItem {
  return {
    type: 'image_url',
    image_url: { url },
    ...(role ? { role } : {}),
  }
}

/** 参考视频 */
export function videoUrlContent(
  url: string,
  role: VideoContentRole = 'reference_video',
): VideoUrlContentItem {
  return {
    type: 'video_url',
    video_url: { url },
    role,
  }
}

/** 参考音频（不可单独使用，需配合图片或视频） */
export function audioUrlContent(
  url: string,
  role: AudioContentRole = 'reference_audio',
): AudioUrlContentItem {
  return {
    type: 'audio_url',
    audio_url: { url },
    role,
  }
}
