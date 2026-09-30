import { NextResponse } from 'next/server'
import { getShopContext } from '@/lib/tts/connection'
import { ttsRequest } from '@/lib/tts/sign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Thử endpoint Shop LIVE Performance Overview (bản 202609).
 *
 * Khác hẳn ba endpoint live_rooms: cái này dùng scope
 * data.shop_analytics.public.read và token SELLER (user_type = 0) — đúng thứ
 * app đang cầm. Nó cũng mới hơn bản 202509 mình đang đồng bộ.
 *
 * Thứ đang tìm là số lần phiên live được HIỂN THỊ (show / impression), vì
 * tap-through rate = người vào xem ÷ số lần hiển thị. Endpoint không trả
 * thẳng con số đó, nhưng trả show_gpm = "LIVE-attributed GMV per 1,000
 * impressions". Từ đó suy ngược:
 *
 *     shows = live_attributed_gmv / show_gpm * 1000
 *     tap_through = views / shows
 *
 * Phép này chỉ đáng tin nếu show_gpm đủ số lẻ. Nó là chuỗi tiền hai chữ số
 * thập phân, nên khi GMV lớn mà show_gpm nhỏ thì sai số làm tròn phóng lên
 * rất nhanh — route in ra cả input lẫn kết quả để tự đánh giá, chưa ghi gì
 * vào DB.
 */

type Tien = { amount?: string; currency?: string }
type Interval = {
  start_date?: string; end_date?: string
  views?: number; avg_viewing_duration?: number
  live_ctr?: string; ctor_sku_order?: string
  show_gpm?: Tien
  live_gmv?: Tien; live_indirect_gmv?: Tien; live_attributed_gmv?: Tien
  live_attributed_sku_orders?: number; live_attributed_items_sold?: number
}

const so = (t?: Tien) => Number(t?.amount ?? 0)

export async function GET(request: Request) {
  const url = new URL(request.url)
  const day = (back: number) =>
    new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
  const from = url.searchParams.get('from') ?? day(31)
  const to = url.searchParams.get('to') ?? day(1)

  try {
    const ctx = await getShopContext()
    const ra: Record<string, unknown> = { from, to }

    for (const acc of ['ALL', 'LINKED_ACCOUNTS', 'AFFILIATE_ACCOUNTS']) {
      try {
        const data = await ttsRequest<{
          latest_available_date?: string
          updated_at?: string
          performance?: { intervals?: Interval[] }
        }>({
          path: '/analytics/202609/shop_lives/overview_performance',
          accessToken: ctx.accessToken,
          shopCipher: ctx.shopCipher,
          query: {
            start_date_ge: from,
            end_date_lt: to,
            granularity: '1D',
            currency: 'LOCAL',
            account_type: acc,
          },
        })

        const iv = data.performance?.intervals ?? []
        const ngay = iv.map((r) => {
          const gmv = so(r.live_attributed_gmv)
          const gpm = so(r.show_gpm)
          // suy ngược số lần hiển thị từ show_gpm
          const shows = gpm > 0 ? Math.round((gmv / gpm) * 1000) : null
          return {
            ngay: r.start_date,
            views: r.views ?? 0,
            show_gpm: r.show_gpm?.amount,
            live_attributed_gmv: r.live_attributed_gmv?.amount,
            live_gmv: r.live_gmv?.amount,
            live_indirect_gmv: r.live_indirect_gmv?.amount,
            sku_orders: r.live_attributed_sku_orders,
            items_sold: r.live_attributed_items_sold,
            live_ctr: r.live_ctr,
            ctor_sku_order: r.ctor_sku_order,
            avg_viewing_duration: r.avg_viewing_duration,
            shows_suy_ra: shows,
            tap_through_suy_ra: shows && shows > 0
              ? `${Math.round(((r.views ?? 0) / shows) * 10000) / 100}%`
              : null,
          }
        })

        ra[acc] = {
          ok: true,
          so_ngay: ngay.length,
          latest_available_date: data.latest_available_date,
          mau_1_ngay: iv[0] ?? null,
          ngay: ngay.slice(-10),
        }
      } catch (err) {
        ra[acc] = { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }

    return NextResponse.json({ ok: true, ...ra })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
