import { supabaseAdmin } from '@/lib/supabase'
import { ADS } from './config'
import { adsGet, adsToken } from './client'

/** Bốn tài khoản Roborock Kiên chốt ngày 24/09/2026. Chín tài khoản còn lại
 *  (Levoit, Breo, O-Tech, Roborock US, Roborock Shop…) cố ý bỏ ngoài. */
export const ADS_ACCOUNTS = [
  '7671244483777970197', // YM-Roborock-VN-TikTok-1 — đang chi tiêu (USD)
  '7342477820100214785', // Roborock Vietnam — branding, lâu lâu GMV Max (VND)
  '7451531003232960529', // Roborock-0754-Vietnam-SINO-TT — đã ngưng (USD)
  '7452168095654756368', // Used-Roborock-0979-Vietnam-SINO-TT — cũ (USD)
] as const

const CAMPAIGN_PATH = '/open_api/v1.3/gmv_max/campaign/get/'
const REPORT_PATH = '/open_api/v1.3/gmv_max/report/get/'

/** LIVE_GMV_MAX = LGM, PRODUCT_GMV_MAX = PGM. Đây là hai giá trị duy nhất
 *  TikTok chấp nhận — đã kiểm chứng bằng cách gửi giá trị sai và đọc lỗi. */
const PROMO_TYPES = ['LIVE_GMV_MAX', 'PRODUCT_GMV_MAX'] as const

const ymd = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Tách tên campaign thành cột.
 *
 *   "LGMM - @tekoratech.vn - 24.09.26"      → koc @tekoratech.vn
 *   "LGMM - Roborock Official VN - RV"      → room RV
 *   "PGMA - Qrevo Edge 2 Flow [KOC] - RV"   → model "Qrevo Edge 2 Flow", room RV
 *
 * Quy ước đặt tên do team tự thống nhất nên có thể đổi; hàm này luôn trả về
 * null thay vì đoán bừa khi không khớp, để bảng không có dữ liệu bịa.
 */
export function parseCampaignName(name: string | null | undefined) {
  const s = (name ?? '').trim()
  if (!s) return { koc: null, model: null, room: null }

  const parts = s.split('-').map((p) => p.trim()).filter(Boolean)
  const koc = parts.find((p) => p.startsWith('@')) ?? null

  const last = parts[parts.length - 1] ?? ''
  const room = /^(RV|HV|[A-Z]{2,4})$/.test(last) ? last : null

  // Phần giữa của tên PGMA là model, bỏ hậu tố [KOC] và các nhãn trong ngoặc.
  let model: string | null = null
  if (/^PGM/i.test(parts[0] ?? '') && parts.length >= 2) {
    const mid = parts[1].replace(/\[[^\]]*\]/g, '').trim()
    model = mid || null
  }
  return { koc, model, room }
}

type Result = {
  accounts: number
  campaigns: number
  reportRows: number
  errors: string[]
}

/**
 * Kéo campaign + báo cáo ngày của GMV Max cho các tài khoản trên.
 *
 * Báo cáo khoá theo STORE TikTok Shop (store_ids), không phải theo ad account
 * — chỗ này tài liệu không nói rõ, phải dò ra mới biết. Ngày lấy theo múi giờ
 * của chính ad account, nên không ép sang giờ Việt Nam ở đây.
 */
export async function syncAds(days = 30): Promise<Result> {
  const db = supabaseAdmin()
  const { token } = await adsToken()

  const { data: shop } = await db.from('shops').select('tts_shop_id').limit(1).single()
  const storeId = shop?.tts_shop_id
  if (!storeId) throw new Error('Không tìm thấy tts_shop_id trong bảng shops')

  const { data: accs } = await db.from('ads_accounts').select('advertiser_id, currency')
  const currencyOf = new Map((accs ?? []).map((a) => [a.advertiser_id, a.currency ?? 'VND']))

  const out: Result = { accounts: 0, campaigns: 0, reportRows: 0, errors: [] }

  for (const adv of ADS_ACCOUNTS) {
    out.accounts++
    const currency = currencyOf.get(adv) ?? 'VND'

    // ---- 1. Danh sách campaign, để biết campaign nào LGM campaign nào PGM ----
    const promoOf = new Map<string, string>()
    for (const promo of PROMO_TYPES) {
      for (let page = 1; page <= 20; page++) {
        const body = await adsGet(CAMPAIGN_PATH, token, {
          advertiser_id: adv,
          filtering: { gmv_max_promotion_types: [promo] },
          page: String(page),
          page_size: '100',
        })
        if (body.code !== 0) {
          out.errors.push(`${adv} ${promo} campaign: ${body.message}`)
          break
        }
        const list = (body.data?.list ?? []) as Record<string, unknown>[]
        if (!list.length) break

        const rows = list.map((c) => {
          const name = (c.campaign_name ?? null) as string | null
          const p = parseCampaignName(name)
          promoOf.set(String(c.campaign_id), promo)
          return {
            campaign_id: String(c.campaign_id),
            advertiser_id: adv,
            promotion_type: promo,
            campaign_name: name,
            koc_handle: p.koc,
            model_hint: p.model,
            room_hint: p.room,
            objective_type: (c.objective_type ?? null) as string | null,
            operation_status: (c.operation_status ?? null) as string | null,
            secondary_status: (c.secondary_status ?? null) as string | null,
            create_time: c.create_time ? new Date(String(c.create_time) + 'Z').toISOString() : null,
            raw: c,
            synced_at: new Date().toISOString(),
          }
        })
        await db.from('ads_campaigns').upsert(rows, { onConflict: 'campaign_id' })
        out.campaigns += rows.length

        const info = body.data?.page_info as { total_page?: number } | undefined
        if (!info?.total_page || page >= info.total_page) break
      }
    }

    // ---- 2. Báo cáo theo ngày, chia mẻ 30 ngày cho khỏi chạm trần khoảng thời gian ----
    for (let back = days; back > 0; back -= 30) {
      const end = new Date(Date.now() - (back - 30 > 0 ? back - 30 : 0) * 86_400_000)
      const start = new Date(Date.now() - back * 86_400_000)
      if (end <= start) continue

      for (let page = 1; page <= 50; page++) {
        const body = await adsGet(REPORT_PATH, token, {
          advertiser_id: adv,
          store_ids: [storeId],
          start_date: ymd(start),
          end_date: ymd(end),
          dimensions: ['campaign_id', 'stat_time_day'],
          metrics: ['campaign_name', 'cost', 'net_cost', 'gross_revenue', 'orders', 'roi'],
          page: String(page),
          page_size: '500',
        })
        if (body.code !== 0) {
          out.errors.push(`${adv} report ${ymd(start)}: ${body.message}`)
          break
        }
        const list = (body.data?.list ?? []) as Record<string, unknown>[]
        if (!list.length) break

        const rows = list.map((r) => {
          const d = (r.dimensions ?? {}) as Record<string, unknown>
          const m = (r.metrics ?? {}) as Record<string, unknown>
          const cid = String(d.campaign_id)
          return {
            advertiser_id: adv,
            campaign_id: cid,
            ngay: String(d.stat_time_day).slice(0, 10),
            promotion_type: promoOf.get(cid) ?? 'UNKNOWN',
            currency,
            cost: Number(m.cost ?? 0),
            net_cost: Number(m.net_cost ?? 0),
            gross_revenue: Number(m.gross_revenue ?? 0),
            orders: Math.round(Number(m.orders ?? 0)),
            roi: m.roi == null ? null : Number(m.roi),
            synced_at: new Date().toISOString(),
          }
        })
        await db.from('ads_daily').upsert(rows, { onConflict: 'advertiser_id,campaign_id,ngay' })
        out.reportRows += rows.length

        const info = body.data?.page_info as { total_page?: number } | undefined
        if (!info?.total_page || page >= info.total_page) break
      }
    }

    // ---- 3. C-Ads và branding: báo cáo đấu giá thường, gộp vào cùng bảng ----
    for (let back = days; back > 0; back -= 30) {
      const end = new Date(Date.now() - (back - 30 > 0 ? back - 30 : 0) * 86_400_000)
      const start = new Date(Date.now() - back * 86_400_000)
      if (end <= start) continue

      for (let page = 1; page <= 50; page++) {
        const body = await adsGet(ADS.PATHS.integratedReport, token, {
          advertiser_id: adv,
          report_type: 'BASIC',
          data_level: 'AUCTION_CAMPAIGN',
          dimensions: ['campaign_id', 'stat_time_day'],
          metrics: ['campaign_name', 'spend', 'impressions', 'clicks'],
          start_date: ymd(start),
          end_date: ymd(end),
          page: String(page),
          page_size: '500',
        })
        if (body.code !== 0) {
          out.errors.push(`${adv} auction ${ymd(start)}: ${body.message}`)
          break
        }
        const list = (body.data?.list ?? []) as Record<string, unknown>[]
        if (!list.length) break

        // Campaign GMV Max cũng xuất hiện ở đây với chi tiêu bằng 0 — bỏ qua,
        // nếu không sẽ đè mất dòng GMV Max thật ở bước 2.
        const rows = list
          .map((r) => {
            const d = (r.dimensions ?? {}) as Record<string, unknown>
            const m = (r.metrics ?? {}) as Record<string, unknown>
            return {
              advertiser_id: adv,
              campaign_id: String(d.campaign_id),
              ngay: String(d.stat_time_day).slice(0, 10),
              promotion_type: 'AUCTION',
              currency,
              cost: Number(m.spend ?? 0),
              net_cost: Number(m.spend ?? 0),
              gross_revenue: 0,
              orders: 0,
              roi: null,
              impressions: Math.round(Number(m.impressions ?? 0)),
              clicks: Math.round(Number(m.clicks ?? 0)),
              synced_at: new Date().toISOString(),
            }
          })
          .filter((r) => !promoOf.has(r.campaign_id))

        if (rows.length) {
          await db.from('ads_daily').upsert(rows, { onConflict: 'advertiser_id,campaign_id,ngay' })
          out.reportRows += rows.length
        }

        const info = body.data?.page_info as { total_page?: number } | undefined
        if (!info?.total_page || page >= info.total_page) break
      }
    }
  }

  return out
}
