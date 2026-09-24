import { supabaseAdmin } from '@/lib/supabase'
import type { ShopContext } from '@/lib/tts/connection'

export type SyncPage<T> = {
  rows: T[]
  /** Con trỏ để gọi trang tiếp theo. null nghĩa là hết. */
  nextCursor: string | null
  hasMore: boolean
}

export type SyncAdapter<T> = {
  /** Tên resource, dùng làm khoá trong sync_cursors và sync_runs */
  name: string
  /** Cursor khi chạy lần đầu — thường là backfill lùi lại một khoảng dài */
  initialCursor: () => string
  /**
   * Cursor đặt lại sau khi đã kéo hết.
   * PHẢI là một mốc gần hiện tại, nếu không lần chạy sau sẽ kéo lại toàn bộ
   * backfill và cron hằng ngày quay vòng mãi không xong.
   */
  completedCursor: () => string
  fetchPage: (ctx: ShopContext, cursor: string) => Promise<SyncPage<T>>
  /** Phải idempotent: chạy lại cùng dữ liệu không được nhân đôi bản ghi */
  upsert: (ctx: ShopContext, rows: T[]) => Promise<number>
}

export type SyncResult = {
  resource: string
  status: 'success' | 'partial' | 'error' | 'skipped'
  recordsRead: number
  recordsWritten: number
  pageCount: number
  error?: string
}

/**
 * Trần thời gian mỗi lượt. Chạm ngưỡng thì lưu cursor và dừng êm, lần sau chạy
 * tiếp từ đúng chỗ đó.
 *
 * Lịch sử:
 *  - 50s: hai lượt bị Vercel giết giữa chừng (15/09, 16/09) vì sát trần 60s.
 *  - 40s + tự gọi lại: Vercel chặn một function tự gọi chính nó ở tầng thứ 5
 *    (coi là vòng lặp vô hạn) — 21/09 cả ba chuỗi đều dừng đúng lượt 5.
 *  - 270s: bản hiện tại. Với Fluid compute, gói Hobby cho chạy tới 300s, nên một
 *    lượt làm được gấp ~7 lần. Một ngày bình thường xong trong MỘT lượt, không
 *    cần tự gọi lại nữa; tự gọi lại chỉ còn là dự phòng cho đợt kéo lớn.
 *  PHẢI khớp với `export const maxDuration` trong route, chừa 30s đệm.
 */
const TIME_BUDGET_MS = 270_000

/** Một lượt khác bắt đầu trong khoảng này mà chưa xong thì coi là đang chạy. */
const CONCURRENCY_WINDOW_MS = TIME_BUDGET_MS + 60_000

export async function runSync<T>(
  adapter: SyncAdapter<T>,
  ctx: ShopContext,
  opts: { resetCursor?: string } = {},
): Promise<SyncResult> {
  const db = supabaseAdmin()
  const startedAt = Date.now()

  // Chặn hai lượt chạy song song. 21/09 có lúc hai chuỗi chạy cùng lúc, cùng đọc
  // một con trỏ: không hỏng dữ liệu nhưng làm trùng việc, và chuỗi xong sau có
  // thể ghi đè con trỏ đã hoàn tất bằng một vị trí cũ. Bỏ qua khi có resetCursor,
  // vì đó là lệnh chủ động của người dùng.
  if (!opts.resetCursor) {
    const since = new Date(startedAt - CONCURRENCY_WINDOW_MS).toISOString()
    const { data: busy } = await db
      .from('sync_runs')
      .select('id')
      .eq('shop_id', ctx.shopId)
      .eq('resource', adapter.name)
      .eq('status', 'running')
      .gte('started_at', since)
      .limit(1)
    if (busy && busy.length > 0) {
      return {
        resource: adapter.name, status: 'skipped',
        recordsRead: 0, recordsWritten: 0, pageCount: 0,
        error: `Another run (#${busy[0].id}) is already in progress`,
      }
    }
  }

  const { data: run } = await db
    .from('sync_runs')
    .insert({ shop_id: ctx.shopId, resource: adapter.name, status: 'running' })
    .select('id')
    .single()

  const result: SyncResult = {
    resource: adapter.name,
    status: 'success',
    recordsRead: 0,
    recordsWritten: 0,
    pageCount: 0,
  }

  try {
    let cursor = opts.resetCursor ?? (await readCursor(ctx.shopId, adapter.name)) ?? adapter.initialCursor()

    let hasMore = true
    while (hasMore) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        result.status = 'partial'
        break
      }

      const page = await adapter.fetchPage(ctx, cursor)
      result.pageCount++
      result.recordsRead += page.rows.length

      if (page.rows.length > 0) {
        result.recordsWritten += await adapter.upsert(ctx, page.rows)
      }

      hasMore = page.hasMore && page.nextCursor !== null
      if (page.nextCursor) {
        cursor = page.nextCursor
        await writeCursor(ctx.shopId, adapter.name, cursor)
      }
    }

    if (!hasMore && result.status === 'success') {
      // Kéo hết rồi: đẩy mốc lên sát hiện tại, để lần sau chỉ lấy phần mới.
      await writeCursor(ctx.shopId, adapter.name, adapter.completedCursor())
    }
  } catch (err) {
    result.status = 'error'
    result.error = err instanceof Error ? err.message : String(err)
  }

  if (run?.id) {
    await db
      .from('sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: result.status,
        records_read: result.recordsRead,
        records_written: result.recordsWritten,
        page_count: result.pageCount,
        error_message: result.error ?? null,
      })
      .eq('id', run.id)
  }

  return result
}

async function readCursor(shopId: string, resource: string): Promise<string | null> {
  const db = supabaseAdmin()
  const { data } = await db
    .from('sync_cursors')
    .select('cursor_value')
    .eq('shop_id', shopId)
    .eq('resource', resource)
    .maybeSingle()
  return data?.cursor_value ?? null
}

async function writeCursor(shopId: string, resource: string, value: string) {
  const db = supabaseAdmin()
  await db.from('sync_cursors').upsert(
    {
      shop_id: shopId,
      resource,
      cursor_value: value,
      cursor_type: 'timestamp',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'shop_id,resource' },
  )
}
