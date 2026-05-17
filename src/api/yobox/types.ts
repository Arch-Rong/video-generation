/** Multi-Ref 固定模型 */
export type YoboxMultiRefModel = 'seedance-2-official2' | 'seedance-2-official2-fast'

export type YoboxTaskMode = 'multi_ref'

export type YoboxResolution = '480p' | '720p'

export type YoboxRatio =
  | '21:9'
  | '16:9'
  | '4:3'
  | '1:1'
  | '3:4'
  | '9:16'

/** 创建异步任务 - 请求体 */
export interface CreateYoboxMultiRefTaskRequest {
  model: YoboxMultiRefModel
  mode: YoboxTaskMode
  prompt: string
  image_urls?: string[]
  video_urls?: string[]
  audio_urls?: string[]
  resolution?: YoboxResolution
  ratio?: YoboxRatio
  duration?: number
  webhook_url?: string
  auto_review?: boolean
}

export interface CreateYoboxTaskOptions {
  apiKey?: string
  baseUrl?: string
  signal?: AbortSignal
}

export interface CreateYoboxTaskData {
  task_id: string
  status: string
  action?: string
  progress?: number
  platform?: string
  model?: string
}

export interface CreateYoboxTaskResponse {
  success: boolean
  message: string
  data: CreateYoboxTaskData
}

export interface GetYoboxTaskOptions {
  apiKey?: string
  baseUrl?: string
  signal?: AbortSignal
}

export interface YoboxTaskResultData {
  id?: string
  mode?: string
  error?: string | null
  model?: string
  ratio?: string
  prompt?: string
  status?: string
  task_type?: string
  resolution?: string
  result_url?: string
  result_urls?: string[]
  completed_at?: string
  credits_left?: number
  credits_used?: number
}

export interface GetYoboxTaskData {
  task_id: string
  platform?: string
  action?: string
  status: string
  progress?: number
  submit_time?: number
  start_time?: number
  finish_time?: number
  fail_reason?: string
  data?: YoboxTaskResultData
}

export interface GetYoboxTaskResponse {
  success: boolean
  message: string
  data: GetYoboxTaskData
}

export const YOBOX_TASK_QUERY_PREFIX = 'sora-2-pro'

export const YOBOX_DEFAULT_MODEL: YoboxMultiRefModel = 'seedance-2-official2'

export const YOBOX_DEFAULT_MODE: YoboxTaskMode = 'multi_ref'
