import { supabaseAdmin } from '@/lib/supabase'
import { getShopContext } from '@/lib/tts/connection'
import { ttsRequest } from '@/lib/tts/sign'

/**
 * Kéo phễu từng sản phẩm, tách theo kênh, về shop_product_channel_monthly.
 *
 * Rẻ hơn hẳn sync video: shop có 142 sản phẩm, 100 mỗi trang → 2 lượt gọi
 * cho một tháng.
 *
 * CÁC KÊNH KHÔNG RỜI NHAU. SHOP_TAB cắt ngang các kênh khác, AFF_LIVE và
 * AFF_VIDEO nằm trong AFF_TOTAL. Cộng cả tám sẽ vượt xa TOTAL. Xem ghi chú
 * trong migration của bảng trước khi viết truy vấn nào có SUM.
 *
 * Cửa sổ lookback giống các endpoint analytics khác (~180 ngày) — hàm bỏ
 * qua trước các tháng ngoài cửa sổ thay vì gọi để nhận 28001022.
 */
const PATH = '/analytics/202605/shop_products/performance'
const TRANG_TOI_DA = 20
const LOOKBACK_NGAY = 175

type Tien = { amount?: string; currency?: string }
type Khoi = Record<string, unknown>
type SanPham = { id?: string } & Record<string, Khoi | string | undefined>

const soTien = (t: unknown) => {
  const v = Number((t as Tien)?.amount ?? NaN)
  return Number.isFinite(v) ? v : null
}
const soChuoi = (s: unknown) => {
  const v = Number(s ?? NaN)
  return Number.isFinite(v) ? v : null
}
const soNguyen = (n: unknown) => (typeof n === 'number' ? n : null)
const ngayISO = (d: Date) => d.toISOString().slice(0, 10)

/** Tên khối của TikTok → tên kênh ngắn dùng trong bảng. */
const KENH: Record<string, string> = {
  total_performance: 'TOTAL',
  seller_live_performance: 'SELLER_LIVE',
  seller_video_performance: 'SELLER_VIDEO',
  seller_product_card_performance: 'SELLER_CARD',
  affiliate_total_performance: 'AFF_TOTAL',
  affiliate_live_performance: 'AFF_LIVE',
  affiliate_video_performance: 'AFF_VIDEO',
  shop_tab_performance: 'SHOP_TAB',
}

/**
 * Một khối → một dòng.
 *
 * BA TÊN TRƯỜNG KHÔNG ĐỒNG NHẤT giữa các khối, TikTok đặt khác nhau:
 *   gmv            : total→gmv, seller/aff→attributed_gmv,
 *                    aff_live→live_attributed_gmv,
 *                    aff_video→attributed_video_gmv, shop_tab→shop_tab_gmv
 *   add_cart_users : vài khối gọi là atc_users
 *   shop_tab       : mọi trường đều có tiền tố shop_tab_
 * Đọc thiếu một biến thể là cột im lặng thành null, không báo lỗi gì cả.
 */
function doiDong(k: Khoi, kenh: string) {
  const lay = (...ten: string[]) => {
    for (const t of ten) if (k[t] !== undefined) return k[t]
    return undefined
  }

  return {
    product_impressions: soNguyen(lay('product_impressions', 'shop_tab_product_impressions')),
    product_clicks: soNguyen(lay('product_clicks', 'shop_tab_product_clicks')),
    ctr: soChuoi(lay('ctr', 'shop_tab_ctr')),
    add_cart_count: soNguyen(lay('add_cart_count')),
    add_cart_rate: soChuoi(lay('add_cart_rate')),
    click_order_rate: soChuoi(lay('click_order_rate', 'shop_tab_ctor_sku')),
    unique_product_impressions: soNguyen(lay('unique_product_impressions')),
    unique_clicks: soNguyen(lay('unique_clicks', 'unique_shop_tab_product_clicks')),
    unique_ctr: soChuoi(lay('unique_ctr')),
    add_cart_users: soNguyen(lay('add_cart_users', 'atc_users')),
    unique_atc_rate: soChuoi(lay('unique_atc_rate')),
    unique_click_order_rate: soChuoi(lay('unique_click_order_rate')),

    gmv: soTien(lay('gmv', 'attributed_gmv', 'live_attributed_gmv',
      'attributed_video_gmv', 'shop_tab_gmv')),
    orders: soNguyen(lay('orders', 'attributed_orders')),
    sku_orders: soNguyen(lay('sku_orders', 'attributed_sku_orders')),
    items_sold: soNguyen(lay('items_sold', 'attributed_sold_items', 'shop_tab_sold_items')),
    estimated_customers: soNguyen(lay('estimated_customers', 'estimated_shop_tab_customers')),
    aov: soTien(lay('aov')),

    gross_merchandise_value: kenh === 'TOTAL' ? soTien(lay('gross_merchandise_value')) : null,
    refunds: kenh === 'TOTAL' ? soTien(lay('refunds')) : null,
    refunded_items: kenh === 'TOTAL' ? soNguyen(lay('refunded_items')) : null,
    refund_customers: kenh === 'TOTAL' ? soNguyen(lay('refund_customers')) : null,
    shipping_fees: kenh === 'TOTAL' ? soTien(lay('shipping_fees')) : null,

    new_live_count: soNguyen(lay('new_live_count')),
    new_video_count: soNguyen(lay('new_video_count')),
    avg_daily_creator_posted_content: soNguyen(lay('avg_daily_creator_posted_content')),
  }
}

function cacThang(soThang: number, lui: number) {
  const ra: { dau: Date; cuoi: Date }[] = []
  const now = new Date()
  for (let i = lui; i < lui + soThang; i++) {
    ra.push({
      dau: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)),
      cuoi: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1)),
    })
  }
  return ra
}

export async function syncProductChannels(soThang = 1, lui = 0) {
  const ctx = await getShopContext()
  const db = supabaseAdmin()

  const errors: string[] = []
  const boQua: string[] = []
  let sanPham = 0
  let ghi = 0
  let trang = 0

  const somNhat = Date.now() - LOOKBACK_NGAY * 86_400_000

  for (const { dau, cuoi } of cacThang(soThang, lui)) {
    const thang = ngayISO(dau)
    if (dau.getTime() < somNhat) { boQua.push(thang); continue }

    const hetNgay = cuoi.getTime() > Date.now() ? ngayISO(new Date()) : ngayISO(cuoi)
    let pageToken: string | undefined

    for (let i = 0; i < TRANG_TOI_DA; i++) {
      try {
        const data = await ttsRequest<{
          products?: SanPham[]
          next_page_token?: string
        }>({
          path: PATH,
          accessToken: ctx.accessToken,
          shopCipher: ctx.shopCipher,
          query: {
            start_date_ge: thang,
            end_date_lt: hetNgay,
            page_size: 100,
            sort_field: 'gmv',
            sort_order: 'DESC',
            currency: 'LOCAL',
            product_status_filter: 'ALL',
            ...(pageToken ? { page_token: pageToken } : {}),
          },
        })

        trang += 1
        const ds = (data.products ?? []).filter((p) => p.id)
        sanPham += ds.length

        const rows: Record<string, unknown>[] = []
        for (const p of ds) {
          for (const [tenKhoi, kenh] of Object.entries(KENH)) {
            const khoi = p[tenKhoi]
            if (!khoi || typeof khoi !== 'object') continue
            rows.push({
              product_id: p.id as string,
              thang,
              kenh,
              ...doiDong(khoi as Khoi, kenh),
              synced_at: new Date().toISOString(),
            })
          }
        }

        if (rows.length) {
          const { error } = await db
            .from('shop_product_channel_monthly')
            .upsert(rows, { onConflict: 'product_id,thang,kenh' })
          if (error) throw new Error(error.message)
          ghi += rows.length
        }

        pageToken = data.next_page_token || undefined
        if (!pageToken) break
      } catch (e) {
        errors.push(`${thang}: ${e instanceof Error ? e.message : String(e)}`)
        break
      }
    }
  }

  return {
    months: soThang, lui, products: sanPham, rows: ghi, pages: trang,
    bo_qua_ngoai_cua_so: boQua, errors,
  }
}
