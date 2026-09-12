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
  /** Giá trị cursor khi chạy lần đầu */
  initialCursor: () => string
  fetchPage: (ctx: ShopContext, cursor: string) => Promise<SyncPage<T>>
  /** Phải idempotent: chạy lại cùng dữ liệu không được nhân đôi bản ghi */
  upsert: (ctx: ShopContext, rows: T[]) => Promise<number>
}

export type SyncResult = {
  resource: string
  status: 'success' | 'partial' | 'error'
  recordsRead: number
  recordsWritten: number
  pageCount: number
  error?: string
}

/**
 * Trần thời gian của hàm serverless. Chạm ngưỡng thì lưu cursor và dừng êm,
 * lần cron sau chạy tiếp từ đúng chỗ đó. Đừng nâng số này lên sát giới hạn thật
 * của Vercel, phải chừa thời gian để ghi log.
 */
const TIME_BUDGET_MS = 50_000

export async function runSync<T>(
  adapter: SyncAdapter<T>,
  ctx: ShopContext,
  opts: { resetCursor?: string } = {},
): Promise<SyncResult> {
  const db = supabaseAdmin()
  const startedAt = Date.now()

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
      // Chạy hết rồi thì đặt lại mốc cho lần sau, để lần sau chỉ lấy phần mới.
      await writeCursor(ctx.shopId, adapter.name, adapter.initialCursor())
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
