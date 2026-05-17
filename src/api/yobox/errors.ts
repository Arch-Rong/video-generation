/** Yobox API 错误响应体（多种格式） */
export interface YoboxErrorPayload {
  success?: boolean
  message?: string
  error?: {
    code?: string
    message?: string
    retryable?: boolean
    type?: string
  }
}

interface NestedGatewayError {
  error?: {
    code?: string
    message?: string
    retryable?: boolean
  }
}

/** 从 message 字段解析嵌套的 JSON 字符串 */
function parseNestedMessage(message: string): NestedGatewayError | null {
  try {
    return JSON.parse(message) as NestedGatewayError
  } catch {
    return null
  }
}

export function formatYoboxErrorMessage(body: string, status?: number): string {
  const parsed = parseYoboxErrorBody(body)
  if (!parsed) {
    return body || (status ? `HTTP ${status}` : '请求失败')
  }

  const nested = parsed.message ? parseNestedMessage(parsed.message) : null
  const code = nested?.error?.code ?? parsed.error?.code
  const nestedMsg = nested?.error?.message ?? parsed.error?.message
  const flatMsg = parsed.message && !nested ? parsed.message : undefined

  let text = nestedMsg ?? flatMsg ?? body

  if (code === 'UNAUTHORIZED' && text.includes('Authorization header')) {
    text += [
      '',
      '提示：若请求体包含 resolution，可能是 Yobox 账户未开通对应计费/分辨率渠道（上游鉴权失败），',
      '并非本地未传 Bearer Token。请在控制台确认 seedance-2-official2 分组权限或联系 Yobox 客服。',
    ].join('\n')
  }

  if (text.includes('resolution is required')) {
    text += '\n\n提示：该接口要求 resolution，但当前 Key 在带 resolution 时可能无法通过上游鉴权，需在平台开通异步计费。'
  }

  return code && !text.startsWith(`[${code}]`) ? `[${code}] ${text}` : text
}

/** Yobox API 调用错误 */
export class YoboxApiError extends Error {
  readonly status: number
  readonly body: string
  readonly code?: string
  readonly apiMessage?: string

  constructor(status: number, body: string, apiMessage?: string) {
    const message = apiMessage ?? formatYoboxErrorMessage(body, status)
    const parsed = parseYoboxErrorBody(body)
    const nested = parsed?.message ? parseNestedMessage(parsed.message) : null
    const code = nested?.error?.code ?? parsed?.error?.code

    super(message)
    this.name = 'YoboxApiError'
    this.status = status
    this.body = body
    this.code = code
    this.apiMessage = message
  }
}

export function parseYoboxErrorBody(body: string): YoboxErrorPayload | null {
  try {
    return JSON.parse(body) as YoboxErrorPayload
  } catch {
    return null
  }
}
