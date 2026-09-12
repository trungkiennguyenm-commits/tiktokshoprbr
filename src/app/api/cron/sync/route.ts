import { NextResponse } from 'next/server'
import { getShopContext } from '@/lib/tts/connection'
import { runSync } from '@/lib/sync/runner'
import { ordersAdapter } from '@/lib/sync/adapters/orders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ADAPTERS = {
  orders: ordersAdapter,
} as const

type ResourceName = keyof typeof ADAPTERS

/**
 * Chạy đồng bộ.
 *
 * Cron gọi tự động:   Authorization: Bearer <CRON_SECRET>
 * Chạy tay từ trình duyệt: /api/cron/sync?secret=<CRON_SECRET>&resource=orders
 *
 * Backfill lại từ đầu:
 *   /api/cron/sync?secret=...&resource=orders&days=180
 *
 * Chạm ngưỡng 50 giây thì nó dừng êm và trả về status "partial" —
 * cứ gọi lại, nó chạy tiếp từ đúng chỗ đã dừng.
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

  const requested = (url.searchParams.get('resource') ?? 'orders') as ResourceName
  const adapter = ADAPTERS[requested]
  if (!adapter) {
    return NextResponse.json(
      { error: `Không biết resource "${requested}"`, available: Object.keys(ADAPTERS) },
      { status: 400 },
    )
  }

  try {
    const ctx = await getShopContext()

    // ?days=N ép lấy lại từ N ngày trước, bỏ qua cursor đang lưu.
    const days = Number(url.searchParams.get('days'))
    let resetCursor: string | undefined
    if (Number.isFinite(days) && days > 0) {
      const since = new Date()
      since.setDate(since.getDate() - days)
      resetCursor = `${Math.floor(since.getTime() / 1000)}|`
    }

    const result = await runSync(adapter, ctx, { resetCursor })

    return NextResponse.json({
      shop: ctx.shopName,
      ...result,
      hint:
        result.status === 'partial'
          ? 'Còn dữ liệu chưa lấy hết. Gọi lại đúng đường link này (bỏ tham số days) để chạy tiếp.'
          : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
