import { NextResponse } from 'next/server'
import { getShopContext } from '@/lib/tts/connection'
import { ttsRequest } from '@/lib/tts/sign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Thử hai endpoint hiệu suất sản phẩm trước khi dựng bảng.
 *
 *  LIST   /analytics/202605/shop_products/performance
 *         → mỗi sản phẩm một dòng, tách sẵn 8 khối kênh, có add-to-cart.
 *  DETAIL /analytics/202509/shop_products/{id}/performance
 *         → thêm cancel_and_refunds, ratings, top_contents, top_creators.
 *
 * Doc của TikTok đã sai một lần (thiếu content_type ở endpoint affiliate),
 * nên đọc dữ liệu thật rồi mới quyết cấu trúc bảng.
 */
const LIST = '/analytics/202605/shop_products/performance'
const DETAIL = (id: string) => `/analytics/202509/shop_products/${id}/performance`

export async function GET(request: Request) {
  const url = new URL(request.url)
  const days = Math.min(Number(url.searchParams.get('days') ?? '30'), 60)
  const ngay = (back: number) =>
    new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)

  try {
    const ctx = await getShopContext()

    const list = await ttsRequest<Record<string, unknown>>({
      path: LIST,
      accessToken: ctx.accessToken,
      shopCipher: ctx.shopCipher,
      query: {
        start_date_ge: ngay(days),
        end_date_lt: ngay(0),
        page_size: 100,
        sort_field: 'gmv',
        sort_order: 'DESC',
        currency: 'LOCAL',
        product_status_filter: 'ALL',
      },
    })

    const products = (list.products ?? []) as Record<string, unknown>[]
    const khoiKenh = new Set<string>()
    for (const p of products) for (const k of Object.keys(p)) khoiKenh.add(k)

    // Khối nào thực sự có số, khối nào rỗng — quyết định bảng lưu gì.
    const coSo: Record<string, number> = {}
    for (const p of products) {
      for (const [k, v] of Object.entries(p)) {
        if (v && typeof v === 'object') {
          const sum = JSON.stringify(v).match(/"amount":"([\d.]+)"/g)?.length ?? 0
          if (sum > 0 || Object.keys(v).length > 0) coSo[k] = (coSo[k] ?? 0) + 1
        }
      }
    }

    // Lấy chi tiết của sản phẩm bán tốt nhất để xem cancel_and_refunds,
    // ratings và top_creators có số thật không.
    const topId = products[0]?.id as string | undefined
    let detail: unknown = null
    let loiDetail: string | null = null
    if (topId) {
      try {
        detail = await ttsRequest<unknown>({
          path: DETAIL(topId),
          accessToken: ctx.accessToken,
          shopCipher: ctx.shopCipher,
          query: {
            start_date_ge: ngay(days),
            end_date_lt: ngay(0),
            granularity: 'ALL',
            currency: 'LOCAL',
          },
        })
      } catch (e) {
        loiDetail = e instanceof Error ? e.message : String(e)
      }
    }

    return NextResponse.json({
      ok: true,
      tu: ngay(days),
      den: ngay(0),
      latest_available_date: list.latest_available_date,
      total_count: list.total_count,
      so_san_pham_trang_dau: products.length,
      con_trang_sau: Boolean(list.next_page_token),
      khoi_kenh: Array.from(khoiKenh).sort(),
      khoi_co_du_lieu: coSo,
      mau_list: products.slice(0, 1),
      detail_cua: topId ?? null,
      detail_loi: loiDetail,
      detail,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
