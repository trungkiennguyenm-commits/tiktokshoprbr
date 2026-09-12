import { TTS } from '@/lib/tts/config'
import { ttsRequest, withRetry } from '@/lib/tts/sign'
import { supabaseAdmin } from '@/lib/supabase'
import type { ShopContext } from '@/lib/tts/connection'
import type { SyncAdapter, SyncPage } from '../runner'

/**
 * Đồng bộ đơn hàng.
 *
 * Cursor ở đây là hai phần ghép bằng dấu "|":
 *   <mốc thời gian update_time_ge>|<page_token>
 * Nhờ vậy vừa nhớ được lấy từ đâu, vừa nhớ được đang ở trang nào.
 *
 * LƯU Ý: tên field trong response của TikTok có thể đổi theo version.
 * Vì vậy toàn bộ payload gốc được lưu vào cột `raw` — nếu map sai field nào
 * thì vẫn tính lại được từ `raw` mà không phải kéo lại dữ liệu.
 */

type TtsOrder = {
  id: string
  status?: string
  create_time?: number
  update_time?: number
  paid_time?: number
  delivery_time?: number
  cancel_reason?: string
  cancel_user?: string
  payment?: { total_amount?: string; currency?: string }
  payment_method_name?: string
  recipient_address?: { region_code?: string }
  line_items?: Array<{
    id?: string
    sku_id?: string
    product_id?: string
    product_name?: string
    sku_name?: string
    original_price?: string
    sale_price?: string
  }>
  [k: string]: unknown
}

const PAGE_SIZE = 50

/** Backfill mặc định 90 ngày khi chạy lần đầu. */
const DEFAULT_BACKFILL_DAYS = 90

function parseCursor(cursor: string): { since: number; pageToken: string } {
  const [sincePart, tokenPart = ''] = cursor.split('|')
  return { since: Number(sincePart), pageToken: tokenPart }
}

function toSeconds(d: Date) {
  return Math.floor(d.getTime() / 1000)
}

function tsToIso(seconds?: number): string | null {
  if (!seconds) return null
  return new Date(seconds * 1000).toISOString()
}

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

  async fetchPage(ctx: ShopContext, cursor: string): Promise<SyncPage<TtsOrder>> {
    const { since, pageToken } = parseCursor(cursor)

    const data = await withRetry(() =>
      ttsRequest<{
        orders?: TtsOrder[]
        next_page_token?: string
        total_count?: number
      }>({
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
      paid_time: tsToIso(o.paid_time),
      delivery_time: tsToIso(o.delivery_time),
      update_time: tsToIso(o.update_time),
      cancel_time: o.status === 'CANCELLED' ? tsToIso(o.update_time) : null,
      cancel_reason: o.cancel_reason ?? null,
      cancel_by: o.cancel_user ?? null,
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
        quantity: 1,
        original_price: toNumber(li.original_price),
        sale_price: toNumber(li.sale_price),
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
