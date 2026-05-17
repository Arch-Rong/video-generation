import type { VideoGenerationTaskStatus } from '../api'

export type StudioJobStatus =
  | 'submitting'
  | 'cancelled'
  | VideoGenerationTaskStatus

export interface StudioJob {
  id: string
  prompt: string
  modelId: string
  modelLabel: string
  duration: number
  hasReferenceImage: boolean
  hasReferenceVideo: boolean
  remoteTaskId?: string
  status: StudioJobStatus
  videoUrl?: string
  error?: string
  createdAt: number
}
