import { TTS, appKey, appSecret } from './config'
import { ttsRequest } from './sign'

export type TokenBundle = {
  accessToken: string
  refreshToken: string
  accessExpiresAt: Date
  refreshExpiresAt: Date
  openId: string
  sellerName: string
  sellerBaseRegion: string
  grantedScopes: string[]
}

type RawToken = {
  access_token: string
  access_token_expire_in: number
  refresh_token: string
  refresh_token_expire_in: number
  open_id: string
  seller_name: string
  seller_base_region: string
  user_type: number
  granted_scopes: string[]
}

async function callAuth(path: string, extra: Record<string, string>): Promise<TokenBundle> {
  const url = new URL(path, TTS.AUTH_BASE)
  url.searchParams.set('app_key', appKey())
  url.searchParams.set('app_secret', appSecret())
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v)

  const res = await fetch(url, { cache: 'no-store' })
  const json = (await res.json()) as { code: number; message: string; data?: RawToken }

  if (json.code !== 0 || !json.data) {
    throw new Error(`Lấy token thất bại (${json.code}): ${json.message}`)
  }

  const d = json.data
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    accessExpiresAt: new Date(d.access_token_expire_in * 1000),
    refreshExpiresAt: new Date(d.refresh_token_expire_in * 1000),
    openId: d.open_id,
    sellerName: d.seller_name,
    sellerBaseRegion: d.seller_base_region,
    grantedScopes: d.granted_scopes ?? [],
  }
}

/**
 * Đổi auth_code lấy token.
 * grant_type là `authorized_code` — KHÔNG phải `authorization_code` như OAuth chuẩn.
 * auth_code sống 30 phút và chỉ dùng được một lần.
 */
export function exchangeAuthCode(authCode: string) {
  return callAuth(TTS.PATHS.tokenGet, {
    auth_code: authCode,
    grant_type: 'authorized_code',
  })
}

/**
 * Gia hạn token. Lưu ý: lệnh này xoay vòng CẢ HAI token —
 * access token cũ chết ngay, refresh token cũng được cấp mới.
 */
export function refreshToken(refresh: string) {
  return callAuth(TTS.PATHS.tokenRefresh, {
    refresh_token: refresh,
    grant_type: 'refresh_token',
  })
}

export type AuthorizedShop = {
  id: string
  name: string
  region: string
  seller_type: string
  cipher: string
  code: string
}

/** Lấy shop_id và shop_cipher. Cần scope seller.authorization.info. */
export async function getAuthorizedShops(accessToken: string): Promise<AuthorizedShop[]> {
  const data = await ttsRequest<{ shops: AuthorizedShop[] }>({
    path: TTS.PATHS.authorizedShops,
    accessToken,
  })
  return data.shops ?? []
}

/** Link để chủ shop bấm vào và cấp quyền. */
export function buildAuthorizeUrl(serviceId: string, state: string): string {
  const url = new URL(TTS.AUTHORIZE_BASE)
  url.searchParams.set('service_id', serviceId)
  url.searchParams.set('state', state)
  return url.toString()
}
