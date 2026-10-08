import { supabaseAdmin } from '@/lib/supabase'
import { getShopContext } from '@/lib/tts/connection'
import { ttsRequest } from '@/lib/tts/sign'
import { ymdVNLui } from '@/lib/tts/ngay'

/**
 * Đồng bộ tổng quan livestream CẤP SHOP.
 *
 * Endpoint 202609 này khác hẳn 202509 đang dùng cho từng phiên: nó cho hai
 * thứ mà bản kia không có, và cả hai đều là lỗ hổng thật của dashboard.
 *
 * 1. SỐ LẦN HIỂN THỊ (show). Không trả thẳng, nhưng trả show_gpm =
 *    "LIVE-attributed GMV per 1,000 impressions", nên suy ngược được:
 *
 *        shows = live_attributed_gmv / show_gpm * 1000
 *
 *    Từ đó ra tap-through rate = views / shows, tức tầng trên cùng của
 *    phễu: người lướt thấy phòng live rồi có bấm vào hay không. Trước đây
 *    phễu bắt đầu từ product impression, tức đã ở BÊN TRONG phòng rồi.
 *
 *    Đây là số SUY RA, không phải số gốc — đã đối chiếu 30 ngày, tap-through
 *    ra 18,9–24,5%, rất chặt. Nhưng nếu ngày nào show_gpm = 0 (không có
 *    GMV) thì shows = null chứ không phải 0.
 *
 * 2. GMV GIÁN TIẾP (live_indirect_gmv) — khoảng 8% doanh thu live, trước
 *    giờ không xuất hiện ở bất kỳ đâu trên dashboard.
 *
 * BẪY: chỉ account_type = LINKED_ACCOUNTS trả đủ trường. ALL và
 * AFFILIATE_ACCOUNTS trả về thiếu hẳn views / show_gpm / live_ctr — không
 * phải bằng 0, mà là không có key. Vẫn lưu cả ba để sau này đối chiếu, chỉ
 * là view chỉ đọc LINKED.
 *
 * Giới hạn: số ở cấp SHOP, không tách theo phòng live. Đừng cố gán nó vào
 * biểu đồ per-room.
 */
const PATH = '/analytics/202609/shop_lives/overview_performance'
const LOAI = ['LINKED_ACCOUNTS', 'ALL', 'AFFILIATE_ACCOUNTS'] as const

type Tien = { amount?: string; currency?: string }
type Interval = {
  start_date?: string
  views?: number
  avg_viewing_duration?: number
  live_ctr?: string
  ctor_sku_order?: string
  show_gpm?: Tien
  live_gmv?: Tien
  live_indirect_gmv?: Tien
  live_attributed_gmv?: Tien
  live_attributed_sku_orders?: number
  live_attributed_items_sold?: number
}

const so = (t?: Tien) => {
  const v = Number(t?.amount ?? NaN)
  return Number.isFinite(v) ? v : null
}
const soChuoi = (s?: string) => {
  const v = Number(s ?? NaN)
  return Number.isFinite(v) ? v : null
}

export async function syncLiveOverview(days = 30) {
  const ctx = await getShopContext()
  const db = supabaseAdmin()
  // Ngày theo múi giờ shop. Dùng UTC là lùi một ngày vì cron chạy 03:00
  // giờ Việt Nam, tức 20:00 UTC hôm trước — xem lib/tts/ngay.ts.
  const ngay = (back: number) => ymdVNLui(back)

  const errors: string[] = []
  let rows = 0

  for (const acc of LOAI) {
    try {
      const data = await ttsRequest<{ performance?: { intervals?: Interval[] } }>({
        path: PATH,
        accessToken: ctx.accessToken,
        shopCipher: ctx.shopCipher,
        query: {
          start_date_ge: ngay(days + 1),
          end_date_lt: ngay(0),
          granularity: '1D',
          currency: 'LOCAL',
          account_type: acc,
        },
      })

      const iv = (data.performance?.intervals ?? []).filter((r) => r.start_date)
      if (!iv.length) continue

      const payload = iv.map((r) => {
        const gmv = so(r.live_attributed_gmv)
        const gpm = so(r.show_gpm)
        return {
          ngay: r.start_date as string,
          account_type: acc,
          views: r.views ?? null,
          shows: gmv != null && gpm != null && gpm > 0 ? Math.round((gmv / gpm) * 1000) : null,
          show_gpm: gpm,
          live_attributed_gmv: gmv,
          live_gmv: so(r.live_gmv),
          live_indirect_gmv: so(r.live_indirect_gmv),
          sku_orders: r.live_attributed_sku_orders ?? null,
          items_sold: r.live_attributed_items_sold ?? null,
          live_ctr: soChuoi(r.live_ctr),
          ctor_sku_order: soChuoi(r.ctor_sku_order),
          avg_viewing_duration: r.avg_viewing_duration ?? null,
          synced_at: new Date().toISOString(),
        }
      })

      const { error } = await db
        .from('live_overview_daily')
        .upsert(payload, { onConflict: 'ngay,account_type' })
      if (error) throw new Error(error.message)
      rows += payload.length
    } catch (e) {
      errors.push(`${acc}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { rows, days, errors }
}
