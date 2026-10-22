import { NextResponse } from 'next/server'
import { liveHourly } from '@/lib/livehub/hourly'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Link nội bộ cho LiveHub (tts-host-scheduler) kéo GMV/NMV live theo giờ.
 *
 *   GET /api/livehub/hourly?from=2026-10-01&to=2026-10-21
 *   Authorization: Bearer <LIVEHUB_SYNC_SECRET>
 *
 * Khoá LIVEHUB_SYNC_SECRET đặt GIỐNG NHAU ở Vercel của cả hai app. Chỉ trả số
 * tổng theo phòng × giờ — không có thông tin khách hàng, không có mã đơn.
 * Middleware mật khẩu dashboard bỏ qua đường /api/livehub để LiveHub gọi được.
 */
export async function GET(request: Request) {
  const secret = process.env.LIVEHUB_SYNC_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
  }
  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  const okDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!okDate(from) || !okDate(to) || from > to) {
    return NextResponse.json({ error: 'Cần from và to dạng YYYY-MM-DD, from <= to' }, { status: 400 })
  }
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 62) {
    return NextResponse.json({ error: 'Tối đa 62 ngày mỗi lần gọi' }, { status: 400 })
  }
  try {
    const { rows, tongDong } = await liveHourly(from, to)
    return NextResponse.json({
      from, to,
      dinhNghia: 'GMV = original_price - seller_discount, moi trang thai, bo qua tang; NMV = GMV bo don CANCELLED; gio = gio tao don theo gio VN',
      tongDongCoMaPhien: tongDong,
      rows,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
