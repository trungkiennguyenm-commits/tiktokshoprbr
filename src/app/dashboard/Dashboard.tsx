'use client'

import { Fragment, useMemo, useState } from 'react'
import {
  BarChart, StackChart, DeltaChart, RowBars, ComboChart, MultiStack,
  type Pt, type PtN,
} from './charts'

/* ============================== data types ==============================
   Seller GMV and Seller NMV share one money formula: list price − seller discount.
   They differ only in the order set: Seller GMV takes every status, Seller NMV drops
   cancelled orders. So Seller GMV = Seller NMV + gmv_mat_do_huy, which is why Seller NMV can
   legitimately stack inside the Seller GMV column.

   Period views carry SUMS, not averages. Only sums can be re-aggregated
   when several periods are selected — an average of averages is wrong.
   ====================================================================== */

type PerfBase = {
  category: string; so_luong: number
  sl_chua_huy: number; sl_hoan_tat: number; sl_huy: number; cancel_rate: number
  gmv: number; nmv: number; nmv_hoan_tat: number; gmv_mat_do_huy: number; khach_tra: number
  gia_goc: number; gia_goc_chua_huy: number
  seller_disc: number; seller_disc_chua_huy: number
  platform_disc: number; platform_disc_chua_huy: number
}
export type Monthly = PerfBase & { thang: string; gio_huy_tb: number }
export type Daily = PerfBase & { ngay: string }

export type SkuPeriod = {
  model: string; category: string; ky: string
  so_luong: number; sl_chua_huy: number; sl_huy: number; cancel_rate: number
  gmv: number; nmv: number
  gia_goc_tong: number; khach_tra_tong: number
  seller_disc_tong: number; platform_disc_tong: number
  gio_huy_tong: number; sl_co_lapse: number; gio_huy_trung_vi: number | null
  gia_goc_chua_huy: number; seller_disc_chua_huy: number
  platform_disc_chua_huy: number; khach_tra_chua_huy: number
}
export type Sku = {
  model: string; category: string
  so_luong: number; sl_chua_huy: number; sl_hoan_tat: number; sl_huy: number; cancel_rate: number
  gmv: number; nmv: number
  gia_goc_tb: number; gia_ban_tb: number; gia_khach_tra_tb: number
  pct_seller_disc: number; pct_platform_disc: number
  gio_huy_tb: number; gio_huy_trung_vi: number
}
export type Segment = {
  thang: string; price_band: string; band_order: number; category: string
  so_luong: number; sl_chua_huy: number; sl_huy: number; cancel_rate: number
  gmv: number; nmv: number; gia_goc: number; seller_disc: number; platform_disc: number
  gia_goc_chua_huy: number; seller_disc_chua_huy: number
  platform_disc_chua_huy: number; khach_tra_chua_huy: number
}
export type LapseRow = { ngay: string; khoang: string; thu_tu: number; category: string; so_luong: number }
export type Ship = {
  ngay: string; so_don: number; phi_ship_goc: number; phi_ship_khach_tra: number
  shop_tro_gia_ship: number; san_tro_gia_ship: number; ship_dot_cho_don_huy: number
}

type Props = {
  monthly: Monthly[]; daily: Daily[]; sku: Sku[]
  skuMonthly: SkuPeriod[]; skuDaily: SkuPeriod[]
  segMonthly: Segment[]; lapseDaily: LapseRow[]; shipDaily: Ship[]
}

/* ============================== helpers ============================== */

const n0 = (v: number) => new Intl.NumberFormat('en-US').format(Math.round(v || 0))
const bn = (v: number) => ((v || 0) / 1e9).toFixed(2)
const mn = (v: number) => ((v || 0) / 1e6).toFixed(0)
const pct = (v: number | null) => (v == null ? '—' : `${v}%`)
const p1 = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)

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
  { key: 'mdays', label: 'Days in picked months' },
  { key: 'd30', label: 'Last 30 days' },
  { key: 'd7', label: 'Last 7 days' },
] as const
type RangeKey = (typeof RANGES)[number]['key']

const TABS = ['MoM Summary', 'Overview', 'Category', 'SKU', 'Discounts', 'Cancellations', 'P&L', 'Glossary'] as const
type Tab = (typeof TABS)[number]

/* ============================== glossary ==============================
   One place where every term on this dashboard is pinned down. If a number
   in a meeting does not match someone else's number, the disagreement is
   almost always a definition, not an error — start here.
   ====================================================================== */

type Term = { ten: string; dinh_nghia: string; ct?: string; ghi_chu?: string; canh_bao?: boolean }
type Nhom = { nhom: string; mo_ta: string; terms: Term[] }

const GLOSSARY: Nhom[] = [
  {
    nhom: 'Money',
    mo_ta: 'Every money figure below uses the same base: list price minus seller discount — the same line TikTok calls "Total Revenue" on its settlement statement. Platform vouchers are never deducted, because TikTok reimburses them. Every figure on this dashboard is before platform fees; fees belong to the P&L tab and appear nowhere else.',
    terms: [
      {
        ten: 'Seller GMV',
        dinh_nghia: 'Order value the shop booked, across every order status including cancelled ones.',
        ct: 'Σ (list price − seller discount), all statuses',
        ghi_chu: 'Measures demand generated, not money earned. A month can post a big Seller GMV and still bring in very little.',
      },
      {
        ten: 'Seller NMV',
        dinh_nghia: 'The part of Seller GMV that is still alive — cancelled orders removed. This is the revenue the shop recognises.',
        ct: 'Σ (list price − seller discount), cancelled excluded',
        ghi_chu: 'Matches TikTok’s own "Total Revenue" line on the settlement statement, to the dong. Seller GMV = Seller NMV + value lost to cancellations. Not restricted to COMPLETED, so it is readable the same day.',
      },
      {
        ten: 'Customer-funded NMV',
        dinh_nghia: 'The cash the buyer actually transferred, after both the seller discount and the platform voucher.',
        ct: 'Σ sale price, cancelled excluded',
        ghi_chu: 'TikTok Seller Centre calls this figure "GMV". Quote the full name when sharing numbers or the two reports will look wrong to each other.',
        canh_bao: true,
      },
      {
        ten: 'Platform-funded NMV',
        dinh_nghia: 'The voucher TikTok reimbursed on those same live orders. Same money as "valid subsidy", seen from the revenue side.',
        ct: 'Σ platform discount, cancelled excluded',
        ghi_chu: 'Customer-funded NMV + Platform-funded NMV = Seller NMV, exactly.',
      },
      {
        ten: 'Seller NMV completed',
        dinh_nghia: 'The slice of Seller NMV whose orders reached COMPLETED — delivered and closed.',
        ct: 'Σ (list price − seller discount), status = COMPLETED',
        ghi_chu: 'Always lags. Use it to reconcile against finance, not to track the current period.',
      },
      {
        ten: 'Value lost to cancellations',
        dinh_nghia: 'Seller GMV that walked out with cancelled orders.',
        ct: 'Seller GMV − Seller NMV',
        ghi_chu: 'The single largest line on this dashboard, and the one nobody invoices for.',
      },
      {
        ten: 'List price',
        dinh_nghia: 'Price before any discount. Also the base for every discount percentage here, and the basis for price bands.',
        ct: 'original_price from the order item',
      },
      {
        ten: 'Price after seller discount',
        dinh_nghia: 'Unit price once the shop’s own discount is taken off, before the platform voucher.',
        ct: 'list price − seller discount',
        ghi_chu: 'This is the per-unit version of Seller GMV.',
      },
    ],
  },
  {
    nhom: 'Volume',
    mo_ta: 'Counted in units, not orders: one order carrying two machines counts as two. Gifts and accessories are excluded everywhere — only robots and handhelds.',
    terms: [
      {
        ten: 'Gross pcs',
        dinh_nghia: 'Units ordered, including units later cancelled.',
        ct: 'count of order items, all statuses',
      },
      {
        ten: 'Net pcs',
        dinh_nghia: 'Units still alive — cancelled units removed.',
        ct: 'count of order items, cancelled excluded',
        ghi_chu: 'The number to plan stock and targets against.',
      },
      {
        ten: 'Cancelled',
        dinh_nghia: 'Units on orders with status CANCELLED.',
        ct: 'Gross pcs − Net pcs',
      },
    ],
  },
  {
    nhom: 'Cancellations',
    mo_ta: 'Cancellation is the dominant force in this account, so it gets its own vocabulary.',
    terms: [
      {
        ten: 'Cancellation rate',
        dinh_nghia: 'Share of ordered units that were cancelled.',
        ct: 'Cancelled ÷ Gross pcs',
        ghi_chu: 'The newest period always understates it: the biggest cancellation cluster lands 3–7 days after the order, so recent days keep climbing for a week.',
        canh_bao: true,
      },
      {
        ten: 'Cancel lapse',
        dinh_nghia: 'Time between the order being placed and being cancelled.',
        ct: 'cancel time − create time, in hours',
        ghi_chu: 'Two clusters matter: under an hour (order-confirmation problem) and day 3–7 (delivery refusal).',
      },
      {
        ten: 'Lapse (median)',
        dinh_nghia: 'The middle cancel lapse for that model in that period.',
        ghi_chu: 'Only shown when a single period is selected — medians cannot be combined across periods. More trustworthy than the average, which a few very late cancellations drag upward.',
      },
      {
        ten: 'Lapse (avg)',
        dinh_nghia: 'Mean cancel lapse, weighted by number of cancellations.',
        ct: 'Σ lapse hours ÷ cancelled units with a lapse',
      },
    ],
  },
  {
    nhom: 'Discounts and subsidy',
    mo_ta: 'Two different wallets pay for a discount. Only one of them is yours.',
    terms: [
      {
        ten: 'Seller discount',
        dinh_nghia: 'Money the shop itself gives up. This is the part that hits your margin.',
        ct: 'Σ seller discount',
      },
      {
        ten: 'Seller discount %',
        dinh_nghia: 'Seller discount as a share of list price.',
        ct: 'Σ seller discount ÷ Σ list price',
        ghi_chu: 'Weighted by quantity, so a high-volume model moves it more than a rarely sold one.',
      },
      {
        ten: 'Subsidy booked',
        dinh_nghia: 'Total platform voucher TikTok put behind your orders in the period, before anything cancelled.',
        ct: 'Σ platform discount, all statuses',
        ghi_chu: 'This is TikTok’s gross spend on your shop, not what you received.',
      },
      {
        ten: 'Valid subsidy',
        dinh_nghia: 'Subsidy that landed on orders which survived. Same money as Platform-funded NMV.',
        ct: 'Σ platform discount, cancelled excluded',
      },
      {
        ten: 'Lost subsidy',
        dinh_nghia: 'Subsidy booked against orders that later cancelled — budget spent for nothing.',
        ct: 'Subsidy booked − Valid subsidy',
      },
      {
        ten: 'Capture rate',
        dinh_nghia: 'Share of the booked subsidy that survived to a live order.',
        ct: 'Valid subsidy ÷ Subsidy booked',
        ghi_chu: 'How efficiently the platform’s money converts. A low capture rate is an argument TikTok will notice, and the lever is delivery, not price.',
      },
      {
        ten: 'Subsidy % of Seller GMV',
        dinh_nghia: 'How heavily TikTok is funding the shop overall.',
        ct: 'Subsidy booked ÷ Seller GMV',
      },
      {
        ten: 'Valid subsidy % of Seller NMV',
        dinh_nghia: 'How much of the revenue you recognise is actually TikTok’s money rather than the customer’s.',
        ct: 'Valid subsidy ÷ Seller NMV',
      },
    ],
  },
  {
    nhom: 'Segmentation',
    mo_ta: 'How rows are grouped.',
    terms: [
      {
        ten: 'Price band',
        dinh_nghia: 'Price tier a model sits in: 5–10M, 10–15M, 15–20M, 20–30M, 30M+.',
        ct: 'from list price',
        ghi_chu: 'Deliberately based on list price, not the discounted price, so a model stays in one band across months and the MoM tables stay readable.',
      },
      {
        ten: 'Model',
        dinh_nghia: 'Short product name, e.g. F25 Ultra. Several product IDs sharing a name are merged into one row.',
      },
      {
        ten: 'Category',
        dinh_nghia: 'Robot vacuums or handheld vacuums. Accessories and gifts are excluded from the whole dashboard.',
      },
    ],
  },
  {
    nhom: 'Time and data',
    mo_ta: 'What a "period" means here, and how current the numbers are.',
    terms: [
      {
        ten: 'Period basis',
        dinh_nghia: 'Everything is keyed on when the order was created, in Vietnam time (UTC+7).',
        ghi_chu: 'Not on delivery or settlement date. An order placed in August and delivered in September belongs to August throughout.',
      },
      {
        ten: 'MoM / DoD',
        dinh_nghia: 'Change against the previous period — the month before, or the day before.',
        ct: '(this − previous) ÷ previous',
      },
      {
        ten: 'By month filter',
        dinh_nghia: 'Only months with at least 20 units are shown.',
        ghi_chu: 'Thinner months are artefacts of the initial sync window, not slow months. Plotting them would look like a collapse that never happened.',
        canh_bao: true,
      },
      {
        ten: 'Data freshness',
        dinh_nghia: 'Orders sync once a day at 03:00 Vietnam time and keep running until caught up.',
        ghi_chu: 'The sync re-reads the last two days on every run, so status changes on recent orders are picked up rather than frozen.',
      },
    ],
  },
]

/** Price bands come from LIST price, so a model stays in one band across
 *  months and the MoM tables stay readable. */
const BANDS = ['<5M', '5-10M', '10-15M', '15-20M', '20-30M', '30M+'] as const
const bandOf = (listPrice: number) =>
  listPrice < 5e6 ? '<5M' : listPrice < 10e6 ? '5-10M' : listPrice < 15e6 ? '10-15M'
    : listPrice < 20e6 ? '15-20M' : listPrice < 30e6 ? '20-30M' : '30M+'

const PALETTE = [
  '#2563A8', '#C2620B', '#1F7A4D', '#8E44AD', '#B31B4A',
  '#0E7490', '#8A6D1F', '#4A5568', '#166534', '#7C2D12',
]
const GREY = '#A9A2AB'
const BAND_COLOR: Record<string, string> = {
  '<5M': '#4A5568', '5-10M': '#2563A8', '10-15M': '#C2620B',
  '15-20M': '#1F7A4D', '20-30M': '#8E44AD', '30M+': '#B31B4A',
}

/* ------------------------------ rollups ------------------------------ */

type Rolled = {
  ky: string
  so_luong: number; sl_chua_huy: number; sl_hoan_tat: number; sl_huy: number
  gmv: number; nmv: number; nmv_hoan_tat: number; gmv_mat_do_huy: number; khach_tra: number
  gia_goc: number; gia_goc_chua_huy: number
  seller_disc: number; seller_disc_chua_huy: number
  platform_disc: number; platform_disc_chua_huy: number
  cancel_rate: number
}

const ZERO = (ky: string): Rolled => ({
  ky, so_luong: 0, sl_chua_huy: 0, sl_hoan_tat: 0, sl_huy: 0,
  gmv: 0, nmv: 0, nmv_hoan_tat: 0, gmv_mat_do_huy: 0, khach_tra: 0,
  gia_goc: 0, gia_goc_chua_huy: 0, seller_disc: 0, seller_disc_chua_huy: 0,
  platform_disc: 0, platform_disc_chua_huy: 0, cancel_rate: 0,
})

const keyOf = (r: Monthly | Daily) => ('thang' in r ? r.thang : r.ngay)

const SUM_FIELDS = [
  'so_luong', 'sl_chua_huy', 'sl_hoan_tat', 'sl_huy', 'gmv', 'nmv', 'nmv_hoan_tat',
  'gmv_mat_do_huy', 'khach_tra', 'gia_goc', 'gia_goc_chua_huy',
  'seller_disc', 'seller_disc_chua_huy', 'platform_disc', 'platform_disc_chua_huy',
] as const

function rollup(rows: (Monthly | Daily)[], cat: CatKey): Rolled[] {
  const filtered = cat === 'all' ? rows : rows.filter((r) => r.category === cat)
  const map = new Map<string, Rolled>()
  for (const r of filtered) {
    const k = keyOf(r)
    const cur = map.get(k) ?? ZERO(k)
    for (const f of SUM_FIELDS) cur[f] += Number((r as unknown as Record<string, number>)[f] || 0)
    map.set(k, cur)
  }
  return Array.from(map.values())
    .map((v) => ({ ...v, cancel_rate: p1(v.sl_huy, v.so_luong) }))
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

/** Per-model aggregate for whatever periods are selected. Averages are
 *  recomputed from sums so they stay weighted correctly. The median only
 *  survives when exactly one period contributes — medians do not add up. */
export type SkuAgg = {
  model: string; category: string; band: string
  so_luong: number; sl_chua_huy: number; sl_huy: number; cancel_rate: number
  gmv: number; nmv: number
  gia_goc_tb: number; gia_ban_tb: number; gia_khach_tra_tb: number
  seller_disc_tb: number; platform_disc_tb: number
  pct_seller_disc: number; pct_platform_disc: number
  gio_huy_tb: number | null; gio_huy_trung_vi: number | null
  /** Trợ giá sàn rơi vào đơn không huỷ — tiền thật sự nhận được. */
  valid_sub: number
  /** valid_sub trên Seller NMV. */
  pct_valid_sub: number
  /** valid_sub trên tổng trợ giá đã ghi nhận: giữ được bao nhiêu phần ngân sách. */
  sub_capture: number
  khach_tra: number
}

function aggSku(rows: SkuPeriod[]): SkuAgg[] {
  type Acc = {
    model: string; category: string
    so_luong: number; sl_chua_huy: number; sl_huy: number
    gmv: number; nmv: number
    gia_goc_tong: number; khach_tra_tong: number
    seller_disc_tong: number; platform_disc_tong: number
    gio_huy_tong: number; sl_co_lapse: number
    valid_sub: number; khach_tra: number
    ky_count: number; median_don: number | null
  }
  const map = new Map<string, Acc>()
  for (const r of rows) {
    const a = map.get(r.model) ?? {
      model: r.model, category: r.category,
      so_luong: 0, sl_chua_huy: 0, sl_huy: 0, gmv: 0, nmv: 0,
      gia_goc_tong: 0, khach_tra_tong: 0, seller_disc_tong: 0, platform_disc_tong: 0,
      gio_huy_tong: 0, sl_co_lapse: 0, valid_sub: 0, khach_tra: 0,
      ky_count: 0, median_don: null,
    }
    a.valid_sub += Number(r.platform_disc_chua_huy || 0)
    a.khach_tra += Number(r.khach_tra_chua_huy || 0)
    a.so_luong += Number(r.so_luong || 0)
    a.sl_chua_huy += Number(r.sl_chua_huy || 0)
    a.sl_huy += Number(r.sl_huy || 0)
    a.gmv += Number(r.gmv || 0)
    a.nmv += Number(r.nmv || 0)
    a.gia_goc_tong += Number(r.gia_goc_tong || 0)
    a.khach_tra_tong += Number(r.khach_tra_tong || 0)
    a.seller_disc_tong += Number(r.seller_disc_tong || 0)
    a.platform_disc_tong += Number(r.platform_disc_tong || 0)
    a.gio_huy_tong += Number(r.gio_huy_tong || 0)
    a.sl_co_lapse += Number(r.sl_co_lapse || 0)
    a.ky_count += 1
    a.median_don = a.ky_count === 1 ? (r.gio_huy_trung_vi ?? null) : null
    map.set(r.model, a)
  }
  return Array.from(map.values()).map((a) => {
    const q = Math.max(1, a.so_luong)
    const giaGoc = a.gia_goc_tong / q
    return {
      model: a.model, category: a.category, band: bandOf(giaGoc),
      so_luong: a.so_luong, sl_chua_huy: a.sl_chua_huy, sl_huy: a.sl_huy,
      cancel_rate: p1(a.sl_huy, a.so_luong),
      gmv: a.gmv, nmv: a.nmv,
      gia_goc_tb: Math.round(giaGoc),
      gia_ban_tb: Math.round(a.gmv / q),
      gia_khach_tra_tb: Math.round(a.khach_tra_tong / q),
      seller_disc_tb: Math.round(a.seller_disc_tong / q),
      platform_disc_tb: Math.round(a.platform_disc_tong / q),
      pct_seller_disc: p1(a.seller_disc_tong, a.gia_goc_tong),
      pct_platform_disc: p1(a.platform_disc_tong, a.gia_goc_tong),
      gio_huy_tb: a.sl_co_lapse ? Math.round(a.gio_huy_tong / a.sl_co_lapse) : null,
      gio_huy_trung_vi: a.median_don,
      valid_sub: a.valid_sub,
      pct_valid_sub: p1(a.valid_sub, a.nmv),
      sub_capture: p1(a.valid_sub, a.platform_disc_tong),
      khach_tra: a.khach_tra,
    }
  })
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

function Dd({ a, b }: { a?: number; b?: number }) {
  if (a == null || b == null || !b) return <span className="muted">—</span>
  const d = Math.round(((a - b) / b) * 1000) / 10
  return <span className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '▲' : '▼'}{Math.abs(d)}%</span>
}

/** Pivot: rows down the side, periods across the top. `heat` shades cells
 *  so a bad column jumps out without reading every number. */
function Matrix({ cols, rows, fmt, heat, corner }: {
  cols: string[]
  rows: { label: string; sub?: string; color?: string; vals: (number | null)[] }[]
  fmt: (v: number) => string
  heat?: 'high-bad' | 'high-good'
  corner: string
}) {
  const flat = rows.flatMap((r) => r.vals.filter((v): v is number => v != null))
  const max = Math.max(1, ...flat)
  const shade = (v: number | null) => {
    if (v == null || !heat) return undefined
    const t = Math.min(1, v / max)
    const c = heat === 'high-bad' ? '193,18,31' : '31,122,77'
    return { background: `rgba(${c},${(t * 0.28).toFixed(3)})` }
  }
  return (
    <div className="tablewrap">
      <table>
        <thead><tr>
          <th>{corner}</th>
          {cols.map((c) => <th key={c} className="n">{c}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>
                {r.color && <span className="sw sm" style={{ background: r.color }} />}
                {r.label}
                {r.sub && <span className="muted"> · {r.sub}</span>}
              </td>
              {r.vals.map((v, i) => (
                <td key={cols[i]} className="n" style={shade(v)}>
                  {v == null ? <span className="muted">—</span> : fmt(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
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
            <th className="n">Seller GMV</th>
            <th className="n">Seller NMV</th>
            <th className="n">±Seller NMV</th>
            <th className="n">Lost to cancels</th>
            <th className="n">Seller NMV completed</th>
            <th className="n">Customer-funded</th>
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

export default function Dashboard({
  monthly, daily, sku, skuMonthly, skuDaily, segMonthly, lapseDaily, shipDaily,
}: Props) {
  const [tab, setTab] = useState<Tab>('MoM Summary')
  const [cat, setCat] = useState<CatKey>('all')
  const [range, setRange] = useState<RangeKey>('mom')
  /** Chọn nhiều tháng để so sánh. Rỗng nghĩa là lấy hết. */
  const [selMonths, setSelMonths] = useState<Set<string>>(new Set())
  const toggleMonth = (m: string) =>
    setSelMonths((p) => {
      const n = new Set(p)
      if (n.has(m)) n.delete(m); else n.add(m)
      return n
    })
  const [sortKey, setSortKey] = useState<keyof SkuAgg>('nmv')
  const [mixMetric, setMixMetric] = useState<'gmv' | 'so_luong'>('gmv')
  const [modelSel, setModelSel] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [momMetric, setMomMetric] = useState<'net' | 'gross' | 'cancel'>('net')

  const toggleClosed = (c: string) =>
    setClosed((p) => {
      const n = new Set(p)
      if (n.has(c)) n.delete(c); else n.add(c)
      return n
    })

  const byMonth = range === 'mom'
  const src: (Monthly | Daily)[] = byMonth ? monthly : daily

  /** Months with real volume. Anything thinner is a sync-window artefact,
   *  not a slow month, and would read as a collapse if plotted. */
  const allMonths = useMemo(
    () => rollup(monthly, 'all').filter((r) => r.so_luong >= 20).map((r) => r.ky),
    [monthly],
  )

  /** Các tháng đang được chọn. Không chọn gì thì lấy hết — đây là mốc mà
   *  mọi bảng theo tháng dùng, kể cả tab MoM Summary. */
  const goodMonths = useMemo(
    () => (selMonths.size ? allMonths.filter((m) => selMonths.has(m)) : allMonths),
    [allMonths, selMonths],
  )

  const keys = useMemo(() => {
    const all = rollup(src, 'all')
    let picked: Rolled[]
    if (range === 'mom') picked = all.filter((r) => goodMonths.includes(r.ky))
    else if (range === 'd30') picked = all.slice(-30)
    else if (range === 'd7') picked = all.slice(-7)
    else {
      // Ngày nằm trong các tháng đã chọn. Chưa chọn gì thì lấy tháng mới nhất,
      // vì đổ toàn bộ lịch sử theo ngày ra một trục là không đọc được.
      const pre = new Set((selMonths.size ? goodMonths : allMonths.slice(-1)).map((m) => m.slice(0, 7)))
      picked = all.filter((r) => pre.has(r.ky.slice(0, 7)))
    }
    return new Set(picked.map((r) => r.ky))
  }, [src, range, goodMonths, allMonths, selMonths])

  const srcShown = useMemo(() => src.filter((r) => keys.has(keyOf(r))), [src, keys])
  const shown = useMemo(() => rollup(srcShown, cat), [srcShown, cat])

  const cur = shown[shown.length - 1]
  const prev = shown[shown.length - 2]
  const delta = (a?: number, b?: number) =>
    a == null || b == null || !b ? null : Math.round(((a - b) / b) * 1000) / 10

  /* ---- everything SKU-shaped now respects the period filter ---- */

  const skuRowsAll = useMemo(
    () => (byMonth ? skuMonthly : skuDaily)
      .filter((r) => keys.has(r.ky))
      .filter((r) => cat === 'all' || r.category === cat),
    [byMonth, skuMonthly, skuDaily, keys, cat],
  )
  const skuRows = useMemo(
    () => (modelSel ? skuRowsAll.filter((r) => r.model === modelSel) : skuRowsAll),
    [skuRowsAll, modelSel],
  )

  const skuF = useMemo(
    () => aggSku(skuRows).sort((a, b) => Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0)),
    [skuRows, sortKey],
  )
  const singlePeriod = keys.size === 1

  const allModels = useMemo(
    () => Array.from(new Set(sku.filter((s) => cat === 'all' || s.category === cat).map((s) => s.model))).sort(),
    [sku, cat],
  )

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

  /* ---- tab Discounts luôn ở mức NGÀY ----
     Tab này sinh ra để soi DoD. Nếu để nó chạy theo nút kỳ chung thì chọn
     "By month" là cả tab thành biểu đồ tháng, trùng với tab MoM Summary.
     Nên nó tự ép về ngày; các nút kỳ chỉ quyết định lấy những ngày nào. */
  const dayKeys = useMemo(() => {
    const all = rollup(daily, 'all')
    if (range === 'd30') return new Set(all.slice(-30).map((r) => r.ky))
    if (range === 'd7') return new Set(all.slice(-7).map((r) => r.ky))
    const pre = new Set((selMonths.size ? goodMonths : allMonths.slice(-1)).map((m) => m.slice(0, 7)))
    return new Set(all.filter((r) => pre.has(r.ky.slice(0, 7))).map((r) => r.ky))
  }, [daily, range, goodMonths, allMonths, selMonths])

  const dayShown = useMemo(
    () => rollup(daily.filter((r) => dayKeys.has(r.ngay)), cat),
    [daily, dayKeys, cat],
  )
  const daySkuRows = useMemo(
    () => skuDaily
      .filter((r) => dayKeys.has(r.ky))
      .filter((r) => cat === 'all' || r.category === cat)
      .filter((r) => !modelSel || r.model === modelSel),
    [skuDaily, dayKeys, cat, modelSel],
  )
  const daySkuF = useMemo(() => aggSku(daySkuRows), [daySkuRows])

  /** Cột chồng trợ giá hợp lệ theo model, theo ngày. Cùng khuôn với mix. */
  const subMix = useMemo(() => {
    const val = (r: SkuPeriod) => Number(r.platform_disc_chua_huy || 0)
    const totals = new Map<string, number>()
    for (const r of daySkuRows) totals.set(r.model, (totals.get(r.model) ?? 0) + val(r))
    const top = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0])
    const hasOther = totals.size > top.length
    const series = [
      ...top.map((m, i) => ({ ten: m, color: PALETTE[i % PALETTE.length] })),
      ...(hasOther ? [{ ten: 'Other', color: GREY }] : []),
    ]
    const idx = new Map(top.map((m, i) => [m, i]))
    const byKy = new Map<string, number[]>()
    for (const r of daySkuRows) {
      const arr = byKy.get(r.ky) ?? new Array(series.length).fill(0)
      arr[idx.get(r.model) ?? top.length] += val(r)
      byKy.set(r.ky, arr)
    }
    const data: PtN[] = Array.from(byKy.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ky, parts]) => ({ ky, parts }))
    return { series, data }
  }, [daySkuRows])

  /* ---- cancellation lapse, filtered ---- */

  const lapse = useMemo(() => {
    const rows = lapseDaily
      .filter((r) => (byMonth ? keys.has(`${r.ngay.slice(0, 7)}-01`) : keys.has(r.ngay)))
      .filter((r) => cat === 'all' || r.category === cat)
    const map = new Map<string, { khoang: string; thu_tu: number; so_luong: number }>()
    for (const r of rows) {
      const c = map.get(r.khoang) ?? { khoang: r.khoang, thu_tu: r.thu_tu, so_luong: 0 }
      c.so_luong += Number(r.so_luong || 0)
      map.set(r.khoang, c)
    }
    const out = Array.from(map.values()).sort((a, b) => a.thu_tu - b.thu_tu)
    const tot = out.reduce((s, r) => s + r.so_luong, 0)
    return out.map((r) => ({ ...r, pct: p1(r.so_luong, tot) }))
  }, [lapseDaily, keys, byMonth, cat])

  /* ---- shipping, filtered ---- */

  const shipShown = useMemo(
    () => shipDaily.filter((r) => (byMonth ? keys.has(`${r.ngay.slice(0, 7)}-01`) : keys.has(r.ngay))),
    [shipDaily, keys, byMonth],
  )
  const shipSum = (f: keyof Ship) => shipShown.reduce((a, r) => a + Number(r[f] || 0), 0)

  const shipByMonth = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const r of shipDaily) {
      const k = `${r.ngay.slice(0, 7)}-01`
      const c = map.get(k) ?? [0, 0]
      c[0] += Number(r.shop_tro_gia_ship || 0)
      c[1] += Number(r.ship_dot_cho_don_huy || 0)
      map.set(k, c)
    }
    return map
  }, [shipDaily])

  /* ---- MoM Summary tab: always monthly, ignores the day filters ---- */

  const momRows = useMemo(
    () => rollup(monthly.filter((r) => goodMonths.includes(r.thang)), cat),
    [monthly, goodMonths, cat],
  )
  const momSeg = useMemo(
    () => segMonthly
      .filter((r) => goodMonths.includes(r.thang))
      .filter((r) => cat === 'all' || r.category === cat),
    [segMonthly, goodMonths, cat],
  )
  const momSkus = useMemo(
    () => skuMonthly
      .filter((r) => goodMonths.includes(r.ky))
      .filter((r) => cat === 'all' || r.category === cat),
    [skuMonthly, goodMonths, cat],
  )

  /** band × month grid of whatever metric. */
  const segGrid = useMemo(() => {
    const bands = BANDS.filter((b) => momSeg.some((r) => r.price_band === b))
    const cell = new Map<string, Segment[]>()
    for (const r of momSeg) {
      const k = `${r.price_band}|${r.thang}`
      cell.set(k, [...(cell.get(k) ?? []), r])
    }
    const sum = (rows: Segment[] | undefined, f: keyof Segment) =>
      (rows ?? []).reduce((a, r) => a + Number(r[f] || 0), 0)
    return { bands, cell, sum }
  }, [momSeg])

  /** model × month grid. */
  const skuGrid = useMemo(() => {
    const cell = new Map<string, SkuPeriod[]>()
    const totals = new Map<string, number>()
    const bandByModel = new Map<string, string>()
    const qtyByModel = new Map<string, { q: number; price: number }>()
    for (const r of momSkus) {
      const k = `${r.model}|${r.ky}`
      cell.set(k, [...(cell.get(k) ?? []), r])
      totals.set(r.model, (totals.get(r.model) ?? 0) + Number(r.sl_chua_huy || 0))
      const acc = qtyByModel.get(r.model) ?? { q: 0, price: 0 }
      acc.q += Number(r.so_luong || 0)
      acc.price += Number(r.gia_goc_tong || 0)
      qtyByModel.set(r.model, acc)
    }
    for (const [m, a] of qtyByModel) bandByModel.set(m, bandOf(a.price / Math.max(1, a.q)))
    const models = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map((e) => e[0])
    return { cell, models, bandByModel }
  }, [momSkus])

  const lbl = byMonth ? mmyy : ddmm
  const periodWord = byMonth ? 'month' : 'day'
  const dod = byMonth ? 'MoM' : 'DoD'
  const scopeLabel = modelSel || (cat === 'all' ? 'all products' : cat)
  const monthNote = selMonths.size
    ? goodMonths.map(mmyy).join(', ')
    : 'all months'
  /** Tab Discounts luôn theo ngày nên có ghi chú kỳ riêng. */
  const dayNote = range === 'd30' ? 'last 30 days'
    : range === 'd7' ? 'last 7 days'
      : `days in ${selMonths.size ? monthNote : mmyy(allMonths[allMonths.length - 1] ?? '')}`
  const periodNote = range === 'mom' ? monthNote
    : range === 'd30' ? 'last 30 days'
      : range === 'd7' ? 'last 7 days'
        : `days in ${selMonths.size ? monthNote : mmyy(allMonths[allMonths.length - 1] ?? '')}`

  const pt = (pick: (r: Rolled) => number): Pt[] => shown.map((r) => ({ ky: r.ky, v: pick(r) }))
  const cancelLine = (rows: { ky: string; cancel_rate: number }[]) => ({
    ten: 'Cancellation rate (right axis)', color: 'var(--bad)', truc: 'pct' as const,
    vals: rows.map((r) => r.cancel_rate), showVals: true, fmtVal: (v: number) => `${v}%`,
  })

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <main className="wrap">
        <header>
          <p className="eyebrow">Roborock Official VN · TikTok Shop</p>
          <h1>Business performance</h1>
          <p className="lede">
            Robots and handhelds only — gifts and accessories excluded. Periods are keyed on order
            creation date in Vietnam time. Price bands come from list price.
          </p>
          <div className="defs">
            <div className="def">
              <b>Seller GMV</b> = list price − seller discount, every order status.
              Platform vouchers are <i>not</i> deducted, because TikTok reimburses them.
            </div>
            <div className="def">
              <b>Seller NMV</b> = same formula, cancelled orders dropped. This is what the shop
              recognises. So <b>Seller GMV = Seller NMV + value lost to cancellations</b>.
            </div>
            <div className="def indent">
              <b>Customer-funded NMV</b> = the cash the buyer actually transferred.
            </div>
            <div className="def indent">
              <b>Platform-funded NMV</b> = the voucher TikTok reimbursed on those same live orders,
              also called <i>valid subsidy</i>. Together: <b>Customer-funded + Platform-funded = Seller NMV</b>.
            </div>
            <div className="def warn-def">
              Careful: TikTok Seller Centre calls the <i>customer-funded</i> figure &ldquo;GMV&rdquo;.
              Its GMV and this Seller GMV differ by exactly the platform voucher — quote the full
              name when you share these numbers. Full definitions are in the <b>Glossary</b> tab.
            </div>
          </div>
        </header>

        <div className="filters">
          <div className="seg">
            {RANGES.map((r) => (
              <button key={r.key} className={range === r.key ? 'on' : ''} onClick={() => setRange(r.key)}>
                {r.label}
              </button>
            ))}
          </div>

          <div className="seg">
            {CATS.map((c) => (
              <button key={c.key} className={cat === c.key ? 'on' : ''}
                onClick={() => { setCat(c.key); setModelSel('') }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="chips">
          <span className="chips-l">Months</span>
          {allMonths.map((m) => (
            <button key={m} className={`chip ${selMonths.has(m) ? 'on' : ''}`} onClick={() => toggleMonth(m)}>
              {mmyy(m)}
            </button>
          ))}
          {selMonths.size > 0
            ? <button className="lnk" onClick={() => setSelMonths(new Set())}>Clear — show all months</button>
            : <span className="muted" style={{ fontSize: 12.5 }}>none picked = all months</span>}
        </div>

        <p className="foot">
          {tab === 'MoM Summary'
            ? `Always monthly — the day ranges do not apply here. Showing ${monthNote}.`
            : tab === 'Discounts'
              ? `Always day-level — this is the DoD tab. Showing ${dayNote}. The single monthly table at the bottom follows the month chips instead.`
              : tab === 'Glossary'
                ? 'Reference only — the filters above do not apply to this tab.'
                : `Showing: ${periodNote}. Every chart and table on this tab follows this filter.`}
        </p>

        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>

        {/* =================== MoM SUMMARY =================== */}
        {tab === 'MoM Summary' && (
          <>
            <section>
              <h2>The month-over-month picture</h2>
              <p className="sub">
                Column height is Seller GMV: solid is Seller NMV, pale is what cancellations took away.
                The red line is the cancellation rate with its own 0–100% axis on the right,
                printed on the line so you do not have to hover for it.
              </p>
              <ComboChart
                data={momRows.map((r) => ({ ky: r.ky, a: r.nmv, b: r.gmv_mat_do_huy }))}
                names={['Seller NMV (live orders)', 'Lost to cancellations']}
                colors={['var(--c1)', 'var(--c1-soft)']}
                lines={[cancelLine(momRows)]}
                fmt={bn} label={mmyy} unit="VND bn"
                tip={(d) => {
                  const r = momRows.find((x) => x.ky === d.ky)!
                  return (
                    <><b>{mmyy(d.ky)}</b><br />
                      Seller GMV {bn(r.gmv)} bn · Seller NMV {bn(r.nmv)} bn<br />
                      Gross {n0(r.so_luong)} pcs · Net {n0(r.sl_chua_huy)} pcs<br />
                      Cancellation rate {r.cancel_rate}%</>
                  )
                }}
              />
            </section>

            <section>
              <h2>Headline numbers by month</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Month</th>
                    <th className="n">Seller GMV</th><th className="n">±</th>
                    <th className="n">Seller NMV</th><th className="n">±</th>
                    <th className="n">Gross pcs</th><th className="n">±</th>
                    <th className="n">Net pcs</th><th className="n">±</th>
                    <th className="n">Cancel %</th>
                    <th className="n">Lost to cancels</th>
                  </tr></thead>
                  <tbody>
                    {momRows.map((r, i) => {
                      const p = momRows[i - 1]
                      return (
                        <tr key={r.ky}>
                          <td className="k">{mmyy(r.ky)}</td>
                          <td className="n">{bn(r.gmv)}</td>
                          <td className="n"><Dd a={r.gmv} b={p?.gmv} /></td>
                          <td className="n"><b>{bn(r.nmv)}</b></td>
                          <td className="n"><Dd a={r.nmv} b={p?.nmv} /></td>
                          <td className="n">{n0(r.so_luong)}</td>
                          <td className="n"><Dd a={r.so_luong} b={p?.so_luong} /></td>
                          <td className="n"><b>{n0(r.sl_chua_huy)}</b></td>
                          <td className="n"><Dd a={r.sl_chua_huy} b={p?.sl_chua_huy} /></td>
                          <td className="n" style={{ color: r.cancel_rate > 40 ? 'var(--bad)' : 'inherit' }}>
                            {pct(r.cancel_rate)}
                          </td>
                          <td className="n" style={{ color: 'var(--bad)' }}>{bn(r.gmv_mat_do_huy)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="foot">Money in VND bn.</p>
            </section>

            <section>
              <h2>Net quantity by price band</h2>
              <p className="sub">Stacked columns — where the volume actually sits each month.</p>
              <MultiStack
                data={goodMonths.map((m) => ({
                  ky: m,
                  parts: segGrid.bands.map((b) => segGrid.sum(segGrid.cell.get(`${b}|${m}`), 'sl_chua_huy')),
                }))}
                series={segGrid.bands.map((b) => ({ ten: b, color: BAND_COLOR[b] }))}
                fmt={n0} label={mmyy} unit="net pcs"
                tip={(d) => (
                  <><b>{mmyy(d.ky)}</b><br />
                    {segGrid.bands.map((b, j) => (d.parts[j] > 0
                      ? <span key={b}>{b}: {n0(d.parts[j])} net pcs<br /></span> : null))}</>
                )}
              />
            </section>

            <section>
              <h2>Cancellation rate by price band</h2>
              <p className="sub">
                Darker means worse. Read down a column to see which band is dragging the month,
                across a row to see whether a band is getting better or worse.
              </p>
              <Matrix
                corner="Price band"
                cols={goodMonths.map(mmyy)}
                rows={segGrid.bands.map((b) => ({
                  label: b, color: BAND_COLOR[b],
                  vals: goodMonths.map((m) => {
                    const rows = segGrid.cell.get(`${b}|${m}`)
                    const g = segGrid.sum(rows, 'so_luong')
                    return g ? p1(segGrid.sum(rows, 'sl_huy'), g) : null
                  }),
                }))}
                fmt={(v) => `${v}%`} heat="high-bad"
              />
              <div className="tablewrap" style={{ marginTop: 18 }}>
                <table>
                  <thead><tr>
                    <th>Price band</th><th className="n">Gross pcs</th><th className="n">Net pcs</th>
                    <th className="n">Cancel %</th><th className="n">Seller NMV</th>
                    <th className="n">Seller disc. %</th><th className="n">Platform disc. %</th>
                  </tr></thead>
                  <tbody>
                    {segGrid.bands.map((b) => {
                      const rows = momSeg.filter((r) => r.price_band === b)
                      const s = (f: keyof Segment) => rows.reduce((a, r) => a + Number(r[f] || 0), 0)
                      const g = s('so_luong')
                      return (
                        <tr key={b}>
                          <td><span className="sw sm" style={{ background: BAND_COLOR[b] }} />{b}</td>
                          <td className="n">{n0(g)}</td>
                          <td className="n"><b>{n0(s('sl_chua_huy'))}</b></td>
                          <td className="n" style={{ color: p1(s('sl_huy'), g) > 70 ? 'var(--bad)' : 'inherit' }}>
                            {pct(p1(s('sl_huy'), g))}
                          </td>
                          <td className="n">{bn(s('nmv'))}</td>
                          <td className="n">{pct(p1(s('seller_disc'), s('gia_goc')))}</td>
                          <td className="n muted">{pct(p1(s('platform_disc'), s('gia_goc')))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2>Model performance by month</h2>
              <p className="sub">
                One row per model, one column per month. Switch the metric to compare volume or
                cancellation behaviour. The band next to each model name is its list-price band.
              </p>
              <div className="seg" style={{ marginTop: 14 }}>
                {([['net', 'Net pcs'], ['gross', 'Gross pcs'], ['cancel', 'Cancel %']] as const).map(([k, l]) => (
                  <button key={k} className={momMetric === k ? 'on' : ''} onClick={() => setMomMetric(k)}>{l}</button>
                ))}
              </div>
              <Matrix
                corner="Model"
                cols={goodMonths.map(mmyy)}
                heat={momMetric === 'cancel' ? 'high-bad' : undefined}
                fmt={momMetric === 'cancel' ? (v) => `${v}%` : n0}
                rows={skuGrid.models.map((m) => ({
                  label: m,
                  sub: skuGrid.bandByModel.get(m),
                  color: BAND_COLOR[skuGrid.bandByModel.get(m) ?? '<5M'],
                  vals: goodMonths.map((mo) => {
                    const rows = skuGrid.cell.get(`${m}|${mo}`)
                    if (!rows?.length) return null
                    const s = (f: keyof SkuPeriod) => rows.reduce((a, r) => a + Number(r[f] || 0), 0)
                    if (momMetric === 'net') return s('sl_chua_huy')
                    if (momMetric === 'gross') return s('so_luong')
                    return p1(s('sl_huy'), s('so_luong'))
                  }),
                }))}
              />
            </section>

            <section>
              <h2>Who funds the discount, month by month</h2>
              <p className="sub">
                Stacked spend: blue is money you gave up, orange is money TikTok gave up.
                Only the blue part hits your margin.
              </p>
              <StackChart
                data={momRows.map((r) => ({ ky: r.ky, a: r.seller_disc, b: r.platform_disc }))}
                fmt={bn} label={mmyy} names={['Seller funded', 'Platform funded']}
                colors={['var(--c1)', 'var(--c2)']} unit="VND bn"
                tip={(d) => (
                  <><b>{mmyy(d.ky)}</b><br />Seller {bn(d.a)} bn · Platform {bn(d.b)} bn<br />
                    Seller carries {p1(d.a, d.a + d.b)}% of all discounting</>
                )}
              />
            </section>

            <section>
              <h2>What Seller NMV is actually made of</h2>
              <p className="sub">
                Column height is Seller NMV, split into the cash the customer actually paid and the
                subsidy TikTok funded on the same live orders. The two add up to Seller NMV exactly
                — the subsidy already sits inside Seller NMV, it is not added on top. The line is
                the subsidy share: how much of your recognised revenue is TikTok&rsquo;s money
                rather than the customer&rsquo;s.
              </p>
              <ComboChart
                data={momRows.map((r) => ({ ky: r.ky, a: r.khach_tra, b: r.platform_disc_chua_huy }))}
                names={['Customer-funded NMV', 'Platform-funded NMV']}
                colors={['var(--c1)', 'var(--c2)']}
                lines={[{
                  ten: 'Valid subsidy % of Seller NMV', color: 'var(--ok)', truc: 'pct',
                  showVals: true, fmtVal: (v) => `${v}%`,
                  vals: momRows.map((r) => p1(r.platform_disc_chua_huy, r.nmv)),
                }]}
                fmt={bn} label={mmyy} unit="VND bn"
                tip={(d) => (
                  <><b>{mmyy(d.ky)}</b><br />
                    Seller NMV {bn(d.a + d.b)} bn<br />
                    · customer-funded {bn(d.a)} bn (cash from buyer)<br />
                    · valid subsidy {bn(d.b)} bn<br />
                    Subsidy share {p1(d.b, d.a + d.b)}%</>
                )}
              />
            </section>

            <section>
              <h2>Subsidy booked vs subsidy kept, by month</h2>
              <p className="sub">
                The whole column is what TikTok put behind your orders. Solid is what survived to
                a live order; pale is what cancelled away. The green line is the share of Seller GMV
                TikTok is funding — your effective subsidy rate.
              </p>
              <ComboChart
                data={momRows.map((r) => ({
                  ky: r.ky,
                  a: r.platform_disc_chua_huy,
                  b: Math.max(0, r.platform_disc - r.platform_disc_chua_huy),
                }))}
                names={['Valid subsidy', 'Lost with cancellations']}
                colors={['var(--c2)', 'var(--c1-soft)']}
                lines={[{
                  ten: 'Subsidy % of Seller GMV', color: 'var(--ok)', truc: 'pct',
                  showVals: true, fmtVal: (v) => `${v}%`,
                  vals: momRows.map((r) => p1(r.platform_disc, r.gmv)),
                }]}
                fmt={bn} label={mmyy} unit="VND bn"
                tip={(d) => {
                  const r = momRows.find((x) => x.ky === d.ky)!
                  return (
                    <><b>{mmyy(d.ky)}</b><br />
                      Booked {bn(r.platform_disc)} bn · {p1(r.platform_disc, r.gmv)}% of Seller GMV<br />
                      Valid {bn(d.a)} bn · {p1(d.a, r.nmv)}% of Seller NMV<br />
                      Lost {bn(d.b)} bn<br />
                      Capture rate {p1(d.a, r.platform_disc)}%</>
                  )
                }}
              />
              <div className="tablewrap" style={{ marginTop: 18 }}>
                <table>
                  <thead><tr>
                    <th>Month</th>
                    <th className="n">Seller GMV</th><th className="n">Subsidy booked</th><th className="n">% of Seller GMV</th>
                    <th className="n">Seller NMV</th><th className="n">Valid subsidy</th><th className="n">% of Seller NMV</th>
                    <th className="n">Lost subsidy</th><th className="n">Capture rate</th>
                    <th className="n">Seller funded</th><th className="n">Seller % of list</th>
                  </tr></thead>
                  <tbody>
                    {momRows.map((r) => {
                      const capture = p1(r.platform_disc_chua_huy, r.platform_disc)
                      return (
                        <tr key={r.ky}>
                          <td className="k">{mmyy(r.ky)}</td>
                          <td className="n">{bn(r.gmv)}</td>
                          <td className="n">{bn(r.platform_disc)}</td>
                          <td className="n">{pct(p1(r.platform_disc, r.gmv))}</td>
                          <td className="n">{bn(r.nmv)}</td>
                          <td className="n"><b>{bn(r.platform_disc_chua_huy)}</b></td>
                          <td className="n"><b>{pct(p1(r.platform_disc_chua_huy, r.nmv))}</b></td>
                          <td className="n" style={{ color: 'var(--bad)' }}>
                            {bn(r.platform_disc - r.platform_disc_chua_huy)}
                          </td>
                          <td className="n" style={{ color: capture < 40 ? 'var(--bad)' : 'inherit' }}>
                            {pct(capture)}
                          </td>
                          <td className="n muted">{bn(r.seller_disc_chua_huy)}</td>
                          <td className="n muted">{pct(p1(r.seller_disc_chua_huy, r.gia_goc_chua_huy))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="foot">Money in VND bn.</p>
            </section>

            <section>
              <h2>Valid subsidy as a share of Seller NMV, by price band</h2>
              <p className="sub">
                Greener means TikTok is carrying more of that band&rsquo;s revenue. A band warming
                up month after month is where the platform is moving its voucher money.
              </p>
              <Matrix
                corner="Price band"
                cols={goodMonths.map(mmyy)}
                heat="high-good"
                fmt={(v) => `${v}%`}
                rows={segGrid.bands.map((b) => ({
                  label: b, color: BAND_COLOR[b],
                  vals: goodMonths.map((m) => {
                    const rows = segGrid.cell.get(`${b}|${m}`)
                    const base = segGrid.sum(rows, 'nmv')
                    return base ? p1(segGrid.sum(rows, 'platform_disc_chua_huy'), base) : null
                  }),
                }))}
              />
              <h3 style={{ marginTop: 26 }}>Capture rate by price band</h3>
              <p className="sub">
                How much of the booked subsidy each band actually kept. A low cell means TikTok
                spent there and the orders died anyway.
              </p>
              <Matrix
                corner="Price band"
                cols={goodMonths.map(mmyy)}
                heat="high-good"
                fmt={(v) => `${v}%`}
                rows={segGrid.bands.map((b) => ({
                  label: b, color: BAND_COLOR[b],
                  vals: goodMonths.map((m) => {
                    const rows = segGrid.cell.get(`${b}|${m}`)
                    const base = segGrid.sum(rows, 'platform_disc')
                    return base ? p1(segGrid.sum(rows, 'platform_disc_chua_huy'), base) : null
                  }),
                }))}
              />
            </section>

            <section>
              <h2>Where the platform is putting its voucher money</h2>
              <p className="sub">
                Platform discount as a percentage of list price, by band and month. If TikTok
                shifts funding from one band to another — say from 5–10M up to 10–15M — it shows
                up here as one row cooling while another heats up.
              </p>
              <Matrix
                corner="Price band"
                cols={goodMonths.map(mmyy)}
                heat="high-good"
                fmt={(v) => `${v}%`}
                rows={segGrid.bands.map((b) => ({
                  label: b, color: BAND_COLOR[b],
                  vals: goodMonths.map((m) => {
                    const rows = segGrid.cell.get(`${b}|${m}`)
                    const base = segGrid.sum(rows, 'gia_goc')
                    return base ? p1(segGrid.sum(rows, 'platform_disc'), base) : null
                  }),
                }))}
              />
              <h3 style={{ marginTop: 26 }}>Seller-funded discount, same view</h3>
              <Matrix
                corner="Price band"
                cols={goodMonths.map(mmyy)}
                heat="high-bad"
                fmt={(v) => `${v}%`}
                rows={segGrid.bands.map((b) => ({
                  label: b, color: BAND_COLOR[b],
                  vals: goodMonths.map((m) => {
                    const rows = segGrid.cell.get(`${b}|${m}`)
                    const base = segGrid.sum(rows, 'gia_goc')
                    return base ? p1(segGrid.sum(rows, 'seller_disc'), base) : null
                  }),
                }))}
              />
              <p className="foot">
                Both grids share the same denominator — list price — so a cell in one is directly
                comparable with the same cell in the other.
              </p>
            </section>
          </>
        )}

        {/* =================== OVERVIEW =================== */}
        {tab === 'Overview' && (
          <>
            <section className="tiles">
              <Tile label="Seller NMV" value={bn(cur?.nmv ?? 0)} unit=" bn"
                sub={deltaText(delta(cur?.nmv, prev?.nmv), periodWord)} />
              <Tile label="Net quantity" value={n0(cur?.sl_chua_huy ?? 0)} unit=" pcs"
                sub={deltaText(delta(cur?.sl_chua_huy, prev?.sl_chua_huy), periodWord)} />
              <Tile label="Seller GMV" value={bn(cur?.gmv ?? 0)} unit=" bn"
                sub={deltaText(delta(cur?.gmv, prev?.gmv), periodWord)} />
              <Tile label="Cancellation rate" value={pct(cur?.cancel_rate ?? 0)}
                tone={(cur?.cancel_rate ?? 0) > 40 ? 'bad' : 'ok'}
                sub={`${n0(cur?.sl_huy ?? 0)} pcs cancelled`} />
            </section>

            <section>
              <h2>Seller GMV, Seller NMV and cancellation rate in one picture</h2>
              <p className="sub">
                Full column height is Seller GMV. The solid part is Seller NMV — what is still alive. The pale
                part is value lost to cancellations. The green line is the share of Seller NMV that has
                actually completed. The red line is the cancellation rate on the right axis.
              </p>
              <ComboChart
                data={shown.map((r) => ({ ky: r.ky, a: r.nmv, b: r.gmv_mat_do_huy }))}
                names={['Seller NMV (live orders)', 'Lost to cancellations']}
                colors={['var(--c1)', 'var(--c1-soft)']}
                lines={[
                  { ten: 'Seller NMV completed', color: 'var(--ok)', truc: 'tien', vals: shown.map((r) => r.nmv_hoan_tat) },
                  cancelLine(shown),
                ]}
                fmt={bn} label={lbl} unit="VND bn"
                tip={(d) => {
                  const r = shown.find((x) => x.ky === d.ky)!
                  return (
                    <><b>{lbl(d.ky)}</b><br />
                      Seller GMV {bn(r.gmv)} bn<br />
                      · Seller NMV {bn(r.nmv)} bn<br />
                      · lost to cancels {bn(r.gmv_mat_do_huy)} bn<br />
                      Seller NMV completed {bn(r.nmv_hoan_tat)} bn<br />
                      Customer-funded {bn(r.khach_tra)} bn<br />
                      Cancellation rate {r.cancel_rate}%</>
                  )
                }}
              />
            </section>

            <section>
              <h2>Seller NMV per {periodWord} · {dod}</h2>
              <p className="sub">Cancelled orders already removed.</p>
              <DeltaChart
                data={pt((r) => r.nmv)} color="var(--c1)" fmt={bn} label={lbl} unit="VND bn"
                tip={(d, dl) => (
                  <><b>{lbl(d.ky)}</b><br />Seller NMV {n0(d.v)} VND
                    {dl != null && <><br />{dl >= 0 ? '▲' : '▼'} {Math.abs(dl)}% vs previous period</>}</>
                )}
              />
            </section>

            <section>
              <h2>Net quantity per {periodWord} · {dod}</h2>
              <p className="sub">Units that have not been cancelled.</p>
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
              <p className="sub">Stacked net quantity.</p>
              <StackChart
                data={splitByCat(srcShown, (r) => r.sl_chua_huy)}
                fmt={n0} label={lbl} names={['Robot', 'Handheld']}
                colors={['var(--c1)', 'var(--c2)']} unit="net pcs"
                tip={(d) => (
                  <><b>{lbl(d.ky)}</b><br />Robot {n0(d.a)} · Handheld {n0(d.b)}
                    <br />Total {n0(d.a + d.b)} pcs · Robot share {p1(d.a, d.a + d.b)}%</>
                )}
              />
            </section>

            <section>
              <h2>Detail by {periodWord}</h2>
              <SeriesTable rows={shown} lbl={lbl} />
            </section>

            <div className="note warn">
              <b>The newest period still understates cancellations.</b> Orders placed in the current
              period have not finished their life cycle, and the largest cancellation cluster lands
              3–7 days after the order. Expect the cancellation rate to climb and Seller NMV to drift down
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
                const s = (f: (r: Monthly | Daily) => number) =>
                  rows.reduce((a, r) => a + Number(f(r) || 0), 0)
                const gross = s((r) => r.so_luong)
                const gmv = s((r) => r.gmv)
                const cancelled = s((r) => r.sl_huy)
                return (
                  <div className="card" key={c}>
                    <div className="card-h">
                      <i className="sw" style={{ background: i === 0 ? 'var(--c1)' : 'var(--c2)' }} />
                      <b>{c === 'robot' ? 'Robot vacuums' : 'Handheld vacuums'}</b>
                    </div>
                    <div className="kv"><span>Seller NMV</span><b>{bn(s((r) => r.nmv))} bn</b></div>
                    <div className="kv"><span>Seller GMV</span><b>{bn(gmv)} bn</b></div>
                    <div className="kv"><span>Net quantity</span><b>{n0(s((r) => r.sl_chua_huy))} pcs</b></div>
                    <div className="kv"><span>Gross quantity</span><b>{n0(gross)} pcs</b></div>
                    <div className="kv"><span>Cancellation rate</span>
                      <b style={{ color: p1(cancelled, gross) > 40 ? 'var(--bad)' : 'inherit' }}>
                        {pct(p1(cancelled, gross))}
                      </b></div>
                    <div className="kv"><span>Avg price after seller disc.</span>
                      <b>{n0(gmv / Math.max(1, gross))}</b></div>
                  </div>
                )
              })}
            </section>

            <section>
              <h2>Seller NMV by category per {periodWord}</h2>
              <StackChart
                data={splitByCat(srcShown, (r) => r.nmv)}
                fmt={bn} label={lbl} names={['Robot', 'Handheld']}
                colors={['var(--c1)', 'var(--c2)']} unit="VND bn"
                tip={(d) => (
                  <><b>{lbl(d.ky)}</b><br />Robot {bn(d.a)} bn · Handheld {bn(d.b)} bn
                    <br />Robot share {p1(d.a, d.a + d.b)}%</>
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
              <h2>Category detail by {periodWord}</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Period</th><th>Category</th>
                    <th className="n">Gross pcs</th><th className="n">Net pcs</th><th className="n">Cancelled</th>
                    <th className="n">Cancel %</th><th className="n">Seller GMV</th><th className="n">Seller NMV</th>
                    <th className="n">Avg price</th>
                  </tr></thead>
                  <tbody>
                    {srcShown
                      .filter((r) => r.category === 'robot' || r.category === 'handheld')
                      .slice()
                      .sort((a, b) => keyOf(b).localeCompare(keyOf(a)) || a.category.localeCompare(b.category))
                      .slice(0, 80)
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
              <p className="foot">Money in VND bn, average price in VND. Latest 80 rows.</p>
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
                Column height is gross units, the solid part is net. The red line is the
                cancellation rate on the right axis, with the number printed on it.
              </p>
              <ComboChart
                data={skuTrend.map((d) => ({ ky: d.ky, a: d.net, b: Math.max(0, d.gross - d.net) }))}
                names={['Net pcs', 'Cancelled pcs']}
                colors={['var(--c1)', 'var(--c1-soft)']}
                lines={[{
                  ten: 'Cancellation rate (right axis)', color: 'var(--bad)', truc: 'pct',
                  showVals: true, fmtVal: (v) => `${v}%`,
                  vals: skuTrend.map((d) => (d.gross ? p1(d.gross - d.net, d.gross) : null)),
                }]}
                fmt={n0} label={lbl} unit="pcs"
                tip={(d) => {
                  const g = d.a + d.b
                  return (
                    <><b>{lbl(d.ky)}</b><br />
                      Gross {n0(g)} pcs · Net {n0(d.a)} pcs<br />
                      Cancelled {n0(d.b)} pcs · rate {p1(d.b, g)}%</>
                  )
                }}
              />
            </section>

            <section>
              <h2>Model performance by month</h2>
              <p className="sub">
                Always monthly so the trend is readable, and it follows the category and model
                filters. Switch the metric below.
              </p>
              <div className="seg" style={{ marginTop: 14 }}>
                {([['net', 'Net pcs'], ['gross', 'Gross pcs'], ['cancel', 'Cancel %']] as const).map(([k, l]) => (
                  <button key={k} className={momMetric === k ? 'on' : ''} onClick={() => setMomMetric(k)}>{l}</button>
                ))}
              </div>
              <Matrix
                corner="Model"
                cols={goodMonths.map(mmyy)}
                heat={momMetric === 'cancel' ? 'high-bad' : undefined}
                fmt={momMetric === 'cancel' ? (v) => `${v}%` : n0}
                rows={skuGrid.models
                  .filter((m) => !modelSel || m === modelSel)
                  .map((m) => ({
                    label: m,
                    sub: skuGrid.bandByModel.get(m),
                    color: BAND_COLOR[skuGrid.bandByModel.get(m) ?? '<5M'],
                    vals: goodMonths.map((mo) => {
                      const rows = skuGrid.cell.get(`${m}|${mo}`)
                      if (!rows?.length) return null
                      const s = (f: keyof SkuPeriod) => rows.reduce((a, r) => a + Number(r[f] || 0), 0)
                      if (momMetric === 'net') return s('sl_chua_huy')
                      if (momMetric === 'gross') return s('so_luong')
                      return p1(s('sl_huy'), s('so_luong'))
                    }),
                  }))}
              />
            </section>

            {!modelSel && (
              <section>
                <h2>Model mix per {periodWord}</h2>
                <p className="sub">Top 8 models by the chosen metric, the rest folded into &ldquo;Other&rdquo;.</p>
                <div className="seg" style={{ marginTop: 14 }}>
                  {(['gmv', 'so_luong'] as const).map((k) => (
                    <button key={k} className={mixMetric === k ? 'on' : ''} onClick={() => setMixMetric(k)}>
                      {k === 'gmv' ? 'By Seller GMV' : 'By quantity'}
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
              <h2>Top models by Seller NMV — {periodNote}</h2>
              <RowBars
                rows={skuF.slice().sort((a, b) => b.nmv - a.nmv).slice(0, 15).map((s) => ({
                  nhan: s.model,
                  segs: [{ v: s.nmv, color: s.category === 'robot' ? 'var(--c1)' : 'var(--c2)', ten: 'Seller NMV' }],
                  phu: `${mn(s.nmv)}m · ${n0(s.sl_chua_huy)} net pcs`,
                }))}
              />
            </section>

            <section>
              <h2>Full table, grouped by category</h2>
              <p className="sub">
                Covers {periodNote}. The bold row is the category total — click it to collapse.
                Click a column header to re-sort. Currently sorted by <b>{String(sortKey)}</b>.
              </p>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Model</th>
                    <th>Band</th>
                    <Th k="so_luong" cur={sortKey} set={setSortKey}>Gross</Th>
                    <Th k="sl_chua_huy" cur={sortKey} set={setSortKey}>Net</Th>
                    <Th k="sl_huy" cur={sortKey} set={setSortKey}>Cancelled</Th>
                    <Th k="cancel_rate" cur={sortKey} set={setSortKey}>Cancel %</Th>
                    <Th k="gmv" cur={sortKey} set={setSortKey}>Seller GMV</Th>
                    <Th k="nmv" cur={sortKey} set={setSortKey}>Seller NMV</Th>
                    <Th k="gia_goc_tb" cur={sortKey} set={setSortKey}>List price</Th>
                    <Th k="gia_ban_tb" cur={sortKey} set={setSortKey}>After seller disc.</Th>
                    <Th k="gia_khach_tra_tb" cur={sortKey} set={setSortKey}>Customer paid</Th>
                    <Th k="pct_seller_disc" cur={sortKey} set={setSortKey}>Seller disc. %</Th>
                    <Th k="pct_platform_disc" cur={sortKey} set={setSortKey}>Platform disc. %</Th>
                    <Th k="gio_huy_tb" cur={sortKey} set={setSortKey}>Lapse (avg)</Th>
                    <th className="n">Lapse (median)</th>
                  </tr></thead>
                  <tbody>
                    {(['robot', 'handheld'] as const)
                      .filter((c) => cat === 'all' || cat === c)
                      .map((c) => {
                        const rows = skuF.filter((s) => s.category === c)
                        if (!rows.length) return null
                        const sum = (f: (s: SkuAgg) => number) => rows.reduce((a, s) => a + Number(f(s) || 0), 0)
                        const gross = sum((s) => s.so_luong)
                        const cancelled = sum((s) => s.sl_huy)
                        const open = !closed.has(c)
                        return (
                          <Fragment key={c}>
                            <tr className="grp" onClick={() => toggleClosed(c)}>
                              <td colSpan={2}>
                                <span className="car">{open ? '▾' : '▸'}</span>{' '}
                                <span className="sw sm" style={{ background: c === 'robot' ? 'var(--c1)' : 'var(--c2)' }} />
                                <b>{c === 'robot' ? 'Robot vacuums' : 'Handheld vacuums'}</b>
                                <span className="muted"> · {rows.length} models</span>
                              </td>
                              <td className="n"><b>{n0(gross)}</b></td>
                              <td className="n"><b>{n0(sum((s) => s.sl_chua_huy))}</b></td>
                              <td className="n"><b>{n0(cancelled)}</b></td>
                              <td className="n"><b>{pct(p1(cancelled, gross))}</b></td>
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
                                <td><span className="sw sm" style={{ background: BAND_COLOR[s.band] }} />{s.band}</td>
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
                                <td className="n">{s.gio_huy_tb != null ? `${s.gio_huy_tb}h` : '—'}</td>
                                <td className="n muted">
                                  {s.gio_huy_trung_vi != null ? `${Math.round(s.gio_huy_trung_vi)}h` : '—'}
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        )
                      })}
                  </tbody>
                </table>
              </div>
              <p className="foot">
                Money in VND m, prices in VND. Averages are weighted by quantity.
                {singlePeriod
                  ? ' Median lapse is shown because exactly one period is selected.'
                  : ' Median lapse is blank: medians cannot be combined across periods — pick a single month to see it.'}
              </p>
            </section>
          </>
        )}

        {/* =================== DISCOUNTS =================== */}
        {tab === 'Discounts' && (
          <>
            <div className="filters" style={{ marginTop: 26 }}>
              <select className="drop wide" value={modelSel} onChange={(e) => setModelSel(e.target.value)}>
                <option value="">All models ({allModels.length})</option>
                {allModels.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {modelSel && <button className="lnk" onClick={() => setModelSel('')}>Clear model filter</button>}
            </div>

            <section>
              <h2>Subsidy booked and capture rate per day · DoD</h2>
              <p className="sub">
                Column height is the whole platform subsidy TikTok booked that day. The
                solid part landed on orders that survived — real money. The pale part was booked
                against orders that later cancelled, so it evaporated. The green line is the
                capture rate on the right axis: it traces exactly how much of each column is solid.
              </p>
              <ComboChart
                data={dayShown.map((r) => ({
                  ky: r.ky,
                  a: r.platform_disc_chua_huy,
                  b: Math.max(0, r.platform_disc - r.platform_disc_chua_huy),
                }))}
                names={['Valid subsidy (live orders)', 'Subsidy lost with cancellations']}
                colors={['var(--c2)', 'var(--c1-soft)']}
                lines={[{
                  ten: 'Capture rate (right axis)', color: 'var(--ok)', truc: 'pct',
                  showVals: true, fmtVal: (v) => `${v}%`,
                  vals: dayShown.map((r) => p1(r.platform_disc_chua_huy, r.platform_disc)),
                }]}
                fmt={bn} label={ddmm} unit="VND bn"
                tip={(d) => {
                  const r = dayShown.find((x) => x.ky === d.ky)!
                  return (
                    <><b>{ddmm(d.ky)}</b><br />
                      Subsidy booked {bn(r.platform_disc)} bn · {p1(r.platform_disc, r.gmv)}% of Seller GMV<br />
                      · valid {bn(r.platform_disc_chua_huy)} bn · {p1(r.platform_disc_chua_huy, r.nmv)}% of Seller NMV<br />
                      · lost {bn(r.platform_disc - r.platform_disc_chua_huy)} bn<br />
                      Capture rate {p1(r.platform_disc_chua_huy, r.platform_disc)}%<br />
                      Seller GMV {bn(r.gmv)} bn · Seller NMV {bn(r.nmv)} bn</>
                  )
                }}
              />
            </section>

            <section>
              <h2>Who paid for the revenue, per day</h2>
              <p className="sub">
                Column height is Seller NMV, split into the cash the customer paid and the subsidy
                TikTok reimbursed on those same live orders. The line is the subsidy share — how
                dependent that day&rsquo;s revenue was on the platform&rsquo;s money.
              </p>
              <ComboChart
                data={dayShown.map((r) => ({ ky: r.ky, a: r.khach_tra, b: r.platform_disc_chua_huy }))}
                names={['Customer-funded NMV', 'Platform-funded NMV']}
                colors={['var(--c1)', 'var(--c2)']}
                lines={[{
                  ten: 'Valid subsidy % of Seller NMV (right axis)', color: 'var(--ok)', truc: 'pct',
                  showVals: true, fmtVal: (v) => `${v}%`,
                  vals: dayShown.map((r) => p1(r.platform_disc_chua_huy, r.nmv)),
                }]}
                fmt={bn} label={ddmm} unit="VND bn"
                tip={(d) => {
                  const r = dayShown.find((x) => x.ky === d.ky)!
                  return (
                    <><b>{ddmm(d.ky)}</b><br />
                      Seller NMV {bn(d.a + d.b)} bn<br />
                      · customer-funded {bn(d.a)} bn<br />
                      · platform-funded {bn(d.b)} bn<br />
                      Subsidy share {p1(d.b, d.a + d.b)}%<br />
                      Subsidy % of Seller GMV {p1(r.platform_disc, r.gmv)}%</>
                  )
                }}
              />
            </section>

            <section>
              <h2>Subsidy detail per day</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Period</th>
                    <th className="n">Seller GMV</th>
                    <th className="n">Subsidy booked</th>
                    <th className="n">% of Seller GMV</th>
                    <th className="n">Seller NMV</th>
                    <th className="n">Valid subsidy</th>
                    <th className="n">% of Seller NMV</th>
                    <th className="n">Lost subsidy</th>
                    <th className="n">Capture rate</th>
                    <th className="n">± capture</th>
                    <th className="n">Customer-funded</th>
                  </tr></thead>
                  <tbody>
                    {dayShown.slice().reverse().map((r, i, arr) => {
                      const capture = p1(r.platform_disc_chua_huy, r.platform_disc)
                      // arr đang xếp mới nhất trước, nên kỳ liền trước nằm ở i + 1.
                      const p = arr[i + 1]
                      const prevCapture = p ? p1(p.platform_disc_chua_huy, p.platform_disc) : undefined
                      return (
                        <tr key={r.ky}>
                          <td className="k">{ddmm(r.ky)}</td>
                          <td className="n">{bn(r.gmv)}</td>
                          <td className="n">{bn(r.platform_disc)}</td>
                          <td className="n">{pct(p1(r.platform_disc, r.gmv))}</td>
                          <td className="n">{bn(r.nmv)}</td>
                          <td className="n"><b>{bn(r.platform_disc_chua_huy)}</b></td>
                          <td className="n"><b>{pct(p1(r.platform_disc_chua_huy, r.nmv))}</b></td>
                          <td className="n" style={{ color: 'var(--bad)' }}>
                            {bn(r.platform_disc - r.platform_disc_chua_huy)}
                          </td>
                          <td className="n" style={{ color: capture < 40 ? 'var(--bad)' : 'inherit' }}>
                            {pct(capture)}
                          </td>
                          <td className="n"><Dd a={capture} b={prevCapture} /></td>
                          <td className="n muted">{bn(r.khach_tra)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="foot">
                Money in VND bn. Seller NMV = customer-funded NMV + platform-funded NMV, so those
                two columns add up to the Seller NMV column.
              </p>
            </section>

            <section>
              <h2>Valid subsidy by model, per day</h2>
              <p className="sub">
                Only the subsidy on live orders, split by model. Use the model filter above to
                isolate one and compare it against the rest.
              </p>
              <MultiStack
                data={subMix.data} series={subMix.series}
                fmt={bn} label={ddmm} unit="VND bn of valid subsidy"
                tip={(d) => (
                  <><b>{ddmm(d.ky)}</b><br />
                    {subMix.series.map((s, j) => (d.parts[j] > 0
                      ? <span key={s.ten}>{s.ten}: {bn(d.parts[j])} bn<br /></span> : null))}</>
                )}
              />
            </section>

            <section>
              <h2>Monthly overview</h2>
              <p className="sub">
                One row per month, totals only. The month-by-month breakdown by model and by price
                band lives in the <b>MoM Summary</b> tab — this tab stays day-level.
              </p>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Month</th>
                    <th className="n">Seller GMV</th>
                    <th className="n">Subsidy booked</th>
                    <th className="n">% of Seller GMV</th>
                    <th className="n">Seller NMV</th>
                    <th className="n">Valid subsidy</th>
                    <th className="n">% of Seller NMV</th>
                    <th className="n">Capture rate</th>
                    <th className="n">Seller funded</th>
                    <th className="n">Seller % of list</th>
                  </tr></thead>
                  <tbody>
                    {momRows.map((r) => {
                      const capture = p1(r.platform_disc_chua_huy, r.platform_disc)
                      return (
                        <tr key={r.ky}>
                          <td className="k">{mmyy(r.ky)}</td>
                          <td className="n">{bn(r.gmv)}</td>
                          <td className="n">{bn(r.platform_disc)}</td>
                          <td className="n">{pct(p1(r.platform_disc, r.gmv))}</td>
                          <td className="n">{bn(r.nmv)}</td>
                          <td className="n"><b>{bn(r.platform_disc_chua_huy)}</b></td>
                          <td className="n"><b>{pct(p1(r.platform_disc_chua_huy, r.nmv))}</b></td>
                          <td className="n" style={{ color: capture < 40 ? 'var(--bad)' : 'inherit' }}>
                            {pct(capture)}
                          </td>
                          <td className="n muted">{bn(r.seller_disc_chua_huy)}</td>
                          <td className="n muted">{pct(p1(r.seller_disc_chua_huy, r.gia_goc_chua_huy))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="foot">Money in VND bn. Follows the month chips, not the day range.</p>
            </section>

            <section>
              <h2>Who funds the discount — {dayNote}</h2>
              <p className="sub">
                Percentage of list price. Blue is money the shop gives up, orange is funded by
                TikTok. Only the blue part eats into your margin.
              </p>
              <RowBars
                rows={daySkuF.slice().sort((a, b) => b.nmv - a.nmv).slice(0, 15).map((s) => ({
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
              <h2>Discount spend per day</h2>
              <StackChart
                data={dayShown.map((r) => ({ ky: r.ky, a: r.seller_disc, b: r.platform_disc }))}
                fmt={bn} label={ddmm} names={['Seller funded', 'Platform funded']}
                colors={['var(--c1)', 'var(--c2)']} unit="VND bn"
                tip={(d) => (
                  <><b>{ddmm(d.ky)}</b><br />Seller {bn(d.a)} bn · Platform {bn(d.b)} bn
                    <br />Seller carries {p1(d.a, d.a + d.b)}% of all discounting</>
                )}
              />
            </section>

            <section>
              <h2>Discount rates per day</h2>
              <p className="sub">Both as a percentage of list price, so they are directly comparable.</p>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Period</th><th className="n">List price</th>
                    <th className="n">Seller disc.</th><th className="n">Seller %</th>
                    <th className="n">Platform disc.</th><th className="n">Platform %</th>
                    <th className="n">Total disc. %</th><th className="n">Seller share of disc.</th>
                  </tr></thead>
                  <tbody>
                    {dayShown.map((r) => (
                      <tr key={r.ky}>
                        <td className="k">{ddmm(r.ky)}</td>
                        <td className="n">{bn(r.gia_goc)}</td>
                        <td className="n">{bn(r.seller_disc)}</td>
                        <td className="n"><b>{pct(p1(r.seller_disc, r.gia_goc))}</b></td>
                        <td className="n muted">{bn(r.platform_disc)}</td>
                        <td className="n muted">{pct(p1(r.platform_disc, r.gia_goc))}</td>
                        <td className="n">{pct(p1(r.seller_disc + r.platform_disc, r.gia_goc))}</td>
                        <td className="n">{pct(p1(r.seller_disc, r.seller_disc + r.platform_disc))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="foot">Money in VND bn.</p>
            </section>

            <section>
              <h2>Discount detail by model — {dayNote}</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Model</th><th>Band</th><th className="n">List price</th><th className="n">After seller disc.</th>
                    <th className="n">Seller disc. (VND)</th><th className="n">Seller disc. %</th>
                    <th className="n">Platform disc. (VND)</th><th className="n">Platform disc. %</th>
                    <th className="n">Total disc. %</th><th className="n">Gross pcs</th>
                    <th className="n">Valid subsidy</th><th className="n">Valid % of Seller NMV</th>
                    <th className="n">Capture rate</th>
                  </tr></thead>
                  <tbody>
                    {daySkuF.slice().sort((a, b) => b.so_luong - a.so_luong).map((s) => (
                      <tr key={s.model}>
                        <td>
                          <span className="sw sm" style={{ background: s.category === 'robot' ? 'var(--c1)' : 'var(--c2)' }} />
                          {s.model}
                        </td>
                        <td className="muted">{s.band}</td>
                        <td className="n">{n0(s.gia_goc_tb)}</td>
                        <td className="n">{n0(s.gia_ban_tb)}</td>
                        <td className="n">{n0(s.seller_disc_tb)}</td>
                        <td className="n"><b>{pct(s.pct_seller_disc)}</b></td>
                        <td className="n muted">{n0(s.platform_disc_tb)}</td>
                        <td className="n muted">{pct(s.pct_platform_disc)}</td>
                        <td className="n">{pct(Math.round((s.pct_seller_disc + s.pct_platform_disc) * 10) / 10)}</td>
                        <td className="n">{n0(s.so_luong)}</td>
                        <td className="n"><b>{mn(s.valid_sub)}m</b></td>
                        <td className="n">{pct(s.pct_valid_sub)}</td>
                        <td className="n" style={{ color: s.sub_capture < 40 ? 'var(--bad)' : 'inherit' }}>
                          {pct(s.sub_capture)}
                        </td>
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
              <h2>Cancellation rate per {periodWord} · {dod}</h2>
              <p className="sub">Internal target is 40% or below.</p>
              <DeltaChart
                data={pt((r) => r.cancel_rate)} color="var(--bad)" fmt={(v) => `${v}`} label={lbl} unit="% cancelled"
                tip={(d) => {
                  const r = shown.find((x) => x.ky === d.ky)
                  return <><b>{lbl(d.ky)}</b><br />Cancelled {d.v}%<br />{n0(r?.sl_huy ?? 0)} of {n0(r?.so_luong ?? 0)} pcs</>
                }}
              />
            </section>

            <section>
              <h2>How long after ordering do orders die — {periodNote}</h2>
              <p className="sub">Two distinct clusters, and they are two different problems.</p>
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
                        run += l.pct
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
              <h2>Cancellation rate by model, month by month</h2>
              <p className="sub">Darker is worse. A row that heats up month after month is a product problem, not a seasonal one.</p>
              <Matrix
                corner="Model"
                cols={goodMonths.map(mmyy)}
                heat="high-bad"
                fmt={(v) => `${v}%`}
                rows={skuGrid.models.map((m) => ({
                  label: m,
                  sub: skuGrid.bandByModel.get(m),
                  color: BAND_COLOR[skuGrid.bandByModel.get(m) ?? '<5M'],
                  vals: goodMonths.map((mo) => {
                    const rows = skuGrid.cell.get(`${m}|${mo}`)
                    if (!rows?.length) return null
                    const s = (f: keyof SkuPeriod) => rows.reduce((a, r) => a + Number(r[f] || 0), 0)
                    return p1(s('sl_huy'), s('so_luong'))
                  }),
                }))}
              />
            </section>

            <section>
              <h2>Worst models — {periodNote}</h2>
              <p className="sub">Models with at least 30 gross units in the selected period.</p>
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
              <h2>Cancellation detail by model — {periodNote}</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Model</th><th>Band</th><th className="n">Gross pcs</th><th className="n">Cancelled</th>
                    <th className="n">Cancel %</th><th className="n">Lapse (avg)</th><th className="n">Lapse (median)</th>
                    <th className="n">Value lost</th>
                  </tr></thead>
                  <tbody>
                    {skuF.slice().sort((a, b) => b.sl_huy - a.sl_huy).map((s) => (
                      <tr key={s.model}>
                        <td>
                          <span className="sw sm" style={{ background: s.category === 'robot' ? 'var(--c1)' : 'var(--c2)' }} />
                          {s.model}
                        </td>
                        <td className="muted">{s.band}</td>
                        <td className="n">{n0(s.so_luong)}</td>
                        <td className="n">{n0(s.sl_huy)}</td>
                        <td className="n" style={{ color: s.cancel_rate > 70 ? 'var(--bad)' : 'inherit' }}>{pct(s.cancel_rate)}</td>
                        <td className="n">{s.gio_huy_tb != null ? `${s.gio_huy_tb}h` : '—'}</td>
                        <td className="n muted">{s.gio_huy_trung_vi != null ? `${Math.round(s.gio_huy_trung_vi)}h` : '—'}</td>
                        <td className="n" style={{ color: 'var(--bad)' }}>{mn(s.gmv - s.nmv)}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="foot">Value lost = Seller GMV minus Seller NMV — the money that walked out with the cancelled orders.</p>
            </section>
          </>
        )}

        {/* =================== P&L =================== */}
        {tab === 'P&L' && (
          <>
            <section>
              <h2>From list price to cash — {periodNote}</h2>
              <p className="sub">
                Cancelled orders excluded. This is a draft — COGS, platform fees, affiliate
                commission and ad spend are still missing.
              </p>
              {(() => {
                const t = shown.reduce((a, r) => ({
                  gia_goc: a.gia_goc + r.gia_goc_chua_huy,
                  seller: a.seller + r.seller_disc_chua_huy,
                  platform: a.platform + r.platform_disc_chua_huy,
                  nmv: a.nmv + r.nmv,
                  khach_tra: a.khach_tra + r.khach_tra,
                  mat: a.mat + r.gmv_mat_do_huy,
                }), { gia_goc: 0, seller: 0, platform: 0, nmv: 0, khach_tra: 0, mat: 0 })
                const shipTot = shipSum('shop_tro_gia_ship')
                const steps = [
                  { nhan: 'List price', v: t.gia_goc, kieu: 'base' },
                  { nhan: 'Seller discount', v: -t.seller, kieu: 'tru' },
                  { nhan: 'Seller NMV — recognised by shop', v: t.nmv, kieu: 'moc' },
                  { nhan: 'Platform discount (TikTok funded)', v: -t.platform, kieu: 'ghi' },
                  { nhan: 'Customer-funded NMV', v: t.khach_tra, kieu: 'moc' },
                  { nhan: 'Seller-funded shipping subsidy', v: -shipTot, kieu: 'tru' },
                  { nhan: 'Still missing: COGS · platform fees · commission · ads', v: 0, kieu: 'thieu' },
                ]
                const maxV = Math.max(1, ...steps.map((s) => Math.abs(s.v)))
                return (
                  <>
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
                    <div className="note hot">
                      <b>The most expensive number is not in the table above.</b> Value lost to
                      cancellations in this period is <b>{bn(t.mat)} bn</b>, and the shipping subsidy
                      burned on cancelled orders is{' '}
                      <b>{n0(shipSum('ship_dot_cho_don_huy'))} VND</b> — spent, with nothing coming back.
                    </div>
                  </>
                )
              })()}
            </section>

            <section>
              <h2>Seller NMV and what erodes it, by month</h2>
              <p className="sub">
                Green is Seller NMV recognised, red is the discount the shop funded itself. Together they
                equal the list price of non-cancelled orders. Always monthly.
              </p>
              <StackChart
                data={rollup(monthly.filter((r) => goodMonths.includes(r.thang)), cat)
                  .map((r) => ({ ky: r.ky, a: r.nmv, b: r.seller_disc_chua_huy }))}
                fmt={bn} label={mmyy} names={['Seller NMV', 'Seller discount']}
                colors={['var(--ok)', 'var(--bad)']} unit="VND bn"
                tip={(d) => (
                  <><b>{mmyy(d.ky)}</b><br />Seller NMV {bn(d.a)} bn · Seller discount {bn(d.b)} bn
                    <br />Seller gave up {p1(d.b, d.a + d.b)}% of list price</>
                )}
              />
            </section>

            <section>
              <h2>P&amp;L by month</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Month</th><th className="n">List price</th><th className="n">Seller disc.</th>
                    <th className="n">Platform disc.</th><th className="n">Seller NMV</th><th className="n">Customer-funded</th>
                    <th className="n">Lost to cancels</th><th className="n">Shipping subsidy</th>
                    <th className="n">Shipping burned on cancels</th>
                  </tr></thead>
                  <tbody>
                    {momRows.map((r) => {
                      const s = shipByMonth.get(r.ky) ?? [0, 0]
                      return (
                        <tr key={r.ky}>
                          <td className="k">{mmyy(r.ky)}</td>
                          <td className="n">{bn(r.gia_goc_chua_huy)}</td>
                          <td className="n" style={{ color: 'var(--bad)' }}>−{bn(r.seller_disc_chua_huy)}</td>
                          <td className="n muted">−{bn(r.platform_disc_chua_huy)}</td>
                          <td className="n"><b>{bn(r.nmv)}</b></td>
                          <td className="n">{bn(r.khach_tra)}</td>
                          <td className="n" style={{ color: 'var(--bad)' }}>{bn(r.gmv_mat_do_huy)}</td>
                          <td className="n">{bn(s[0])}</td>
                          <td className="n" style={{ color: 'var(--bad)' }}>{bn(s[1])}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="foot">Money in VND bn. Shipping figures cover all orders, not just robots and handhelds.</p>
            </section>
          </>
        )}

        {/* =================== GLOSSARY =================== */}
        {tab === 'Glossary' && (
          <>
            <section>
              <h2>What every term on this dashboard means</h2>
              <p className="sub">
                When a number here disagrees with a number somewhere else, the cause is almost
                always a definition rather than an error. This is the reference to settle it.
                The filters above do not apply to this tab.
              </p>
            </section>

            {GLOSSARY.map((g) => (
              <section key={g.nhom}>
                <h2>{g.nhom}</h2>
                <p className="sub">{g.mo_ta}</p>
                <div className="tablewrap">
                  <table className="gloss">
                    <thead><tr>
                      <th>Term</th>
                      <th>What it is</th>
                      <th>How it is computed</th>
                      <th>Worth knowing</th>
                    </tr></thead>
                    <tbody>
                      {g.terms.map((t) => (
                        <tr key={t.ten}>
                          <td className="gt"><b>{t.ten}</b></td>
                          <td className="gw">{t.dinh_nghia}</td>
                          <td className="gw">{t.ct ? <code className="fx">{t.ct}</code> : <span className="muted">—</span>}</td>
                          <td className={`gw ${t.canh_bao ? 'gwarn' : 'muted'}`}>{t.ghi_chu ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

            <div className="note hot">
              <b>The one identity to remember.</b> Seller GMV = Seller NMV + value lost to
              cancellations, and Seller NMV = Customer-funded NMV + Platform-funded NMV. Every money
              chart on this dashboard is a view of one of those two splits.
            </div>
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
  k: keyof SkuAgg; cur: keyof SkuAgg; set: (k: keyof SkuAgg) => void; children: React.ReactNode
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
  max-width:1240px;margin:0 auto;padding:40px 20px 96px}
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

/* Glossary: the only table here that wraps instead of scrolling sideways —
   these are sentences, not figures. */
.wrap table.gloss{min-width:760px;font-size:13.5px}
.wrap table.gloss th,.wrap table.gloss td{white-space:normal;vertical-align:top;line-height:1.55}
.gt{width:16%;min-width:150px}
.gw{width:28%}
.gwarn{color:var(--ink-2)}
.gwarn::before{content:"⚠ ";color:var(--bad)}
.fx{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;
  background:var(--surface-2);border:1px solid var(--line);border-radius:3px;
  padding:1px 5px;display:inline-block;color:var(--ink-2)}

.defs{margin-top:18px;display:grid;gap:7px;max-width:82ch;font-size:13.5px;
  color:var(--ink-2);line-height:1.55}
.def{padding-left:13px;border-left:2px solid var(--line-s)}
.def b{color:var(--ink)}
.def.indent{margin-left:22px;border-left-color:var(--c2)}
.def.warn-def{border-left-color:var(--bad);color:var(--muted)}

.filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:26px}
.seg{display:inline-flex;background:var(--surface-2);border:1px solid var(--line);border-radius:5px;padding:2px}
.seg button{font:inherit;font-size:13.5px;padding:6px 13px;border:0;background:transparent;
  color:var(--ink-2);border-radius:4px;cursor:pointer;white-space:nowrap}
.seg button.on{background:var(--surface);color:var(--ink);font-weight:500;
  box-shadow:0 1px 2px rgba(0,0,0,.08)}
.seg button:focus-visible{outline:2px solid var(--c1);outline-offset:1px}
.chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px}
.chips-l{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);
  margin-right:4px}
.chip{font:inherit;font-size:12.5px;padding:4px 11px;border:1px solid var(--line);
  background:var(--surface);color:var(--ink-2);border-radius:999px;cursor:pointer;
  font-variant-numeric:tabular-nums}
.chip:hover{border-color:var(--line-s);color:var(--ink)}
.chip.on{background:var(--c1);border-color:var(--c1);color:#fff;font-weight:500}
.chip:focus-visible{outline:2px solid var(--c1);outline-offset:1px}

.drop{font:inherit;font-size:13.5px;padding:7px 11px;border:1px solid var(--line);
  background:var(--surface);color:var(--ink);border-radius:5px;cursor:pointer;max-width:100%}
.drop.wide{min-width:240px}
.drop:focus-visible{outline:2px solid var(--c1);outline-offset:1px}

.tabs{display:flex;gap:2px;margin-top:20px;border-bottom:1px solid var(--line);overflow-x:auto}
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
   below the columns instead of absolutely positioned. Axis numbers live in the
   left/right gutters. Line values float above the line itself. */
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
.lvals{position:absolute;inset:0;pointer-events:none;z-index:4}
.lval{position:absolute;transform:translate(-50%,-135%);font-size:10px;font-weight:600;
  white-space:nowrap;font-variant-numeric:tabular-nums;background:var(--surface);
  padding:0 3px;border-radius:3px;box-shadow:0 0 0 1px var(--line)}
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
