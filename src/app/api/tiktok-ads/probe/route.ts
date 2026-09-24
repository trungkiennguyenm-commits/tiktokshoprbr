import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ADS } from '@/lib/ads/config'
import { adsGet, adsToken } from '@/lib/ads/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Bắn thử một báo cáo 7 ngày gần nhất để xem TikTok trả về đúng những chỉ số
 * nào cho tài khoản này. Nguyên phản hồi được ghi vào ads_debug để đọc bằng
 * SQL — nhanh hơn đọc tài liệu, và tài liệu hay lệch so với thực tế.
 *
 * Gọi: /api/tiktok-ads/probe?advertiser_id=...
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const advertiserId = url.searchParams.get('advertiser_id')
  if (!advertiserId) {
    return NextResponse.json({ error: 'Thiếu ?advertiser_id=' }, { status: 400 })
  }

  const day = (back: number) => {
    const d = new Date(Date.now() - back * 86_400_000)
    return d.toISOString().slice(0, 10)
  }

  try {
    const { token } = await adsToken()
    const db = supabaseAdmin()

    const body = await adsGet(ADS.PATHS.integratedReport, token, {
      advertiser_id: advertiserId,
      report_type: 'BASIC',
      data_level: 'AUCTION_CAMPAIGN',
      dimensions: ['campaign_id', 'stat_time_day'],
      metrics: [
        'campaign_name', 'spend', 'impressions', 'clicks',
        'conversion', 'cost_per_conversion', 'conversion_rate',
      ],
      start_date: day(7),
      end_date: day(1),
      page: '1',
      page_size: '50',
    })

    await db.from('ads_debug').insert({ note: `probe BASIC ${advertiserId}`, payload: body })

    return NextResponse.json({
      code: body.code,
      message: body.message,
      rows: Array.isArray(body.data?.list) ? (body.data.list as unknown[]).length : 0,
      hint: 'Phản hồi đầy đủ đã ghi vào bảng ads_debug.',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
