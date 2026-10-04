import { NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { syncAds } from '@/lib/ads/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Đồng bộ quảng cáo.
 *
 *   /api/cron/ads?secret=<CRON_SECRET>            → 30 ngày gần nhất
 *   /api/cron/ads?secret=<CRON_SECRET>&days=400   → kéo lại cả năm
 *
 * Gói Hobby chỉ cho 2 cron job, mà hai chỗ đó đã dùng cho refresh-tokens và
 * orders. Nên route này được lượt orders gọi tiếp sau khi chạy xong, thay vì
 * có lịch riêng.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = process.env.CRON_SECRET
  const authorized =
    request.headers.get('authorization') === `Bearer ${secret}` ||
    url.searchParams.get('secret') === secret
  if (!secret || !authorized) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
  }

  const days = Number(url.searchParams.get('days'))
  const db = supabaseAdmin()
  const { data: shop } = await db.from('shops').select('id').limit(1).single()

  const { data: run } = await db
    .from('sync_runs')
    .insert({ shop_id: shop?.id, resource: 'ads', status: 'running' })
    .select('id')
    .single()

  try {
    const res = await syncAds(Number.isFinite(days) && days > 0 ? days : 30)
    if (run?.id) {
      await db
        .from('sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: res.errors.length ? 'error' : 'success',
          records_read: res.reportRows,
          records_written: res.reportRows,
          page_count: res.campaigns,
          error_message: res.errors.length ? res.errors.slice(0, 5).join(' | ') : null,
        })
        .eq('id', run.id)
    }

    // Gọi tiếp phần livestream. Gói Hobby chỉ cho 2 cron job (refresh-tokens
    // và orders), nên cả chuỗi hằng đêm móc đuôi nhau:
    //   orders → ads → live → product → video → affiliate
    //
    // Mắt xích này TRƯỚC ĐÂY KHÔNG TỒN TẠI: chú thích ở /api/cron/live nói
    // "được lượt đồng bộ quảng cáo gọi tiếp" nhưng thực tế chưa ai nối, nên
    // live_sessions chỉ cập nhật mỗi khi có người bấm tay — lần gần nhất
    // 25/09, trong khi orders vẫn chạy đều mỗi tối. Sheet Livestream vì thế
    // đứng im 5 ngày mà không có gì báo.
    //
    // Phải gọi qua TÊN MIỀN PRODUCTION: địa chỉ riêng của từng bản deploy bị
    // Deployment Protection chặn 401 trước khi tới code (xem chú thích dài
    // trong /api/cron/sync).
    {
      const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
      const liveUrl = new URL((host ? `https://${host}` : url.origin) + '/api/cron/live')
      after(async () => {
        try {
          await fetch(liveUrl.toString(), {
            headers: { authorization: `Bearer ${secret}` },
            cache: 'no-store',
            signal: AbortSignal.timeout(15_000),
          })
        } catch (e) {
          const name = e instanceof Error ? e.name : ''
          // Hết 15s nghĩa là nó đang chạy thật, bỏ đi là đúng.
          if (name === 'TimeoutError' || name === 'AbortError') return
          console.error('[ads] gọi tiếp /api/cron/live thất bại:', e)
        }
      })
    }

    return NextResponse.json({ ok: true, ...res })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (run?.id) {
      await db
        .from('sync_runs')
        .update({ finished_at: new Date().toISOString(), status: 'error', error_message: message })
        .eq('id', run.id)
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
