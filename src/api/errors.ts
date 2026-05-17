/** 火山方舟 API 错误响应体 */
export interface ArkErrorPayload {
  error?: {
    code?: string
    message?: string
    param?: string
    type?: string
  }
}

/** 火山方舟 API 调用错误 */
export class ArkApiError extends Error {
  readonly status: number
  readonly body: string
  readonly code?: string
  readonly apiMessage?: string

  constructor(status: number, body: string) {
    const parsed = parseArkErrorBody(body)
    const code = parsed?.error?.code
    const apiMessage = parsed?.error?.message
    const summary = formatArkErrorSummary(status, code, apiMessage, body)

    super(summary)
    this.name = 'ArkApiError'
    this.status = status
    this.body = body
    this.code = code
    this.apiMessage = apiMessage
  }
}

export function parseArkErrorBody(body: string): ArkErrorPayload | null {
  try {
    return JSON.parse(body) as ArkErrorPayload
  } catch {
    return null
  }
}

/** 将方舟错误格式化为可读中文说明 */
export function formatArkErrorSummary(
  status: number,
  code?: string,
  apiMessage?: string,
  rawBody?: string,
): string {
  if (code === 'ModelNotOpen') {
    const modelMatch = apiMessage?.match(/model ([\w-]+)/)
    const modelId = modelMatch?.[1] ?? '该模型'
    return [
      `模型未开通：${modelId}`,
      '',
      '请在火山方舟控制台 → 开通管理 中开通对应模型服务：',
      'https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement',
      '',
      '开通后使用控制台「模型列表」中显示的 Model ID，或改用你已开通的模型。',
      apiMessage ? `\n原始信息：${apiMessage}` : '',
    ].join('\n')
  }

  if (apiMessage) {
    return code
      ? `[${code}] HTTP ${status}\n${apiMessage}`
      : `HTTP ${status}\n${apiMessage}`
  }

  return rawBody ? `HTTP ${status}\n${rawBody}` : `HTTP ${status}`
}
