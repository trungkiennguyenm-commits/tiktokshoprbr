import { NextResponse } from 'next/server'
import { chayAffiliate } from '@/lib/affiliate/chay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 *   /api/cron/affiliate?secret=<CRON_SECRET>             → 60 ngày gần nhất
 *   /api/cron/affiliate?secret=<CRON_SECRET>&days=400    → backfill
 *
 * Gói Hobby chỉ cho 2 cron job nên route này không tự chạy. Lượt đồng bộ
 * đêm KHÔNG gọi route này nữa — nó chạy chayAffiliate() thẳng trong tiến
 * trình của route video, xem lib/affiliate/chay.ts. Route này giữ lại để
 * gọi tay và để backfill.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = process.env.CRON_SECRET
  const authorized =
    request.headers.get('authorization') === `Bearer ${secret}` ||
    url.searchParams.get('secret') === secret
  if (!secret || !authorized) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
  }

  const days = Number(url.searchParams.get('days'))
  const res = await chayAffiliate(Number.isFinite(days) && days > 0 ? days : 60)
  if ('loi' in res) return NextResponse.json({ error: res.loi }, { status: 500 })
  return NextResponse.json({ ok: true, ...res })
}
