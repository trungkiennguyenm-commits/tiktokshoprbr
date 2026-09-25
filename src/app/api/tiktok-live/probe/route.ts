import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getShopContext } from '@/lib/tts/connection'
import { ttsRequest } from '@/lib/tts/sign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Dò hai endpoint livestream của TikTok Shop Analytics.
 *
 * Chưa từng gọi bao giờ nên chưa biết tên tham số. Cách nhanh nhất vẫn là
 * bắn thử vài biến thể rồi đọc thông báo lỗi — TikTok nói khá rõ thiếu gì.
 * Toàn bộ phản hồi ghi vào ads_debug để đọc bằng SQL.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const day = (back: number) =>
    new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
  const from = url.searchParams.get('from') ?? day(30)
  const to = url.searchParams.get('to') ?? day(1)

  try {
    const ctx = await getShopContext()
    const db = supabaseAdmin()

    /* Đường dẫn overview lấy từ tài liệu chính thức (Kiên chụp màn hình
       25/09): /analytics/202508/shop_lives/overview_performance — chuỗi
       shop_live_performance viết sẵn trong config từ đầu là sai.

       Overview chỉ cho tổng cả shop, nên dò thêm endpoint liệt kê từng phiên
       live để tách ba phòng. Có hai lượt overview làm đối chứng. */
    const OVERVIEW = '/analytics/202508/shop_lives/overview_performance'
    const candidates: { name: string; path: string; query: Record<string, string | number> }[] = [
      { name: 'overview ALL', path: OVERVIEW, query: { start_date_ge: from, end_date_lt: to, granularity: 'ALL' } },
      { name: 'overview 1D', path: OVERVIEW, query: { start_date_ge: from, end_date_lt: to, granularity: '1D' } },
      { name: 'overview account_type sai (lộ enum)', path: OVERVIEW,
        query: { start_date_ge: from, end_date_lt: to, account_type: 'KHONG_CO_THAT' } },
      /* shop_lives/performance trả 36009003 (lỗi nội bộ) chứ không phải
         "Invalid path" — tức đường dẫn CÓ THẬT, chỉ thiếu tham số. */
      { name: 'performance + page_size', path: '/analytics/202508/shop_lives/performance',
        query: { start_date_ge: from, end_date_lt: to, page_size: 10 } },
      { name: 'performance + granularity', path: '/analytics/202508/shop_lives/performance',
        query: { start_date_ge: from, end_date_lt: to, granularity: 'ALL' } },
      { name: 'performance + sort', path: '/analytics/202508/shop_lives/performance',
        query: { start_date_ge: from, end_date_lt: to, page_size: 10, sort_field: 'gmv', sort_order: 'DESC' } },
      ...['performance_list', 'list', 'detail_performance', 'live_performance']
        .map((tail) => ({
          name: `list: ${tail}`,
          path: `/analytics/202508/shop_lives/${tail}`,
          query: { start_date_ge: from, end_date_lt: to, page_size: 10 } as Record<string, string | number>,
        })),
    ]

    const summary: Record<string, unknown>[] = []
    for (const c of candidates) {
      let body: Record<string, unknown>
      try {
        body = await ttsRequest<Record<string, unknown>>({
          path: c.path,
          accessToken: ctx.accessToken,
          shopCipher: ctx.shopCipher,
          query: c.query,
        })
      } catch (e) {
        body = { error: e instanceof Error ? e.message : String(e) }
      }
      await db.from('ads_debug').insert({
        note: `live ${c.name}`,
        payload: JSON.parse(JSON.stringify(body)).data ? { keys: Object.keys(body), data: body } : body,
      })
      summary.push({
        candidate: c.name,
        ok: !body.error,
        message: body.error ?? 'OK',
      })
    }

    return NextResponse.json({ ok: true, shop: ctx.shopName, from, to, summary })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
