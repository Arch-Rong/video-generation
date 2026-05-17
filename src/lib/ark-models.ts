import type { ImageContentRole } from '../api'

export const ARK_MODEL_PRESETS = [
  {
    id: 'doubao-seedance-1-5-pro-251215',
    label: 'Seedance 1.5 Pro',
    shortLabel: '1.5 Pro',
    description: '有声视频 · 图生视频（首帧）',
    supportsReferenceVideo: false,
  },
  {
    id: 'doubao-seedance-2-0-260128',
    label: 'Seedance 2.0',
    shortLabel: '2.0',
    description: '多模态 · 支持参考图 / 参考视频',
    supportsReferenceVideo: true,
  },
] as const

export const DEFAULT_ARK_MODEL_ID = ARK_MODEL_PRESETS[0].id

/** 创作页当前对用户开放的模型（其余在 UI 中标注暂未开放） */
export const STUDIO_ENABLED_MODELS = ARK_MODEL_PRESETS.filter(
  (m) => m.id === DEFAULT_ARK_MODEL_ID,
)

export const ARK_DURATION_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const sec = i + 4
  return { value: sec, label: `${sec}s` }
})

export function isSeedance2Model(modelId: string): boolean {
  return /seedance-2-0|seedance-2/i.test(modelId)
}

export function imageRoleForModel(modelId: string): ImageContentRole | undefined {
  return isSeedance2Model(modelId) ? 'reference_image' : undefined
}

export function modelSupportsReferenceVideo(modelId: string): boolean {
  const preset = ARK_MODEL_PRESETS.find((m) => m.id === modelId)
  if (preset) return preset.supportsReferenceVideo
  return isSeedance2Model(modelId)
}
