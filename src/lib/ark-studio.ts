import { ArkApiError } from '../api/errors'
import {
  createVideoGenerationTask,
  imageUrlContent,
  textContent,
  videoUrlContent,
  type VideoGenerationContentItem,
} from '../api'
import { imageRoleForModel } from './ark-models'
import { readFileAsDataUrl, type AttachedMedia } from './media-file'

export interface SubmitArkGenerationInput {
  modelId: string
  prompt: string
  duration: number
  referenceImage?: AttachedMedia | null
  referenceVideo?: AttachedMedia | null
}

export interface SubmitArkGenerationOptions {
  signal?: AbortSignal
}

export async function submitArkGeneration(
  input: SubmitArkGenerationInput,
  options: SubmitArkGenerationOptions = {},
): Promise<{ taskId: string }> {
  const trimmedPrompt = input.prompt.trim()
  if (!trimmedPrompt && !input.referenceImage && !input.referenceVideo) {
    throw new Error('请输入提示词或上传参考素材')
  }

  const content: VideoGenerationContentItem[] = []
  if (trimmedPrompt) {
    content.push(textContent(trimmedPrompt))
  }
  if (input.referenceImage) {
    const dataUrl = await readFileAsDataUrl(input.referenceImage.file)
    content.push(imageUrlContent(dataUrl, imageRoleForModel(input.modelId)))
  }
  if (input.referenceVideo) {
    const dataUrl = await readFileAsDataUrl(input.referenceVideo.file)
    content.push(videoUrlContent(dataUrl, 'reference_video'))
  }

  try {
    const data = await createVideoGenerationTask(
      {
        model: input.modelId,
        content,
        duration: input.duration,
        ratio: '16:9',
        resolution: '720p',
        generate_audio: true,
        watermark: false,
      },
      { signal: options.signal },
    )
    return { taskId: data.id }
  } catch (err) {
    if (err instanceof ArkApiError) throw err
    if (err instanceof Error) throw err
    throw new Error(String(err))
  }
}

export function formatStudioError(err: unknown): string {
  if (err instanceof ArkApiError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}
