/**
 * Mọi hằng số về endpoint TikTok Shop nằm ở đây.
 * TikTok đánh version theo ngày và đổi khá thường — sửa một chỗ này là xong.
 */

export const TTS = {
  /** Đổi auth_code / refresh_token lấy access_token. Không cần ký chữ ký. */
  AUTH_BASE: 'https://auth.tiktok-shops.com',

  /** Cổng dữ liệu. Mọi request ở đây đều phải ký. */
  API_BASE: 'https://open-api.tiktokglobalshop.com',

  /** Shop Việt Nam thuộc Rest of World — KHÔNG dùng tên miền .us */
  AUTHORIZE_BASE: 'https://services.tiktokshop.com/open/authorize',

  PATHS: {
    tokenGet: '/api/v2/token/get',
    tokenRefresh: '/api/v2/token/refresh',

    authorizedShops: '/authorization/202309/shops',

    orderList: '/order/202309/orders/search',
    orderDetail: '/order/202309/orders',

    liveOverview: '/analytics/202508/shop_live_performance',
    liveList: '/analytics/202508/shop_live_performance/live_list',
    shopPerformance: '/analytics/202405/shop/performance',
    productPerformance: '/analytics/202405/shop_products/performance',
  },
} as const

export const TTS_BUSINESS = {
  BASE: 'https://business-api.tiktok.com',
  PATHS: {
    integratedReport: '/open_api/v1.3/report/integrated/get/',
  },
} as const

export function appKey(): string {
  const v = process.env.TTS_APP_KEY
  if (!v) throw new Error('Thiếu biến môi trường TTS_APP_KEY')
  return v
}

export function appSecret(): string {
  const v = process.env.TTS_APP_SECRET
  if (!v) throw new Error('Thiếu biến môi trường TTS_APP_SECRET')
  return v
}
