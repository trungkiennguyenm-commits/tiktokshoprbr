import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { syncShopVideos } from '@/lib/video/sync'
import { goiTiep } from '@/lib/cron/chain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 *   /api/cron/video?secret=…                    → tháng hiện tại
 *   /api/cron/video?secret=…&months=3           → 3 tháng gần nhất
 *   /api/cron/video?secret=…&months=3&back=3    → lùi thêm 3 tháng nữa
 *
 * Backfill phải chia nhỏ: hơn 1.200 video mỗi tháng, 100 video một trang,
 * nên một tháng tốn khoảng 13 lượt gọi. Kéo quá 4 tháng một lần là chạm
 * trần 300 giây của Vercel.
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

  const months = Number(url.searchParams.get('months'))
  const back = Number(url.searchParams.get('back'))
  const db = supabaseAdmin()
  const { data: shop } = await db.from('shops').select('id').limit(1).single()
  const { data: run } = await db
    .from('sync_runs')
    .insert({ shop_id: shop?.id, resource: 'video', status: 'running' })
    .select('id')
    .single()

  try {
    const res = await syncShopVideos(
      Number.isFinite(months) && months > 0 ? months : 1,
      Number.isFinite(back) && back > 0 ? back : 0,
    )
    if (run?.id) {
      await db
        .from('sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: res.errors.length ? 'error' : 'success',
          records_read: res.videos,
          records_written: res.rows,
          page_count: res.pages,
          error_message: res.errors.slice(0, 5).join(' | ') || null,
        })
        .eq('id', run.id)
    }
    goiTiep(url.origin, '/api/cron/affiliate?days=60', secret, 'video')

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
