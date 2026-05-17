import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Empty,
  Image,
  Input,
  List,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PictureOutlined,
  SendOutlined,
  StopOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import {
  cancelVideoGenerationTask,
  getVideoGenerationTask,
  verifyArkTaskCancelled,
  VIDEO_GENERATION_TASK_STATUS_LABEL,
  type VideoGenerationTaskStatus,
} from '../api'
import {
  ARK_DURATION_OPTIONS,
  ARK_MODEL_PRESETS,
  DEFAULT_ARK_MODEL_ID,
  STUDIO_ENABLED_MODELS,
  modelSupportsReferenceVideo,
} from '../lib/ark-models'
import { formatStudioError, submitArkGeneration } from '../lib/ark-studio'
import {
  createAttachedMedia,
  revokeAttachedMedia,
  validateMediaFile,
  type AttachedMedia,
} from '../lib/media-file'
import type { StudioJob } from '../types/studio'

/**
 * Studio 创作台：对话式视频生成主页面
 *
 * - 左侧：可折叠「生成记录」侧栏（桌面）/ Drawer（移动端）
 * - 中间：用户提示词 + 助手任务状态/成片 的对话流
 * - 底部：提示词输入、参考素材、模型/时长、提交
 * - 异步任务：POST 创建 → 轮询 GET 直至 succeeded/failed（非流式）
 */

const { Text, Paragraph } = Typography
const { TextArea } = Input

/** 轮询间隔（毫秒），视频生成为长任务，不宜过频 */
const POLL_MS = 4000
/** 任务列表 localStorage 键（仅存可序列化字段，不含 File） */
const JOBS_STORAGE_KEY = 'studio-jobs-v1'
/** 左侧生成记录侧栏展开状态 */
const HISTORY_PANEL_KEY = 'studio-history-panel-open'

/** 读取侧栏是否展开，默认展开 */
function loadHistoryPanelOpen(): boolean {
  try {
    const saved = localStorage.getItem(HISTORY_PANEL_KEY)
    if (saved === '0' || saved === 'false') return false
    if (saved === '1' || saved === 'true') return true
  } catch {
    /* ignore */
  }
  return true
}

/** 从 localStorage 恢复历史任务 */
function loadPersistedJobs(): StudioJob[] {
  try {
    const raw = localStorage.getItem(JOBS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StudioJob[]
    return parsed.filter((j) => j.id && j.createdAt)
  } catch {
    return []
  }
}

/** 持久化任务列表（剔除不可 JSON 化的附件等） */
function persistJobs(jobs: StudioJob[]) {
  const slim = jobs.map(({ id, prompt, modelId, modelLabel, duration, hasReferenceImage, hasReferenceVideo, remoteTaskId, status, videoUrl, error, createdAt }) => ({
    id,
    prompt,
    modelId,
    modelLabel,
    duration,
    hasReferenceImage,
    hasReferenceVideo,
    remoteTaskId,
    status,
    videoUrl,
    error,
    createdAt,
  }))
  localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(slim))
}

/** Tag 颜色：终态 / 进行中 / 已取消 */
function statusColor(
  status: StudioJob['status'],
): 'default' | 'processing' | 'success' | 'error' {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'expired') return 'error'
  if (status === 'cancelled') return 'default'
  if (status === 'submitting' || status === 'queued' || status === 'running') {
    return 'processing'
  }
  return 'default'
}

/** 状态中文文案（含前端独有 submitting、cancelled） */
function statusLabel(status: StudioJob['status']): string {
  if (status === 'submitting') return '提交中'
  if (status === 'cancelled') return '已取消'
  return VIDEO_GENERATION_TASK_STATUS_LABEL[status as VideoGenerationTaskStatus] ?? status
}

/** 是否展示取消/停止按钮 */
function canCancelJob(job: StudioJob): boolean {
  return (
    job.status === 'submitting' ||
    job.status === 'queued' ||
    job.status === 'running'
  )
}

/** 取消按钮文案：提交中 / 排队 / 生成中 语义不同 */
function cancelActionLabel(job: StudioJob): string {
  if (job.status === 'submitting') return '取消提交'
  if (job.status === 'queued') return '取消任务'
  return '停止等待'
}

/** Popconfirm 二次确认标题 */
function cancelConfirmTitle(job: StudioJob): string {
  if (job.status === 'queued') {
    return '确认取消排队中的任务？将向火山方舟发送取消请求。'
  }
  if (job.status === 'running') {
    return '生成中的任务无法被火山方舟中止，服务端仍会继续生成并可能计费。仅停止本页轮询与展示，是否继续？'
  }
  return '确认取消提交？'
}

export default function Studio() {
  // —— 表单与任务状态 ——
  const [jobs, setJobs] = useState<StudioJob[]>(loadPersistedJobs)
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState(DEFAULT_ARK_MODEL_ID)
  const [duration, setDuration] = useState(5)
  const [referenceImage, setReferenceImage] = useState<AttachedMedia | null>(null)
  const [referenceVideo, setReferenceVideo] = useState<AttachedMedia | null>(null)
  const [sending, setSending] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  /** 桌面左侧栏展开；移动端用 Drawer */
  const [historyOpen, setHistoryOpen] = useState(loadHistoryPanelOpen)
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)

  const threadEndRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  /** 用于「取消提交」：中断尚未完成的 create 请求 */
  const submitAbortRef = useRef<AbortController | null>(null)
  /** 与 Abort 配合，避免过期回调写错 job */
  const submittingJobIdRef = useRef<string | null>(null)

  const modelPreset = ARK_MODEL_PRESETS.find((m) => m.id === modelId)
  const canUseReferenceVideo = modelSupportsReferenceVideo(modelId)
  const hasApiKey = Boolean(import.meta.env.VITE_ARK_API_KEY?.trim())
  const activeJobCount = jobs.filter(
    (j) =>
      j.status === 'submitting' ||
      j.status === 'queued' ||
      j.status === 'running',
  ).length

  const setHistoryPanelOpen = useCallback((open: boolean) => {
    setHistoryOpen(open)
    localStorage.setItem(HISTORY_PANEL_KEY, open ? '1' : '0')
  }, [])

  // jobs 变化时写入 localStorage
  useEffect(() => {
    persistJobs(jobs)
  }, [jobs])

  // 新消息或状态更新时滚到对话底部
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [jobs.length, jobs[jobs.length - 1]?.status])

  // 卸载或替换附件时释放 blob URL，避免内存泄漏
  useEffect(() => {
    return () => {
      revokeAttachedMedia(referenceImage)
      revokeAttachedMedia(referenceVideo)
    }
  }, [referenceImage, referenceVideo])

  // 1.5 不支持参考视频时自动清掉已选视频
  useEffect(() => {
    if (!canUseReferenceVideo && referenceVideo) {
      revokeAttachedMedia(referenceVideo)
      setReferenceVideo(null)
    }
  }, [canUseReferenceVideo, referenceVideo])

  // 仅开放 STUDIO_ENABLED_MODELS 时，纠正非法 modelId
  useEffect(() => {
    if (!STUDIO_ENABLED_MODELS.some((m) => m.id === modelId)) {
      setModelId(DEFAULT_ARK_MODEL_ID)
    }
  }, [modelId])

  const updateJob = useCallback((id: string, patch: Partial<StudioJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)))
  }, [])

  /**
   * 轮询所有 queued/running 任务
   * 依赖 jobs：任务终态后自动停止定时器；组件卸载时 cancelled 防竞态
   */
  useEffect(() => {
    const active = jobs.filter(
      (j) =>
        j.remoteTaskId &&
        j.status !== 'cancelled' &&
        (j.status === 'queued' || j.status === 'running'),
    )
    if (active.length === 0) return

    let cancelled = false

    async function pollAll() {
      for (const job of active) {
        if (cancelled || !job.remoteTaskId) continue
        try {
          const task = await getVideoGenerationTask(job.remoteTaskId)
          if (cancelled) return

          const patch: Partial<StudioJob> = {
            status: task.status,
            videoUrl: task.content?.video_url,
          }

          if (task.status === 'failed') {
            patch.error = task.error?.message ?? '生成失败'
          } else if (task.status === 'expired') {
            patch.error = '任务已超时'
          }

          updateJob(job.id, patch)
        } catch (err) {
          if (cancelled) return
          updateJob(job.id, {
            status: 'failed',
            error: formatStudioError(err),
          })
        }
      }
    }

    pollAll()
    const timer = setInterval(pollAll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [jobs, updateJob])

  /** 选择参考图/视频：校验类型与大小，生成预览 URL */
  function attachFile(file: File, kind: 'image' | 'video') {
    const err = validateMediaFile(file)
    if (err) {
      message.error(err)
      return
    }
    if (kind === 'video' && !canUseReferenceVideo) {
      message.warning('当前模型不支持参考视频，请切换到 Seedance 2.0')
      return
    }

    const media = createAttachedMedia(file)
    if (media.kind === 'image') {
      revokeAttachedMedia(referenceImage)
      setReferenceImage(media)
    } else {
      revokeAttachedMedia(referenceVideo)
      setReferenceVideo(media)
    }
  }

  /**
   * 提交生成：本地先插入 submitting → 调方舟创建任务 → queued
   * 成功后由轮询更新为 running / succeeded；附件在提交前已从输入区清空
   */
  async function handleSend() {
    const trimmed = prompt.trim()
    if (!trimmed && !referenceImage && !referenceVideo) {
      message.warning('请输入提示词或上传参考图/视频')
      return
    }
    if (!hasApiKey) {
      message.error('请配置 VITE_ARK_API_KEY')
      return
    }

    const jobId = crypto.randomUUID()
    const label = modelPreset?.label ?? modelId

    // 乐观 UI：立即出现在对话流
    const newJob: StudioJob = {
      id: jobId,
      prompt: trimmed || '（参考素材生成）',
      modelId,
      modelLabel: label,
      duration,
      hasReferenceImage: Boolean(referenceImage),
      hasReferenceVideo: Boolean(referenceVideo),
      status: 'submitting',
      createdAt: Date.now(),
    }

    setJobs((prev) => [...prev, newJob])
    setSending(true)
    setPrompt('')

    // 快照附件引用，清空输入区（File 已捕获在 img/vid）
    const img = referenceImage
    const vid = referenceVideo
    revokeAttachedMedia(referenceImage)
    revokeAttachedMedia(referenceVideo)
    setReferenceImage(null)
    setReferenceVideo(null)

    submitAbortRef.current?.abort()
    const controller = new AbortController()
    submitAbortRef.current = controller
    submittingJobIdRef.current = jobId

    try {
      const { taskId } = await submitArkGeneration(
        {
          modelId,
          prompt: trimmed,
          duration,
          referenceImage: img,
          referenceVideo: vid,
        },
        { signal: controller.signal },
      )
      if (submittingJobIdRef.current !== jobId) return
      updateJob(jobId, { remoteTaskId: taskId, status: 'queued' })
    } catch (err) {
      if (submittingJobIdRef.current !== jobId) return
      if (err instanceof Error && err.name === 'AbortError') {
        updateJob(jobId, { status: 'cancelled' })
        return
      }
      updateJob(jobId, {
        status: 'failed',
        error: formatStudioError(err),
      })
    } finally {
      if (submittingJobIdRef.current === jobId) {
        submittingJobIdRef.current = null
        submitAbortRef.current = null
      }
      setSending(false)
    }
  }

  /**
   * 取消逻辑分三档（与火山官方能力一致）：
   * - submitting：AbortController
   * - queued：DELETE + verify，失败则继续轮询
   * - running：仅本地 cancelled，服务端可能仍在生成
   */
  async function handleCancel(job: StudioJob) {
    if (!canCancelJob(job)) return

    setCancellingId(job.id)

    try {
      if (job.status === 'submitting') {
        if (submittingJobIdRef.current === job.id) {
          submitAbortRef.current?.abort()
        }
        updateJob(job.id, { status: 'cancelled' })
        message.info('已取消提交')
        return
      }

      if (!job.remoteTaskId) {
        updateJob(job.id, { status: 'cancelled' })
        return
      }

      // 生成中：官方不支持中止，仅停止本地轮询
      if (job.status === 'running') {
        try {
          await cancelVideoGenerationTask(job.remoteTaskId)
        } catch {
          // 删除记录失败也不影响「停止等待」
        }
        updateJob(job.id, {
          status: 'cancelled',
          error:
            '已停止本地等待。火山方舟无法中止生成中的任务，服务端可能仍在运行并计费，请在控制台查看。',
        })
        message.warning('已停止等待（服务端任务可能仍在生成）')
        return
      }

      // 排队中：真正调用 DELETE 并校验
      await cancelVideoGenerationTask(job.remoteTaskId)
      const verify = await verifyArkTaskCancelled(job.remoteTaskId)

      if (verify === 'still_active') {
        message.error('服务端取消未生效，任务仍在排队或生成中，将继续轮询')
        return
      }

      updateJob(job.id, {
        status: 'cancelled',
        error:
          verify === 'terminal'
            ? '任务在取消前已结束'
            : undefined,
      })
      message.success(
        verify === 'gone' ? '任务已在服务端取消' : '任务已结束',
      )
    } catch (err) {
      message.error(`取消失败：${formatStudioError(err)}`)
    } finally {
      setCancellingId(null)
    }
  }

  /** 对话区/侧栏共用的取消按钮（running/queued 需二次确认） */
  function renderCancelButton(job: StudioJob) {
    if (!canCancelJob(job)) return null
    const label = cancelActionLabel(job)
    const btn = (
      <Button
        type="link"
        size="small"
        danger
        icon={<StopOutlined />}
        loading={cancellingId === job.id}
        className="!px-0"
      >
        {label}
      </Button>
    )

    if (job.status === 'running') {
      return (
        <Tooltip title="火山方舟不支持中止生成中的任务，仅停止本页等待">
          <Popconfirm
            title={cancelConfirmTitle(job)}
            okText="停止等待"
            cancelText="继续等待"
            onConfirm={() => void handleCancel(job)}
          >
            {btn}
          </Popconfirm>
        </Tooltip>
      )
    }

    if (job.status === 'queued') {
      return (
        <Popconfirm
          title={cancelConfirmTitle(job)}
          okText="取消任务"
          cancelText="返回"
          onConfirm={() => void handleCancel(job)}
        >
          {btn}
        </Popconfirm>
      )
    }

    return (
      <Button
        type="link"
        size="small"
        danger
        icon={<StopOutlined />}
        loading={cancellingId === job.id}
        onClick={() => void handleCancel(job)}
        className="!px-0"
      >
        {label}
      </Button>
    )
  }

  /** 侧栏 / 移动端 Drawer 中的任务列表（时间倒序） */
  function renderHistoryList() {
    if (jobs.length === 0) {
      return (
        <Text type="secondary" className="block p-4 text-center text-sm">
          暂无记录
        </Text>
      )
    }

    return (
      <List
        dataSource={[...jobs].reverse()}
        renderItem={(job) => (
          <List.Item className="!rounded-lg !border !border-[var(--border)] !px-3 !py-2 mb-1">
            <div className="w-full">
              <div className="mb-1 flex items-center justify-between gap-1">
                <Tag color={statusColor(job.status)} className="!m-0">
                  {statusLabel(job.status)}
                </Tag>
                <Space size={4}>
                  {renderCancelButton(job)}
                  <Text type="secondary" className="text-xs">
                    {new Date(job.createdAt).toLocaleTimeString()}
                  </Text>
                </Space>
              </div>
              <Paragraph
                ellipsis={{ rows: 2 }}
                className="!mb-1 !text-sm text-[var(--text-h)]"
              >
                {job.prompt}
              </Paragraph>
              <Text type="secondary" className="text-xs">
                {job.modelLabel} · {job.duration}s
              </Text>
              {job.videoUrl && (
                <video
                  src={job.videoUrl}
                  className="mt-2 w-full rounded-md bg-black"
                  muted
                  playsInline
                />
              )}
            </div>
          </List.Item>
        )}
      />
    )
  }

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col bg-[var(--bg)] text-[var(--text)] lg:flex-row">
      {/* 生成记录侧栏（桌面可折叠） */}
      <aside
        className={`hidden h-[calc(100dvh-3rem)] shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface)] transition-[width] duration-200 ease-out lg:flex ${
          historyOpen ? 'w-80' : 'w-12'
        }`}
      >
        {historyOpen ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-3">
              <div className="min-w-0">
                <Text className="font-medium text-[var(--text-h)]">生成记录</Text>
                <Text type="secondary" className="ml-1 text-xs">
                  {jobs.length}
                  {activeJobCount > 0 && ` · ${activeJobCount} 进行中`}
                </Text>
              </div>
              <Tooltip title="收起侧栏">
                <Button
                  type="text"
                  size="small"
                  aria-label="收起生成记录"
                  icon={<MenuFoldOutlined />}
                  onClick={() => setHistoryPanelOpen(false)}
                />
              </Tooltip>
            </div>
            <div className="flex-1 overflow-y-auto p-2">{renderHistoryList()}</div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center py-3">
            <Tooltip title="展开生成记录" placement="right">
              <Button
                type="text"
                aria-label="展开生成记录"
                icon={
                  <Badge count={jobs.length} size="small" offset={[4, -2]}>
                    <HistoryOutlined className="text-lg" />
                  </Badge>
                }
                onClick={() => setHistoryPanelOpen(true)}
              />
            </Tooltip>
            {activeJobCount > 0 && (
              <Tooltip title={`${activeJobCount} 个任务进行中`} placement="right">
                <span className="mt-3 inline-flex h-2 w-2 animate-pulse rounded-full bg-violet-500" />
              </Tooltip>
            )}
            <div className="mt-auto pb-2">
              <Tooltip title="展开" placement="right">
                <Button
                  type="text"
                  size="small"
                  icon={<MenuUnfoldOutlined />}
                  onClick={() => setHistoryPanelOpen(true)}
                />
              </Tooltip>
            </div>
          </div>
        )}
      </aside>

      {/* 小屏：左侧 Drawer 查看生成记录 */}
      <Drawer
        title={
          <span>
            生成记录
            {jobs.length > 0 && (
              <Text type="secondary" className="ml-2 text-sm font-normal">
                {jobs.length}
              </Text>
            )}
          </span>
        }
        placement="left"
        width={320}
        open={mobileHistoryOpen}
        onClose={() => setMobileHistoryOpen(false)}
        classNames={{ wrapper: 'lg:!hidden' }}
        styles={{ body: { padding: 8 } }}
      >
        {renderHistoryList()}
      </Drawer>
      {/* 对话主区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶栏：移动端打开记录 + 标题与模型说明 */}
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Button
            type="text"
            className="shrink-0 lg:!hidden"
            icon={<HistoryOutlined />}
            onClick={() => setMobileHistoryOpen(true)}
          >
            记录
            {jobs.length > 0 && (
              <Badge
                count={jobs.length}
                size="small"
                className="!ml-1"
                overflowCount={99}
              />
            )}
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium tracking-tight text-[var(--text-h)]">
                视频创作
              </span>
              <Tag
                bordered={false}
                className="!m-0 !rounded-md !border-0 !bg-[var(--accent-bg)] !px-1.5 !py-0 !text-[11px] !font-medium !leading-5 !text-[var(--accent)]"
              >
               仅仅限制  Seedance 1.5 Pro 使用 其他的模型暂未开放
              </Tag>
              <span className="mt-1 text-[11px] leading-4 text-[var(--text)]">
                AI 视频生成 · 文字或参考图
              </span>
            </div>
          </div>
        </div>

        {/* 对话流：每条 job = 用户气泡 + 助手状态/成片 */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {jobs.length === 0 ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center">
              <Empty
                description={
                  <span className="text-[var(--text)]">
                    描述你想要的画面，或附上参考图开始对话
                  </span>
                }
              />
            </div>
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-6">
              {jobs.map((job) => (
                <div key={job.id} className="flex flex-col gap-3">
                  {/* 用户消息 */}
                  <div className="flex justify-end">
                    <div className="max-w-[92%] rounded-2xl rounded-br-md bg-violet-600 px-4 py-3 text-white shadow-sm dark:bg-violet-700">
                      <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                        {job.prompt}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {job.hasReferenceImage && (
                          <Tag className="!m-0 border-white/30 !bg-white/15 !text-white">
                            参考图
                          </Tag>
                        )}
                        {job.hasReferenceVideo && (
                          <Tag className="!m-0 border-white/30 !bg-white/15 !text-white">
                            参考视频
                          </Tag>
                        )}
                        <Tag className="!m-0 border-white/30 !bg-white/15 !text-white">
                          {job.modelLabel} · {job.duration}s
                        </Tag>
                      </div>
                    </div>
                  </div>

                  {/* 助手回复 */}
                  <div className="flex justify-start">
                    <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-sm">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Tag color={statusColor(job.status)}>
                          {statusLabel(job.status)}
                        </Tag>
                        {(job.status === 'queued' || job.status === 'running') && (
                          <Spin size="small" />
                        )}
                        {renderCancelButton(job)}
                      </div>

                      {job.remoteTaskId && (
                        <Paragraph
                          copyable
                          className="!mb-2 font-mono text-xs !text-[var(--text)]"
                        >
                          {job.remoteTaskId}
                        </Paragraph>
                      )}

                      {job.error && (
                        <Alert
                          type="error"
                          showIcon
                          className="!mb-2"
                          title={job.error}
                        />
                      )}

                      {job.videoUrl && (
                        <div className="mt-2 overflow-hidden rounded-lg">
                          <video
                            src={job.videoUrl}
                            controls
                            playsInline
                            className="w-full max-h-80 bg-black"
                          />
                          <a
                            href={job.videoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block text-sm text-violet-500 hover:underline"
                          >
                            新标签页打开
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div className="px-4 py-5">
          <div className="mx-auto max-w-3xl">
            {!hasApiKey && (
              <Alert
                type="warning"
                showIcon
                className="!mb-3"
                title="未配置 VITE_ARK_API_KEY"
              />
            )}

            {/* 一体化输入卡片：预览区 + 文本框 + 工具栏 */}
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-sm transition-shadow focus-within:border-violet-400/60 focus-within:shadow-md dark:focus-within:border-violet-500/50">
            {(referenceImage || referenceVideo) && (
              <div className="flex flex-wrap gap-2 border-b border-[var(--border)] px-4 pt-3">
                {referenceImage && (
                  <div className="relative overflow-hidden rounded-lg">
                    <Image
                      src={referenceImage.previewUrl}
                      alt={referenceImage.name}
                      width={64}
                      height={64}
                      className="!object-cover"
                    />
                    <Button
                      type="text"
                      size="small"
                      className="!absolute right-0 top-0 !min-w-0 !px-1 !text-white"
                      onClick={() => {
                        revokeAttachedMedia(referenceImage)
                        setReferenceImage(null)
                      }}
                    >
                      ×
                    </Button>
                  </div>
                )}
                {referenceVideo && (
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-lg bg-black/80">
                    <VideoCameraOutlined className="text-xl text-white" />
                    <Button
                      type="text"
                      size="small"
                      className="!absolute right-0 top-0 !min-w-0 !px-1 !text-white"
                      onClick={() => {
                        revokeAttachedMedia(referenceVideo)
                        setReferenceVideo(null)
                      }}
                    >
                      ×
                    </Button>
                  </div>
                )}
              </div>
            )}

              <TextArea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你想生成的视频画面…（Enter 发送，Shift+Enter 换行）"
                variant="borderless"
                autoSize={{ minRows: 4, maxRows: 10 }}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault()
                    void handleSend()
                  }
                }}
                className="!px-4 !pt-4 !text-[15px] !leading-relaxed"
              />

              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) attachFile(f, 'image')
                }}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) attachFile(f, 'video')
                }}
              />

              {/* 工具栏：参考素材、模型/时长、发送 */}
              <div className="flex flex-wrap items-center gap-1 px-2 pb-2 pt-1">
                <Tooltip title="参考图">
                  <Button
                    type="text"
                    size="small"
                    icon={<PictureOutlined />}
                    onClick={() => imageInputRef.current?.click()}
                  />
                </Tooltip>
                <Tooltip
                  title={
                    canUseReferenceVideo
                      ? '参考视频'
                      : '仅 Seedance 2.0 支持参考视频'
                  }
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<VideoCameraOutlined />}
                    disabled={!canUseReferenceVideo}
                    onClick={() => videoInputRef.current?.click()}
                  />
                </Tooltip>

                <div className="mx-1 h-4 w-px shrink-0 bg-[var(--border)]" aria-hidden />

                <Select
                  size="small"
                  variant="borderless"
                  value={modelId}
                  onChange={setModelId}
                  popupMatchSelectWidth={false}
                  className="!min-w-[108px]"
                  options={STUDIO_ENABLED_MODELS.map((m) => ({
                    value: m.id,
                    label: m.shortLabel,
                  }))}
                />
                <Select
                  size="small"
                  variant="borderless"
                  value={duration}
                  onChange={setDuration}
                  popupMatchSelectWidth={false}
                  className="!w-[72px]"
                  options={ARK_DURATION_OPTIONS}
                />

                <div className="flex-1" />

                <Button
                  type="primary"
                  shape="circle"
                  icon={<SendOutlined />}
                  loading={sending}
                  onClick={() => void handleSend()}
                  aria-label="生成视频"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
