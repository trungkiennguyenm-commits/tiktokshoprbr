import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getShopContext } from '@/lib/tts/connection'
import { ttsRequest } from '@/lib/tts/sign'
import { TTS } from '@/lib/tts/config'

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

    const candidates: { name: string; path: string; query: Record<string, string | number> }[] = [
      {
        name: 'live_list start/end_date_ge',
        path: TTS.PATHS.liveList,
        query: { start_date_ge: from, end_date_lt: to, page_size: 10 },
      },
      { name: 'live_list không tham số', path: TTS.PATHS.liveList, query: {} },
      {
        name: 'live_list start_date/end_date',
        path: TTS.PATHS.liveList,
        query: { start_date: from, end_date: to, page_size: 10 },
      },
      {
        name: 'overview start/end_date_ge',
        path: TTS.PATHS.liveOverview,
        query: { start_date_ge: from, end_date_lt: to },
      },
      { name: 'overview không tham số', path: TTS.PATHS.liveOverview, query: {} },
      {
        name: 'overview granularity sai (lộ enum)',
        path: TTS.PATHS.liveOverview,
        query: { start_date_ge: from, end_date_lt: to, granularity: 'KHONG_CO_THAT' },
      },
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
