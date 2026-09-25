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

    /* Dò ĐƯỜNG DẪN, không phải tham số: cả 6 biến thể vòng trước đều trả
       "Invalid path", nghĩa là chuỗi /analytics/202508/shop_live_performance
       viết trong config từ đầu là sai.

       Có kèm hai đường dẫn ĐÃ BIẾT CHẮC LÀ ĐÚNG làm đối chứng — nếu chúng
       cũng hỏng thì vấn đề nằm ở scope hay token, không phải đường dẫn. */
    const P = [
      '/analytics/202405/shop/performance',            // đối chứng: vẫn đang dùng
      '/analytics/202405/shop_products/performance',   // đối chứng
      '/analytics/202508/shop_lives/performance',
      '/analytics/202508/shop_live/performance',
      '/analytics/202508/shop_lives',
      '/analytics/202508/shop_live_performance/lives',
      '/analytics/202508/shop_lives/live_list',
      '/analytics/202506/shop_live_performance',
      '/analytics/202409/shop_live_performance',
      '/analytics/202405/shop_lives/performance',
      '/analytics/202507/shop_lives/performance',
      '/analytics/202508/live/performance',
    ]
    const candidates = P.map((p) => ({
      name: p,
      path: p,
      query: { start_date_ge: from, end_date_lt: to } as Record<string, string | number>,
    }))

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
