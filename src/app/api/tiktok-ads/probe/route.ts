import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ADS } from '@/lib/ads/config'
import { adsGet, adsToken } from '@/lib/ads/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Bắn thử báo cáo 30 ngày để xem account nào có chi tiêu thật và TikTok trả
 * về đúng những chỉ số nào. Nguyên phản hồi ghi vào ads_debug để đọc bằng SQL
 * — nhanh hơn đọc tài liệu, và tài liệu hay lệch so với thực tế.
 *
 * Không truyền tham số  → quét toàn bộ account đã uỷ quyền.
 * ?advertiser_id=...    → chỉ một account.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const only = url.searchParams.get('advertiser_id')

  const day = (back: number) =>
    new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)

  try {
    const { token, advertiserIds } = await adsToken()
    const targets = only ? [only] : advertiserIds
    const db = supabaseAdmin()
    const summary: Record<string, unknown>[] = []

    for (const id of targets) {
      const body = await adsGet(ADS.PATHS.integratedReport, token, {
        advertiser_id: id,
        report_type: 'BASIC',
        data_level: 'AUCTION_CAMPAIGN',
        dimensions: ['campaign_id', 'stat_time_day'],
        metrics: ['campaign_name', 'spend', 'impressions', 'clicks', 'conversion'],
        start_date: day(30),
        end_date: day(1),
        page: '1',
        page_size: '100',
      })

      const list = Array.isArray(body.data?.list) ? (body.data.list as Record<string, unknown>[]) : []
      const spend = list.reduce((a, r) => {
        const m = (r.metrics ?? {}) as Record<string, unknown>
        return a + Number(m.spend ?? 0)
      }, 0)

      await db.from('ads_debug').insert({
        note: `probe BASIC ${id}`,
        // Chỉ giữ 5 dòng đầu: đủ để đọc tên trường, khỏi phình bảng.
        payload: { code: body.code, message: body.message, rows: list.length, sample: list.slice(0, 5) },
      })

      summary.push({ advertiser_id: id, code: body.code, message: body.message, rows: list.length, spend })
    }

    return NextResponse.json({
      ok: true,
      checked: targets.length,
      summary,
      hint: 'Chi tiết đã ghi vào bảng ads_debug.',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
