import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchAll, num, VIEW_LAZY, type KhoaLazy } from '@/lib/dashboard/tai'

export const dynamic = 'force-dynamic'

/**
 * Nguồn dữ liệu cho những sheet tự tải khi được mở.
 *
 * BẢO MẬT: route này nằm trong matcher của middleware (danh sách loại trừ
 * chỉ có login, api/cron, api/tiktok-ads, api/livehub), nên khi đã đặt
 * DASHBOARD_PASSWORD thì nó được bảo vệ y như trang dashboard. Fetch từ
 * trình duyệt là same-origin nên cookie tự đi kèm, không cần làm gì thêm.
 *
 * Tên view LUÔN lấy từ VIEW_LAZY, tuyệt đối không ghép từ tham số URL —
 * fetchAll đưa thẳng tên đó vào db.from().
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ khoa: string }> },
) {
  const { khoa } = await ctx.params
  const view = VIEW_LAZY[khoa as KhoaLazy]
  if (!view) {
    return NextResponse.json({ error: `Không có nguồn '${khoa}'` }, { status: 404 })
  }

  try {
    const rows = await fetchAll<Record<string, unknown>>(supabaseAdmin(), view)
    return NextResponse.json(num(rows), {
      // Dữ liệu chỉ đổi sau lần sync 3h sáng, nhưng để no-store cho chắc:
      // cache sai ở tầng này thì sai lệch rất khó lần ra, mà thứ cần chữa
      // là payload chứ không phải số lần gọi.
      headers: { 'cache-control': 'no-store' },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
