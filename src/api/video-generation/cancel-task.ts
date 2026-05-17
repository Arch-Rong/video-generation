import { ArkApiError } from '../errors'
import { arkRequest } from '../client'
import { getVideoGenerationTask } from './get-task'
import type { GetVideoGenerationTaskOptions } from './types'
import { isVideoGenerationTaskTerminal } from './types'

function taskPath(taskId: string): string {
  return `/contents/generations/tasks/${encodeURIComponent(taskId)}`
}

/**
 * 取消或删除视频生成任务
 *
 * @see https://www.volcengine.com/docs/82379/1521720
 * DELETE /api/v3/contents/generations/tasks/{id}
 *
 * 官方说明：仅可取消「排队中」任务；生成中的任务无法中止，DELETE 至多删除记录。
 */
export function cancelVideoGenerationTask(
  taskId: string,
  options: GetVideoGenerationTaskOptions = {},
): Promise<void> {
  const { apiKey, baseUrl, signal } = options
  return arkRequest<void>(taskPath(taskId), {
    method: 'DELETE',
    apiKey,
    baseUrl,
    signal,
  })
}

export type ArkTaskCancelVerifyResult =
  /** 任务已不存在（删除/取消成功） */
  | 'gone'
  /** 已终态（成功/失败/过期） */
  | 'terminal'
  /** 仍在排队或生成中 */
  | 'still_active'

/** 取消后查询一次，确认服务端是否仍在执行 */
export async function verifyArkTaskCancelled(
  taskId: string,
  options: GetVideoGenerationTaskOptions = {},
): Promise<ArkTaskCancelVerifyResult> {
  try {
    const task = await getVideoGenerationTask(taskId, options)
    if (isVideoGenerationTaskTerminal(task.status)) return 'terminal'
    if (task.status === 'queued' || task.status === 'running') {
      return 'still_active'
    }
    return 'still_active'
  } catch (err) {
    if (err instanceof ArkApiError && err.status === 404) return 'gone'
    throw err
  }
}
