import { supabaseAdmin } from '@/lib/supabase'

/**
 * Chặn số truy vấn chạy CÙNG LÚC.
 *
 * Trang này đã lên 30 view, phần lớn quét toàn bộ orders / order_items.
 * Promise.all bắn cả 30 một lượt thì Postgres phải chạy 30 seq scan song
 * song trên một instance nhỏ: không truy vấn nào sai, nhưng tất cả cùng
 * chậm lại và những cái vốn chỉ mất 200ms bị đẩy quá statement_timeout rồi
 * chết. "canceling statement due to statement timeout" trên một view nhẹ
 * như v_shipping_daily là dấu hiệu của nghẽn, không phải của view đó.
 *
 * Giữ Promise.all ở chỗ gọi (nếu không TS gộp 30 kiểu trả về thành union),
 * chỉ xếp hàng bên trong fetchAll. Tăng số này chỉ nên làm cùng lúc với
 * nâng cấu hình DB.
 *
 * Hạ 6 -> 4 cùng lúc với COT bên dưới: hai thứ chữa cùng một bệnh từ hai
 * đầu — COT giảm số byte mỗi lượt, số này giảm số lượt chạy cùng lúc.
 */
const SONG_SONG = 4
let dangChay = 0
const hangDoi: (() => void)[] = []

async function xinLuot() {
  if (dangChay < SONG_SONG) { dangChay++; return }
  await new Promise<void>((r) => hangDoi.push(r))
  dangChay++
}
function traLuot() {
  dangChay--
  hangDoi.shift()?.()
}

/**
 * Cột cần lấy, cho những view mà `select *` tốn vô ích.
 *
 * `v_video_thang` nặng 7,1 MB cho 6.860 dòng nhưng tự nó chạy hết 22ms —
 * toàn bộ chi phí là serialize JSON rồi đẩy qua 7 lần round-trip của
 * PostgREST. Riêng `title` chiếm 3,3 MB và `hash_tags` 0,9 MB mà không có
 * chỗ nào trong Dashboard đọc tới.
 *
 * Chỉ liệt kê những view đủ lớn để bù công bảo trì. Bỏ hai cột khỏi một
 * view 154 dòng không tiết kiệm gì mà lại thêm một chỗ để gõ sai tên.
 *
 * THÊM CỘT VÀO TYPE THÌ PHẢI THÊM VÀO ĐÂY, nếu không nó sẽ về undefined.
 */
const COT: Record<string, string> = {
  v_video_thang: [
    'thang', 'username', 'nick_name', 'author_type', 'video_url', 'video_nhan',
    'views', 'product_impressions', 'product_clicks', 'click_through_rate', 'ctor',
    'gmv', 'indirect_gmv', 'gpm', 'sku_orders', 'items_sold',
    'likes', 'comments', 'shares', 'new_followers',
    'product_name', 'model_short', 'category', 'so_product',
    'aff_don', 'aff_huy', 'aff_gmv_dat', 'aff_gmv_con',
  ].join(','),
  v_product_kenh: [
    'thang', 'kenh', 'san_pham', 'category',
    'product_impressions', 'product_clicks', 'add_cart_count',
    'orders', 'sku_orders', 'items_sold',
    'gmv', 'aov', 'refunds', 'refunded_items', 'chua_gan',
  ].join(','),
}

/**
 * Bốn nguồn nặng nhất trang, KHÔNG tải cùng lần dựng trang mà để sheet của
 * nó tự gọi khi được mở.
 *
 * Đo ngày 26/10: cả trang gửi về trình duyệt 21,6 MB JSON mỗi lần load,
 * trong đó
 *
 *   v_video_thang   10.535 KB  (7.280 dòng)  -> sheet Videos
 *   v_huy_chi_tiet   2.347 KB  (7.474 dòng)  -> sheet Cancellations
 *   v_product_kenh   2.118 KB  (4.053 dòng)  -> sheet Traffic
 *   v_huy_model      1.047 KB  (5.305 dòng)  -> sheet Cancellations
 *
 * Tức mở sheet Sales cũng phải chờ xong 10,5 MB dữ liệu video. Phía
 * database bốn view này rẻ (19ms, 439ms, 60ms, 178ms) — chi phí là truyền
 * và parse, nên chữa bằng cách đừng gửi, không phải bằng cách tối ưu view.
 *
 * ĐÃ KIỂM: mỗi nguồn chỉ được đọc trong đúng sheet của nó (s7, s5, s4),
 * không có memo nào ở sheet khác dùng tới. Thêm nguồn vào đây thì phải
 * kiểm lại điều đó, nếu không sheet khác sẽ lặng lẽ hiện số 0.
 *
 * v_sku_daily (2.259 KB) CỐ Ý không nằm đây: đó là sheet Sales, mở mỗi
 * sáng, cho nó chờ là đi ngược mục đích.
 */
export const VIEW_LAZY = {
  videoThang: 'v_video_thang',
  huyChiTiet: 'v_huy_chi_tiet',
  huyModel: 'v_huy_model',
  productKenh: 'v_product_kenh',
} as const

export type KhoaLazy = keyof typeof VIEW_LAZY

/** PostgREST caps a single response (1000 rows by default) and several of
 *  these views are already past that. Page until a short page comes back. */
export async function fetchAll<T>(db: ReturnType<typeof supabaseAdmin>, view: string): Promise<T[]> {
  const SIZE = 1000
  const out: T[] = []
  const cot = COT[view] ?? '*'
  await xinLuot()
  try {
    for (let page = 0; page < 25; page++) {
      const { data, error } = await db.from(view).select(cot).range(page * SIZE, page * SIZE + SIZE - 1)
      if (error) throw new Error(`${view}: ${error.message}`)
      const rows = (data ?? []) as T[]
      out.push(...rows)
      if (rows.length < SIZE) break
    }
  } finally {
    traLuot()
  }
  return out
}

/**
 * Supabase trả numeric/bigint về dạng chuỗi, đổi lại thành số.
 *
 * CẨN THẬN: id 19 chữ số cũng "trông như số" nên sẽ bị ép qua Number và
 * mất chính xác. Vì vậy video_nhan được dựng sẵn trong SQL với tiền tố '·'
 * để nó ở lại dạng chuỗi — đừng bỏ tiền tố đó.
 */
export const num = <T,>(rows: T[]) =>
  rows.map((r) => {
    const o: Record<string, unknown> = { ...(r as Record<string, unknown>) }
    for (const k of Object.keys(o)) {
      if (typeof o[k] === 'string' && o[k] !== '' && !isNaN(Number(o[k]))) o[k] = Number(o[k])
    }
    return o as T
  })
