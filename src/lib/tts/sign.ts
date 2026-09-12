import { createHmac } from 'node:crypto'
import { TTS, appKey, appSecret } from './config'

/**
 * Ký request theo đúng thuật toán của TikTok Shop.
 *
 * Đã đối chiếu với ví dụ trong doc chính thức:
 *   secret e59af819cc + path /authorization/202309/shops + app_key 29a39d
 *   + timestamp 1623812664
 *   => b596b73e0cc6de07ac26f036364178ab16b0a907af13d43f0a0cd2345f582dc8
 * Có unit test giữ nguyên ví dụ này — đừng sửa hàm mà không chạy test.
 */
export function signRequest(
  path: string,
  params: Record<string, string | number>,
  body = '',
): string {
  const secret = appSecret()

  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && k !== 'access_token')
    .sort()

  let base = path
  for (const k of keys) base += k + String(params[k])

  const payload = secret + base + body + secret
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
}

export class TtsApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly requestId?: string,
  ) {
    super(`TikTok API ${code}: ${message}`)
    this.name = 'TtsApiError'
  }

  /** Token hết hạn — cần refresh rồi thử lại. */
  get isTokenExpired() {
    return this.code === 105002 || this.code === 105001
  }

  /**
   * Thiếu scope. CẢNH BÁO: TikTok cũng trả mã này khi thiếu header
   * content-type: application/json. Kiểm tra header trước khi đi sửa scope.
   */
  get isScopeDenied() {
    return this.code === 105005
  }

  /** Chữ ký sai. Hay gặp nhất khi app_secret vừa bị reset (cửa sổ 2 khoá ~24h). */
  get isSignInvalid() {
    return this.code === 106001
  }

  get isRateLimited() {
    return this.code === 105004
  }
}

type TtsResponse<T> = {
  code: number
  message: string
  request_id?: string
  data?: T
}

/**
 * Gọi một endpoint đã ký.
 *
 * QUAN TRỌNG: luôn gửi kèm content-type: application/json.
 * Thiếu header này TikTok trả 105005 "chưa được cấp scope" — thông báo sai
 * hoàn toàn so với nguyên nhân thật.
 */
export async function ttsRequest<T>(opts: {
  path: string
  accessToken: string
  shopCipher?: string
  method?: 'GET' | 'POST'
  query?: Record<string, string | number>
  body?: unknown
}): Promise<T> {
  const { path, accessToken, shopCipher, method = 'GET', query = {}, body } = opts

  const params: Record<string, string | number> = {
    ...query,
    app_key: appKey(),
    timestamp: Math.floor(Date.now() / 1000),
  }
  if (shopCipher) params.shop_cipher = shopCipher

  const bodyString = body === undefined ? '' : JSON.stringify(body)
  params.sign = signRequest(path, params, bodyString)

  const url = new URL(path, TTS.API_BASE)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }

  const res = await fetch(url, {
    method,
    headers: {
      'x-tts-access-token': accessToken,
      'content-type': 'application/json',
    },
    body: bodyString || undefined,
    cache: 'no-store',
  })

  const json = (await res.json()) as TtsResponse<T>

  if (json.code !== 0) {
    throw new TtsApiError(json.code, json.message, json.request_id)
  }
  return json.data as T
}

/** Chạy lại với backoff — chỉ retry lỗi tạm thời, không retry lỗi chữ ký hay scope. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      const retryable =
        err instanceof TtsApiError
          ? err.isRateLimited
          : err instanceof Error && err.name === 'TypeError'

      if (!retryable || i === attempts - 1) throw err

      const delay = Math.min(2 ** i * 500, 8000) + Math.random() * 300
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  throw lastError
}
