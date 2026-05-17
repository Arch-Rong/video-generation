/** 视频分辨率 */
export type VideoResolution = '480p' | '720p' | '1080p'

/** 视频宽高比 */
export type VideoRatio =
  | '16:9'
  | '4:3'
  | '1:1'
  | '3:4'
  | '9:16'
  | '21:9'
  | 'adaptive'

/** 服务等级 */
export type ServiceTier = 'default' | 'flex'

/** 图片在 content 中的角色 */
export type ImageContentRole =
  | 'reference_image'
  | 'first_frame'
  | 'last_frame'

/** 视频在 content 中的角色 */
export type VideoContentRole = 'reference_video'

/** 音频在 content 中的角色 */
export type AudioContentRole = 'reference_audio'

export interface TextContentItem {
  type: 'text'
  text: string
}

export interface ImageUrlContentItem {
  type: 'image_url'
  image_url: {
    /** 图片 URL，或 `data:image/...;base64,...` */
    url: string
  }
  role?: ImageContentRole
}

export interface VideoUrlContentItem {
  type: 'video_url'
  video_url: {
    url: string
  }
  role?: VideoContentRole
}

export interface AudioUrlContentItem {
  type: 'audio_url'
  audio_url: {
    url: string
  }
  role?: AudioContentRole
}

/** 基于样片任务 ID 生成正式视频（仅 Seedance 1.5 pro） */
export interface DraftTaskContentItem {
  type: 'draft'
  draft_task_id: string
}

export type VideoGenerationContentItem =
  | TextContentItem
  | ImageUrlContentItem
  | VideoUrlContentItem
  | AudioUrlContentItem
  | DraftTaskContentItem

/** 创建视频生成任务 - 请求体 */
export interface CreateVideoGenerationTaskRequest {
  /** 模型 ID 或 Endpoint ID */
  model: string
  /** 多模态输入：文本、图片、视频、音频、样片任务 ID */
  content: VideoGenerationContentItem[]
  /** 任务状态变更时的回调地址 */
  callback_url?: string
  /** 是否返回生成视频的尾帧图像 */
  return_last_frame?: boolean
  /** 服务等级：default 在线 / flex 离线 */
  service_tier?: ServiceTier
  /** 任务超时阈值（秒），默认 172800，范围 [3600, 259200] */
  execution_expires_after?: number
  /** 是否生成与画面同步的音频 */
  generate_audio?: boolean
  /** 是否开启样片模式（仅 Seedance 1.5 pro） */
  draft?: boolean
  /** 模型工具配置（仅 Seedance 2.0 系列） */
  tools?: Record<string, unknown>[]
  /** 终端用户唯一标识（合规检测） */
  safety_identifier?: string
  resolution?: VideoResolution
  ratio?: VideoRatio
  /** 视频时长（秒），与 frames 二选一，frames 优先 */
  duration?: number
  /** 视频帧数，与 duration 二选一 */
  frames?: number
  /** 随机种子，-1 表示随机 */
  seed?: number
  /** 是否固定摄像头 */
  camera_fixed?: boolean
  /** 是否添加 AI 生成水印 */
  watermark?: boolean
}

/** 创建视频生成任务 - 响应体 */
export interface CreateVideoGenerationTaskResponse {
  /** 任务 ID，7 天内有效，需通过查询接口获取结果 */
  id: string
}

export interface CreateVideoGenerationTaskOptions {
  apiKey?: string
  baseUrl?: string
  signal?: AbortSignal
}

/** 任务状态 */
export type VideoGenerationTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'expired'

export interface VideoGenerationTaskError {
  code?: string
  message?: string
}

export interface VideoGenerationTaskOutput {
  video_url?: string
  last_frame_url?: string
}

export interface VideoGenerationTaskUsage {
  completion_tokens?: number
  total_tokens?: number
}

/** 查询视频生成任务 - 响应体 */
export interface GetVideoGenerationTaskResponse {
  id: string
  model?: string
  status: VideoGenerationTaskStatus
  content?: VideoGenerationTaskOutput
  error?: VideoGenerationTaskError
  usage?: VideoGenerationTaskUsage
  created_at?: number
  updated_at?: number
  seed?: number
  duration?: number
  ratio?: VideoRatio
  resolution?: VideoResolution
  framespersecond?: number
  service_tier?: ServiceTier
  execution_expires_after?: number
  generate_audio?: boolean
  draft?: boolean
}

export interface GetVideoGenerationTaskOptions {
  apiKey?: string
  baseUrl?: string
  signal?: AbortSignal
}

export function isVideoGenerationTaskTerminal(
  status: VideoGenerationTaskStatus,
): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'expired'
}

export const VIDEO_GENERATION_TASK_STATUS_LABEL: Record<
  VideoGenerationTaskStatus,
  string
> = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
  expired: '已超时',
}
