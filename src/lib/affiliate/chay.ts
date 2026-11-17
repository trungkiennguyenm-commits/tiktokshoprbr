import { supabaseAdmin } from '@/lib/supabase'
import { syncAffiliateOrders } from '@/lib/affiliate/sync'

type KetQua = Awaited<ReturnType<typeof syncAffiliateOrders>>

/**
 * Chạy đồng bộ affiliate và tự ghi một dòng vào sync_runs.
 *
 * VÌ SAO TÁCH RA: trước đây affiliate là mắt xích cuối của chuỗi, được
 * route video gọi tiếp qua HTTP trong after(). Mắt xích đó CHƯA BAO GIỜ
 * chạy được từ cron — sync_runs chỉ có 6 dòng, đều là những lần gọi tay
 * đầu tháng 10, còn affiliate_order_skus thì đứng im từ 08/10 trong khi
 * bốn nguồn kia vẫn cập nhật mỗi đêm. Không có log để lần ra nguyên nhân
 * (gói Hobby chỉ giữ log 1 giờ, mà cron chạy 3h sáng).
 *
 * Nên bỏ hẳn chỗ dễ gãy thay vì đoán: affiliate chỉ tốn 2–17 giây, route
 * video tốn 25 giây, trần Vercel là 300 — chạy thẳng trong tiến trình thì
 * không còn cold start, không còn xác thực, không còn phụ thuộc vòng đời
 * của after(). Route riêng vẫn giữ để gọi tay và để backfill.
 */
export async function chayAffiliate(days: number): Promise<KetQua | { loi: string }> {
  const db = supabaseAdmin()
  const { data: shop } = await db.from('shops').select('id').limit(1).single()
  const { data: run } = await db
    .from('sync_runs')
    .insert({ shop_id: shop?.id, resource: 'affiliate', status: 'running' })
    .select('id')
    .single()

  try {
    const res = await syncAffiliateOrders(days)
    if (run?.id) {
      await db
        .from('sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: res.errors.length ? 'error' : 'success',
          records_read: res.orders,
          records_written: res.rows,
          page_count: res.pages,
          error_message: res.errors.slice(0, 5).join(' | ') || null,
        })
        .eq('id', run.id)
    }
    return res
  } catch (err) {
    const loi = err instanceof Error ? err.message : String(err)
    if (run?.id) {
      await db
        .from('sync_runs')
        .update({ finished_at: new Date().toISOString(), status: 'error', error_message: loi })
        .eq('id', run.id)
    }
    return { loi }
  }
}
