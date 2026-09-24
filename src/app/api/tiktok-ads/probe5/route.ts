import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { adsGet, adsToken } from '@/lib/ads/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CAMPAIGN = '/open_api/v1.3/gmv_max/campaign/get/'
const REPORT = '/open_api/v1.3/gmv_max/report/get/'

/**
 * Vòng cuối. Đã biết:
 *   gmv_max_promotion_types ∈ { LIVE_GMV_MAX, PRODUCT_GMV_MAX }   (LGM, PGM)
 *   báo cáo cần 1-3 dimension chính, stat_time_day không tính
 *   'spend' KHÔNG hợp lệ ở báo cáo GMV Max, nhưng gross_revenue/roi/orders thì có
 *
 * Còn thiếu tên trường chi phí. Thử từng ứng viên riêng lẻ để lỗi chỉ đúng
 * tên sai — gộp lại thì không biết cái nào hỏng.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const advertiserId = url.searchParams.get('advertiser_id') ?? '7671244483777970197'

  const day = (back: number) =>
    new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)

  try {
    const { token } = await adsToken()
    const db = supabaseAdmin()
    const { data: shop } = await db.from('shops').select('tts_shop_id').limit(1).single()
    const storeId = url.searchParams.get('store_id') ?? shop?.tts_shop_id
    if (!storeId) return NextResponse.json({ error: 'Không có tts_shop_id' }, { status: 400 })

    const camp = (type: string) => ({
      advertiser_id: advertiserId,
      filtering: { gmv_max_promotion_types: [type] },
      page: '1',
      page_size: '20',
    })
    const rep = (metrics: string[]) => ({
      advertiser_id: advertiserId,
      store_ids: [storeId],
      start_date: day(30),
      end_date: day(1),
      dimensions: ['campaign_id', 'stat_time_day'],
      metrics,
      page: '1',
      page_size: '20',
    })

    const candidates: { name: string; path: string; params: Record<string, unknown> }[] = [
      { name: 'PGM campaigns', path: CAMPAIGN, params: camp('PRODUCT_GMV_MAX') },
      { name: 'LGM campaigns', path: CAMPAIGN, params: camp('LIVE_GMV_MAX') },
      { name: 'report base (không chi phí)', path: REPORT, params: rep(['campaign_name', 'gross_revenue', 'roi', 'orders']) },
      { name: 'report + cost', path: REPORT, params: rep(['gross_revenue', 'cost']) },
      { name: 'report + net_cost', path: REPORT, params: rep(['gross_revenue', 'net_cost']) },
      { name: 'report + total_cost', path: REPORT, params: rep(['gross_revenue', 'total_cost']) },
      { name: 'report + ad_spend', path: REPORT, params: rep(['gross_revenue', 'ad_spend']) },
    ]

    const summary: Record<string, unknown>[] = []
    for (const c of candidates) {
      let body: Record<string, unknown>
      try {
        body = (await adsGet(c.path, token, c.params)) as unknown as Record<string, unknown>
      } catch (e) {
        body = { code: -1, message: e instanceof Error ? e.message : String(e) }
      }
      const data = body.data as Record<string, unknown> | undefined
      const list = Array.isArray(data?.list) ? (data.list as unknown[]) : []

      await db.from('ads_debug').insert({
        note: `probe5 ${c.name}`,
        payload: { code: body.code, message: body.message, rows: list.length, sample: list.slice(0, 3) },
      })
      summary.push({ candidate: c.name, code: body.code, message: body.message, rows: list.length })
    }

    return NextResponse.json({ ok: true, advertiserId, storeId, summary })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
