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
 * 2. Mỗi lần hỏi tối đa 60 ngày. Tháng luôn dưới ngưỡng đó nên hỏi theo
 *    tháng là an toàn.
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
    const hetNgay = cuoi.getTime() > Date.now() ? ymdVN() : ngayISO(cuoi)
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
            start_date_ge: thang,
            end_date_lt: hetNgay,
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

        if (videos.length) {
          const gop = new Map<string, Record<string, unknown>>()
          for (const v of videos) {
            const sp = v.products ?? []
            gop.set(v.id as string, {
              video_id: v.id as string,
              thang,

              username: v.username ?? v.creator?.user_name ?? null,
              nick_name: v.creator?.nick_name ?? null,
              author_type: v.creator?.author_type ?? null,
              creator_id: v.creator?.creator_id ?? null,

              title: v.title ?? null,
              duration: v.duration ?? null,
              video_post_time: v.video_post_time
                ? new Date(v.video_post_time.replace(' ', 'T') + 'Z').toISOString()
                : null,
              advertisable: v.advertisable ?? null,
              hash_tags: v.hash_tags ?? null,

              views: v.views ?? null,
              product_impressions: v.product_impressions ?? null,
              product_clicks: v.product_clicks ?? null,
              click_through_rate: soChuoi(v.click_through_rate),
              ctor: soChuoi(v.ctor),
              v_to_l_clicks: v.v_to_l_clicks ?? null,
              v_to_l_rate: soChuoi(v.v_to_l_rate),
              video_finish_rate: soChuoi(v.video_finish_rate),

              gmv: soTien(v.gmv),
              indirect_gmv: soTien(v.indirect_gmv),
              attributed_gmv: soTien(v.attributed_gmv),
              gpm: soTien(v.gpm),
              sku_orders: v.sku_orders ?? null,
              items_sold: v.items_sold ?? null,
              avg_customers: v.avg_customers ?? null,

              likes: v.likes ?? null,
              comments: v.comments ?? null,
              shares: v.shares ?? null,
              new_followers: v.new_followers ?? null,

              product_id: sp[0]?.id ?? null,
              product_name: sp[0]?.name ?? null,
              so_product: sp.length,

              synced_at: new Date().toISOString(),
            })
          }

          const { error } = await db
            .from('shop_video_monthly')
            .upsert(Array.from(gop.values()), { onConflict: 'video_id,thang' })
          if (error) throw new Error(error.message)
          ghi += gop.size
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
    months: soThang, lui, videos: doc, rows: ghi, pages: trang,
    // Tháng nằm ngoài cửa sổ ~180 ngày của API. Không phải lỗi.
    bo_qua_ngoai_cua_so: boQua,
    errors,
  }
}
