import { ArkApiError } from './errors'

/** 默认走同源路径，由 Vite dev proxy 或 Vercel rewrites 转发到火山方舟 */
const ARK_API_V3_PREFIX = '/api/ark'

export interface ArkClientOptions {
  /** API Key，默认读取 `import.meta.env.VITE_ARK_API_KEY`*/
  apiKey?: string
  /**
   * API 根路径（不含 `/contents/...` 等具体路径）
   * - 推荐：`/api/ark`（dev 用 Vite proxy，Vercel 用 vercel.json rewrites）
   * - 也可：`https://ark.cn-beijing.volces.com/api/v3`（需上游开启 CORS，浏览器直连易失败）
   */
  baseUrl?: string
}

export interface ArkRequestInit extends Omit<RequestInit, 'body'> {
  apiKey?: string
  baseUrl?: string
  body?: unknown
}

function resolveApiKey(override?: string): string {
  const key =
    override ??
    import.meta.env.VITE_ARK_API_KEY
  if (!key) {
    throw new Error(
      '缺少 API Key：请在 .env 中设置 VITE_ARK_API_KEY 或 API_KEY，或在请求选项中传入 apiKey',
    )
  }
  return key
}

function resolveBaseUrl(override?: string): string {
  const base =
    override ??
    import.meta.env.VITE_ARK_BASE_URL ??
    ARK_API_V3_PREFIX
  const trimmed = base.replace(/\/$/, '')
  if (
    import.meta.env.PROD &&
    trimmed.startsWith('http') &&
    typeof window !== 'undefined'
  ) {
    console.warn(
      '[ark] 生产环境使用跨域 baseUrl，可能触发 CORS；建议 VITE_ARK_BASE_URL=/api/ark 并配置 vercel.json 代理',
    )
  }
  return trimmed
}

/** 发起方舟 API v3 请求 */
export async function arkRequest<T>(
  path: string,
  init: ArkRequestInit = {},
): Promise<T> {
  const { apiKey, baseUrl, body, headers, ...rest } = init
  const url = `${resolveBaseUrl(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`

  const res = await fetch(url, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resolveApiKey(apiKey)}`,
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  if (!res.ok) {
    throw new ArkApiError(res.status, text)
  }

  if (!text) {
    return undefined as T
  }

  return JSON.parse(text) as T
}

export function createArkClient(options: ArkClientOptions = {}) {
  const { apiKey, baseUrl } = options

  return {
    request<T>(path: string, init: Omit<ArkRequestInit, 'apiKey' | 'baseUrl'> = {}) {
      return arkRequest<T>(path, { ...init, apiKey, baseUrl })
    },
  }
}
