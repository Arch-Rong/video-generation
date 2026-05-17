import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { ArkApiError } from './api/errors'
import {
  createVideoGenerationTask,
  getVideoGenerationTask,
  imageUrlContent,
  isVideoGenerationTaskTerminal,
  textContent,
  VIDEO_GENERATION_TASK_STATUS_LABEL,
  type GetVideoGenerationTaskResponse,
  type ImageContentRole,
  type VideoGenerationTaskStatus,
  type VideoGenerationContentItem,
} from './api'
import './App.css'

const POLL_INTERVAL_MS = 4000
const MAX_POLL_MS = 10 * 60 * 1000
const MAX_REFERENCE_IMAGE_BYTES = 30 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

/** 常见模型 ID，需在控制台开通后使用 */
const MODEL_PRESETS = [
  { id: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0' },
  { id: 'doubao-seedance-1-5-pro-251215', label: 'Seedance 1.5 Pro' },
] as const

/** Seedance 2.0 多模态参考图需显式 reference_image；1.5 图生视频官方示例不传 role */
function isSeedance2Model(modelId: string): boolean {
  return /seedance-2-0|seedance-2/i.test(modelId)
}

function imageRoleForModel(modelId: string): ImageContentRole | undefined {
  return isSeedance2Model(modelId) ? 'reference_image' : undefined
}

function imageUploadHint(modelId: string): string {
  if (isSeedance2Model(modelId)) {
    return 'JPEG / PNG / WebP / GIF，最大 30MB。Seedance 2.0：使用 reference_image（r2v）'
  }
  return 'JPEG / PNG / WebP / GIF，最大 30MB。Seedance 1.5 图生视频：不传 role，由服务端按单图推断'
}

interface ReferenceImage {
  file: File
  previewUrl: string
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('无法读取图片'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('无法读取图片'))
    reader.readAsDataURL(file)
  })
}

function App() {
  const [model, setModel] = useState<string>(MODEL_PRESETS[1].id)
  const [customModel, setCustomModel] = useState('')
  const [prompt, setPrompt] = useState('一朵花在微风中轻轻摇曳，阳光透过花瓣')
  const [duration, setDuration] = useState(5)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [taskId, setTaskId] = useState<string | null>(null)
  const [taskStatus, setTaskStatus] = useState<VideoGenerationTaskStatus | null>(
    null,
  )
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [taskDetail, setTaskDetail] =
    useState<GetVideoGenerationTaskResponse | null>(null)
  const [polling, setPolling] = useState(false)
  const [lookupId, setLookupId] = useState('')
  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(
    null,
  )
  const imageInputRef = useRef<HTMLInputElement>(null)

  const modelId = model === '__custom__' ? customModel.trim() : model

  useEffect(() => {
    return () => {
      if (referenceImage) URL.revokeObjectURL(referenceImage.previewUrl)
    }
  }, [referenceImage])

  function handleReferenceImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setError('仅支持 JPEG、PNG、WebP、GIF 格式的参考图')
      return
    }
    if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
      setError('参考图不能超过 30MB')
      return
    }

    setError(null)
    setReferenceImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl)
      return { file, previewUrl: URL.createObjectURL(file) }
    })
  }

  function removeReferenceImage() {
    setReferenceImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  useEffect(() => {
    if (!taskId) return
    const id = taskId

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined
    const startedAt = Date.now()

    async function poll() {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        if (!cancelled) {
          setError('轮询超时（超过 10 分钟），请稍后在控制台查看任务状态')
          setPolling(false)
        }
        if (timer) clearInterval(timer)
        return
      }

      try {
        const task = await getVideoGenerationTask(id)
        if (cancelled) return

        setTaskDetail(task)
        setTaskStatus(task.status)
        if (task.content?.video_url) {
          setVideoUrl(task.content.video_url)
        }

        if (task.status === 'failed') {
          setError(task.error?.message ?? '视频生成失败')
          setPolling(false)
          if (timer) clearInterval(timer)
          return
        }

        if (task.status === 'expired') {
          setError('任务已超时')
          setPolling(false)
          if (timer) clearInterval(timer)
          return
        }

        if (isVideoGenerationTaskTerminal(task.status)) {
          setPolling(false)
          if (timer) clearInterval(timer)
        }
      } catch (err) {
        if (cancelled) return
        setPolling(false)
        if (timer) clearInterval(timer)
        if (err instanceof ArkApiError) {
          setError(err.message)
        } else if (err instanceof Error) {
          setError(err.message)
        } else {
          setError(String(err))
        }
      }
    }

    setPolling(true)
    setTaskStatus(null)
    setVideoUrl(null)
    setTaskDetail(null)
    poll()
    timer = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [taskId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!modelId) {
      setError('请填写模型 ID')
      return
    }
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt && !referenceImage) {
      setError('请输入提示词或上传参考图')
      return
    }

    setLoading(true)
    setError(null)
    setTaskId(null)
    setTaskStatus(null)
    setVideoUrl(null)
    setTaskDetail(null)

    try {
      const content: VideoGenerationContentItem[] = []
      if (trimmedPrompt) {
        content.push(textContent(trimmedPrompt))
      }
      if (referenceImage) {
        const dataUrl = await readFileAsDataUrl(referenceImage.file)
        content.push(imageUrlContent(dataUrl, imageRoleForModel(modelId)))
      }

      const data = await createVideoGenerationTask({
        model: modelId,
        content,
        duration,
        ratio: '16:9',
        resolution: '720p',
        generate_audio: true,
        watermark: false,
      })
      setTaskId(data.id)
    } catch (err) {
      if (err instanceof ArkApiError) {
        setError(err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError(String(err))
      }
    } finally {
      setLoading(false)
    }
  }

  function handleLookup(e: FormEvent) {
    e.preventDefault()
    const id = lookupId.trim()
    if (!id) {
      setError('请填写任务 ID')
      return
    }
    setError(null)
    setTaskId(id)
  }

  const hasApiKey = Boolean(
    import.meta.env.VITE_ARK_API_KEY
  )

  const statusLabel = taskStatus
    ? VIDEO_GENERATION_TASK_STATUS_LABEL[taskStatus]
    : null

  return (
    <main className="api-test">
      <header className="api-test__header">
        <h1>视频生成 API 测试</h1>
        <p className="api-test__hint">
          文生视频 · 创建任务后自动轮询查询结果
          {!hasApiKey && (
            <span className="api-test__warn">
              {' '}
              · 未检测到 API Key，请在 .env 配置 VITE_ARK_API_KEY
            </span>
          )}
        </p>
      </header>

      <form className="api-test__form" onSubmit={handleSubmit}>
        <label className="api-test__field">
          <span>模型</span>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {MODEL_PRESETS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}（{m.id}）
              </option>
            ))}
            <option value="__custom__">自定义 Model ID</option>
          </select>
        </label>

        {model === '__custom__' && (
          <label className="api-test__field">
            <span>自定义 Model ID</span>
            <input
              type="text"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="在控制台模型列表中复制"
              required
            />
          </label>
        )}

        <label className="api-test__field">
          <span>提示词</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="描述期望的画面；也可仅上传参考图进行图生视频"
          />
        </label>

        <div className="api-test__field">
          <span>参考图（可选）</span>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="api-test__file-input"
            onChange={handleReferenceImageChange}
          />
          {!referenceImage ? (
            <button
              type="button"
              className="api-test__upload-trigger"
              onClick={() => imageInputRef.current?.click()}
            >
              选择图片
            </button>
          ) : (
            <figure className="api-test__image-preview">
              <img
                src={referenceImage.previewUrl}
                alt={referenceImage.file.name}
              />
              <figcaption>
                <span className="api-test__image-name">
                  {referenceImage.file.name}
                </span>
                <button
                  type="button"
                  className="api-test__image-remove"
                  onClick={removeReferenceImage}
                >
                  移除
                </button>
              </figcaption>
            </figure>
          )}
          <p className="api-test__field-hint">{imageUploadHint(modelId)}</p>
        </div>

        <label className="api-test__field api-test__field--inline">
          <span>时长（秒）</span>
          <input
            type="number"
            min={4}
            max={15}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </label>

        <button
          type="submit"
          className="api-test__submit"
          disabled={loading || polling}
        >
          {loading ? '创建中…' : polling ? '生成中…' : '创建任务'}
        </button>
      </form>

      <form className="api-test__lookup" onSubmit={handleLookup}>
        <h2>查询已有任务</h2>
        <label className="api-test__field">
          <span>任务 ID</span>
          <input
            type="text"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="cgt-20260516161028-pgd6l"
          />
        </label>
        <button
          type="submit"
          className="api-test__submit api-test__submit--secondary"
          disabled={polling}
        >
          查询状态
        </button>
      </form>

      {(taskId || error) && (
        <section className="api-test__output" aria-live="polite">
          {taskId && (
            <div className="api-test__success">
              <h2>任务已创建</h2>
              <p>
                任务 ID：<code>{taskId}</code>
              </p>
              {statusLabel && (
                <p className="api-test__status">
                  状态：
                  <strong>{statusLabel}</strong>
                  {polling && '（轮询中…）'}
                </p>
              )}
              {taskDetail?.status === 'succeeded' && (
                <ul className="api-test__meta">
                  {taskDetail.model && <li>模型：{taskDetail.model}</li>}
                  {taskDetail.resolution && taskDetail.ratio && (
                    <li>
                      规格：{taskDetail.resolution} · {taskDetail.ratio} ·{' '}
                      {taskDetail.duration}s
                    </li>
                  )}
                  {taskDetail.usage?.total_tokens != null && (
                    <li>消耗 tokens：{taskDetail.usage.total_tokens}</li>
                  )}
                </ul>
              )}
              {videoUrl && (
                <div className="api-test__video">
                  <video src={videoUrl} controls playsInline />
                  <a href={videoUrl} target="_blank" rel="noreferrer">
                    在新标签页打开 / 下载
                  </a>
                  <p className="api-test__video-hint">
                    视频链接有效期约 24 小时，请及时下载保存
                  </p>
                </div>
              )}
            </div>
          )}
          {error && (
            <div className="api-test__error">
              <h2>{taskId ? '任务异常' : '请求失败'}</h2>
              <pre>{error}</pre>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

export default App
