import { after } from 'next/server'

/**
 * Gọi mắt xích tiếp theo của chuỗi đồng bộ hằng đêm.
 *
 * VÌ SAO PHẢI NỐI CHUỖI: gói Hobby chỉ cho 2 cron job, mà đang có 6 nguồn
 * cần chạy. Hai khe cron dành cho refresh-tokens và orders; phần còn lại
 * móc đuôi nhau:
 *
 *   orders → ads → live → product → video → affiliate
 *
 * MỖI MẮT XÍCH LÀ MỘT LƯỢT GỌI RIÊNG, nên mỗi cái có trọn 300 giây của
 * nó. Gộp ba nguồn vào một route là chạm trần: riêng video đã mất 169
 * giây cho 6 tháng.
 *
 * HAI CÁI BẪY ĐÃ TRẢ GIÁ:
 *
 * 1. Phải gọi qua TÊN MIỀN PRODUCTION. Địa chỉ riêng của từng bản deploy
 *    bị Deployment Protection chặn 401 trước khi tới code.
 *
 * 2. Hết giờ chờ là BÌNH THƯỜNG, không phải lỗi. Mình chỉ cần kích cho nó
 *    chạy rồi buông; chờ phản hồi đầy đủ thì chính lượt gọi này hết giờ.
 *    Nuốt TimeoutError, nhưng ghi log mọi lỗi khác — nếu không thì một
 *    mắt xích đứt sẽ im lặng y như chuyện đã xảy ra với live_sessions:
 *    chú thích bảo có người gọi tiếp, thực tế không ai nối, và sheet đứng
 *    im 5 ngày mà không có gì báo.
 *
 * 3. NGƯỠNG CHỜ PHẢI ĐỦ CHO MỘT LẦN KHỞI ĐỘNG NGUỘI. Để 15 giây thì mắt
 *    xích cuối (affiliate) đứt ngay đêm đầu tiên: 3h sáng không ai gọi nó
 *    hàng giờ nên hàm nguội, nhận request mất hơn 15 giây, lượt gọi bị
 *    huỷ TRƯỚC KHI route kịp chạy — không có cả dòng 'running' trong
 *    sync_runs để lần ra. Cùng mắt xích đó gọi lúc giữa trưa thì khởi
 *    động sau 3 giây. Huỷ sớm không tiết kiệm được gì vì route gọi đang
 *    có 300 giây, nên để rộng tay.
 */
export function goiTiep(goc: string, duong: string, secret: string, tu: string) {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const url = new URL((host ? `https://${host}` : goc) + duong)

  after(async () => {
    try {
      await fetch(url.toString(), {
        headers: { authorization: `Bearer ${secret}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(90_000),
      })
    } catch (e) {
      const name = e instanceof Error ? e.name : ''
      if (name === 'TimeoutError' || name === 'AbortError') return
      console.error(`[${tu}] gọi tiếp ${duong} thất bại:`, e)
    }
  })
}
