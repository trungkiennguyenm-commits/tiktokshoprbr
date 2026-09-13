import { TTS } from '@/lib/tts/config'
import { ttsRequest, withRetry } from '@/lib/tts/sign'
import { supabaseAdmin } from '@/lib/supabase'
import type { ShopContext } from '@/lib/tts/connection'
import type { SyncAdapter, SyncPage } from '../runner'

/**
 * Đồng bộ đơn hàng.
 *
 * Cursor = "<mốc update_time_ge>|<page_token>".
 *
 * Toàn bộ payload gốc vẫn được lưu vào cột `raw`, nên nếu TikTok đổi tên field
 * thì tính lại được bằng SQL mà không phải kéo lại dữ liệu.
 *
 * ĐÃ ĐỐI CHIẾU VỚI DỮ LIỆU THẬT (2026-09-12, 2.250 đơn của Roborock Official VN):
 * - line_items KHÔNG có field số lượng. Mỗi phần tử = một đơn vị sản phẩm.
 *   Muốn biết số lượng bán thì ĐẾM số line_items, đừng cộng cột quantity.
 * - KHÔNG có creator_id / live_id / content_type trong Order API.
 *   Quy thuộc đơn về phiên live phải lấy từ Analytics API, không lấy ở đây.
 * - Field huỷ đúng tên là `cancel_time` và `cancellation_initiator`
 *   (không phải `cancel_user` như doc gợi ý).
 * - KHÔNG có `paid_time` ở cấp đơn hàng.
 * - `is_cod` có mặt ở mọi đơn và là yếu tố chi phối cancel rate mạnh nhất.
 */

type TtsLineItem = {
  id?: string
  sku_id?: string
  product_id?: string
  product_name?: string
  sku_name?: string
  seller_sku?: string
  sku_type?: string
  is_gift?: boolean
  original_price?: string
  sale_price?: string
  seller_discount?: string
  platform_discount?: string
}

type TtsOrder = {
  id: string
  status?: string
  create_time?: number
  update_time?: number
  cancel_time?: number
  paid_time?: number
  delivery_time?: number
  cancel_reason?: string
  cancellation_initiator?: string
  is_cod?: boolean
  order_type?: string
  commerce_platform?: string
  payment?: { total_amount?: string; currency?: string }
  payment_method_name?: string
  recipient_address?: { region_code?: string }
  line_items?: TtsLineItem[]
  [k: string]: unknown
}

const PAGE_SIZE = 50
const DEFAULT_BACKFILL_DAYS = 90
/** Biên chồng lấn giữa hai lần chạy, tính bằng ngày. */
const OVERLAP_DAYS = 2

function parseCursor(cursor: string): { since: number; pageToken: string } {
  const [sincePart, tokenPart = ''] = cursor.split('|')
  return { since: Number(sincePart), pageToken: tokenPart }
}

const toSeconds = (d: Date) => Math.floor(d.getTime() / 1000)

const tsToIso = (s?: number) => (s ? new Date(s * 1000).toISOString() : null)

function toNumber(v?: string): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const ordersAdapter: SyncAdapter<TtsOrder> = {
  name: 'orders',

  initialCursor() {
    const since = new Date()
    since.setDate(since.getDate() - DEFAULT_BACKFILL_DAYS)
    return `${toSeconds(since)}|`
  },

  /**
   * Sau khi kéo hết: lùi lại 2 ngày làm biên an toàn, để không sót đơn
   * được cập nhật ngay lúc giao thời giữa hai lần chạy.
   */
  completedCursor() {
    const since = new Date()
    since.setDate(since.getDate() - OVERLAP_DAYS)
    return `${toSeconds(since)}|`
  },

  async fetchPage(ctx: ShopContext, cursor: string): Promise<SyncPage<TtsOrder>> {
    const { since, pageToken } = parseCursor(cursor)

    const data = await withRetry(() =>
      ttsRequest<{ orders?: TtsOrder[]; next_page_token?: string }>({
        path: TTS.PATHS.orderList,
        method: 'POST',
        accessToken: ctx.accessToken,
        shopCipher: ctx.shopCipher,
        query: {
          page_size: PAGE_SIZE,
          sort_field: 'update_time',
          sort_order: 'ASC',
          ...(pageToken ? { page_token: pageToken } : {}),
        },
        body: { update_time_ge: since },
      }),
    )

    const rows = data.orders ?? []
    const next = data.next_page_token ?? ''

    return {
      rows,
      nextCursor: next ? `${since}|${next}` : null,
      hasMore: Boolean(next) && rows.length > 0,
    }
  },

  async upsert(ctx: ShopContext, rows: TtsOrder[]): Promise<number> {
    const db = supabaseAdmin()

    const orders = rows.map((o) => ({
      order_id: o.id,
      shop_id: ctx.shopId,
      status: o.status ?? null,
      create_time: tsToIso(o.create_time),
      update_time: tsToIso(o.update_time),
      cancel_time: tsToIso(o.cancel_time),
      delivery_time: tsToIso(o.delivery_time),
      paid_time: tsToIso(o.paid_time), // có ở ~40% đơn (đơn đã thanh toán)
      cancel_reason: o.cancel_reason ?? null,
      cancellation_initiator: o.cancellation_initiator ?? null,
      cancel_by: o.cancellation_initiator ?? null,
      is_cod: o.is_cod ?? null,
      order_type: o.order_type ?? null,
      commerce_platform: o.commerce_platform ?? null,
      total_amount: toNumber(o.payment?.total_amount),
      currency: o.payment?.currency ?? 'VND',
      payment_method: o.payment_method_name ?? null,
      buyer_region: o.recipient_address?.region_code ?? null,
      raw: o as unknown as Record<string, unknown>,
      synced_at: new Date().toISOString(),
    }))

    const { error: orderErr } = await db
      .from('orders')
      .upsert(orders, { onConflict: 'order_id' })
    if (orderErr) throw new Error(`Ghi orders thất bại: ${orderErr.message}`)

    const items = rows.flatMap((o) =>
      (o.line_items ?? []).map((li, idx) => ({
        order_id: o.id,
        line_item_id: li.id ?? `${o.id}-${idx}`,
        sku_id: li.sku_id ?? null,
        product_id: li.product_id ?? null,
        product_name: li.product_name ?? null,
        sku_name: li.sku_name ?? null,
        seller_sku: li.seller_sku ?? null,
        sku_type: li.sku_type ?? null,
        is_gift: li.is_gift ?? null,
        // Mỗi line_item là MỘT đơn vị sản phẩm — TikTok không trả số lượng.
        quantity: 1,
        original_price: toNumber(li.original_price),
        sale_price: toNumber(li.sale_price),
        seller_discount: toNumber(li.seller_discount),
        platform_discount: toNumber(li.platform_discount),
      })),
    )

    if (items.length > 0) {
      const { error: itemErr } = await db
        .from('order_items')
        .upsert(items, { onConflict: 'order_id,line_item_id' })
      if (itemErr) throw new Error(`Ghi order_items thất bại: ${itemErr.message}`)
    }

    return orders.length
  },
}
