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
 * HAI CÁI BẪY ĐÃ TRẢ GIÁ:
 *
 * 1. ttsRequest() ĐÃ bóc sẵn json.data rồi. Bản đầu viết
 *    body.data?.live_stream_sessions → lúc nào cũng undefined, chạy sạch
 *    không lỗi mà lưu được 0 dòng. Đọc thẳng body.live_stream_sessions.
 *
 * 2. API chỉ cho tra ngược ~180 ngày. Xa hơn trả 28001022 với thông báo
 *    "start_date_ge must be earlier than end_date_lt" — nghe như sai thứ tự
 *    ngày nhưng thật ra là quá hạn lookback. Mặc định để 175 ngày cho chắc.
 *
 * Điểm cộng bất ngờ: endpoint này trả luôn interaction_performance (view,
 * viewer, like, comment, share, follow mới, click, impression, thời lượng
 * xem TB). Ba endpoint live_rooms/* trong doc creator chỉ thừa ra phần
 * nguồn traffic và số liệu từng sản phẩm.
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
    avg_price?: { amount?: string }
    '24h_live_gmv'?: { amount?: string }
    products_added?: number
    different_products_sold?: number
    created_sku_orders?: number
    sku_orders?: number
    items_sold?: number
    customers?: number
  }
  interaction_performance?: {
    views?: number
    viewers?: number
    likes?: number
    comments?: number
    shares?: number
    new_followers?: number
    product_clicks?: number
    product_impressions?: number
    avg_viewing_duration?: string | number
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

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Lookback tối đa API cho phép. Vượt là 28001022. */
export const LIVE_LOOKBACK_DAYS = 175

export async function syncLive(days = LIVE_LOOKBACK_DAYS) {
  const db = supabaseAdmin()
  const ctx = await getShopContext()

  const capped = Math.min(days, LIVE_LOOKBACK_DAYS)
  const out = {
    sessions: 0,
    pages: 0,
    days: capped,
    capped: days > capped,
    newRooms: [] as string[],
    errors: [] as string[],
  }

  const known = new Set(
    ((await db.from('live_rooms').select('username')).data ?? []).map((r) => r.username),
  )

  // Chia mẻ 30 ngày: khoảng dài hơn hay bị API từ chối hoặc trả thiếu.
  for (let back = capped; back > 0; back -= 30) {
    const start = new Date(Date.now() - back * 86_400_000)
    const end = new Date(Date.now() - Math.max(0, back - 30) * 86_400_000)
    if (end <= start) continue

    let pageToken = ''
    for (let page = 0; page < 40; page++) {
      let body: { live_stream_sessions?: Session[]; next_page_token?: string; total_count?: number }
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
        out.errors.push(`${ymd(start)}→${ymd(end)}: ${e instanceof Error ? e.message : String(e)}`)
        break
      }

      const list = body.live_stream_sessions ?? []
      out.pages++
      if (!list.length) break

      const rows = list.map((s) => {
        const p = s.sales_performance ?? {}
        const i = s.interaction_performance ?? {}
        const startIso = toIso(s.start_time)
        const endIso = toIso(s.end_time)
        return {
          session_id: String(s.id),
          username: s.username ?? '(không rõ)',
          title: s.title ?? null,
          start_time: startIso,
          end_time: endIso,
          ngay: ngayVN(startIso),
          duration_phut:
            startIso && endIso
              ? Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000)
              : null,
          currency: p.gmv?.currency ?? null,
          gmv: num(p.gmv?.amount),
          gmv_24h: num(p['24h_live_gmv']?.amount),
          avg_price: num(p.avg_price?.amount),
          products_added: num(p.products_added),
          different_products_sold: num(p.different_products_sold),
          created_sku_orders: num(p.created_sku_orders),
          sku_orders: num(p.sku_orders),
          items_sold: num(p.items_sold),
          customers: num(p.customers),
          views: num(i.views),
          viewers: num(i.viewers),
          likes: num(i.likes),
          comments: num(i.comments),
          shares: num(i.shares),
          new_followers: num(i.new_followers),
          product_clicks: num(i.product_clicks),
          product_impressions: num(i.product_impressions),
          avg_viewing_duration: num(i.avg_viewing_duration),
          raw: s,
          synced_at: new Date().toISOString(),
        }
      })

      const { error } = await db.from('live_sessions').upsert(rows, { onConflict: 'session_id' })
      if (error) {
        out.errors.push(`upsert ${ymd(start)}: ${error.message}`)
        break
      }
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

      pageToken = body.next_page_token ?? ''
      if (!pageToken) break
    }
  }

  return out
}
