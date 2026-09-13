import { supabaseAdmin } from '@/lib/supabase'
import Dashboard, {
  type Monthly, type Daily, type Sku, type SkuPeriod, type Lapse, type Pnl, type Ship,
} from './Dashboard'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const db = supabaseAdmin()

  const [m, d, s, sm, sd, l, p, sh] = await Promise.all([
    db.from('v_perf_monthly').select('*'),
    db.from('v_perf_daily').select('*'),
    db.from('v_sku_perf').select('*'),
    db.from('v_sku_monthly').select('*'),
    db.from('v_sku_daily').select('*'),
    db.from('v_cancel_lapse').select('*'),
    db.from('v_pnl_monthly').select('*'),
    db.from('v_shipping_monthly').select('*'),
  ])

  const err = [m, d, s, sm, sd, l, p, sh].find((r) => r.error)?.error
  if (err) {
    return (
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '64px 20px', fontFamily: 'system-ui' }}>
        <h1 style={{ fontSize: 22 }}>Không đọc được dữ liệu</h1>
        <p style={{ color: '#777' }}>{err.message}</p>
      </main>
    )
  }

  const num = <T,>(rows: T[] | null) =>
    (rows ?? []).map((r) => {
      const o: Record<string, unknown> = { ...(r as Record<string, unknown>) }
      for (const k of Object.keys(o)) {
        if (typeof o[k] === 'string' && o[k] !== '' && !isNaN(Number(o[k]))) o[k] = Number(o[k])
      }
      return o as T
    })

  return (
    <Dashboard
      monthly={num(m.data as Monthly[])}
      daily={num(d.data as Daily[])}
      sku={num(s.data as Sku[])}
      skuMonthly={num(sm.data as SkuPeriod[])}
      skuDaily={num(sd.data as SkuPeriod[])}
      lapse={num(l.data as Lapse[])}
      pnl={num(p.data as Pnl[])}
      ship={num(sh.data as Ship[])}
    />
  )
}
