import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { syncProductChannels } from '@/lib/product/sync'
import { goiTiep } from '@/lib/cron/chain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 *   /api/cron/product?secret=…             → tháng hiện tại
 *   /api/cron/product?secret=…&months=6    → trọn cửa sổ API cho phép
 *
 * Chỉ 142 sản phẩm, 2 trang mỗi tháng, nên 6 tháng vẫn rất nhanh.
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
    .insert({ shop_id: shop?.id, resource: 'product', status: 'running' })
    .select('id')
    .single()

  try {
    const res = await syncProductChannels(
      Number.isFinite(months) && months > 0 ? months : 1,
      Number.isFinite(back) && back > 0 ? back : 0,
    )
    if (run?.id) {
      await db.from('sync_runs').update({
        finished_at: new Date().toISOString(),
        status: res.errors.length ? 'error' : 'success',
        records_read: res.products,
        records_written: res.rows,
        page_count: res.pages,
        error_message: res.errors.slice(0, 5).join(' | ') || null,
      }).eq('id', run.id)
    }
    goiTiep(url.origin, '/api/cron/video?months=2', secret, 'product')

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
