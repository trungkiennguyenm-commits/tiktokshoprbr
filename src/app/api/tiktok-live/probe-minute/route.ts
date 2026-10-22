import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getShopContext } from '@/lib/tts/connection'
import { ttsRequest } from '@/lib/tts/sign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Do thử endpoint "Get Shop LIVE Minute Performance" (202510) cho LiveHub.
 *
 * Vì sao cần: phòng Roborock live liên tục 8–12 tiếng một phiên, nhiều host
 * thay ca trong cùng một phiên. GMV cấp phiên (202509, đang sync) không chia
 * được cho từng host. LiveHub cần GMV theo từng giờ để tính hoa hồng host.
 *
 * Doc của TikTok render bằng JS nên không đọc được đường dẫn chính xác — thử
 * vài biến thể, in ra lỗi và hình dạng dữ liệu để chọn đúng cái.
 *
 * Chỉ ĐỌC, không ghi gì vào database. Nằm sau mật khẩu dashboard.
 *
 *   /api/tiktok-live/probe-minute                 → 2 phiên Roborock gần nhất
 *   /api/tiktok-live/probe-minute?id=<session_id> → một phiên cụ thể
 */
const CANDIDATES = [
  (id: string) => `/analytics/202510/shop_lives/${id}/performance_per_minutes`,
  (id: string) => `/analytics/202510/shop_lives/${id}/performance/per_minutes`,
  (id: string) => `/analytics/202510/shop_lives/${id}/minute_performance`,
  (id: string) => `/analytics/202510/shop_lives/${id}/performances_per_minute`,
]

/** Tóm tắt một phản hồi: các key, mảng dài nhất, vài phần tử đầu/cuối. */
function shape(data: unknown) {
  if (!data || typeof data !== 'object') return { kieu: typeof data }
  const obj = data as Record<string, unknown>
  const arrays = Object.entries(obj).filter(([, v]) => Array.isArray(v)) as [string, unknown[]][]
  const main = arrays.sort((a, b) => b[1].length - a[1].length)[0]
  return {
    keys: Object.keys(obj),
    mangChinh: main ? { ten: main[0], soPhanTu: main[1].length } : null,
    dau: main ? main[1].slice(0, 3) : null,
    cuoi: main ? main[1].slice(-2) : null,
    khac: Object.fromEntries(Object.entries(obj).filter(([, v]) => !Array.isArray(v))),
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  try {
    const ctx = await getShopContext()
    const db = supabaseAdmin()

    let sessions: { session_id: string; username: string; start_time: string; end_time: string; gmv: number }[]
    const one = url.searchParams.get('id')
    if (one) {
      const { data } = await db.from('live_sessions')
        .select('session_id,username,start_time,end_time,gmv').eq('session_id', one)
      sessions = data ?? []
    } else {
      const { data } = await db.from('live_sessions')
        .select('session_id,username,start_time,end_time,gmv')
        .like('username', 'roborock%').gt('gmv', 0)
        .order('start_time', { ascending: false }).limit(2)
      sessions = data ?? []
    }
    if (!sessions.length) return NextResponse.json({ ok: false, note: 'Không tìm thấy phiên nào trong live_sessions' })

    const ketQua: Record<string, unknown>[] = []
    for (const s of sessions) {
      for (const make of CANDIDATES) {
        const path = make(s.session_id)
        for (const query of [{ currency: 'LOCAL' }, {}] as Record<string, string>[]) {
          try {
            const data = await ttsRequest<unknown>({
              path, accessToken: ctx.accessToken, shopCipher: ctx.shopCipher, query,
            })
            ketQua.push({ phien: s.session_id, path, query, ok: true, duLieu: shape(data) })
            break
          } catch (e) {
            ketQua.push({ phien: s.session_id, path, query, ok: false, loi: e instanceof Error ? e.message : String(e) })
          }
        }
      }
    }

    const dung = ketQua.filter((r) => r.ok)
    return NextResponse.json({
      ok: true,
      ketLuan: dung.length
        ? `GỌI ĐƯỢC: ${Array.from(new Set(dung.map((r) => r.path as string).map((p) => p.replace(/\/\d{6,}\//, '/{id}/')))).join(', ')}`
        : 'Chưa biến thể nào gọi được — xem cột loi',
      phien: sessions,
      ketQua,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
