import { arkRequest } from '../client'
import type {
  GetVideoGenerationTaskOptions,
  GetVideoGenerationTaskResponse,
} from './types'

function taskPath(taskId: string): string {
  return `/contents/generations/tasks/${encodeURIComponent(taskId)}`
}

/**
 * 查询视频生成任务
 *
 * @see https://www.volcengine.com/docs/82379/1520757
 * GET /api/v3/contents/generations/tasks/{id}
 */
export function getVideoGenerationTask(
  taskId: string,
  options: GetVideoGenerationTaskOptions = {},
): Promise<GetVideoGenerationTaskResponse> {
  const { apiKey, baseUrl, signal } = options
  return arkRequest<GetVideoGenerationTaskResponse>(taskPath(taskId), {
    method: 'GET',
    apiKey,
    baseUrl,
    signal,
  })
}
