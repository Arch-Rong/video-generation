import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  ConfigProvider,
  Divider,
  Form,
  Input,
  InputNumber,
  Progress,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'
import { YoboxApiError } from '../api/yobox/errors'
import {
  createYoboxMultiRefTask,
  extractYoboxVideoUrl,
  getYoboxTask,
  isYoboxTaskTerminal,
  maskYoboxApiKey,
  mergeMultiRefPrompt,
  resolveYoboxApiKey,
  type GetYoboxTaskResponse,
  type YoboxMultiRefModel,
  type YoboxRatio,
  type YoboxResolution,
} from '../api/yobox'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const POLL_INTERVAL_MS = 4000
const MAX_POLL_MS = 15 * 60 * 1000

const DEFAULT_PROMPT = 'A cinematic scene with smooth camera movement'
const DEFAULT_IMAGE_URLS = `https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?auto=format&fit=crop&w=512&q=80`

type FormValues = {
  model: YoboxMultiRefModel
  prompt: string
  imageUrlsText: string
  videoUrlsText: string
  audioUrlsText: string
  resolution: YoboxResolution
  ratio: YoboxRatio
  duration: number
  autoAppendTags: boolean
  /** 是否向 API 提交 resolution（关闭则走平台默认，可能仍要求计费字段） */
  sendResolution: boolean
}



function parseUrlLines(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

function formatError(err: unknown): string {
  if (err instanceof YoboxApiError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

function statusTagColor(status: string): string {
  const s = status.toUpperCase()
  if (s === 'SUCCESS' || s === 'SUCCEEDED') return 'success'
  if (s === 'FAILED' || s === 'FAILURE' || s === 'ERROR') return 'error'
  if (s === 'PROCESSING' || s === 'RUNNING' || s === 'PENDING') return 'processing'
  return 'default'
}

export default function YoboxTest() {
  const [form] = Form.useForm<FormValues>()
  const [lookupId, setLookupId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [taskDetail, setTaskDetail] = useState<GetYoboxTaskResponse | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)

  const apiKey = (() => {
    try {
      return resolveYoboxApiKey()
    } catch {
      return ''
    }
  })()
  const hasApiKey = apiKey.length > 0
  const apiBase =
    import.meta.env.VITE_YOBOX_BASE_URL?.trim() || '/api/yobox'

  const watched = Form.useWatch([], form)
  const imageUrls = parseUrlLines(watched?.imageUrlsText ?? '')
  const videoUrls = parseUrlLines(watched?.videoUrlsText ?? '')
  const audioUrls = parseUrlLines(watched?.audioUrlsText ?? '')
  const autoAppendTags = watched?.autoAppendTags ?? true
  const sendResolution = watched?.sendResolution ?? true
  const prompt = watched?.prompt ?? ''

  const previewPrompt = useMemo(() => {
    if (!autoAppendTags) return prompt.trim()
    return mergeMultiRefPrompt(prompt, {
      imageCount: imageUrls.length,
      videoCount: videoUrls.length,
      audioCount: audioUrls.length,
    })
  }, [autoAppendTags, prompt, imageUrls.length, videoUrls.length, audioUrls.length])

  useEffect(() => {
    if (!taskId) return
    const id = taskId

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined
    const startedAt = Date.now()

    async function poll() {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        if (!cancelled) {
          setError('轮询超时（超过 15 分钟）')
          setPolling(false)
        }
        if (timer) clearInterval(timer)
        return
      }

      try {
        const task = await getYoboxTask(id)
        if (cancelled) return

        setTaskDetail(task)
        setError(null)
        const url = extractYoboxVideoUrl(task)
        if (url) setVideoUrl(url)

        const status = task.data.status
        if (isYoboxTaskTerminal(status)) {
          setPolling(false)
          if (timer) clearInterval(timer)
          if (status.toUpperCase() === 'FAILED' || task.data.fail_reason) {
            setError(
              task.data.fail_reason ||
                String(task.data.data?.error ?? '') ||
                '任务失败',
            )
          }
        }
      } catch (err) {
        if (cancelled) return
        setPolling(false)
        if (timer) clearInterval(timer)
        setError(formatError(err))
      }
    }

    setPolling(true)
    setTaskDetail(null)
    setVideoUrl(null)
    poll()
    timer = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [taskId])

  async function submitTask(values: FormValues) {
    const imgs = parseUrlLines(values.imageUrlsText)
    const vids = parseUrlLines(values.videoUrlsText)
    const auds = parseUrlLines(values.audioUrlsText)

    setLoading(true)
    setError(null)
    setTaskId(null)
    setTaskDetail(null)
    setVideoUrl(null)

    try {
      const res = await createYoboxMultiRefTask({
        model: values.model,
        prompt: values.prompt,
        image_urls: imgs.length > 0 ? imgs : undefined,
        video_urls: vids.length > 0 ? vids : undefined,
        audio_urls: auds.length > 0 ? auds : undefined,
        resolution: values.resolution,
        ratio: values.ratio,
        duration: values.duration,
        autoAppendTags: values.autoAppendTags,
        sendResolution: values.sendResolution,
      })
      setTaskId(res.data.task_id)
    } catch (err) {
      setError(formatError(err))
    } finally {
      setLoading(false)
    }
  }

  function lookupTask() {
    const id = lookupId.trim()
    if (!id) {
      setError('请填写任务 ID')
      return
    }
    setError(null)
    setTaskId(id)
  }

  const outerStatus = taskDetail?.data.status
  const progress = taskDetail?.data.progress

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#7c3aed',
          borderRadius: 8,
        },
      }}
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-8 text-left">
        <Space orientation="vertical" size="large" className="w-full">
          <div className="text-center">
            <Title level={2} className="!mb-1">
              Yobox Multi-Ref 测试
            </Title>
            <Text type="secondary">
              Yobox seedance-2 · multi_ref · $0.13/s（480p/720p 倍率 1）
            </Text>
          </div>

          {!hasApiKey ? (
            <Alert
              type="warning"
              showIcon
              title="未配置 API Key"
              description={
                <span>
                  在 <code>.env</code> 设置{' '}
                  <code>VITE_YOBOX_API_KEY=sk-...</code> 后，必须{' '}
                  <strong>重启</strong> <code>npm run dev</code> 才会生效。
                </span>
              }
            />
          ) : (
            <Alert
              type="success"
              showIcon
              title="API Key 已加载"
              description={
                <span className="text-sm">
                  {maskYoboxApiKey(apiKey)} · 请求地址：{apiBase}
                  {apiBase.startsWith('http') && (
                    <span className="text-amber-600">
                      {' '}
                      （直连可能因 CORS 丢失 Authorization，请改用 /api/yobox）
                    </span>
                  )}
                </span>
              }
            />
          )}

          <Alert
            type="info"
            showIcon
            title="官方 API（seedance-2 / 默认分组）"
            description={
              <ul className="m-0 list-disc pl-4 text-sm">
                <li>
                  <code>POST /async/tasks</code> · model:{' '}
                  <code>seedance-2-official2</code> · mode:{' '}
                  <code>multi_ref</code>
                </li>
                <li>
                  查询：<code>GET /async/tasks/sora-2-pro:&#123;taskId&#125;</code>
                </li>
                <li>参考图 ≤9、参考视频 ≤3、参考音频 ≤3；prompt 须含 @ 标签</li>
                <li>resolution 文档写可选默认 720p；ratio / duration 4–15s</li>
                <li>控制台「OpenAI 兼容」若显示未配置，请继续用当前 Bearer 方式</li>
              </ul>
            }
          />

          <Alert
            type="warning"
            showIcon
            title="当前 Key 的实测情况"
            description={
              <ul className="m-0 list-disc pl-4 text-sm">
                <li>
                  <strong>不传</strong> resolution → Token 有效，但返回{' '}
                  <code>resolution is required for async billing</code>
                </li>
                <li>
                  <strong>传入</strong> resolution（720p/480p）→{' '}
                  <code>UNAUTHORIZED</code>（上游计费渠道未开通，非前端漏传 Header）
                </li>
                <li>
                  请在 Yobox 控制台为 <strong>seedance-2 · 默认分组 · 按时长付费</strong>{' '}
                  开通异步计费 / resolution 渠道，或换有权限的 API Key
                </li>
              </ul>
            }
          />

          <Card title="创建任务" className="shadow-sm">
            <Form<FormValues>
              form={form}
              layout="vertical"
              initialValues={{
                model: 'seedance-2-official2',
                prompt: DEFAULT_PROMPT,
                imageUrlsText: DEFAULT_IMAGE_URLS,
                videoUrlsText: '',
                audioUrlsText: '',
                resolution: '720p',
                ratio: '16:9',
                duration: 10,
                autoAppendTags: true,
                sendResolution: true,
              }}
              onFinish={submitTask}
            >
              <Form.Item name="model" label="模型 model">
                <Select
                  options={[
                    {
                      value: 'seedance-2-official2',
                      label: 'seedance-2-official2',
                    },
                    {
                      value: 'seedance-2-official2-fast',
                      label: 'seedance-2-official2-fast',
                    },
                  ]}
                />
              </Form.Item>

              <Form.Item
                name="prompt"
                label="提示词"
                rules={[{ required: true, message: '请输入提示词' }]}
              >
                <TextArea rows={4} placeholder="描述期望的画面效果" />
              </Form.Item>

              <Form.Item
                name="autoAppendTags"
                label="自动追加 @ 标签"
                valuePropName="checked"
              >
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>

              {previewPrompt && (
                <Form.Item label="实际提交的 prompt">
                  <TextArea
                    value={previewPrompt}
                    readOnly
                    rows={3}
                    className="font-mono text-xs"
                  />
                </Form.Item>
              )}

              <Form.Item
                name="imageUrlsText"
                label="参考图 URL"
                extra="每行一个，最多 9 张"
              >
                <TextArea rows={3} placeholder="https://..." />
              </Form.Item>

              <Form.Item
                name="videoUrlsText"
                label="参考视频 URL"
                extra="每行一个，最多 3 条"
              >
                <TextArea rows={3} placeholder="https://..." />
              </Form.Item>

              <Form.Item
                name="audioUrlsText"
                label="参考音频 URL"
                extra="每行一个；不可单独使用，须搭配图或视频"
              >
                <TextArea rows={2} placeholder="https://..." />
              </Form.Item>

              <Form.Item
                name="sendResolution"
                label="提交 resolution 字段"
                valuePropName="checked"
                extra="关闭可测试「依赖平台默认」；正式生成需平台开通计费后保持开启"
              >
                <Switch checkedChildren="提交" unCheckedChildren="不传" />
              </Form.Item>

              <Row gutter={16}>
                <Col xs={24} sm={8}>
                  <Form.Item name="resolution" label="分辨率">
                    <Select
                      disabled={!sendResolution}
                      options={[
                        { value: '480p', label: '480p（倍率 1）' },
                        { value: '720p', label: '720p（倍率 1）' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="ratio" label="宽高比">
                    <Select
                      options={[
                        '21:9',
                        '16:9',
                        '4:3',
                        '1:1',
                        '3:4',
                        '9:16',
                      ].map((v) => ({ value: v, label: v }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="duration" label="时长（秒）">
                    <InputNumber min={4} max={15} className="w-full" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item className="!mb-0">
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  disabled={polling}
                  block
                  size="large"
                >
                  {polling ? '生成中…' : '创建任务'}
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <Card title="查询已有任务" className="shadow-sm">
            <Space.Compact className="w-full">
              <Input
                placeholder="任务 ID，如 cmne8prov0001gbp3ccj2p4aa"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                onPressEnter={lookupTask}
              />
              <Button onClick={lookupTask} disabled={polling}>
                查询
              </Button>
            </Space.Compact>
          </Card>

          {polling && (
            <Card className="shadow-sm">
              <Space orientation="vertical" className="w-full">
                <Text>轮询任务状态中…</Text>
                <Progress percent={progress ?? undefined} status="active" />
              </Space>
            </Card>
          )}

          {error && (
            <Alert
              type="error"
              showIcon
              title={taskId ? '任务异常' : '请求失败'}
              description={<pre className="m-0 whitespace-pre-wrap text-sm">{error}</pre>}
            />
          )}

          {taskId && (
            <Card title="任务结果" className="shadow-sm">
              <Space orientation="vertical" size="middle" className="w-full">
                <Paragraph copyable className="!mb-0">
                  {taskId}
                </Paragraph>
                {outerStatus && (
                  <Tag color={statusTagColor(outerStatus)}>{outerStatus}</Tag>
                )}
                {videoUrl && (
                  <>
                    <Divider className="!my-2" />
                    <video
                      src={videoUrl}
                      controls
                      playsInline
                      className="w-full max-h-[360px] rounded-lg bg-black"
                    />
                    <a
                      href={videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-violet-600 hover:underline"
                    >
                      在新标签页打开
                    </a>
                  </>
                )}
              </Space>
            </Card>
          )}
        </Space>
      </div>
    </ConfigProvider>
  )
}
