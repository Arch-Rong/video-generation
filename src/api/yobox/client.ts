import { YoboxApiError, formatYoboxErrorMessage } from './errors'

const YOBOX_API_PREFIX = '/api/yobox'

export interface YoboxClientOptions {
  apiKey?: string
  /** 默认开发环境 `/api/yobox`（Vite 代理到 api.yoboxai.com） */
  baseUrl?: string
}

export interface YoboxRequestInit extends Omit<RequestInit, 'body'> {
  apiKey?: string
  baseUrl?: string
  body?: unknown
}

/** 读取并校验 API Key（去除首尾空白） */
export function resolveYoboxApiKey(override?: string): string {
  const raw = override ?? import.meta.env.VITE_YOBOX_API_KEY
  const key = typeof raw === 'string' ? raw.trim() : ''
  if (!key) {
    throw new Error(
      '缺少 API Key：请在 .env 设置 VITE_YOBOX_API_KEY 后重启 dev 服务，或在请求选项传入 apiKey',
    )
  }
  return key
}

/** 用于 UI 展示（脱敏） */
export function maskYoboxApiKey(key: string): string {
  if (key.length <= 12) return '***'
  return `${key.slice(0, 8)}…${key.slice(-4)}`
}

function resolveBaseUrl(override?: string): string {
  const base =
    override ?? import.meta.env.VITE_YOBOX_BASE_URL ?? YOBOX_API_PREFIX
  const trimmed = base.replace(/\/$/, '')
  if (trimmed.startsWith('http') && import.meta.env.DEV) {
    console.warn(
      '[yobox] 开发环境建议使用 VITE_YOBOX_BASE_URL=/api/yobox 走 Vite 代理，避免 CORS 导致 Authorization 丢失',
    )
  }
  return trimmed
}

/** 发起 Yobox API 请求（自动解析 success/message 包装） */
export async function yoboxRequest<T>(
  path: string,
  init: YoboxRequestInit = {},
): Promise<T> {
  const { apiKey, baseUrl, body, headers, ...rest } = init
  const url = `${resolveBaseUrl(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`
  const token = resolveYoboxApiKey(apiKey)

  const res = await fetch(url, {
    ...rest,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  if (!res.ok) {
    throw new YoboxApiError(res.status, text, formatYoboxErrorMessage(text, res.status))
  }

  if (!text) {
    return undefined as T
  }

  const json = JSON.parse(text) as T & { success?: boolean; message?: string }
  if (
    typeof json === 'object' &&
    json !== null &&
    'success' in json &&
    json.success === false
  ) {
    throw new YoboxApiError(res.status, text, formatYoboxErrorMessage(text, res.status))
  }

  return json
}

export function createYoboxClient(options: YoboxClientOptions = {}) {
  const { apiKey, baseUrl } = options

  return {
    request<T>(path: string, init: Omit<YoboxRequestInit, 'apiKey' | 'baseUrl'> = {}) {
      return yoboxRequest<T>(path, { ...init, apiKey, baseUrl })
    },
  }
}
