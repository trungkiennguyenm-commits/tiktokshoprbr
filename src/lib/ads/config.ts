/**
 * TikTok Marketing API (quảng cáo) — KHÁC hẳn TikTok Shop Open API.
 *
 *  - App khác, App ID khác, secret khác (TTADS_*).
 *  - Không phải ký chữ ký như bên Shop; chỉ gắn header Access-Token.
 *  - Token của advertiser không hết hạn, nên không có refresh token.
 *
 * LGM và PGM là GMV Max campaign của TikTok Shop, TikTok để chúng ở bộ
 * endpoint riêng chứ không nằm trong report thường.
 */
export const ADS = {
  BASE: 'https://business-api.tiktok.com',
  PATHS: {
    accessToken: '/open_api/v1.3/oauth2/access_token/',
    advertiserInfo: '/open_api/v1.3/advertiser/info/',
    integratedReport: '/open_api/v1.3/report/integrated/get/',
  },
} as const

export function adsAppId(): string {
  const v = process.env.TTADS_APP_ID
  if (!v) throw new Error('Thiếu biến môi trường TTADS_APP_ID')
  return v
}

export function adsAppSecret(): string {
  const v = process.env.TTADS_APP_SECRET
  if (!v) throw new Error('Thiếu biến môi trường TTADS_APP_SECRET')
  return v
}
