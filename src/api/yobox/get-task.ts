import { yoboxRequest } from './client'
import type {
  GetYoboxTaskOptions,
  GetYoboxTaskResponse,
} from './types'
import { YOBOX_TASK_QUERY_PREFIX } from './types'

function taskPath(taskId: string): string {
  const id = taskId.includes(':')
    ? taskId.split(':').pop()!
    : taskId
  return `/async/tasks/${YOBOX_TASK_QUERY_PREFIX}:${encodeURIComponent(id)}`
}

/**
 * 查询 Yobox 异步视频生成任务
 *
 * GET /async/tasks/sora-2-pro:{taskId}
 */
export function getYoboxTask(
  taskId: string,
  options: GetYoboxTaskOptions = {},
): Promise<GetYoboxTaskResponse> {
  const { apiKey, baseUrl, signal } = options
  return yoboxRequest<GetYoboxTaskResponse>(taskPath(taskId), {
    method: 'GET',
    apiKey,
    baseUrl,
    signal,
  })
}

/** 从查询响应中提取视频 URL */
export function extractYoboxVideoUrl(
  response: GetYoboxTaskResponse,
): string | undefined {
  const inner = response.data?.data
  return inner?.result_url ?? inner?.result_urls?.[0]
}

/** 外层或内层 status 是否已终态 */
export function isYoboxTaskTerminal(status: string): boolean {
  const s = status.toUpperCase()
  return (
    s === 'SUCCESS' ||
    s === 'SUCCEEDED' ||
    s === 'FAILED' ||
    s === 'FAILURE' ||
    s === 'ERROR'
  )
}

/** 是否成功完成 */
export function isYoboxTaskSucceeded(response: GetYoboxTaskResponse): boolean {
  const outer = response.data?.status?.toUpperCase()
  const inner = response.data?.data?.status?.toLowerCase()
  return outer === 'SUCCESS' || inner === 'succeeded'
}
