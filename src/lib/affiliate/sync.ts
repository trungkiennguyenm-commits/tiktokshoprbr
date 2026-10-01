import { supabaseAdmin } from '@/lib/supabase'
import { getShopContext } from '@/lib/tts/connection'
import { ttsRequest } from '@/lib/tts/sign'

/**
 * Kéo đơn affiliate về bảng affiliate_order_skus.
 *
 * Đây là nguồn DUY NHẤT nối order_id của shop với creator, nên có nó thì
 * tỷ lệ huỷ theo creator và theo loại nội dung (VIDEO / LIVE / SHOP) tính
 * được bằng chính định nghĩa huỷ đang dùng, không phải xin TikTok.
 *
 * BA CÁI BẪY ĐÃ TRẢ GIÁ — đừng sửa nếu chưa đọc:
 *
 * 1. Query BẮT BUỘC có `version` và `shop_id`. Doc không ghi hai cái này,
 *    nhưng thiếu `version` thì gateway trả 105005 "app chưa được cấp
 *    scope" — thông báo sai hoàn toàn so với nguyên nhân thật. Mất một
 *    buổi đi bật scope vô ích vì tin vào thông báo đó.
 *
 * 2. Mỗi request chỉ hỏi được TỐI ĐA 3 THÁNG. Kéo dài hơn thì phải chia
 *    cửa sổ, nên hàm này tự cắt theo từng khoảng 80 ngày.
 *
 * 3. PHẠM VI: chỉ đơn có hoa hồng affiliate, tức creator ngoài. Khoảng 3%
 *    tổng số đơn. Ba phòng live của chính shop KHÔNG nằm trong đây vì đó
 *    là live của shop, không phát hoa hồng. Đừng trình bày số ở bảng này
 *    như tỷ lệ huỷ của cả shop.
 */
const PATH = '/affiliate_seller/202410/orders/search'
const CUA_SO = 80 * 86_400 // giây — dưới trần 3 tháng của API
const TRANG_TOI_DA = 60    // chặn vòng lặp vô hạn nếu token phân trang lặp

type Tien = { amount?: string; currency?: string }
type Sku = {
  sku_id?: string
  creator_username?: string
  content_type?: string
  content_id?: string
  product_id?: string
  quantity?: number
  price?: Tien
  settlement_status?: string
  fully_return?: string
  is_carousel?: boolean
  commission_model?: string
  commission_rate?: string
  shop_ads_commission_rate?: string
  estimated_commission_base?: Tien
  actual_commission_base?: Tien
  campaign_id?: string
  open_collaboration_id?: string
  target_collaboration_id?: string
}
type Order = {
  id?: string
  create_time?: number
  status?: string
  skus?: Sku[]
}

const soTien = (t?: Tien) => {
  const v = Number(t?.amount ?? NaN)
  return Number.isFinite(v) ? v : null
}
const soChuoi = (s?: string) => {
  const v = Number(s ?? NaN)
  return Number.isFinite(v) ? v : null
}
const rong = (s?: string) => (s && s.length ? s : null)

export async function syncAffiliateOrders(days = 60) {
  const ctx = await getShopContext()
  const db = supabaseAdmin()

  const den = Math.floor(Date.now() / 1000)
  const tu = den - days * 86_400

  const errors: string[] = []
  let doc = 0
  let ghi = 0
  let trang = 0

  for (let batDau = tu; batDau < den; batDau += CUA_SO) {
    const ketThuc = Math.min(batDau + CUA_SO, den)
    let pageToken: string | undefined

    for (let i = 0; i < TRANG_TOI_DA; i++) {
      try {
        const data = await ttsRequest<{
          orders?: Order[]
          next_page_token?: string
        }>({
          path: PATH,
          method: 'POST',
          accessToken: ctx.accessToken,
          shopCipher: ctx.shopCipher,
          query: {
            page_size: 100,
            version: 202410,
            shop_id: ctx.ttsShopId,
            ...(pageToken ? { page_token: pageToken } : {}),
          },
          body: { create_time_ge: batDau, create_time_lt: ketThuc },
        })

        trang += 1
        const orders = data.orders ?? []
        doc += orders.length

        const rows = orders.flatMap((o) =>
          (o.skus ?? [])
            .filter((s) => o.id && s.sku_id)
            .map((s) => ({
              order_id: o.id as string,
              sku_id: s.sku_id as string,
              create_time: o.create_time ? new Date(o.create_time * 1000).toISOString() : null,
              order_status: rong(o.status),

              creator_username: rong(s.creator_username),
              content_type: rong(s.content_type),
              content_id: rong(s.content_id),

              product_id: rong(s.product_id),
              quantity: s.quantity ?? null,
              price: soTien(s.price),

              settlement_status: rong(s.settlement_status),
              fully_return: rong(s.fully_return),
              is_carousel: s.is_carousel ?? null,

              commission_model: rong(s.commission_model),
              commission_rate: soChuoi(s.commission_rate),
              shop_ads_commission_rate: soChuoi(s.shop_ads_commission_rate),
              commission_base:
                soTien(s.actual_commission_base) ?? soTien(s.estimated_commission_base),

              campaign_id: rong(s.campaign_id),
              open_collaboration_id: rong(s.open_collaboration_id),
              target_collaboration_id: rong(s.target_collaboration_id),

              synced_at: new Date().toISOString(),
            })),
        )

        if (rows.length) {
          // Một đơn có thể trả cùng sku_id hai lần trong một trang; gộp
          // trước khi upsert, nếu không Postgres báo "ON CONFLICT ... cannot
          // affect row a second time".
          const gop = new Map<string, (typeof rows)[number]>()
          for (const r of rows) gop.set(`${r.order_id}|${r.sku_id}`, r)

          const { error } = await db
            .from('affiliate_order_skus')
            .upsert(Array.from(gop.values()), { onConflict: 'order_id,sku_id' })
          if (error) throw new Error(error.message)
          ghi += gop.size
        }

        pageToken = data.next_page_token || undefined
        if (!pageToken) break
      } catch (e) {
        errors.push(
          `${new Date(batDau * 1000).toISOString().slice(0, 10)}: ` +
            (e instanceof Error ? e.message : String(e)),
        )
        break
      }
    }
  }

  return { days, orders: doc, rows: ghi, pages: trang, errors }
}
