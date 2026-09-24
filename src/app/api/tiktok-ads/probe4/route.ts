import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { adsGet, adsToken } from '@/lib/ads/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CAMPAIGN = '/open_api/v1.3/gmv_max/campaign/get/'
const REPORT = '/open_api/v1.3/gmv_max/report/get/'

/**
 * Vòng dò thứ ba. Còn thiếu hai thứ: giá trị hợp lệ của
 * filtering.gmv_max_promotion_types, và danh sách metrics/dimensions.
 *
 * Mẹo: gửi một giá trị SAI cố ý. TikTok trả về kèm danh sách giá trị đúng —
 * nhanh và chắc hơn đọc tài liệu, vì tài liệu công khai hay lệch với thực tế.
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

    const rep = (extra: Record<string, unknown>) => ({
      advertiser_id: advertiserId,
      store_ids: [storeId],
      start_date: day(30),
      end_date: day(1),
      page: '1',
      page_size: '20',
      ...extra,
    })

    const candidates: { name: string; path: string; params: Record<string, unknown> }[] = [
      // Ba lượt đầu cố tình sai, để TikTok đọc ra danh sách giá trị hợp lệ.
      {
        name: 'A. promotion_types sai (lộ enum)',
        path: CAMPAIGN,
        params: { advertiser_id: advertiserId, filtering: { gmv_max_promotion_types: ['KHONG_CO_THAT'] }, page: '1', page_size: '20' },
      },
      {
        name: 'B. dimensions sai (lộ enum)',
        path: REPORT,
        params: rep({ dimensions: ['KHONG_CO_THAT'], metrics: ['spend'] }),
      },
      {
        name: 'C. metrics sai (lộ enum)',
        path: REPORT,
        params: rep({ dimensions: ['stat_time_day'], metrics: ['KHONG_CO_THAT'] }),
      },
      // Ba lượt sau là phỏng đoán hợp lý, may ra trúng luôn.
      {
        name: 'D. promotion_types PRODUCT',
        path: CAMPAIGN,
        params: { advertiser_id: advertiserId, filtering: { gmv_max_promotion_types: ['PRODUCT'] }, page: '1', page_size: '20' },
      },
      {
        name: 'E. promotion_types LIVE',
        path: CAMPAIGN,
        params: { advertiser_id: advertiserId, filtering: { gmv_max_promotion_types: ['LIVE'] }, page: '1', page_size: '20' },
      },
      {
        name: 'F. report metrics đoán',
        path: REPORT,
        params: rep({
          dimensions: ['campaign_id', 'stat_time_day'],
          metrics: ['spend', 'gross_revenue', 'roi', 'orders', 'campaign_name'],
        }),
      },
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
        note: `probe4 ${c.name}`,
        payload: { code: body.code, message: body.message, rows: list.length, sample: list.slice(0, 3) },
      })
      summary.push({ candidate: c.name, code: body.code, message: body.message, rows: list.length })
    }

    return NextResponse.json({ ok: true, advertiserId, storeId, summary })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
