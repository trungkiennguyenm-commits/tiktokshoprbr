import { supabaseAdmin } from '@/lib/supabase'
import Dashboard, {
  type Monthly, type Daily, type Sku, type SkuPeriod, type Lapse, type Pnl, type Ship,
} from './Dashboard'

export const dynamic = 'force-dynamic'

/** PostgREST caps a single response (1000 rows by default), and v_sku_daily is
 *  already past that. Page through with range() until a short page comes back. */
async function fetchAll<T>(db: ReturnType<typeof supabaseAdmin>, view: string): Promise<T[]> {
  const SIZE = 1000
  const out: T[] = []
  for (let page = 0; page < 20; page++) {
    const { data, error } = await db.from(view).select('*').range(page * SIZE, page * SIZE + SIZE - 1)
    if (error) throw new Error(`${view}: ${error.message}`)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < SIZE) break
  }
  return out
}

const num = <T,>(rows: T[]) =>
  rows.map((r) => {
    const o: Record<string, unknown> = { ...(r as Record<string, unknown>) }
    for (const k of Object.keys(o)) {
      if (typeof o[k] === 'string' && o[k] !== '' && !isNaN(Number(o[k]))) o[k] = Number(o[k])
    }
    return o as T
  })

export default async function Page() {
  const db = supabaseAdmin()

  try {
    const [m, d, s, sm, sd, l, p, sh] = await Promise.all([
      fetchAll<Monthly>(db, 'v_perf_monthly'),
      fetchAll<Daily>(db, 'v_perf_daily'),
      fetchAll<Sku>(db, 'v_sku_perf'),
      fetchAll<SkuPeriod>(db, 'v_sku_monthly'),
      fetchAll<SkuPeriod>(db, 'v_sku_daily'),
      fetchAll<Lapse>(db, 'v_cancel_lapse'),
      fetchAll<Pnl>(db, 'v_pnl_monthly'),
      fetchAll<Ship>(db, 'v_shipping_monthly'),
    ])

    return (
      <Dashboard
        monthly={num(m)} daily={num(d)} sku={num(s)}
        skuMonthly={num(sm)} skuDaily={num(sd)}
        lapse={num(l)} pnl={num(p)} ship={num(sh)}
      />
    )
  } catch (e) {
    return (
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '64px 20px', fontFamily: 'system-ui' }}>
        <h1 style={{ fontSize: 22 }}>Could not load data</h1>
        <p style={{ color: '#777' }}>{e instanceof Error ? e.message : String(e)}</p>
      </main>
    )
  }
}
