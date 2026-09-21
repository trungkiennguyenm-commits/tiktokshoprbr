import { NextResponse, after } from 'next/server'
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

/** Số lần tự gọi tiếp tối đa trong một chuỗi. 25 lượt × ~700 đơn là thừa
 *  sức cho một ngày, và là cái phanh nếu có gì đó chạy loạn. */
const MAX_CHAIN = 25

/**
 * Chạy đồng bộ.
 *
 * Cron gọi tự động:        Authorization: Bearer <CRON_SECRET>
 * Chạy tay từ trình duyệt: /api/cron/sync?secret=<CRON_SECRET>&resource=orders
 * Backfill lại từ đầu:     thêm &days=365
 *
 * Chạm ngưỡng 50 giây thì dừng êm và trả về status "partial". Trước đây
 * phải có người bấm lại thì mới chạy tiếp — và vì không ai bấm, dữ liệu
 * đứng im hai ngày mà không báo gì. Giờ khi còn dở, nó TỰ gọi lại chính
 * mình cho tới khi xong hoặc chạm MAX_CHAIN.
 *
 * Lần gọi tiếp theo là một invocation mới, có 60 giây riêng. Nếu lần gọi
 * cha bị cắt giữa chừng thì lần con vẫn chạy tiếp và tự nối chuỗi, nên
 * chuỗi không đứt.
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

  const chain = Number(url.searchParams.get('chain') ?? '0') || 0
  const noChain = url.searchParams.get('chain') === 'off'

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

    const willChain = result.status === 'partial' && !noChain && chain < MAX_CHAIN
    if (willChain) {
      // Gọi tiếp qua TÊN MIỀN PRODUCTION, không qua url.origin.
      //
      // Khi mở link bằng tay, url.origin là tiktokshoprbr.vercel.app — công khai,
      // nên chuỗi chạy được. Nhưng khi Vercel Cron gọi, url.origin là địa chỉ riêng
      // của từng bản deploy (tiktokshoprbr-<hash>-....vercel.app), và gói Hobby bật
      // sẵn Deployment Protection cho các địa chỉ đó: lượt gọi tiếp bị chặn 401 ở
      // tầng Vercel, không bao giờ tới được code của mình. Cron cứ thế dừng sau một
      // lượt mỗi sáng mà không báo gì (15–21/09).
      //
      // VERCEL_PROJECT_PRODUCTION_URL là biến hệ thống Vercel tự cấp.
      const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
      const base = host ? `https://${host}` : url.origin
      const next = new URL(base + url.pathname)
      // Bỏ days đi, nếu không mỗi lượt lại reset cursor về đầu và chạy vòng vô tận.
      next.searchParams.set('resource', requested)
      next.searchParams.set('chain', String(chain + 1))
      after(async () => {
        // Một lượt con làm việc thật thì chạy ~40s, nên chỉ đợi tối đa 15s:
        //  - quá 15s mà chưa trả lời  → con đang làm việc, bỏ đi, nó tự chạy tiếp
        //    (lượt cha chết không kéo lượt con chết theo — đã kiểm chứng 21/09)
        //  - trả lỗi nhanh trong 15s  → con gãy ngay từ đầu, thử lại tối đa 3 lần
        // Trước đây chỉ gọi một lần: một lỗi thoáng qua là cả chuỗi dừng hẳn
        // (21/09 dừng sau đúng 5 lượt giữa đợt kéo 12 tháng).
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await fetch(next.toString(), {
              headers: { authorization: `Bearer ${secret}` },
              cache: 'no-store',
              signal: AbortSignal.timeout(15_000),
            })
            if (res.ok) return
            console.error(`[sync] chain ${chain + 1} attempt ${attempt} → HTTP ${res.status}`)
          } catch (e) {
            const name = e instanceof Error ? e.name : ''
            if (name === 'TimeoutError' || name === 'AbortError') return
            console.error(`[sync] chain ${chain + 1} attempt ${attempt} failed:`, e)
          }
          await new Promise((r) => setTimeout(r, 2_000 * attempt))
        }
        // Hết 3 lần: cron sáng hôm sau vẫn chạy tiếp từ cursor, không mất dữ liệu.
      })
    }

    return NextResponse.json({
      shop: ctx.shopName,
      ...result,
      chain,
      hint:
        result.status === 'partial'
          ? willChain
            ? `Còn dữ liệu. Đã tự gọi tiếp lượt ${chain + 1}, không cần làm gì.`
            : `Còn dữ liệu nhưng đã chạm giới hạn ${MAX_CHAIN} lượt. Gọi lại đường link này để chạy tiếp.`
          : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message, chain }, { status: 500 })
  }
}
