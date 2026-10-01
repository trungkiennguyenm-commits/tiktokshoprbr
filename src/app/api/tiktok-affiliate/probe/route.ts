import { NextResponse } from 'next/server'
import { getShopContext } from '@/lib/tts/connection'
import { ttsRequest } from '@/lib/tts/sign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Thử endpoint Search Seller Affiliate Orders.
 *
 * Đây là endpoint DUY NHẤT tìm được trả về cùng lúc order_id và creator —
 * tức là khoá nối giữa đơn hàng của mình và người bán hộ. Có nó thì tỷ lệ
 * huỷ theo creator và theo content_type (VIDEO / LIVE / SHOP...) tính được
 * bằng chính định nghĩa huỷ đang dùng trên dashboard, không phải xin TikTok.
 *
 * RỦI RO ĐÃ BIẾT: endpoint cần scope seller.affiliate_collaboration.read.
 * App đang có scope analytics và order, chưa chắc có scope này. Thiếu thì
 * trả 105005 hoặc tương tự, và phải bật scope trong App settings rồi uỷ
 * quyền lại shop — không sửa code nào cứu được.
 *
 * Khác hai bộ Analytics ở ba chỗ: POST chứ không GET, lọc theo Unix
 * timestamp chứ không theo chuỗi ngày, và mỗi lần hỏi tối đa 3 tháng.
 */
const PATH = '/affiliate_seller/202410/orders/search'

type Sku = {
  sku_id?: string; settlement_status?: string
  creator_username?: string; content_type?: string; content_id?: string
  product_id?: string; quantity?: number
  price?: { amount?: string; currency?: string }
  fully_return?: string
}
type Order = { id?: string; create_time?: number; skus?: Sku[] }

export async function GET(request: Request) {
  const url = new URL(request.url)
  const days = Number(url.searchParams.get('days') ?? '60')
  const now = Math.floor(Date.now() / 1000)
  const ge = now - days * 86_400

  try {
    const ctx = await getShopContext()
    const body = await ttsRequest<{
      orders?: Order[]; next_page_token?: string; total_count?: number
    }>({
      path: PATH,
      method: 'POST',
      accessToken: ctx.accessToken,
      shopCipher: ctx.shopCipher,
      query: { page_size: 100 },
      body: { create_time_ge: ge, create_time_lt: now },
    })

    const orders = body.orders ?? []
    const skus = orders.flatMap((o) => (o.skus ?? []).map((s) => ({ order_id: o.id, ...s })))

    // Đếm nhanh để biết dữ liệu có dùng được không
    const dem = (f: (s: typeof skus[number]) => string | undefined) => {
      const m = new Map<string, number>()
      for (const s of skus) m.set(f(s) ?? '(trống)', (m.get(f(s) ?? '(trống)') ?? 0) + 1)
      return Object.fromEntries(Array.from(m.entries()).sort((a, b) => b[1] - a[1]))
    }

    return NextResponse.json({
      ok: true,
      ngay_tu: new Date(ge * 1000).toISOString().slice(0, 10),
      total_count: body.total_count,
      so_don_trang_dau: orders.length,
      so_dong_sku: skus.length,
      co_order_id: skus.filter((s) => s.order_id).length,
      co_creator: skus.filter((s) => s.creator_username).length,
      theo_content_type: dem((s) => s.content_type),
      theo_creator: dem((s) => s.creator_username),
      theo_settlement: dem((s) => s.settlement_status),
      con_trang_sau: Boolean(body.next_page_token),
      mau: skus.slice(0, 3),
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
