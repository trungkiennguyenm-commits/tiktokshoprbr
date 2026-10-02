import { NextResponse } from 'next/server'
import { getShopContext } from '@/lib/tts/connection'
import { ttsRequest } from '@/lib/tts/sign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Thử Get Shop Video Performance List trước khi dựng bảng.
 *
 * Doc trên Partner Center không render hết khối JSON mẫu, nên thay vì đoán
 * tên trường thì gọi thật rồi đọc. Cách này đã đúng một lần với endpoint
 * affiliate — đoán theo doc là hỏng.
 *
 * Giới hạn đã biết: mỗi lần hỏi tối đa 60 ngày, và số trả về là số QUY KẾT
 * CỦA TIKTOK, không phải doanh thu shop ghi nhận, không trừ huỷ.
 */
const PATH = '/analytics/202605/shop_videos/performance'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const days = Math.min(Number(url.searchParams.get('days') ?? '30'), 60)
  const acc = url.searchParams.get('acc') ?? 'ALL'
  const ngay = (back: number) =>
    new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)

  try {
    const ctx = await getShopContext()
    const data = await ttsRequest<Record<string, unknown>>({
      path: PATH,
      accessToken: ctx.accessToken,
      shopCipher: ctx.shopCipher,
      query: {
        start_date_ge: ngay(days),
        end_date_lt: ngay(0),
        page_size: 100,
        sort_field: 'gmv',
        sort_order: 'DESC',
        currency: 'LOCAL',
        account_type: acc,
      },
    })

    const videos = (data.videos ?? []) as Record<string, unknown>[]
    const truong = new Set<string>()
    for (const v of videos) for (const k of Object.keys(v)) truong.add(k)

    return NextResponse.json({
      ok: true,
      acc,
      tu: ngay(days),
      den: ngay(0),
      latest_available_date: data.latest_available_date,
      total_count: data.total_count,
      so_video_trang_dau: videos.length,
      con_trang_sau: Boolean(data.next_page_token),
      truong: Array.from(truong).sort(),
      mau: videos.slice(0, 2),
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
