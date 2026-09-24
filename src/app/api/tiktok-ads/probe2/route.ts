import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ADS } from '@/lib/ads/config'
import { adsGet, adsToken } from '@/lib/ads/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Dò đường dẫn GMV Max.
 *
 * Báo cáo AUCTION_CAMPAIGN chỉ trả về C-Ads và branding — đã kiểm chứng:
 * "Consideration Ads", "CAds - ABO - Roborock". LGM/PGM nằm ở bộ endpoint
 * khác mà tài liệu công khai không đọc được (trang docs render bằng JS).
 *
 * Nên bắn thử từng ứng viên và ghi lại phản hồi. code 0 là trúng; 40002
 * (sai tham số) nghĩa là đường dẫn đúng nhưng tham số sai — cũng là manh mối;
 * 404 hoặc "not exist" nghĩa là đường dẫn sai hẳn.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const advertiserId = url.searchParams.get('advertiser_id') ?? '7671244483777970197'

  const day = (back: number) =>
    new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)

  const candidates: { name: string; path: string; params: Record<string, unknown> }[] = [
    {
      name: 'gmv_max/campaign/get',
      path: '/open_api/v1.3/gmv_max/campaign/get/',
      params: { advertiser_id: advertiserId, page: '1', page_size: '20' },
    },
    {
      name: 'gmv_max/report/get',
      path: '/open_api/v1.3/gmv_max/report/get/',
      params: {
        advertiser_id: advertiserId,
        start_date: day(30), end_date: day(1),
        dimensions: ['campaign_id', 'stat_time_day'],
        page: '1', page_size: '20',
      },
    },
    {
      name: 'report/integrated GMV_MAX_CAMPAIGN',
      path: ADS.PATHS.integratedReport,
      params: {
        advertiser_id: advertiserId, report_type: 'BASIC', data_level: 'GMV_MAX_CAMPAIGN',
        dimensions: ['campaign_id', 'stat_time_day'], metrics: ['campaign_name', 'spend'],
        start_date: day(30), end_date: day(1), page: '1', page_size: '20',
      },
    },
    {
      name: 'report/integrated service_type GMV_MAX',
      path: ADS.PATHS.integratedReport,
      params: {
        advertiser_id: advertiserId, report_type: 'BASIC', service_type: 'GMV_MAX',
        data_level: 'AUCTION_CAMPAIGN',
        dimensions: ['campaign_id', 'stat_time_day'], metrics: ['campaign_name', 'spend'],
        start_date: day(30), end_date: day(1), page: '1', page_size: '20',
      },
    },
    {
      name: 'campaign/get (xem objective_type)',
      path: '/open_api/v1.3/campaign/get/',
      params: {
        advertiser_id: advertiserId,
        fields: ['campaign_id', 'campaign_name', 'objective_type', 'campaign_type', 'operation_status'],
        page: '1', page_size: '50',
      },
    },
    {
      name: 'report/integrated metrics GMV (auction)',
      path: ADS.PATHS.integratedReport,
      params: {
        advertiser_id: advertiserId, report_type: 'BASIC', data_level: 'AUCTION_CAMPAIGN',
        dimensions: ['campaign_id', 'stat_time_day'],
        metrics: ['campaign_name', 'spend', 'gross_revenue', 'onsite_shopping_roas', 'orders'],
        start_date: day(30), end_date: day(1), page: '1', page_size: '20',
      },
    },
  ]

  try {
    const { token } = await adsToken()
    const db = supabaseAdmin()
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
        note: `probe2 ${c.name} ${advertiserId}`,
        payload: { code: body.code, message: body.message, rows: list.length, sample: list.slice(0, 3) },
      })
      summary.push({ candidate: c.name, code: body.code, message: body.message, rows: list.length })
    }

    return NextResponse.json({ ok: true, advertiserId, summary })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
