import { supabaseAdmin } from '@/lib/supabase'
import { getShopContext } from '@/lib/tts/connection'
import { ttsRequest } from '@/lib/tts/sign'
import { ymdVN } from '@/lib/tts/ngay'

/**
 * Kéo hiệu suất từng video về bảng shop_video_monthly.
 *
 * BỐN ĐIỀU CẦN BIẾT TRƯỚC KHI SỬA:
 *
 * 1. API gộp số theo khoảng ngày mình hỏi, KHÔNG trả theo ngày. Nên muốn
 *    có số theo tháng thì phải hỏi riêng từng tháng — không thể hỏi một
 *    phát cả năm rồi chia ra.
 *
 * 2. MỖI LẦN HỎI TỐI ĐA 30 NGÀY, không phải 60 như tôi tưởng lúc đầu.
 *    Tháng 31 ngày vượt trần, và lỗi trả về là 28001022 "date range cannot
 *    exceed 30 days". Bẫy ở chỗ nó chỉ nổ vào những tháng mà tháng LIỀN
 *    TRƯỚC có 31 ngày, nên đồng bộ chạy êm hàng tháng rồi đột nhiên hỏng —
 *    đúng chuyện đã xảy ra từ 07/11/2026, tháng 10 có 31 ngày.
 *
 *    Vì vậy một tháng phải chia thành nhiều cửa sổ ≤30 ngày. NHƯNG API trả
 *    số ĐÃ GỘP theo cửa sổ, mà bảng khoá theo (video_id, thang) — upsert
 *    từng cửa sổ thì cửa sổ sau ĐÈ cửa sổ trước và tháng đó chỉ còn số của
 *    mấy ngày cuối. Nên phải cộng dồn hết các cửa sổ rồi mới ghi một lần.
 *
 * 3. Shop này có hơn 1.200 video mỗi tháng, trang tối đa 100 → khoảng 13
 *    lượt gọi cho một tháng. Kéo 12 tháng là trên 150 lượt, quá 300 giây
 *    của Vercel. Vì vậy hàm nhận tham số số tháng và mốc bắt đầu, để
 *    backfill chia làm nhiều lần chạy.
 *
 * 4. Số tiền và số đơn ở đây là QUY KẾT CỦA TIKTOK, không trừ huỷ. Muốn
 *    biết đơn có sống không thì phải nối sang affiliate_order_skus theo
 *    video id — và chỉ video affiliate mới nối được.
 *
 * 5. CỬA SỔ LOOKBACK ~180 NGÀY. Hỏi tháng cũ hơn thì trả 28001022, không
 *    phải lỗi code và chạy lại bao nhiêu lần cũng vậy. Đã đo: mốc 01/04
 *    (184 ngày) bị từ chối, mốc 01/05 (154 ngày) thì qua. Vì vậy lịch sử
 *    video chỉ lùi được tới khoảng 6 tháng và sẽ TRƯỢT DẦN — tháng cũ
 *    nhất rụng đi khi thời gian trôi. Hàm này bỏ qua trước các tháng ngoài
 *    cửa sổ thay vì gọi để nhận lỗi.
 */
const PATH = '/analytics/202605/shop_videos/performance'
const TRANG_TOI_DA = 40
/** Cửa sổ lookback của endpoint, tính bằng ngày. Để 175 thay vì 180 cho
 *  có biên — TikTok tính theo múi giờ shop, không theo UTC. */
const LOOKBACK_NGAY = 175
/** Trần độ dài một lần hỏi, tính bằng ngày. */
const NGAY_TOI_DA = 30

type Tien = { amount?: string; currency?: string }
type Video = {
  id?: string
  username?: string
  title?: string
  duration?: number
  video_post_time?: string
  advertisable?: boolean
  hash_tags?: string[]
  creator?: { author_type?: string; creator_id?: string; nick_name?: string; user_name?: string }
  views?: number
  product_impressions?: number
  product_clicks?: number
  click_through_rate?: string
  ctor?: string
  v_to_l_clicks?: number
  v_to_l_rate?: string
  video_finish_rate?: string
  gmv?: Tien
  indirect_gmv?: Tien
  attributed_gmv?: Tien
  gpm?: Tien
  sku_orders?: number
  items_sold?: number
  avg_customers?: number
  likes?: number
  comments?: number
  shares?: number
  new_followers?: number
  products?: { id?: string; name?: string }[]
}

const soTien = (t?: Tien) => {
  const v = Number(t?.amount ?? NaN)
  return Number.isFinite(v) ? v : null
}
const soChuoi = (s?: string) => {
  const v = Number(s ?? NaN)
  return Number.isFinite(v) ? v : null
}
/** Mốc tháng tự dựng bằng Date.UTC nên toISOString là đúng cho chúng.
 *  Riêng mốc "hôm nay" phải theo múi giờ shop, nếu không tháng đang chạy
 *  thiếu mất ngày gần nhất — xem lib/tts/ngay.ts. */
const ngayISO = (d: Date) => d.toISOString().slice(0, 10)

/** Chia [dau, cuoi) thành các cửa sổ ≤ NGAY_TOI_DA ngày.
 *  Mốc cuối là loại trừ (end_date_lt), nên cửa sổ nối đuôi nhau không
 *  chồng lấn và không hở ngày nào. */
function cacCuaSo(dau: Date, cuoi: Date) {
  const ra: { tu: Date; den: Date }[] = []
  let tu = dau
  while (tu.getTime() < cuoi.getTime()) {
    const den = new Date(Math.min(tu.getTime() + NGAY_TOI_DA * 86_400_000, cuoi.getTime()))
    ra.push({ tu, den })
    tu = den
  }
  return ra
}

/** Danh sách tháng cần kéo, mới nhất trước. */
function cacThang(soThang: number, lui: number) {
  const ra: { dau: Date; cuoi: Date }[] = []
  const now = new Date()
  for (let i = lui; i < lui + soThang; i++) {
    const dau = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const cuoi = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1))
    ra.push({ dau, cuoi })
  }
  return ra
}

export async function syncShopVideos(soThang = 1, lui = 0) {
  const ctx = await getShopContext()
  const db = supabaseAdmin()

  const errors: string[] = []
  const boQua: string[] = []
  let doc = 0
  let ghi = 0
  let trang = 0

  const somNhat = Date.now() - LOOKBACK_NGAY * 86_400_000

  for (const { dau, cuoi } of cacThang(soThang, lui)) {
    const thang = ngayISO(dau)

    // Ngoài cửa sổ lookback: bỏ qua im lặng. Gọi cũng chỉ nhận 28001022.
    if (dau.getTime() < somNhat) {
      boQua.push(thang)
      continue
    }

    // Tháng đang chạy dở thì chốt ở hôm nay, đừng hỏi ngày tương lai.
    const hetDate = cuoi.getTime() > Date.now() ? new Date(`${ymdVN()}T00:00:00Z`) : cuoi

    /* Cộng dồn CẢ THÁNG rồi mới ghi một lần.
       API trả số đã gộp theo cửa sổ hỏi, nên upsert từng cửa sổ sẽ đè lên
       nhau — tháng 31 ngày chia hai cửa sổ thì chỉ còn số của ngày cuối. */
    const gop = new Map<string, Record<string, unknown>>()
    const soCuaSo = new Map<string, number>()
    let loiThang: string | null = null

    for (const { tu, den } of cacCuaSo(dau, hetDate)) {
      if (loiThang) break
      const tuISO = ngayISO(tu)
      const denISO = ngayISO(den)
      let pageToken: string | undefined

      for (let i = 0; i < TRANG_TOI_DA; i++) {
        try {
          const data = await ttsRequest<{
            videos?: Video[]
            next_page_token?: string
          }>({
            path: PATH,
            accessToken: ctx.accessToken,
            shopCipher: ctx.shopCipher,
            query: {
              start_date_ge: tuISO,
              end_date_lt: denISO,
              page_size: 100,
              sort_field: 'gmv',
              sort_order: 'DESC',
              currency: 'LOCAL',
              account_type: 'ALL',
              ...(pageToken ? { page_token: pageToken } : {}),
            },
          })

          trang += 1
          const videos = (data.videos ?? []).filter((v) => v.id)
          doc += videos.length

          for (const v of videos) {
            const id = v.id as string
            const sp = v.products ?? []
            const cu = gop.get(id)
            soCuaSo.set(id, (soCuaSo.get(id) ?? 0) + 1)

            const cong = (ten: string, them: number | null) => {
              const a = Number(cu?.[ten] ?? 0)
              const b = Number(them ?? 0)
              return cu?.[ten] == null && them == null ? null : a + b
            }

            gop.set(id, {
              video_id: id,
              thang,

              // Phần mô tả: lấy của cửa sổ mới nhất, không cộng.
              username: v.username ?? v.creator?.user_name ?? cu?.username ?? null,
              nick_name: v.creator?.nick_name ?? cu?.nick_name ?? null,
              author_type: v.creator?.author_type ?? cu?.author_type ?? null,
              creator_id: v.creator?.creator_id ?? cu?.creator_id ?? null,
              title: v.title ?? cu?.title ?? null,
              duration: v.duration ?? cu?.duration ?? null,
              video_post_time: v.video_post_time
                ? new Date(v.video_post_time.replace(' ', 'T') + 'Z').toISOString()
                : (cu?.video_post_time ?? null),
              advertisable: v.advertisable ?? cu?.advertisable ?? null,
              hash_tags: v.hash_tags ?? cu?.hash_tags ?? null,

              // Phần đếm được: cộng qua các cửa sổ.
              views: cong('views', v.views ?? null),
              product_impressions: cong('product_impressions', v.product_impressions ?? null),
              product_clicks: cong('product_clicks', v.product_clicks ?? null),
              v_to_l_clicks: cong('v_to_l_clicks', v.v_to_l_clicks ?? null),
              gmv: cong('gmv', soTien(v.gmv)),
              indirect_gmv: cong('indirect_gmv', soTien(v.indirect_gmv)),
              attributed_gmv: cong('attributed_gmv', soTien(v.attributed_gmv)),
              sku_orders: cong('sku_orders', v.sku_orders ?? null),
              items_sold: cong('items_sold', v.items_sold ?? null),
              avg_customers: cong('avg_customers', v.avg_customers ?? null),
              likes: cong('likes', v.likes ?? null),
              comments: cong('comments', v.comments ?? null),
              shares: cong('shares', v.shares ?? null),
              new_followers: cong('new_followers', v.new_followers ?? null),

              // Tỷ lệ: giữ nguyên của API khi tháng chỉ có MỘT cửa sổ; tháng
              // bị chia thì tính lại từ tử số và mẫu số đã cộng, bên dưới.
              click_through_rate: soChuoi(v.click_through_rate),
              ctor: soChuoi(v.ctor),
              gpm: soTien(v.gpm),
              // Hai tỷ lệ này không có mẫu số để tính lại, nên tháng bị chia
              // thì để null còn hơn ghi số của một cửa sổ rồi gọi là cả tháng.
              v_to_l_rate: soChuoi(v.v_to_l_rate),
              video_finish_rate: soChuoi(v.video_finish_rate),

              product_id: sp[0]?.id ?? cu?.product_id ?? null,
              product_name: sp[0]?.name ?? cu?.product_name ?? null,
              so_product: sp.length || (cu?.so_product ?? 0),

              synced_at: new Date().toISOString(),
            })
          }

          pageToken = data.next_page_token || undefined
          if (!pageToken) break
        } catch (e) {
          loiThang = `${thang} (${tuISO}→${denISO}): ${e instanceof Error ? e.message : String(e)}`
          break
        }
      }
    }

    if (loiThang) {
      errors.push(loiThang)
      continue
    }

    /* Tháng bị chia nhiều cửa sổ: tỷ lệ của từng cửa sổ không cộng được,
       nên tính lại từ tổng — đúng công thức Dashboard đang dùng để gộp. */
    for (const [id, r] of gop) {
      if ((soCuaSo.get(id) ?? 1) <= 1) continue
      const views = Number(r.views ?? 0)
      const clicks = Number(r.product_clicks ?? 0)
      const don = Number(r.sku_orders ?? 0)
      const tien = Number(r.gmv ?? 0)
      r.click_through_rate = views ? (clicks / views) * 100 : null
      r.ctor = clicks ? (don / clicks) * 100 : null
      r.gpm = views ? (tien / views) * 1000 : null
      r.v_to_l_rate = null
      r.video_finish_rate = null
    }

    if (gop.size) {
      const { error } = await db
        .from('shop_video_monthly')
        .upsert(Array.from(gop.values()), { onConflict: 'video_id,thang' })
      if (error) {
        errors.push(`${thang}: ghi thất bại — ${error.message}`)
        continue
      }
      ghi += gop.size
    }
  }

  return {
    months: soThang, lui, videos: doc, rows: ghi, pages: trang,
    // Tháng nằm ngoài cửa sổ ~180 ngày của API. Không phải lỗi.
    bo_qua_ngoai_cua_so: boQua,
    errors,
  }
}
