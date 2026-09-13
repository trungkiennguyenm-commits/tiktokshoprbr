'use client'

import { Fragment, useMemo, useState } from 'react'
import {
  BarChart, StackChart, DeltaChart, RowBars, ComboChart, MultiStack,
  type Pt, type PtN,
} from './charts'

/* ============================== data types ==============================
   GMV and NMV share one money formula: list price − seller discount.
   They differ only in the order set: GMV takes every status, NMV drops
   cancelled orders. So GMV = NMV + gmv_mat_do_huy, which is why NMV can
   legitimately stack inside the GMV column.
   ====================================================================== */

export type Monthly = {
  thang: string; category: string; so_luong: number
  sl_chua_huy: number; sl_hoan_tat: number; sl_huy: number; cancel_rate: number
  gmv: number; nmv: number; nmv_hoan_tat: number; gmv_mat_do_huy: number; khach_tra: number
  gia_goc: number; seller_disc: number; platform_disc: number; gio_huy_tb: number
}
export type Daily = {
  ngay: string; category: string; so_luong: number
  sl_chua_huy: number; sl_hoan_tat: number; sl_huy: number; cancel_rate: number
  gmv: number; nmv: number; nmv_hoan_tat: number; gmv_mat_do_huy: number; khach_tra: number
  seller_disc: number; platform_disc: number
}
export type SkuPeriod = {
  model: string; category: string; ky: string
  so_luong: number; sl_chua_huy: number; sl_huy: number; cancel_rate: number
  gmv: number; nmv: number
}
export type Sku = {
  model: string; category: string
  so_luong: number; sl_chua_huy: number; sl_hoan_tat: number; sl_huy: number; cancel_rate: number
  gmv: number; nmv: number; nmv_hoan_tat: number
  gia_goc_tb: number; gia_ban_tb: number; gia_khach_tra_tb: number
  seller_disc_tb: number; platform_disc_tb: number
  pct_seller_disc: number; pct_platform_disc: number
  gio_huy_tb: number; gio_huy_trung_vi: number
}
export type Lapse = { khoang: string; thu_tu: number; so_luong: number; pct: number }
export type Pnl = {
  thang: string; gia_niem_yet: number; shop_giam_gia: number; san_giam_gia: number
  nmv: number; khach_tra: number; gmv_mat_do_huy: number
}
export type Ship = {
  thang: string; so_don: number; phi_ship_goc: number; phi_ship_khach_tra: number
  shop_tro_gia_ship: number; san_tro_gia_ship: number; ship_dot_cho_don_huy: number
}

type Props = {
  monthly: Monthly[]; daily: Daily[]; sku: Sku[]
  skuMonthly: SkuPeriod[]; skuDaily: SkuPeriod[]
  lapse: Lapse[]; pnl: Pnl[]; ship: Ship[]
}

/* ============================== helpers ============================== */

const n0 = (v: number) => new Intl.NumberFormat('en-US').format(Math.round(v || 0))
const bn = (v: number) => ((v || 0) / 1e9).toFixed(2)
const mn = (v: number) => ((v || 0) / 1e6).toFixed(0)
const pct = (v: number) => (v == null ? '—' : `${v}%`)

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const mmyy = (s: string) => `${MONTH_NAMES[Number(s.slice(5, 7)) - 1]} ${s.slice(2, 4)}`
const ddmm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`

const CATS = [
  { key: 'all', label: 'All products' },
  { key: 'robot', label: 'Robot' },
  { key: 'handheld', label: 'Handheld' },
] as const
type CatKey = (typeof CATS)[number]['key']

const RANGES = [
  { key: 'mom', label: 'By month' },
  { key: 'd30', label: 'Last 30 days' },
  { key: 'd7', label: 'Last 7 days' },
] as const
type RangeKey = 'mom' | 'd30' | 'd7' | 'month'

const TABS = ['Overview', 'Category', 'SKU', 'Discounts', 'Cancellations', 'P&L'] as const
type Tab = (typeof TABS)[number]

/** Roll per-category rows up into one row per period. Declare the type
 *  explicitly — spreading Record<string, number> loses the index signature
 *  and the build fails on every field access. */
type Rolled = {
  ky: string
  so_luong: number; sl_chua_huy: number; sl_hoan_tat: number; sl_huy: number
  gmv: number; nmv: number; nmv_hoan_tat: number; gmv_mat_do_huy: number; khach_tra: number
  seller_disc: number; platform_disc: number
  cancel_rate: number
}

const ZERO = (ky: string): Rolled => ({
  ky, so_luong: 0, sl_chua_huy: 0, sl_hoan_tat: 0, sl_huy: 0,
  gmv: 0, nmv: 0, nmv_hoan_tat: 0, gmv_mat_do_huy: 0, khach_tra: 0,
  seller_disc: 0, platform_disc: 0, cancel_rate: 0,
})

/** Categorical palette for the model mix column. */
const PALETTE = [
  '#2563A8', '#C2620B', '#1F7A4D', '#8E44AD', '#B31B4A',
  '#0E7490', '#8A6D1F', '#4A5568', '#166534', '#7C2D12',
]
const GREY = '#A9A2AB'

const keyOf = (r: Monthly | Daily) => ('thang' in r ? r.thang : r.ngay)

function rollup(rows: (Monthly | Daily)[], cat: CatKey): Rolled[] {
  const filtered = cat === 'all' ? rows : rows.filter((r) => r.category === cat)
  const map = new Map<string, Rolled>()

  for (const r of filtered) {
    const k = keyOf(r)
    const cur = map.get(k) ?? ZERO(k)
    cur.so_luong += Number(r.so_luong || 0)
    cur.sl_chua_huy += Number(r.sl_chua_huy || 0)
    cur.sl_hoan_tat += Number(r.sl_hoan_tat || 0)
    cur.sl_huy += Number(r.sl_huy || 0)
    cur.gmv += Number(r.gmv || 0)
    cur.nmv += Number(r.nmv || 0)
    cur.nmv_hoan_tat += Number(r.nmv_hoan_tat || 0)
    cur.gmv_mat_do_huy += Number(r.gmv_mat_do_huy || 0)
    cur.khach_tra += Number(r.khach_tra || 0)
    cur.seller_disc += Number(r.seller_disc || 0)
    cur.platform_disc += Number(r.platform_disc || 0)
    map.set(k, cur)
  }

  return Array.from(map.values())
    .map((v) => ({
      ...v,
      cancel_rate: v.so_luong ? Math.round((v.sl_huy / v.so_luong) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.ky.localeCompare(b.ky))
}

function splitByCat(rows: (Monthly | Daily)[], pick: (r: Monthly | Daily) => number) {
  const map = new Map<string, { ky: string; a: number; b: number }>()
  for (const r of rows) {
    const k = keyOf(r)
    const cur = map.get(k) ?? { ky: k, a: 0, b: 0 }
    if (r.category === 'robot') cur.a += Number(pick(r) || 0)
    else cur.b += Number(pick(r) || 0)
    map.set(k, cur)
  }
  return Array.from(map.values()).sort((a, b) => a.ky.localeCompare(b.ky))
}

/* ============================ shared pieces ============================ */

function Tile({ label, value, unit, sub, tone }: {
  label: string; value: string; unit?: string; sub?: string; tone?: 'ok' | 'bad'
}) {
  return (
    <div className="tile">
      <div className="tile-l">{label}</div>
      <div className="tile-v" style={tone ? { color: tone === 'bad' ? 'var(--bad)' : 'var(--ok)' } : undefined}>
        {value}{unit && <span className="tile-u">{unit}</span>}
      </div>
      {sub && <div className="tile-s">{sub}</div>}
    </div>
  )
}

/** Change vs the previous row. */
function Dd({ a, b }: { a?: number; b?: number }) {
  if (a == null || b == null || !b) return <span className="muted">—</span>
  const d = Math.round(((a - b) / b) * 1000) / 10
  return <span className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '▲' : '▼'}{Math.abs(d)}%</span>
}

function SeriesTable({ rows, lbl }: { rows: Rolled[]; lbl: (k: string) => string }) {
  const [all, setAll] = useState(false)
  const view = all ? rows : rows.slice(-14)
  return (
    <>
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Period</th>
            <th className="n">Gross pcs</th>
            <th className="n">±</th>
            <th className="n">Net pcs</th>
            <th className="n">Cancelled</th>
            <th className="n">Cancel %</th>
            <th className="n">GMV</th>
            <th className="n">NMV</th>
            <th className="n">±NMV</th>
            <th className="n">Lost to cancels</th>
            <th className="n">NMV completed</th>
            <th className="n">Buyer paid</th>
            <th className="n">Seller disc.</th>
            <th className="n">Platform disc.</th>
          </tr></thead>
          <tbody>
            {view.map((r, i) => {
              const p = view[i - 1]
              return (
                <tr key={r.ky}>
                  <td className="k">{lbl(r.ky)}</td>
                  <td className="n">{n0(r.so_luong)}</td>
                  <td className="n"><Dd a={r.so_luong} b={p?.so_luong} /></td>
                  <td className="n"><b>{n0(r.sl_chua_huy)}</b></td>
                  <td className="n">{n0(r.sl_huy)}</td>
                  <td className="n" style={{ color: r.cancel_rate > 40 ? 'var(--bad)' : 'inherit' }}>{pct(r.cancel_rate)}</td>
                  <td className="n">{bn(r.gmv)}</td>
                  <td className="n"><b>{bn(r.nmv)}</b></td>
                  <td className="n"><Dd a={r.nmv} b={p?.nmv} /></td>
                  <td className="n" style={{ color: 'var(--bad)' }}>{bn(r.gmv_mat_do_huy)}</td>
                  <td className="n muted">{bn(r.nmv_hoan_tat)}</td>
                  <td className="n muted">{bn(r.khach_tra)}</td>
                  <td className="n">{bn(r.seller_disc)}</td>
                  <td className="n muted">{bn(r.platform_disc)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="foot">
        Money in VND bn.{' '}
        {rows.length > 14 && (
          <button className="lnk" onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : `Show all ${rows.length} periods`}
          </button>
        )}
      </p>
    </>
  )
}

/* ================================ page ================================ */

export default function Dashboard({ monthly, daily, sku, skuMonthly, skuDaily, lapse, pnl, ship }: Props) {
  const [tab, setTab] = useState<Tab>('Overview')
  const [cat, setCat] = useState<CatKey>('all')
  const [range, setRange] = useState<RangeKey>('mom')
  const [month, setMonth] = useState('')
  const [sortKey, setSortKey] = useState<keyof Sku>('nmv')
  const [mixMetric, setMixMetric] = useState<'gmv' | 'so_luong'>('gmv')
  const [modelSel, setModelSel] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())

  const toggleClosed = (c: string) =>
    setClosed((p) => {
      const n = new Set(p)
      if (n.has(c)) n.delete(c); else n.add(c)
      return n
    })

  const byMonth = range === 'mom'
  const src: (Monthly | Daily)[] = byMonth ? monthly : daily

  const months = useMemo(
    () => Array.from(new Set(monthly.map((r) => r.thang))).sort().reverse(),
    [monthly],
  )

  /** Which periods the current filter keeps. */
  const keys = useMemo(() => {
    const all = rollup(src, 'all')
    let picked: Rolled[]
    if (range === 'mom') picked = all.filter((r) => r.so_luong >= 20)
    else if (range === 'd30') picked = all.slice(-30)
    else if (range === 'd7') picked = all.slice(-7)
    else picked = all.filter((r) => r.ky.slice(0, 7) === month.slice(0, 7))
    return new Set(picked.map((r) => r.ky))
  }, [src, range, month])

  const srcShown = useMemo(() => src.filter((r) => keys.has(keyOf(r))), [src, keys])
  const shown = useMemo(() => rollup(srcShown, cat), [srcShown, cat])

  const cur = shown[shown.length - 1]
  const prev = shown[shown.length - 2]
  const delta = (a?: number, b?: number) =>
    a == null || b == null || !b ? null : Math.round(((a - b) / b) * 1000) / 10

  const skuF = useMemo(
    () => (cat === 'all' ? sku : sku.filter((s) => s.category === cat))
      .filter((s) => !modelSel || s.model === modelSel)
      .slice()
      .sort((a, b) => Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0)),
    [sku, cat, sortKey, modelSel],
  )

  const allModels = useMemo(
    () => Array.from(new Set(sku.filter((s) => cat === 'all' || s.category === cat).map((s) => s.model))).sort(),
    [sku, cat],
  )

  /** SKU rows inside the current period + category + model filter. */
  const skuRows = useMemo(
    () => (byMonth ? skuMonthly : skuDaily)
      .filter((r) => keys.has(r.ky))
      .filter((r) => cat === 'all' || r.category === cat)
      .filter((r) => !modelSel || r.model === modelSel),
    [byMonth, skuMonthly, skuDaily, keys, cat, modelSel],
  )

  /** Gross / net per period for the SKU combo chart. */
  const skuTrend = useMemo(() => {
    const map = new Map<string, { ky: string; gross: number; net: number }>()
    for (const r of skuRows) {
      const c = map.get(r.ky) ?? { ky: r.ky, gross: 0, net: 0 }
      c.gross += Number(r.so_luong || 0)
      c.net += Number(r.sl_chua_huy || 0)
      map.set(r.ky, c)
    }
    return Array.from(map.values()).sort((a, b) => a.ky.localeCompare(b.ky))
  }, [skuRows])

  /** Model mix column: keep the 8 largest, fold the rest into "Other". */
  const mix = useMemo(() => {
    const val = (r: SkuPeriod) => Number((mixMetric === 'gmv' ? r.gmv : r.so_luong) || 0)
    const totals = new Map<string, number>()
    for (const r of skuRows) totals.set(r.model, (totals.get(r.model) ?? 0) + val(r))
    const top = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0])
    const hasOther = totals.size > top.length

    const series = [
      ...top.map((m, i) => ({ ten: m, color: PALETTE[i % PALETTE.length] })),
      ...(hasOther ? [{ ten: 'Other', color: GREY }] : []),
    ]
    const idx = new Map(top.map((m, i) => [m, i]))

    const byKy = new Map<string, number[]>()
    for (const r of skuRows) {
      const arr = byKy.get(r.ky) ?? new Array(series.length).fill(0)
      arr[idx.get(r.model) ?? top.length] += val(r)
      byKy.set(r.ky, arr)
    }
    const data: PtN[] = Array.from(byKy.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ky, parts]) => ({ ky, parts }))

    return { series, data }
  }, [skuRows, mixMetric])

  const lbl = byMonth ? mmyy : ddmm
  const periodWord = byMonth ? 'month' : 'day'
  const dod = byMonth ? 'MoM' : 'DoD'
  const scopeLabel = modelSel || (cat === 'all' ? 'all products' : cat)

  const pt = (pick: (r: Rolled) => number): Pt[] => shown.map((r) => ({ ky: r.ky, v: pick(r) }))

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <main className="wrap">
        <header>
          <p className="eyebrow">Roborock Official VN · TikTok Shop</p>
          <h1>Business performance</h1>
          <p className="lede">
            Robots and handhelds only — gifts and accessories excluded. GMV and NMV both use
            <b> list price minus seller discount</b>; platform vouchers are not deducted because
            TikTok funds them. GMV covers every order status, NMV drops cancelled orders, so
            GMV = NMV + value lost to cancellations. Periods are keyed on order creation date.
          </p>
        </header>

        {/* ---- filters ---- */}
        <div className="filters">
          <div className="seg">
            {RANGES.map((r) => (
              <button key={r.key} className={range === r.key ? 'on' : ''}
                onClick={() => { setRange(r.key); setMonth('') }}>
                {r.label}
              </button>
            ))}
          </div>

          <select
            className="drop"
            value={range === 'month' ? month : ''}
            onChange={(e) => {
              const v = e.target.value
              if (!v) { setRange('mom'); setMonth('') }
              else { setMonth(v); setRange('month') }
            }}
          >
            <option value="">Pick a month…</option>
            {months.map((m) => <option key={m} value={m}>{mmyy(m)}</option>)}
          </select>

          <div className="seg">
            {CATS.map((c) => (
              <button key={c.key} className={cat === c.key ? 'on' : ''}
                onClick={() => { setCat(c.key); setModelSel('') }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {range === 'month' && <p className="foot">Showing every day in {mmyy(month)}.</p>}

        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>

        {/* =================== OVERVIEW =================== */}
        {tab === 'Overview' && (
          <>
            <section className="tiles">
              <Tile label="NMV" value={bn(cur?.nmv ?? 0)} unit=" bn"
                sub={deltaText(delta(cur?.nmv, prev?.nmv), periodWord)} />
              <Tile label="Net quantity" value={n0(cur?.sl_chua_huy ?? 0)} unit=" pcs"
                sub={deltaText(delta(cur?.sl_chua_huy, prev?.sl_chua_huy), periodWord)} />
              <Tile label="GMV" value={bn(cur?.gmv ?? 0)} unit=" bn"
                sub={deltaText(delta(cur?.gmv, prev?.gmv), periodWord)} />
              <Tile label="Cancellation rate" value={pct(cur?.cancel_rate ?? 0)}
                tone={(cur?.cancel_rate ?? 0) > 40 ? 'bad' : 'ok'}
                sub={`${n0(cur?.sl_huy ?? 0)} pcs cancelled`} />
            </section>

            <section>
              <h2>GMV, NMV and cancellation rate in one picture</h2>
              <p className="sub">
                Full column height is GMV. The solid part is NMV — what is still alive. The pale
                part is value lost to cancellations. They add up exactly, because both sides use
                the same money formula and differ only in which orders they count. The green line
                is the share of NMV that has actually completed. The red line is the cancellation
                rate, read on the right axis, fixed 0–100%.
              </p>
              <ComboChart
                data={shown.map((r) => ({ ky: r.ky, a: r.nmv, b: r.gmv_mat_do_huy }))}
                names={['NMV (live orders)', 'Lost to cancellations']}
                colors={['var(--c1)', 'var(--c1-soft)']}
                lines={[
                  { ten: 'NMV completed', color: 'var(--ok)', truc: 'tien', vals: shown.map((r) => r.nmv_hoan_tat) },
                  { ten: 'Cancellation rate (right axis)', color: 'var(--bad)', truc: 'pct', vals: shown.map((r) => r.cancel_rate) },
                ]}
                fmt={bn} label={lbl} unit="VND bn"
                tip={(d) => {
                  const r = shown.find((x) => x.ky === d.ky)!
                  return (
                    <><b>{lbl(d.ky)}</b><br />
                      GMV {bn(r.gmv)} bn<br />
                      · NMV {bn(r.nmv)} bn<br />
                      · lost to cancels {bn(r.gmv_mat_do_huy)} bn<br />
                      NMV completed {bn(r.nmv_hoan_tat)} bn<br />
                      Buyer paid {bn(r.khach_tra)} bn<br />
                      Cancellation rate {r.cancel_rate}%</>
                  )
                }}
              />
            </section>

            <section>
              <h2>NMV per {periodWord} · {dod}</h2>
              <p className="sub">
                Cancelled orders already removed. The figure under each column is the change
                against the previous period.
              </p>
              <DeltaChart
                data={pt((r) => r.nmv)} color="var(--c1)" fmt={bn} label={lbl} unit="VND bn"
                tip={(d, dl) => (
                  <><b>{lbl(d.ky)}</b><br />NMV {n0(d.v)} VND
                    {dl != null && <><br />{dl >= 0 ? '▲' : '▼'} {Math.abs(dl)}% vs previous period</>}</>
                )}
              />
            </section>

            <section>
              <h2>Net quantity per {periodWord} · {dod}</h2>
              <p className="sub">Units that have not been cancelled. Gifts and accessories excluded.</p>
              <DeltaChart
                data={pt((r) => r.sl_chua_huy)} color="var(--c3)" fmt={n0} label={lbl} unit="pcs"
                tip={(d, dl) => (
                  <><b>{lbl(d.ky)}</b><br />{n0(d.v)} net pcs
                    {dl != null && <><br />{dl >= 0 ? '▲' : '▼'} {Math.abs(dl)}% vs previous period</>}</>
                )}
              />
            </section>

            <section>
              <h2>Robot vs handheld mix</h2>
              <p className="sub">Stacked net quantity. Shows the total and the split in one shape.</p>
              <StackChart
                data={splitByCat(srcShown, (r) => r.sl_chua_huy)}
                fmt={n0} label={lbl} names={['Robot', 'Handheld']}
                colors={['var(--c1)', 'var(--c2)']} unit="net pcs"
                tip={(d) => (
                  <><b>{lbl(d.ky)}</b><br />Robot {n0(d.a)} · Handheld {n0(d.b)}
                    <br />Total {n0(d.a + d.b)} pcs
                    <br />Robot share {Math.round((d.a / Math.max(1, d.a + d.b)) * 100)}%</>
                )}
              />
            </section>

            <section>
              <h2>Detail by {periodWord}</h2>
              <p className="sub">Every metric behind the charts above, with {dod} change.</p>
              <SeriesTable rows={shown} lbl={lbl} />
            </section>

            <div className="note warn">
              <b>The newest period still understates cancellations.</b> Orders placed in the current
              period have not finished their life cycle, and the largest cancellation cluster lands
              3–7 days after the order. Expect the cancellation rate to climb and NMV to drift down
              over the following week.
            </div>
          </>
        )}

        {/* =================== CATEGORY =================== */}
        {tab === 'Category' && (
          <>
            <section className="cards">
              {(['robot', 'handheld'] as const).map((c, i) => {
                const rows = srcShown.filter((r) => r.category === c)
                const sum = (f: (r: Monthly | Daily) => number) =>
                  rows.reduce((a, r) => a + Number(f(r) || 0), 0)
                const gross = sum((r) => r.so_luong)
                const net = sum((r) => r.sl_chua_huy)
                const nmv = sum((r) => r.nmv)
                const gmv = sum((r) => r.gmv)
                const cancelled = sum((r) => r.sl_huy)
                return (
                  <div className="card" key={c}>
                    <div className="card-h">
                      <i className="sw" style={{ background: i === 0 ? 'var(--c1)' : 'var(--c2)' }} />
                      <b>{c === 'robot' ? 'Robot vacuums' : 'Handheld vacuums'}</b>
                    </div>
                    <div className="kv"><span>NMV</span><b>{bn(nmv)} bn</b></div>
                    <div className="kv"><span>GMV</span><b>{bn(gmv)} bn</b></div>
                    <div className="kv"><span>Net quantity</span><b>{n0(net)} pcs</b></div>
                    <div className="kv"><span>Gross quantity</span><b>{n0(gross)} pcs</b></div>
                    <div className="kv"><span>Cancellation rate</span>
                      <b style={{ color: cancelled / Math.max(1, gross) > 0.4 ? 'var(--bad)' : 'inherit' }}>
                        {Math.round((cancelled / Math.max(1, gross)) * 1000) / 10}%
                      </b></div>
                    <div className="kv"><span>Avg price after seller disc.</span>
                      <b>{n0(gmv / Math.max(1, gross))}</b></div>
                  </div>
                )
              })}
            </section>

            <section>
              <h2>NMV by category per {periodWord}</h2>
              <p className="sub">Stacked columns, VND bn.</p>
              <StackChart
                data={splitByCat(srcShown, (r) => r.nmv)}
                fmt={bn} label={lbl} names={['Robot', 'Handheld']}
                colors={['var(--c1)', 'var(--c2)']} unit="VND bn"
                tip={(d) => (
                  <><b>{lbl(d.ky)}</b><br />Robot {bn(d.a)} bn · Handheld {bn(d.b)} bn
                    <br />Robot share {Math.round((d.a / Math.max(1, d.a + d.b)) * 100)}%</>
                )}
              />
            </section>

            <section>
              <h2>Cancellation rate by category · {dod}</h2>
              <p className="sub">
                Handhelds usually cancel harder than robots. Same delivery problem, lower order
                value, so buyers refuse more easily.
              </p>
              <div className="two">
                {(['robot', 'handheld'] as const).map((c) => {
                  const rr = rollup(srcShown, c)
                  return (
                    <div key={c}>
                      <h3>{c === 'robot' ? 'Robot' : 'Handheld'}</h3>
                      <DeltaChart
                        data={rr.map((r) => ({ ky: r.ky, v: r.cancel_rate }))}
                        color={c === 'robot' ? 'var(--c1)' : 'var(--c2)'}
                        fmt={(v) => `${v}`} label={lbl} unit="% cancelled"
                        tip={(d) => <><b>{lbl(d.ky)}</b><br />Cancelled {d.v}%</>}
                      />
                    </div>
                  )
                })}
              </div>
            </section>

            <section>
              <h2>Category detail</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Period</th><th>Category</th>
                    <th className="n">Gross pcs</th><th className="n">Net pcs</th><th className="n">Cancelled</th>
                    <th className="n">Cancel %</th><th className="n">GMV</th><th className="n">NMV</th>
                    <th className="n">Avg price</th>
                  </tr></thead>
                  <tbody>
                    {srcShown
                      .filter((r) => r.category === 'robot' || r.category === 'handheld')
                      .slice()
                      .sort((a, b) => keyOf(b).localeCompare(keyOf(a)) || a.category.localeCompare(b.category))
                      .slice(0, 60)
                      .map((r) => (
                        <tr key={`${keyOf(r)}-${r.category}`}>
                          <td className="k">{lbl(keyOf(r))}</td>
                          <td>
                            <span className="sw sm" style={{ background: r.category === 'robot' ? 'var(--c1)' : 'var(--c2)' }} />
                            {r.category === 'robot' ? 'Robot' : 'Handheld'}
                          </td>
                          <td className="n">{n0(r.so_luong)}</td>
                          <td className="n"><b>{n0(r.sl_chua_huy)}</b></td>
                          <td className="n">{n0(r.sl_huy)}</td>
                          <td className="n" style={{ color: Number(r.cancel_rate) > 40 ? 'var(--bad)' : 'inherit' }}>
                            {pct(r.cancel_rate)}
                          </td>
                          <td className="n">{bn(r.gmv)}</td>
                          <td className="n">{bn(r.nmv)}</td>
                          <td className="n">{n0(Number(r.gmv || 0) / Math.max(1, Number(r.so_luong || 0)))}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="foot">Money in VND bn, average price in VND. Latest 60 rows.</p>
            </section>
          </>
        )}

        {/* =================== SKU =================== */}
        {tab === 'SKU' && (
          <>
            <div className="filters" style={{ marginTop: 26 }}>
              <select className="drop wide" value={modelSel} onChange={(e) => setModelSel(e.target.value)}>
                <option value="">All models ({allModels.length})</option>
                {allModels.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {modelSel && <button className="lnk" onClick={() => setModelSel('')}>Clear model filter</button>}
            </div>

            <section>
              <h2>Gross vs net units and cancellation rate — {scopeLabel}</h2>
              <p className="sub">
                Column height is gross units. The solid part is net — units not cancelled. The red
                line is the cancellation rate on the right axis, fixed 0–100%. Pick a model above
                to isolate it.
              </p>
              <ComboChart
                data={skuTrend.map((d) => ({ ky: d.ky, a: d.net, b: Math.max(0, d.gross - d.net) }))}
                names={['Net pcs', 'Cancelled pcs']}
                colors={['var(--c1)', 'var(--c1-soft)']}
                lines={[{
                  ten: 'Cancellation rate (right axis)', color: 'var(--bad)', truc: 'pct',
                  vals: skuTrend.map((d) => (d.gross ? Math.round((1 - d.net / d.gross) * 1000) / 10 : null)),
                }]}
                fmt={n0} label={lbl} unit="pcs"
                tip={(d) => {
                  const g = d.a + d.b
                  return (
                    <><b>{lbl(d.ky)}</b><br />
                      Gross {n0(g)} pcs<br />
                      Net {n0(d.a)} pcs<br />
                      Cancelled {n0(d.b)} pcs<br />
                      Cancellation rate {g ? Math.round((d.b / g) * 1000) / 10 : 0}%</>
                  )
                }}
              />
            </section>

            {!modelSel && (
              <section>
                <h2>Model mix per {periodWord}</h2>
                <p className="sub">
                  Top 8 models by the chosen metric, everything else folded into &ldquo;Other&rdquo;
                  so the column stays readable.
                </p>
                <div className="seg" style={{ marginTop: 14 }}>
                  {(['gmv', 'so_luong'] as const).map((k) => (
                    <button key={k} className={mixMetric === k ? 'on' : ''} onClick={() => setMixMetric(k)}>
                      {k === 'gmv' ? 'By GMV' : 'By quantity'}
                    </button>
                  ))}
                </div>
                <MultiStack
                  data={mix.data} series={mix.series}
                  fmt={mixMetric === 'gmv' ? bn : n0} label={lbl}
                  unit={mixMetric === 'gmv' ? 'VND bn' : 'gross pcs'}
                  tip={(d) => (
                    <><b>{lbl(d.ky)}</b><br />
                      {mix.series.map((s, j) => (d.parts[j] > 0
                        ? <span key={s.ten}>{s.ten}: {mixMetric === 'gmv' ? `${bn(d.parts[j])} bn` : `${n0(d.parts[j])} pcs`}<br /></span>
                        : null))}</>
                  )}
                />
              </section>
            )}

            <section>
              <h2>Top models by NMV</h2>
              <RowBars
                rows={skuF.slice(0, 15).map((s) => ({
                  nhan: s.model,
                  segs: [{ v: s.nmv, color: s.category === 'robot' ? 'var(--c1)' : 'var(--c2)', ten: 'NMV' }],
                  phu: `${mn(s.nmv)}m · ${n0(s.sl_chua_huy)} net pcs`,
                }))}
              />
            </section>

            <section>
              <h2>Full table, grouped by category</h2>
              <p className="sub">
                The bold row is the category total — click it to collapse or expand its models.
                Click a column header to re-sort. Currently sorted by <b>{String(sortKey)}</b>.
              </p>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Model</th>
                    <Th k="so_luong" cur={sortKey} set={setSortKey}>Gross</Th>
                    <Th k="sl_chua_huy" cur={sortKey} set={setSortKey}>Net</Th>
                    <Th k="sl_huy" cur={sortKey} set={setSortKey}>Cancelled</Th>
                    <Th k="cancel_rate" cur={sortKey} set={setSortKey}>Cancel %</Th>
                    <Th k="gmv" cur={sortKey} set={setSortKey}>GMV</Th>
                    <Th k="nmv" cur={sortKey} set={setSortKey}>NMV</Th>
                    <Th k="gia_goc_tb" cur={sortKey} set={setSortKey}>List price</Th>
                    <Th k="gia_ban_tb" cur={sortKey} set={setSortKey}>After seller disc.</Th>
                    <Th k="gia_khach_tra_tb" cur={sortKey} set={setSortKey}>Buyer paid</Th>
                    <Th k="pct_seller_disc" cur={sortKey} set={setSortKey}>Seller disc. %</Th>
                    <Th k="pct_platform_disc" cur={sortKey} set={setSortKey}>Platform disc. %</Th>
                    <Th k="gio_huy_trung_vi" cur={sortKey} set={setSortKey}>Lapse (median)</Th>
                    <Th k="gio_huy_tb" cur={sortKey} set={setSortKey}>Lapse (avg)</Th>
                  </tr></thead>
                  <tbody>
                    {(['robot', 'handheld'] as const)
                      .filter((c) => cat === 'all' || cat === c)
                      .map((c) => {
                        const rows = skuF.filter((s) => s.category === c)
                        if (!rows.length) return null
                        const sum = (f: (s: Sku) => number) => rows.reduce((a, s) => a + Number(f(s) || 0), 0)
                        const gross = sum((s) => s.so_luong)
                        const cancelled = sum((s) => s.sl_huy)
                        const open = !closed.has(c)
                        return (
                          <Fragment key={c}>
                            <tr className="grp" onClick={() => toggleClosed(c)}>
                              <td>
                                <span className="car">{open ? '▾' : '▸'}</span>{' '}
                                <span className="sw sm" style={{ background: c === 'robot' ? 'var(--c1)' : 'var(--c2)' }} />
                                <b>{c === 'robot' ? 'Robot vacuums' : 'Handheld vacuums'}</b>
                                <span className="muted"> · {rows.length} models</span>
                              </td>
                              <td className="n"><b>{n0(gross)}</b></td>
                              <td className="n"><b>{n0(sum((s) => s.sl_chua_huy))}</b></td>
                              <td className="n"><b>{n0(cancelled)}</b></td>
                              <td className="n"><b>{Math.round((cancelled / Math.max(1, gross)) * 1000) / 10}%</b></td>
                              <td className="n"><b>{mn(sum((s) => s.gmv))}m</b></td>
                              <td className="n"><b>{mn(sum((s) => s.nmv))}m</b></td>
                              <td className="n muted">—</td>
                              <td className="n"><b>{n0(sum((s) => s.gmv) / Math.max(1, gross))}</b></td>
                              <td className="n muted">—</td>
                              <td className="n muted">—</td>
                              <td className="n muted">—</td>
                              <td className="n muted">—</td>
                              <td className="n muted">—</td>
                            </tr>
                            {open && rows.map((s) => (
                              <tr key={s.model}>
                                <td className="ind">{s.model}</td>
                                <td className="n">{n0(s.so_luong)}</td>
                                <td className="n"><b>{n0(s.sl_chua_huy)}</b></td>
                                <td className="n">{n0(s.sl_huy)}</td>
                                <td className="n" style={{ color: s.cancel_rate > 70 ? 'var(--bad)' : 'inherit' }}>{pct(s.cancel_rate)}</td>
                                <td className="n">{mn(s.gmv)}m</td>
                                <td className="n"><b>{mn(s.nmv)}m</b></td>
                                <td className="n">{n0(s.gia_goc_tb)}</td>
                                <td className="n">{n0(s.gia_ban_tb)}</td>
                                <td className="n muted">{n0(s.gia_khach_tra_tb)}</td>
                                <td className="n">{pct(s.pct_seller_disc)}</td>
                                <td className="n muted">{pct(s.pct_platform_disc)}</td>
                                <td className="n">{s.gio_huy_trung_vi != null ? `${Math.round(s.gio_huy_trung_vi)}h` : '—'}</td>
                                <td className="n muted">{s.gio_huy_tb != null ? `${Math.round(s.gio_huy_tb)}h` : '—'}</td>
                              </tr>
                            ))}
                          </Fragment>
                        )
                      })}
                  </tbody>
                </table>
              </div>
              <p className="foot">
                Money in VND m, prices in VND. &ldquo;Lapse&rdquo; is the gap between order and
                cancellation; the median is more trustworthy than the average because a few very
                late cancellations drag the average up. This table covers all time, not the
                selected period.
              </p>
            </section>
          </>
        )}

        {/* =================== DISCOUNTS =================== */}
        {tab === 'Discounts' && (
          <>
            <section>
              <h2>Who funds the discount</h2>
              <p className="sub">
                Percentage of list price. Blue is money the shop gives up, orange is funded by
                TikTok. Only the blue part eats into your margin.
              </p>
              <RowBars
                rows={skuF.slice(0, 15).map((s) => ({
                  nhan: s.model,
                  segs: [
                    { v: s.pct_seller_disc, color: 'var(--c1)', ten: 'Seller funded (%)' },
                    { v: s.pct_platform_disc, color: 'var(--c2)', ten: 'Platform funded (%)' },
                  ],
                  phu: `${pct(s.pct_seller_disc)} + ${pct(s.pct_platform_disc)}`,
                }))}
              />
              <div className="legend" style={{ marginTop: 14 }}>
                <span><i className="sw" style={{ background: 'var(--c1)' }} />Seller funded</span>
                <span><i className="sw" style={{ background: 'var(--c2)' }} />Platform funded</span>
              </div>
            </section>

            <section>
              <h2>Discount spend per {periodWord}</h2>
              <p className="sub">Stacked: seller share and platform share. VND bn.</p>
              <StackChart
                data={shown.map((r) => ({ ky: r.ky, a: r.seller_disc ?? 0, b: r.platform_disc ?? 0 }))}
                fmt={bn} label={lbl} names={['Seller funded', 'Platform funded']}
                colors={['var(--c1)', 'var(--c2)']} unit="VND bn"
                tip={(d) => (
                  <><b>{lbl(d.ky)}</b><br />Seller {bn(d.a)} bn · Platform {bn(d.b)} bn
                    <br />Seller carries {Math.round((d.a / Math.max(1, d.a + d.b)) * 100)}% of all discounting</>
                )}
              />
            </section>

            <section>
              <h2>Seller-funded share · {dod}</h2>
              <p className="sub">
                Rising means you are buying the price position with your own money, not that the
                platform is subsidising more.
              </p>
              <DeltaChart
                data={shown.map((r) => ({
                  ky: r.ky,
                  v: Math.round((r.seller_disc / Math.max(1, r.seller_disc + r.platform_disc)) * 1000) / 10,
                }))}
                color="var(--c1)" fmt={(v) => `${v}`} label={lbl} unit="% of discount funded by seller"
                tip={(d) => <><b>{lbl(d.ky)}</b><br />Seller funded {d.v}%</>}
              />
            </section>

            <section>
              <h2>Discount detail by model</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Model</th><th className="n">List price</th><th className="n">After seller disc.</th>
                    <th className="n">Seller disc. (VND)</th><th className="n">Seller disc. %</th>
                    <th className="n">Platform disc. (VND)</th><th className="n">Platform disc. %</th>
                    <th className="n">Total disc. %</th><th className="n">Gross pcs</th>
                  </tr></thead>
                  <tbody>
                    {skuF.map((s) => (
                      <tr key={s.model}>
                        <td>
                          <span className="sw sm" style={{ background: s.category === 'robot' ? 'var(--c1)' : 'var(--c2)' }} />
                          {s.model}
                        </td>
                        <td className="n">{n0(s.gia_goc_tb)}</td>
                        <td className="n">{n0(s.gia_ban_tb)}</td>
                        <td className="n">{n0(s.seller_disc_tb)}</td>
                        <td className="n"><b>{pct(s.pct_seller_disc)}</b></td>
                        <td className="n muted">{n0(s.platform_disc_tb)}</td>
                        <td className="n muted">{pct(s.pct_platform_disc)}</td>
                        <td className="n">{pct(Math.round((Number(s.pct_seller_disc) + Number(s.pct_platform_disc)) * 10) / 10)}</td>
                        <td className="n">{n0(s.so_luong)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* =================== CANCELLATIONS =================== */}
        {tab === 'Cancellations' && (
          <>
            <section>
              <h2>How long after ordering do orders die</h2>
              <p className="sub">Two distinct clusters, and they are two different problems — see the note below.</p>
              <BarChart
                data={lapse.map((l) => ({ ky: l.khoang, v: l.so_luong }))}
                color="var(--c2)" fmt={n0} label={(k) => k} unit="pcs"
                tip={(d) => {
                  const row = lapse.find((l) => l.khoang === d.ky)
                  return <><b>{d.ky}</b><br />{n0(d.v)} pcs · {row?.pct}% of all cancellations</>
                }}
              />
              <div className="tablewrap" style={{ marginTop: 18 }}>
                <table>
                  <thead><tr><th>Time bucket</th><th className="n">Pcs</th><th className="n">Share</th><th className="n">Cumulative</th></tr></thead>
                  <tbody>
                    {(() => {
                      let run = 0
                      return lapse.map((l) => {
                        run += Number(l.pct || 0)
                        return (
                          <tr key={l.khoang}>
                            <td>{l.khoang}</td>
                            <td className="n">{n0(l.so_luong)}</td>
                            <td className="n">{pct(l.pct)}</td>
                            <td className="n muted">{Math.round(run * 10) / 10}%</td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>
              <div className="note hot">
                <b>First cluster — cancelled within the hour.</b> The order dies before anyone picks
                it. Mis-taps, test orders, or the system voiding unpaid orders. This is fixed in the
                order-confirmation flow, not in logistics.
                <br /><br />
                <b>Second cluster — cancelled at day 3–7.</b> That is the delivery window. The parcel
                shipped and the buyer refused it, which matches the &ldquo;delivery failed&rdquo;
                reason code. The shipping money is genuinely gone.
              </div>
            </section>

            <section>
              <h2>Cancellation rate per {periodWord} · {dod}</h2>
              <p className="sub">Internal target is 40% or below. The mid gridline is half the maximum.</p>
              <DeltaChart
                data={pt((r) => r.cancel_rate)} color="var(--bad)" fmt={(v) => `${v}`} label={lbl} unit="% cancelled"
                tip={(d) => {
                  const r = shown.find((x) => x.ky === d.ky)
                  return <><b>{lbl(d.ky)}</b><br />Cancelled {d.v}%<br />{n0(r?.sl_huy ?? 0)} of {n0(r?.so_luong ?? 0)} pcs</>
                }}
              />
            </section>

            <section>
              <h2>Worst models by cancellation rate</h2>
              <p className="sub">Models with at least 30 gross units.</p>
              <RowBars
                rows={skuF.filter((s) => s.so_luong >= 30)
                  .slice()
                  .sort((a, b) => b.cancel_rate - a.cancel_rate)
                  .slice(0, 14)
                  .map((s) => ({
                    nhan: s.model,
                    segs: [{ v: s.cancel_rate, color: s.cancel_rate > 70 ? 'var(--bad)' : 'var(--c2)', ten: 'Cancellation rate (%)' }],
                    phu: `${pct(s.cancel_rate)} · ${n0(s.so_luong)} gross`,
                  }))}
              />
            </section>

            <section>
              <h2>Cancellation detail by model</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Model</th><th className="n">Gross pcs</th><th className="n">Cancelled</th><th className="n">Cancel %</th>
                    <th className="n">Lapse (median)</th><th className="n">Lapse (avg)</th>
                    <th className="n">Value lost</th>
                  </tr></thead>
                  <tbody>
                    {skuF.slice()
                      .sort((a, b) => b.sl_huy - a.sl_huy)
                      .map((s) => (
                        <tr key={s.model}>
                          <td>
                            <span className="sw sm" style={{ background: s.category === 'robot' ? 'var(--c1)' : 'var(--c2)' }} />
                            {s.model}
                          </td>
                          <td className="n">{n0(s.so_luong)}</td>
                          <td className="n">{n0(s.sl_huy)}</td>
                          <td className="n" style={{ color: s.cancel_rate > 70 ? 'var(--bad)' : 'inherit' }}>{pct(s.cancel_rate)}</td>
                          <td className="n">{s.gio_huy_trung_vi != null ? `${Math.round(s.gio_huy_trung_vi)}h` : '—'}</td>
                          <td className="n muted">{s.gio_huy_tb != null ? `${Math.round(s.gio_huy_tb)}h` : '—'}</td>
                          <td className="n" style={{ color: 'var(--bad)' }}>{mn(s.gmv - s.nmv)}m</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="foot">Value lost = GMV minus NMV — the money that walked out with the cancelled orders.</p>
            </section>
          </>
        )}

        {/* =================== P&L =================== */}
        {tab === 'P&L' && (
          <>
            <section>
              <h2>From list price to cash</h2>
              <p className="sub">
                All periods combined, cancelled orders excluded. This is a draft — COGS, platform
                fees, affiliate commission and ad spend are still missing.
              </p>
              {(() => {
                const t = pnl.reduce((a, r) => ({
                  gia_niem_yet: a.gia_niem_yet + Number(r.gia_niem_yet || 0),
                  shop_giam_gia: a.shop_giam_gia + Number(r.shop_giam_gia || 0),
                  san_giam_gia: a.san_giam_gia + Number(r.san_giam_gia || 0),
                  nmv: a.nmv + Number(r.nmv || 0),
                  khach_tra: a.khach_tra + Number(r.khach_tra || 0),
                  gmv_mat_do_huy: a.gmv_mat_do_huy + Number(r.gmv_mat_do_huy || 0),
                }), { gia_niem_yet: 0, shop_giam_gia: 0, san_giam_gia: 0, nmv: 0, khach_tra: 0, gmv_mat_do_huy: 0 })
                const shipTot = ship.reduce((a, r) => a + Number(r.shop_tro_gia_ship || 0), 0)
                const steps = [
                  { nhan: 'List price', v: t.gia_niem_yet, kieu: 'base' },
                  { nhan: 'Seller discount', v: -t.shop_giam_gia, kieu: 'tru' },
                  { nhan: 'NMV — recognised by shop', v: t.nmv, kieu: 'moc' },
                  { nhan: 'Platform discount (TikTok funded)', v: -t.san_giam_gia, kieu: 'ghi' },
                  { nhan: 'Buyer actually paid', v: t.khach_tra, kieu: 'moc' },
                  { nhan: 'Seller-funded shipping subsidy', v: -shipTot, kieu: 'tru' },
                  { nhan: 'Still missing: COGS · platform fees · commission · ads', v: 0, kieu: 'thieu' },
                ]
                const maxV = Math.max(...steps.map((s) => Math.abs(s.v)))
                return (
                  <div className="waterfall">
                    {steps.map((s) => (
                      <div className={`wf ${s.kieu}`} key={s.nhan}>
                        <div className="wf-l">{s.nhan}</div>
                        <div className="wf-b">
                          {s.v !== 0 && (
                            <div className="wf-f" style={{
                              width: `${(Math.abs(s.v) / maxV) * 100}%`,
                              background: s.kieu === 'tru' ? 'var(--bad)'
                                : s.kieu === 'ghi' ? 'var(--c2)'
                                : s.kieu === 'moc' ? 'var(--ok)' : 'var(--c1)',
                            }} />
                          )}
                        </div>
                        <div className="wf-v">{s.v === 0 ? '—' : `${s.v < 0 ? '−' : ''}${bn(Math.abs(s.v))} bn`}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              <div className="note hot">
                <b>The most expensive number is not in the table above.</b> Value lost to cancellations
                is <b>{bn(pnl.reduce((a, r) => a + Number(r.gmv_mat_do_huy || 0), 0))} bn</b>, and the
                shipping subsidy burned on those cancelled orders alone is{' '}
                <b>{n0(ship.reduce((a, r) => a + Number(r.ship_dot_cho_don_huy || 0), 0))} VND</b> —
                spent, with nothing coming back.
              </div>
            </section>

            <section>
              <h2>NMV and what erodes it, by month</h2>
              <p className="sub">
                Stacked: green is NMV recognised, red is the discount the shop funded itself.
                Together they equal the list price of non-cancelled orders. VND bn.
              </p>
              <StackChart
                data={pnl.filter((r) => Number(r.gia_niem_yet || 0) > 0)
                  .map((r) => ({ ky: r.thang, a: Number(r.nmv || 0), b: Number(r.shop_giam_gia || 0) }))}
                fmt={bn} label={mmyy} names={['NMV', 'Seller discount']}
                colors={['var(--ok)', 'var(--bad)']} unit="VND bn"
                tip={(d) => (
                  <><b>{mmyy(d.ky)}</b><br />NMV {bn(d.a)} bn · Seller discount {bn(d.b)} bn
                    <br />Seller gave up {Math.round((d.b / Math.max(1, d.a + d.b)) * 1000) / 10}% of list price</>
                )}
              />
            </section>

            <section>
              <h2>P&amp;L by month</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Month</th><th className="n">List price</th><th className="n">Seller disc.</th>
                    <th className="n">Platform disc.</th><th className="n">NMV</th><th className="n">Buyer paid</th>
                    <th className="n">Lost to cancels</th><th className="n">Shipping subsidy</th>
                    <th className="n">Shipping burned on cancels</th>
                  </tr></thead>
                  <tbody>
                    {pnl.filter((r) => Number(r.gia_niem_yet || 0) > 0).map((r) => {
                      const s = ship.find((x) => x.thang === r.thang)
                      return (
                        <tr key={r.thang}>
                          <td className="k">{mmyy(r.thang)}</td>
                          <td className="n">{bn(r.gia_niem_yet)}</td>
                          <td className="n" style={{ color: 'var(--bad)' }}>−{bn(r.shop_giam_gia)}</td>
                          <td className="n muted">−{bn(r.san_giam_gia)}</td>
                          <td className="n"><b>{bn(r.nmv)}</b></td>
                          <td className="n">{bn(r.khach_tra)}</td>
                          <td className="n" style={{ color: 'var(--bad)' }}>{bn(r.gmv_mat_do_huy)}</td>
                          <td className="n">{bn(s?.shop_tro_gia_ship ?? 0)}</td>
                          <td className="n" style={{ color: 'var(--bad)' }}>{bn(s?.ship_dot_cho_don_huy ?? 0)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="foot">Money in VND bn.</p>
            </section>
          </>
        )}

        <div className="note">
          <b>Not in this dashboard yet:</b> Livestream, Advertising and Product Funnel. Each needs a
          new sync adapter — that data is not in the database.
        </div>
      </main>
    </>
  )
}

function Th({ k, cur, set, children }: {
  k: keyof Sku; cur: keyof Sku; set: (k: keyof Sku) => void; children: React.ReactNode
}) {
  return (
    <th className="n srt" onClick={() => set(k)} data-on={cur === k ? '1' : '0'}>
      {children}{cur === k && <span className="car"> ▾</span>}
    </th>
  )
}

function deltaText(d: number | null, periodWord: string) {
  if (d == null) return undefined
  const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '·'
  return `${arrow} ${Math.abs(d)}% vs previous ${periodWord}`
}

/* ================================ CSS ================================ */

const CSS = `
.wrap{--ground:#FBFAFA;--surface:#fff;--surface-2:#F3F1F2;--ink:#17151A;--ink-2:#4A444C;
  --muted:#7C737D;--line:#E3DFE1;--line-s:#CFC8CB;
  --c1:#2563A8;--c1-soft:#A9C4E0;--c2:#C2620B;--c3:#5B4A9E;--ok:#1F7A4D;--bad:#C1121F;
  background:var(--ground);color:var(--ink);min-height:100vh;
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
  max-width:1180px;margin:0 auto;padding:40px 20px 96px}
@media (prefers-color-scheme:dark){.wrap{--ground:#131215;--surface:#1B191D;--surface-2:#232025;
  --ink:#F2EFF1;--ink-2:#C6BEC6;--muted:#8F8691;--line:#312D33;--line-s:#453F47;
  --c1:#4E93DD;--c1-soft:#2F4E6E;--c2:#C07E1E;--c3:#9B8AE0;--ok:#5FCB92;--bad:#FF6B7B}}
.wrap *{box-sizing:border-box}
.eyebrow{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 11px}
.wrap h1{font-size:32px;font-weight:700;letter-spacing:-.02em;margin:0}
.lede{color:var(--ink-2);margin:11px 0 0;font-size:15.5px;max-width:74ch;line-height:1.6}
.wrap section{margin-top:44px}
.wrap h2{font-size:18.5px;font-weight:600;letter-spacing:-.01em;margin:0}
.wrap h3{font-size:14px;font-weight:600;margin:0 0 4px;color:var(--ink-2)}
.sub{color:var(--ink-2);margin:7px 0 0;font-size:14.5px;max-width:74ch;line-height:1.6}
.foot{color:var(--muted);font-size:12.5px;margin:8px 0 0}
.muted{color:var(--muted);font-weight:400}
.up{color:var(--ok)}
.down{color:var(--bad)}
.lnk{font:inherit;font-size:12.5px;background:none;border:0;padding:0;color:var(--c1);
  cursor:pointer;text-decoration:underline}

.filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:26px}
.seg{display:inline-flex;background:var(--surface-2);border:1px solid var(--line);border-radius:5px;padding:2px}
.seg button{font:inherit;font-size:13.5px;padding:6px 13px;border:0;background:transparent;
  color:var(--ink-2);border-radius:4px;cursor:pointer;white-space:nowrap}
.seg button.on{background:var(--surface);color:var(--ink);font-weight:500;
  box-shadow:0 1px 2px rgba(0,0,0,.08)}
.seg button:focus-visible{outline:2px solid var(--c1);outline-offset:1px}
.drop{font:inherit;font-size:13.5px;padding:7px 11px;border:1px solid var(--line);
  background:var(--surface);color:var(--ink);border-radius:5px;cursor:pointer;max-width:100%}
.drop.wide{min-width:240px}
.drop:focus-visible{outline:2px solid var(--c1);outline-offset:1px}

.tabs{display:flex;gap:2px;margin-top:26px;border-bottom:1px solid var(--line);overflow-x:auto}
.tabs button{font:inherit;font-size:14px;padding:9px 14px;border:0;background:transparent;
  color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
.tabs button.on{color:var(--ink);border-bottom-color:var(--c1);font-weight:500}
.tabs button:focus-visible{outline:2px solid var(--c1);outline-offset:-2px}

.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:4px;overflow:hidden;margin-top:30px}
.tile{background:var(--surface);padding:15px 17px}
.tile-l{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.tile-v{font-size:27px;font-weight:650;letter-spacing:-.02em;margin-top:7px;font-variant-numeric:tabular-nums}
.tile-u{font-size:15px;font-weight:500;color:var(--muted);margin-left:2px}
.tile-s{font-size:12.5px;color:var(--muted);margin-top:4px;line-height:1.4}

/* ---- chart layer (charts.tsx) ----
   Everything sits in normal flow: fixed-height plot, flexible columns, labels
   below the columns instead of absolutely positioned. That is what stopped the
   labels colliding. Axis numbers live in the left/right gutters. */
.unit{font-size:12px;color:var(--muted);margin:14px 0 0}
.unit-inline{color:var(--muted);font-size:12px}
.cframe{position:relative;margin-top:14px;padding:8px 46px 0 50px}
.gridline{position:absolute;left:50px;right:46px;top:8px;border-top:1px dashed var(--line);
  pointer-events:none;z-index:0}
.gridline.half{top:133px}
.gridline .gl,.gridline .gr{position:absolute;top:-8px;font-size:10.5px;color:var(--muted);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.gridline .gl{left:-50px;width:44px;text-align:right}
.gridline .gr{right:-46px;width:40px;text-align:left}
.lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;overflow:visible}
.swl{width:13px;height:3px;border-radius:2px;display:inline-block;flex:none}
.plot{display:flex;align-items:flex-end;gap:6px;height:250px;position:relative;z-index:1;
  border-bottom:1px solid var(--line-s)}
.plot .col{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:flex-end;
  cursor:default}
.bwrap{flex:1;display:flex;flex-direction:column;justify-content:flex-end;min-height:0}
.bval{font-size:10.5px;text-align:center;color:var(--ink-2);font-variant-numeric:tabular-nums;
  margin-bottom:3px;white-space:nowrap}
.bar{width:100%;border-radius:3px 3px 0 0;min-height:2px}
.stack{width:100%;display:flex;flex-direction:column;justify-content:flex-end;min-height:2px}
.sseg{width:100%;min-height:0}
.sseg.top{border-radius:3px 3px 0 0}
.gap{height:2px;flex:none}
.col:hover .bar,.col:hover .stack{opacity:.82}
.xlab{font-size:10.5px;color:var(--muted);text-align:center;line-height:1.3;margin-top:6px;
  height:28px;overflow:hidden;word-break:break-word}
.dod{font-size:10px;text-align:center;color:var(--muted);font-variant-numeric:tabular-nums;
  margin-top:4px;height:14px;white-space:nowrap}
.dod.up{color:var(--ok)}
.dod.down{color:var(--bad)}

.legend{display:flex;gap:16px;margin-top:14px;font-size:13px;color:var(--ink-2);flex-wrap:wrap}
.legend span{display:inline-flex;align-items:center;gap:6px}
.sw{width:9px;height:9px;border-radius:2px;display:inline-block;flex:none}
.sw.sm{width:7px;height:7px;margin-right:7px}

.two{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:18px}
@media (max-width:760px){.two{grid-template-columns:1fr}}

.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;margin-top:30px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:16px 18px}
.card-h{display:flex;align-items:center;gap:8px;font-size:14.5px;margin-bottom:12px}
.kv{display:flex;justify-content:space-between;gap:12px;padding:6px 0;font-size:14px;
  border-top:1px solid var(--line)}
.kv span{color:var(--muted)}
.kv b{font-variant-numeric:tabular-nums}

.rows{display:grid;gap:9px;margin-top:20px}
.row{display:grid;grid-template-columns:minmax(150px,1.4fr) 2fr auto;gap:13px;align-items:center;font-size:13.5px}
.row-l{color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row-t{height:10px;background:var(--surface-2);border-radius:4px;overflow:hidden;display:flex}
.row-v{font-variant-numeric:tabular-nums;white-space:nowrap;font-size:13px}
@media (max-width:640px){.row{grid-template-columns:1fr auto}.row-t{grid-column:1/-1}}

.tablewrap{overflow-x:auto;margin-top:18px;border:1px solid var(--line);border-radius:4px}
.wrap table{border-collapse:collapse;width:100%;min-width:680px;background:var(--surface);font-size:13px}
.wrap th,.wrap td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.wrap thead th{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);
  font-weight:500;background:var(--surface-2)}
.wrap thead th.srt{cursor:pointer;user-select:none}
.wrap thead th.srt:hover{color:var(--ink)}
.wrap thead th[data-on="1"]{color:var(--c1)}
.car{font-size:9px}
.wrap tbody tr:last-child td{border-bottom:0}
.wrap tbody tr:hover td{background:var(--surface-2)}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.k{font-variant-numeric:tabular-nums}
.wrap tbody tr.grp td{background:var(--surface-2);cursor:pointer;
  border-top:1px solid var(--line-s);border-bottom:1px solid var(--line-s)}
.wrap tbody tr.grp:hover td{background:var(--line)}
.ind{padding-left:30px !important;color:var(--ink-2)}

.waterfall{display:grid;gap:8px;margin-top:22px}
.wf{display:grid;grid-template-columns:minmax(180px,1.2fr) 2fr auto;gap:13px;align-items:center;font-size:14px}
.wf-l{color:var(--ink-2)}
.wf.moc .wf-l{color:var(--ink);font-weight:600}
.wf.thieu .wf-l{color:var(--muted);font-style:italic}
.wf-b{height:11px;background:var(--surface-2);border-radius:4px;overflow:hidden}
.wf-f{height:100%;border-radius:4px}
.wf-v{font-variant-numeric:tabular-nums;white-space:nowrap;font-size:13.5px}
.wf.moc .wf-v{font-weight:600}
@media (max-width:640px){.wf{grid-template-columns:1fr auto}.wf-b{grid-column:1/-1}}

.tip{position:fixed;z-index:50;background:var(--surface);border:1px solid var(--line-s);
  border-radius:4px;padding:8px 11px;font-size:12.5px;line-height:1.5;color:var(--ink);
  box-shadow:0 4px 14px rgba(0,0,0,.16);pointer-events:none;max-width:280px}

.note{margin-top:26px;padding:14px 16px;background:var(--surface-2);border:1px solid var(--line);
  border-left:2px solid var(--line-s);border-radius:3px;font-size:14px;color:var(--ink-2);line-height:1.6}
.note.warn{border-left-color:var(--c2)}
.note.hot{border-left-color:var(--bad)}
.note b{color:var(--ink)}
`
