import { supabaseAdmin } from '@/lib/supabase'

/**
 * GMV / NMV live theo PHÒNG × NGÀY × GIỜ (giờ Việt Nam) — nguồn cho LiveHub
 * (app xếp lịch host, repo tts-host-scheduler) gán doanh số về từng host theo ca.
 *
 * Cách ghép (đã đối chiếu 22/10/2026):
 *   - Mỗi dòng sản phẩm trong đơn có `room_id` = id phiên live (khớp 100% với
 *     live_sessions.session_id). Đơn không có room_id là đơn video / trang sản
 *     phẩm → không thuộc host nào, không trả về.
 *   - Phiên → tài khoản live (username) qua live_sessions.
 *   - Giờ = giờ tạo đơn (create_time) theo giờ Việt Nam.
 *
 * Định nghĩa Kiên chốt (giống mọi màn của dashboard này):
 *   GMV = original_price − seller_discount, MỌI trạng thái đơn, bỏ quà tặng.
 *   NMV = như GMV nhưng bỏ đơn CANCELLED. Không dùng COMPLETED (chậm nhiều ngày).
 *
 * GMV ở đây cao hơn số GMV phiên TikTok báo (~15%) vì TikTok tính theo giá
 * khách trả. Đừng so lẫn hai số.
 */

export type HourlyRow = {
  username: string
  ngay: string          // YYYY-MM-DD theo giờ VN
  gio: number           // 0..23 theo giờ VN
  gmv: number
  nmv: number
  don: number           // số đơn (đếm order_id khác nhau)
  don_huy: number
  dong_sp: number       // số dòng sản phẩm không phải quà
}

const VN_MS = 7 * 3600_000

export async function liveHourly(from: string, to: string): Promise<{ rows: HourlyRow[]; tongDong: number }> {
  const db = supabaseAdmin()
  // Lấy rộng thêm 1 ngày hai đầu vì create_time lưu UTC
  const fromUtc = new Date(Date.parse(`${from}T00:00:00Z`) - VN_MS).toISOString()
  const toUtc = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000 - VN_MS).toISOString()

  type Item = {
    order_id: string; room_id: string; original_price: number | null; seller_discount: number | null;
    is_gift: boolean | null; orders: { create_time: string; status: string } | { create_time: string; status: string }[] | null
  }
  const items: Item[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await db
      .from('order_items')
      .select('order_id, room_id, original_price, seller_discount, is_gift, orders!inner(create_time, status)')
      .not('room_id', 'is', null)
      .gte('orders.create_time', fromUtc)
      .lt('orders.create_time', toUtc)
      .order('order_id')
      .order('line_item_id')
      .range(off, off + 999)
    if (error) throw new Error(error.message)
    items.push(...((data ?? []) as Item[]))
    if (!data || data.length < 1000) break
  }

  const roomIds = Array.from(new Set(items.map((i) => i.room_id)))
  const userOf = new Map<string, string>()
  for (let k = 0; k < roomIds.length; k += 300) {
    const { data, error } = await db.from('live_sessions').select('session_id, username')
      .in('session_id', roomIds.slice(k, k + 300))
    if (error) throw new Error(error.message)
    for (const s of data ?? []) userOf.set(String(s.session_id), s.username)
  }

  const agg = new Map<string, HourlyRow & { _don: Set<string>; _huy: Set<string> }>()
  for (const it of items) {
    if (it.is_gift) continue
    const o = Array.isArray(it.orders) ? it.orders[0] : it.orders
    if (!o) continue
    const vn = new Date(Date.parse(o.create_time) + VN_MS)
    const ngay = vn.toISOString().slice(0, 10)
    const gio = vn.getUTCHours()
    const username = userOf.get(String(it.room_id)) ?? `(phien ${it.room_id})`
    const key = `${username}|${ngay}|${gio}`
    let r = agg.get(key)
    if (!r) {
      r = { username, ngay, gio, gmv: 0, nmv: 0, don: 0, don_huy: 0, dong_sp: 0, _don: new Set(), _huy: new Set() }
      agg.set(key, r)
    }
    const v = Number(it.original_price ?? 0) - Number(it.seller_discount ?? 0)
    const huy = o.status === 'CANCELLED'
    r.gmv += v
    if (!huy) r.nmv += v
    r.dong_sp++
    r._don.add(it.order_id)
    if (huy) r._huy.add(it.order_id)
  }

  const rows = Array.from(agg.values())
    .filter((r) => r.ngay >= from && r.ngay <= to)
    .map(({ _don, _huy, ...r }) => ({ ...r, don: _don.size, don_huy: _huy.size }))
    .sort((a, b) => a.username.localeCompare(b.username) || a.ngay.localeCompare(b.ngay) || a.gio - b.gio)
  return { rows, tongDong: items.length }
}
