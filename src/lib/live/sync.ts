import { supabaseAdmin } from '@/lib/supabase'
import { getShopContext } from '@/lib/tts/connection'
import { ttsRequest } from '@/lib/tts/sign'

/**
 * Đồng bộ phiên livestream từ TikTok Shop Analytics.
 *
 * Đường dẫn đúng là /analytics/202509/shop_lives/performance — bản 202508
 * ghi sẵn trong config từ đầu dự án là SAI: nó tồn tại nhưng trả 36009003
 * với mọi tham số hợp lệ. Mất một buổi dò mới ra, đừng đổi lại.
 *
 * API chỉ trả phiên của tài khoản chính thức thuộc shop; tài khoản KOC vẫn
 * hiện vì họ live bán hàng của shop.
 */
const PATH = '/analytics/202509/shop_lives/performance'

type Session = {
  id?: string
  title?: string
  username?: string
  start_time?: string
  end_time?: string
  sales_performance?: {
    gmv?: { amount?: string; currency?: string }
    products_added?: number
    different_products_sold?: number
    created_sku_orders?: number
    sku_orders?: number
    items_sold?: number
    customers?: number
  }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

/** Giây epoch → ISO. TikTok trả chuỗi số, không phải ISO. */
const toIso = (v?: string) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null
}

/** Ngày theo giờ Việt Nam, để khớp với cách mọi bảng khác chia ngày. */
const ngayVN = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10) : null

export async function syncLive(days = 370) {
  const db = supabaseAdmin()
  const ctx = await getShopContext()

  const out = { sessions: 0, pages: 0, newRooms: [] as string[], errors: [] as string[] }
  const known = new Set(
    ((await db.from('live_rooms').select('username')).data ?? []).map((r) => r.username),
  )

  // Chia mẻ 30 ngày: khoảng dài hơn hay bị API từ chối hoặc trả thiếu.
  for (let back = days; back > 0; back -= 30) {
    const start = new Date(Date.now() - back * 86_400_000)
    const end = new Date(Date.now() - Math.max(0, back - 30) * 86_400_000)
    if (end <= start) continue

    let pageToken = ''
    for (let page = 0; page < 40; page++) {
      let body: { data?: { live_stream_sessions?: Session[]; next_page_token?: string } }
      try {
        body = await ttsRequest({
          path: PATH,
          accessToken: ctx.accessToken,
          shopCipher: ctx.shopCipher,
          query: {
            start_date_ge: ymd(start),
            end_date_lt: ymd(end),
            page_size: 100,
            currency: 'LOCAL',
            ...(pageToken ? { page_token: pageToken } : {}),
          },
        })
      } catch (e) {
        out.errors.push(`${ymd(start)}: ${e instanceof Error ? e.message : String(e)}`)
        break
      }

      const list = body.data?.live_stream_sessions ?? []
      out.pages++
      if (!list.length) break

      const rows = list.map((s) => {
        const p = s.sales_performance ?? {}
        const startIso = toIso(s.start_time)
        return {
          session_id: String(s.id),
          username: s.username ?? '(không rõ)',
          title: s.title ?? null,
          start_time: startIso,
          end_time: toIso(s.end_time),
          ngay: ngayVN(startIso),
          currency: p.gmv?.currency ?? null,
          gmv: Number(p.gmv?.amount ?? 0),
          products_added: Number(p.products_added ?? 0),
          different_products_sold: Number(p.different_products_sold ?? 0),
          created_sku_orders: Number(p.created_sku_orders ?? 0),
          sku_orders: Number(p.sku_orders ?? 0),
          items_sold: Number(p.items_sold ?? 0),
          customers: Number(p.customers ?? 0),
          raw: s,
          synced_at: new Date().toISOString(),
        }
      })

      await db.from('live_sessions').upsert(rows, { onConflict: 'session_id' })
      out.sessions += rows.length

      // Tài khoản lạ thì ghi nhận là KOC, để không phải sửa code mỗi lần
      // team bắt tay với một KOC mới.
      const fresh = rows.map((r) => r.username).filter((u) => !known.has(u))
      if (fresh.length) {
        const uniq = Array.from(new Set(fresh))
        await db.from('live_rooms').upsert(
          uniq.map((u) => ({ username: u, ten: u, nhom: 'koc' })),
          { onConflict: 'username' },
        )
        uniq.forEach((u) => { known.add(u); out.newRooms.push(u) })
      }

      pageToken = body.data?.next_page_token ?? ''
      if (!pageToken) break
    }
  }

  return out
}
