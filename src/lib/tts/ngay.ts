/**
 * Ngày dạng YYYY-MM-DD theo MÚI GIỜ SHOP (Asia/Ho_Chi_Minh).
 *
 * VÌ SAO KHÔNG DÙNG toISOString(): nó trả ngày theo UTC. Cron chạy 03:00
 * giờ Việt Nam, tức 20:00 UTC của NGÀY HÔM TRƯỚC — nên mọi khoảng ngày
 * tính bằng UTC đều lùi một ngày so với ý định.
 *
 * Hậu quả thật đã gặp: sync livestream hỏi "đến trước ngày 7/10" trong khi
 * ở Việt Nam đã là ngày 8, nên dữ liệu luôn dừng ở ngày 6. Thiếu đúng một
 * ngày, mỗi ngày, và không báo lỗi gì — chạy "thành công" với số liệu cũ.
 *
 * Mọi endpoint analytics của TikTok Shop đều nhận ngày theo múi giờ shop
 * đăng ký, nên mọi chỗ dựng khoảng ngày phải đi qua hàm này.
 */
const DINH_DANG = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function ymdVN(d: Date = new Date()): string {
  return DINH_DANG.format(d)
}

/** Lùi n ngày rồi lấy ngày theo giờ Việt Nam. */
export function ymdVNLui(n: number, goc: Date = new Date()): string {
  return ymdVN(new Date(goc.getTime() - n * 86_400_000))
}
