import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { adsGet, adsToken } from '@/lib/ads/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Vòng dò thứ hai cho GMV Max.
 *
 * Vòng trước đã xác định hai endpoint CÓ THẬT, chỉ thiếu tham số:
 *   /gmv_max/campaign/get/  → thiếu "filtering"
 *   /gmv_max/report/get/    → thiếu "store_ids"
 *
 * store_ids là id store TikTok Shop (lấy từ bảng shops), không phải
 * advertiser_id — đây là điểm mà đọc tài liệu suông rất dễ nhầm.
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
    if (!storeId) {
      return NextResponse.json({ error: 'Không tìm thấy tts_shop_id' }, { status: 400 })
    }

    const candidates: { name: string; path: string; params: Record<string, unknown> }[] = [
      {
        name: 'campaign/get filtering store_ids',
        path: '/open_api/v1.3/gmv_max/campaign/get/',
        params: { advertiser_id: advertiserId, filtering: { store_ids: [storeId] }, page: '1', page_size: '20' },
      },
      {
        name: 'campaign/get filtering rỗng',
        path: '/open_api/v1.3/gmv_max/campaign/get/',
        params: { advertiser_id: advertiserId, filtering: {}, page: '1', page_size: '20' },
      },
      {
        name: 'report/get store_ids + dimensions',
        path: '/open_api/v1.3/gmv_max/report/get/',
        params: {
          advertiser_id: advertiserId, store_ids: [storeId],
          start_date: day(30), end_date: day(1),
          dimensions: ['campaign_id', 'stat_time_day'],
          page: '1', page_size: '20',
        },
      },
      {
        name: 'report/get store_ids không dimensions',
        path: '/open_api/v1.3/gmv_max/report/get/',
        params: {
          advertiser_id: advertiserId, store_ids: [storeId],
          start_date: day(30), end_date: day(1),
          page: '1', page_size: '20',
        },
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
        note: `probe3 ${c.name} adv=${advertiserId}`,
        payload: { code: body.code, message: body.message, rows: list.length, sample: list.slice(0, 3), keys: data ? Object.keys(data) : [] },
      })
      summary.push({ candidate: c.name, code: body.code, message: body.message, rows: list.length })
    }

    return NextResponse.json({ ok: true, advertiserId, storeId, summary })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
