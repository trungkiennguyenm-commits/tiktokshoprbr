import { NextResponse } from 'next/server'
import { getShopContext } from '@/lib/tts/connection'
import { ttsRequest } from '@/lib/tts/sign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Thử xem token seller có gọi được 3 endpoint live_rooms hay không.
 *
 * Tài liệu ghi 3 endpoint này cần creator access_token (user_type = 1) và
 * scope creator.data.live.read.public — app mình đang cầm token seller
 * (user_type = 0). Nhưng doc cũng có một câu mở đường: "Sellers can only
 * query room ID data for their own official creator accounts", nghĩa là
 * với 3 phòng chính chủ thì có thể vẫn gọi được. Chỉ có bắn thử mới biết.
 *
 * Lỗi cần đọc:
 *   66009302 → sai room id (field id của phiên live không phải live_room_id)
 *   66009315 → không có quyền (đúng như doc: cần token creator)
 *   105005   → thiếu scope
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const day = (back: number) =>
    new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)

  try {
    const ctx = await getShopContext()

    // Lấy vài phiên gần nhất để mượn id làm live_room_id.
    const list = await ttsRequest<{
      live_stream_sessions?: { id?: string; username?: string; title?: string }[]
    }>({
      path: '/analytics/202509/shop_lives/performance',
      accessToken: ctx.accessToken,
      shopCipher: ctx.shopCipher,
      query: {
        start_date_ge: url.searchParams.get('from') ?? day(14),
        end_date_lt: url.searchParams.get('to') ?? day(1),
        page_size: 10,
        currency: 'LOCAL',
      },
    })

    const rooms = (list.live_stream_sessions ?? []).slice(0, 3)
    if (!rooms.length) return NextResponse.json({ ok: false, note: 'Không có phiên live nào trong khoảng này' })

    const endpoints = [
      { ten: 'interactive_trend', suffix: 'interactive_trend_performances' },
      { ten: 'product_stats', suffix: 'product_stats' },
      { ten: 'traffic', suffix: 'traffic_performances' },
    ]

    const out: Record<string, unknown>[] = []
    for (const r of rooms) {
      for (const e of endpoints) {
        // Thử cả hai kiểu: có shop_cipher và không, vì doc không nhắc tới nó.
        for (const withCipher of [true, false]) {
          const path = `/analytics/202502/live_rooms/${r.id}/${e.suffix}`
          try {
            const data = await ttsRequest<unknown>({
              path,
              accessToken: ctx.accessToken,
              ...(withCipher ? { shopCipher: ctx.shopCipher } : {}),
            })
            out.push({
              room: r.username, id: r.id, endpoint: e.ten, cipher: withCipher,
              ok: true, sample: JSON.stringify(data).slice(0, 600),
            })
          } catch (err) {
            out.push({
              room: r.username, id: r.id, endpoint: e.ten, cipher: withCipher,
              ok: false, error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      }
    }

    const ok = out.filter((r) => r.ok)
    return NextResponse.json({
      ok: true,
      ketLuan: ok.length
        ? `Token seller GỌI ĐƯỢC ${ok.length}/${out.length} lượt thử`
        : 'Token seller KHÔNG gọi được endpoint nào — cần token creator',
      rooms: rooms.map((r) => ({ id: r.id, username: r.username, title: r.title })),
      ketQua: out,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
