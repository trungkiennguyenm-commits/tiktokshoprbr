import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { syncLive } from '@/lib/live/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 *   /api/cron/live?secret=<CRON_SECRET>            → 30 ngày gần nhất
 *   /api/cron/live?secret=<CRON_SECRET>&days=370   → kéo lại cả năm
 *
 * Được lượt đồng bộ quảng cáo gọi tiếp, vì gói Hobby chỉ cho 2 cron job.
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
    .insert({ shop_id: shop?.id, resource: 'live', status: 'running' })
    .select('id')
    .single()

  try {
    const res = await syncLive(Number.isFinite(days) && days > 0 ? days : 30)
    if (run?.id) {
      await db.from('sync_runs').update({
        finished_at: new Date().toISOString(),
        status: res.errors.length ? 'error' : 'success',
        records_read: res.sessions,
        records_written: res.sessions,
        page_count: res.pages,
        error_message: res.errors.slice(0, 5).join(' | ') || null,
      }).eq('id', run.id)
    }
    return NextResponse.json({ ok: true, ...res })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (run?.id) {
      await db.from('sync_runs').update({
        finished_at: new Date().toISOString(), status: 'error', error_message: message,
      }).eq('id', run.id)
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
