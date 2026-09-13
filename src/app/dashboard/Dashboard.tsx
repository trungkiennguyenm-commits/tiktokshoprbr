'use client'

import { useMemo, useState } from 'react'
import { BarChart, StackChart, DeltaChart, RowBars, type Pt, type Pt2 } from './charts'

/* ============================ kiểu dữ liệu ============================ */

export type Monthly = {
  thang: string; category: string; so_luong: number; sl_hoan_tat: number
  sl_huy: number; cancel_rate: number; gmv: number; nmv: number
  gia_goc: number; seller_disc: number; platform_disc: number; gio_huy_tb: number
}
export type Daily = {
  ngay: string; category: string; so_luong: number; sl_hoan_tat: number
  sl_huy: number; cancel_rate: number; gmv: number; nmv: number
  seller_disc: number; platform_disc: number
}
export type Sku = {
  product_id: string; model: string; category: string
  so_luong: number; sl_hoan_tat: number; sl_huy: number; cancel_rate: number
  gmv: number; nmv: number; gia_goc_tb: number; gia_ban_tb: number
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

type Props = { monthly: Monthly[]; daily: Daily[]; sku: Sku[]; lapse: Lapse[]; pnl: Pnl[]; ship: Ship[] }

/* ============================ tiện ích ============================ */

const n0 = (v: number) => new Intl.NumberFormat('vi-VN').format(Math.round(v || 0))
const ty = (v: number) => ((v || 0) / 1e9).toFixed(2)
const tr = (v: number) => ((v || 0) / 1e6).toFixed(0)
const pct = (v: number) => (v == null ? '—' : `${v}%`)
const mmyy = (s: string) => `${s.slice(5, 7)}/${s.slice(2, 4)}`
const ddmm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`

const CATS = [
  { key: 'all', nhan: 'Tất cả' },
  { key: 'robot', nhan: 'Robot' },
  { key: 'handheld', nhan: 'Handheld' },
] as const
type CatKey = (typeof CATS)[number]['key']

const TABS = ['Tổng quan', 'Theo ngành hàng', 'Theo SKU', 'Khuyến mãi', 'Huỷ đơn', 'PnL'] as const
type Tab = (typeof TABS)[number]

/**
 * Gộp các dòng (mỗi category một dòng) thành một dòng tổng theo kỳ.
 * Khai báo kiểu tường minh — đừng dùng spread của Record<string, number>,
 * TypeScript không suy ra được từng cột và build sẽ hỏng.
 */
type Rolled = {
  ky: string
  so_luong: number; sl_hoan_tat: number; sl_huy: number
  gmv: number; nmv: number; seller_disc: number; platform_disc: number
  cancel_rate: number
}

const ZERO = (ky: string): Rolled => ({
  ky, so_luong: 0, sl_hoan_tat: 0, sl_huy: 0,
  gmv: 0, nmv: 0, seller_disc: 0, platform_disc: 0, cancel_rate: 0,
})

const keyOf = (r: Monthly | Daily) => ('thang' in r ? r.thang : r.ngay)

function rollup(rows: (Monthly | Daily)[], cat: CatKey): Rolled[] {
  const filtered = cat === 'all' ? rows : rows.filter((r) => r.category === cat)
  const map = new Map<string, Rolled>()

  for (const r of filtered) {
    const k = keyOf(r)
    const cur = map.get(k) ?? ZERO(k)
    cur.so_luong += Number(r.so_luong || 0)
    cur.sl_hoan_tat += Number(r.sl_hoan_tat || 0)
    cur.sl_huy += Number(r.sl_huy || 0)
    cur.gmv += Number(r.gmv || 0)
    cur.nmv += Number(r.nmv || 0)
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

/** Tách một chỉ tiêu thành hai chuỗi robot / handheld để vẽ cột chồng. */
function splitByCat(rows: (Monthly | Daily)[], pick: (r: Monthly | Daily) => number): Pt2[] {
  const map = new Map<string, Pt2>()
  for (const r of rows) {
    const k = keyOf(r)
    const cur = map.get(k) ?? { ky: k, a: 0, b: 0 }
    if (r.category === 'robot') cur.a += Number(pick(r) || 0)
    else cur.b += Number(pick(r) || 0)
    map.set(k, cur)
  }
  return Array.from(map.values()).sort((a, b) => a.ky.localeCompare(b.ky))
}

/* ============================ thành phần chung ============================ */

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

/** Bảng chi tiết đi kèm biểu đồ: mỗi kỳ một dòng, kèm biến động so với kỳ trước. */
function SeriesTable({ rows, lbl }: { rows: Rolled[]; lbl: (k: string) => string }) {
  const [mo, setMo] = useState(false)
  const view = mo ? rows : rows.slice(-12)
  return (
    <>
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Kỳ</th>
            <th className="n">SL bán</th>
            <th className="n">±SL</th>
            <th className="n">Hoàn tất</th>
            <th className="n">Huỷ</th>
            <th className="n">Huỷ %</th>
            <th className="n">GMV</th>
            <th className="n">±GMV</th>
            <th className="n">NMV</th>
            <th className="n">Shop giảm</th>
            <th className="n">Sàn giảm</th>
          </tr></thead>
          <tbody>
            {view.map((r, i) => {
              const p = view[i - 1]
              return (
                <tr key={r.ky}>
                  <td className="k">{lbl(r.ky)}</td>
                  <td className="n">{n0(r.so_luong)}</td>
                  <td className="n"><Dd a={r.so_luong} b={p?.so_luong} /></td>
                  <td className="n">{n0(r.sl_hoan_tat)}</td>
                  <td className="n">{n0(r.sl_huy)}</td>
                  <td className="n" style={{ color: r.cancel_rate > 40 ? 'var(--bad)' : 'inherit' }}>{pct(r.cancel_rate)}</td>
                  <td className="n">{ty(r.gmv)}</td>
                  <td className="n"><Dd a={r.gmv} b={p?.gmv} /></td>
                  <td className="n">{ty(r.nmv)}</td>
                  <td className="n">{ty(r.seller_disc)}</td>
                  <td className="n">{ty(r.platform_disc)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="foot">
        Tiền tính bằng tỷ đồng.{' '}
        {rows.length > 12 && (
          <button className="lnk" onClick={() => setMo(!mo)}>
            {mo ? 'Thu gọn' : `Xem tất cả ${rows.length} kỳ`}
          </button>
        )}
      </p>
    </>
  )
}

/** Ô biến động % so với dòng trước. */
function Dd({ a, b }: { a?: number; b?: number }) {
  if (a == null || b == null || !b) return <span className="muted">—</span>
  const d = Math.round(((a - b) / b) * 1000) / 10
  return <span className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '▲' : '▼'}{Math.abs(d)}%</span>
}

/* ============================ trang ============================ */

export default function Dashboard({ monthly, daily, sku, lapse, pnl, ship }: Props) {
  const [tab, setTab] = useState<Tab>('Tổng quan')
  const [cat, setCat] = useState<CatKey>('all')
  const [mode, setMode] = useState<'mom' | 'd30'>('mom')
  const [sortKey, setSortKey] = useState<keyof Sku>('nmv')

  const src: (Monthly | Daily)[] = mode === 'mom' ? monthly : daily

  /** Các kỳ đủ dữ liệu để so sánh. Tháng quá ít đơn là do cửa sổ đồng bộ, không phải kinh doanh. */
  const keys = useMemo(() => {
    const all = rollup(src, 'all')
    const ok = mode === 'mom' ? all.filter((r) => r.so_luong >= 20) : all.slice(-30)
    return new Set(ok.map((r) => r.ky))
  }, [src, mode])

  const srcShown = useMemo(() => src.filter((r) => keys.has(keyOf(r))), [src, keys])
  const shown = useMemo(() => rollup(srcShown, cat), [srcShown, cat])

  const cur = shown[shown.length - 1]
  const prev = shown[shown.length - 2]
  const delta = (a?: number, b?: number) =>
    a == null || b == null || !b ? null : Math.round(((a - b) / b) * 1000) / 10

  const skuF = useMemo(
    () => (cat === 'all' ? sku : sku.filter((s) => s.category === cat))
      .slice()
      .sort((a, b) => Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0)),
    [sku, cat, sortKey],
  )

  const lbl = mode === 'mom' ? mmyy : ddmm
  const kyText = mode === 'mom' ? 'tháng' : 'ngày'
  const dodText = mode === 'mom' ? 'MoM' : 'DoD'

  const pt = (pick: (r: Rolled) => number): Pt[] => shown.map((r) => ({ ky: r.ky, v: pick(r) }))

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <main className="wrap">
        <header>
          <p className="eyebrow">Roborock Official VN · TikTok Shop</p>
          <h1>Hiệu quả kinh doanh</h1>
          <p className="lede">
            Robot và handheld, đã loại quà tặng và phụ kiện. NMV = giá gốc trừ seller discount,
            chỉ tính đơn hoàn tất. Xếp kỳ theo ngày đặt đơn.
          </p>
        </header>

        {/* ---- bộ lọc ---- */}
        <div className="filters">
          <div className="seg">
            {(['mom', 'd30'] as const).map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                {m === 'mom' ? 'Theo tháng' : '30 ngày gần nhất'}
              </button>
            ))}
          </div>
          <div className="seg">
            {CATS.map((c) => (
              <button key={c.key} className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>
                {c.nhan}
              </button>
            ))}
          </div>
        </div>

        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>

        {/* =================== TỔNG QUAN =================== */}
        {tab === 'Tổng quan' && (
          <>
            <section className="tiles">
              <Tile label="GMV" value={ty(cur?.gmv ?? 0)} unit=" tỷ"
                sub={deltaText(delta(cur?.gmv, prev?.gmv), kyText)} />
              <Tile label="Số lượng bán" value={n0(cur?.so_luong ?? 0)} unit=" máy"
                sub={deltaText(delta(cur?.so_luong, prev?.so_luong), kyText)} />
              <Tile label="NMV (đơn hoàn tất)" value={ty(cur?.nmv ?? 0)} unit=" tỷ"
                sub={deltaText(delta(cur?.nmv, prev?.nmv), kyText)} />
              <Tile label="Cancel rate" value={pct(cur?.cancel_rate ?? 0)}
                tone={(cur?.cancel_rate ?? 0) > 40 ? 'bad' : 'ok'}
                sub={`${n0(cur?.sl_huy ?? 0)} máy bị huỷ`} />
            </section>

            <section>
              <h2>GMV theo {kyText} · {dodText}</h2>
              <p className="sub">
                Toàn bộ đơn đặt, không phụ thuộc đơn đã hoàn tất hay chưa. Con số dưới mỗi cột
                là biến động so với kỳ liền trước.
              </p>
              <DeltaChart
                data={pt((r) => r.gmv)} color="var(--c1)" fmt={ty} label={lbl} unit="tỷ đồng"
                tip={(d, dl) => (
                  <><b>{lbl(d.ky)}</b><br />GMV {n0(d.v)}đ
                    {dl != null && <><br />{dl >= 0 ? '▲' : '▼'} {Math.abs(dl)}% so với kỳ trước</>}</>
                )}
              />
            </section>

            <section>
              <h2>Số lượng bán theo {kyText} · {dodText}</h2>
              <p className="sub">Đếm số máy, đã loại quà tặng và phụ kiện.</p>
              <DeltaChart
                data={pt((r) => r.so_luong)} color="var(--c3)" fmt={n0} label={lbl} unit="máy"
                tip={(d, dl) => (
                  <><b>{lbl(d.ky)}</b><br />{n0(d.v)} máy
                    {dl != null && <><br />{dl >= 0 ? '▲' : '▼'} {Math.abs(dl)}% so với kỳ trước</>}</>
                )}
              />
            </section>

            <section>
              <h2>Cơ cấu số lượng: robot và handheld</h2>
              <p className="sub">Cột chồng. Nhìn được cả tổng lẫn tỷ trọng trong cùng một hình.</p>
              <StackChart
                data={splitByCat(srcShown, (r) => r.so_luong)}
                fmt={n0} label={lbl} names={['Robot', 'Handheld']}
                colors={['var(--c1)', 'var(--c2)']} unit="máy"
                tip={(d) => (
                  <><b>{lbl(d.ky)}</b><br />Robot {n0(d.a)} · Handheld {n0(d.b)}
                    <br />Tổng {n0(d.a + d.b)} máy
                    <br />Robot chiếm {Math.round((d.a / Math.max(1, d.a + d.b)) * 100)}%</>
                )}
              />
            </section>

            <section>
              <h2>Hoàn tất và huỷ</h2>
              <p className="sub">
                Cột chồng: phần xanh là máy thật sự tới tay khách, phần đỏ là máy bị huỷ.
                Khoảng cách GMV–NMV nằm ở đây.
              </p>
              <StackChart
                data={shown.map((r) => ({ ky: r.ky, a: r.sl_hoan_tat, b: r.sl_huy }))}
                fmt={n0} label={lbl} names={['Hoàn tất', 'Huỷ']}
                colors={['var(--ok)', 'var(--bad)']} unit="máy"
                tip={(d) => (
                  <><b>{lbl(d.ky)}</b><br />Hoàn tất {n0(d.a)} · Huỷ {n0(d.b)}
                    <br />Tỷ lệ huỷ {Math.round((d.b / Math.max(1, d.a + d.b)) * 1000) / 10}%</>
                )}
              />
            </section>

            <section>
              <h2>Bảng chi tiết theo {kyText}</h2>
              <p className="sub">Tất cả chỉ tiêu của biểu đồ phía trên, kèm biến động {dodText}.</p>
              <SeriesTable rows={shown} lbl={lbl} />
            </section>

            <div className="note warn">
              <b>Kỳ gần nhất luôn trông tệ hơn thực tế.</b> NMV chỉ tính đơn đã COMPLETED,
              mà đơn đặt trong kỳ đang chạy phần lớn còn đang giao. Vì vậy hãy đọc GMV và số lượng
              trước, NMV sau. Đừng so kỳ đang chạy với kỳ đã đóng.
            </div>
          </>
        )}

        {/* =================== NGÀNH HÀNG =================== */}
        {tab === 'Theo ngành hàng' && (
          <>
            <section className="cards">
              {(['robot', 'handheld'] as const).map((c, i) => {
                const rows = srcShown.filter((r) => r.category === c)
                const sl = rows.reduce((s, r) => s + Number(r.so_luong || 0), 0)
                const nmv = rows.reduce((s, r) => s + Number(r.nmv || 0), 0)
                const gmv = rows.reduce((s, r) => s + Number(r.gmv || 0), 0)
                const huy = rows.reduce((s, r) => s + Number(r.sl_huy || 0), 0)
                return (
                  <div className="card" key={c}>
                    <div className="card-h">
                      <i className="sw" style={{ background: i === 0 ? 'var(--c1)' : 'var(--c2)' }} />
                      <b>{c === 'robot' ? 'Robot hút bụi' : 'Máy hút bụi cầm tay'}</b>
                    </div>
                    <div className="kv"><span>GMV</span><b>{ty(gmv)} tỷ</b></div>
                    <div className="kv"><span>NMV</span><b>{ty(nmv)} tỷ</b></div>
                    <div className="kv"><span>Số lượng</span><b>{n0(sl)} máy</b></div>
                    <div className="kv"><span>Cancel rate</span>
                      <b style={{ color: huy / Math.max(1, sl) > 0.4 ? 'var(--bad)' : 'inherit' }}>
                        {Math.round((huy / Math.max(1, sl)) * 1000) / 10}%
                      </b></div>
                    <div className="kv"><span>Giá bán TB</span><b>{n0(gmv / Math.max(1, sl))}đ</b></div>
                  </div>
                )
              })}
            </section>

            <section>
              <h2>GMV hai ngành hàng theo {kyText}</h2>
              <p className="sub">Cột chồng, đơn vị tỷ đồng.</p>
              <StackChart
                data={splitByCat(srcShown, (r) => r.gmv)}
                fmt={ty} label={lbl} names={['Robot', 'Handheld']}
                colors={['var(--c1)', 'var(--c2)']} unit="tỷ đồng"
                tip={(d) => (
                  <><b>{lbl(d.ky)}</b><br />Robot {ty(d.a)} tỷ · Handheld {ty(d.b)} tỷ
                    <br />Robot chiếm {Math.round((d.a / Math.max(1, d.a + d.b)) * 100)}%</>
                )}
              />
            </section>

            <section>
              <h2>Tỷ lệ huỷ từng ngành hàng · {dodText}</h2>
              <p className="sub">
                Handheld thường huỷ nặng hơn robot. Cùng một vấn đề giao nhận nhưng giá trị đơn
                thấp hơn nên khách dễ từ chối nhận.
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
                        fmt={(v) => `${v}`} label={lbl} unit="% huỷ"
                        tip={(d) => <><b>{lbl(d.ky)}</b><br />Huỷ {d.v}%</>}
                      />
                    </div>
                  )
                })}
              </div>
            </section>

            <section>
              <h2>Bảng chi tiết theo ngành hàng</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Kỳ</th><th>Ngành hàng</th>
                    <th className="n">SL bán</th><th className="n">Hoàn tất</th><th className="n">Huỷ</th>
                    <th className="n">Huỷ %</th><th className="n">GMV</th><th className="n">NMV</th>
                    <th className="n">Giá bán TB</th>
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
                          <td className="n">{n0(r.sl_hoan_tat)}</td>
                          <td className="n">{n0(r.sl_huy)}</td>
                          <td className="n" style={{ color: Number(r.cancel_rate) > 40 ? 'var(--bad)' : 'inherit' }}>
                            {pct(r.cancel_rate)}
                          </td>
                          <td className="n">{ty(r.gmv)}</td>
                          <td className="n">{ty(r.nmv)}</td>
                          <td className="n">{n0(Number(r.gmv || 0) / Math.max(1, Number(r.so_luong || 0)))}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="foot">Tiền tính bằng tỷ đồng, riêng giá bán trung bình tính bằng đồng. Tối đa 60 dòng gần nhất.</p>
            </section>
          </>
        )}

        {/* =================== SKU =================== */}
        {tab === 'Theo SKU' && (
          <>
            <section>
              <h2>Top SKU theo NMV</h2>
              <p className="sub">Thanh ngang xếp theo cột đang sắp xếp ở bảng dưới.</p>
              <RowBars
                rows={skuF.slice(0, 15).map((s) => ({
                  nhan: s.model,
                  segs: [{ v: s.nmv, color: s.category === 'robot' ? 'var(--c1)' : 'var(--c2)', ten: 'NMV' }],
                  phu: `${tr(s.nmv)}tr · ${n0(s.so_luong)} máy`,
                }))}
              />
            </section>

            <section>
              <h2>Hoàn tất và huỷ theo SKU</h2>
              <p className="sub">Cột chồng cho 14 SKU bán nhiều nhất. Phần đỏ là phần không ra tiền.</p>
              <StackChart
                data={skuF.slice()
                  .sort((a, b) => b.so_luong - a.so_luong)
                  .slice(0, 14)
                  .map((s) => ({ ky: s.model, a: s.sl_hoan_tat, b: s.sl_huy }))}
                fmt={n0} label={(k) => k.split(' ').slice(-1)[0]} names={['Hoàn tất', 'Huỷ']}
                colors={['var(--ok)', 'var(--bad)']} unit="máy"
                tip={(d) => (
                  <><b>{d.ky}</b><br />Hoàn tất {n0(d.a)} · Huỷ {n0(d.b)}
                    <br />Huỷ {Math.round((d.b / Math.max(1, d.a + d.b)) * 1000) / 10}%</>
                )}
              />
            </section>

            <section>
              <h2>Bảng đầy đủ từng SKU</h2>
              <p className="sub">Bấm vào tiêu đề cột để sắp xếp lại. Đang sắp theo <b>{String(sortKey)}</b>.</p>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Model</th>
                    <Th k="so_luong" cur={sortKey} set={setSortKey}>Bán</Th>
                    <Th k="sl_hoan_tat" cur={sortKey} set={setSortKey}>Hoàn tất</Th>
                    <Th k="sl_huy" cur={sortKey} set={setSortKey}>Huỷ</Th>
                    <Th k="cancel_rate" cur={sortKey} set={setSortKey}>Huỷ %</Th>
                    <Th k="gmv" cur={sortKey} set={setSortKey}>GMV</Th>
                    <Th k="nmv" cur={sortKey} set={setSortKey}>NMV</Th>
                    <Th k="gia_goc_tb" cur={sortKey} set={setSortKey}>Giá niêm yết</Th>
                    <Th k="gia_ban_tb" cur={sortKey} set={setSortKey}>Giá bán TB</Th>
                    <Th k="pct_seller_disc" cur={sortKey} set={setSortKey}>Shop giảm %</Th>
                    <Th k="pct_platform_disc" cur={sortKey} set={setSortKey}>Sàn giảm %</Th>
                    <Th k="gio_huy_trung_vi" cur={sortKey} set={setSortKey}>Huỷ sau (median)</Th>
                    <Th k="gio_huy_tb" cur={sortKey} set={setSortKey}>Huỷ sau (TB)</Th>
                  </tr></thead>
                  <tbody>
                    {skuF.map((s) => (
                      <tr key={s.product_id}>
                        <td>
                          <span className="sw sm" style={{ background: s.category === 'robot' ? 'var(--c1)' : 'var(--c2)' }} />
                          {s.model}
                        </td>
                        <td className="n">{n0(s.so_luong)}</td>
                        <td className="n">{n0(s.sl_hoan_tat)}</td>
                        <td className="n">{n0(s.sl_huy)}</td>
                        <td className="n" style={{ color: s.cancel_rate > 70 ? 'var(--bad)' : 'inherit' }}>{pct(s.cancel_rate)}</td>
                        <td className="n">{tr(s.gmv)}tr</td>
                        <td className="n"><b>{tr(s.nmv)}tr</b></td>
                        <td className="n">{n0(s.gia_goc_tb)}</td>
                        <td className="n">{n0(s.gia_ban_tb)}</td>
                        <td className="n">{pct(s.pct_seller_disc)}</td>
                        <td className="n muted">{pct(s.pct_platform_disc)}</td>
                        <td className="n">{s.gio_huy_trung_vi != null ? `${Math.round(s.gio_huy_trung_vi)}h` : '—'}</td>
                        <td className="n muted">{s.gio_huy_tb != null ? `${Math.round(s.gio_huy_tb)}h` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="foot">
                &ldquo;Huỷ sau&rdquo; là khoảng cách từ lúc đặt tới lúc huỷ. Median đáng tin hơn trung bình
                vì vài đơn treo rất lâu sẽ kéo lệch trung bình.
              </p>
            </section>
          </>
        )}

        {/* =================== KHUYẾN MÃI =================== */}
        {tab === 'Khuyến mãi' && (
          <>
            <section>
              <h2>Ai gánh khuyến mãi</h2>
              <p className="sub">
                Phần trăm trên giá niêm yết. Xanh là shop tự bỏ tiền, cam là sàn tài trợ.
                Chỉ phần xanh mới ăn vào lãi của mình.
              </p>
              <RowBars
                rows={skuF.slice(0, 15).map((s) => ({
                  nhan: s.model,
                  segs: [
                    { v: s.pct_seller_disc, color: 'var(--c1)', ten: 'Shop gánh (%)' },
                    { v: s.pct_platform_disc, color: 'var(--c2)', ten: 'Sàn gánh (%)' },
                  ],
                  phu: `${pct(s.pct_seller_disc)} + ${pct(s.pct_platform_disc)}`,
                }))}
              />
              <div className="legend" style={{ marginTop: 14 }}>
                <span><i className="sw" style={{ background: 'var(--c1)' }} />Shop gánh</span>
                <span><i className="sw" style={{ background: 'var(--c2)' }} />Sàn gánh</span>
              </div>
            </section>

            <section>
              <h2>Tiền khuyến mãi theo {kyText}</h2>
              <p className="sub">Cột chồng: phần shop và phần sàn. Đơn vị tỷ đồng.</p>
              <StackChart
                data={shown.map((r) => ({ ky: r.ky, a: r.seller_disc ?? 0, b: r.platform_disc ?? 0 }))}
                fmt={ty} label={lbl} names={['Shop gánh', 'Sàn gánh']}
                colors={['var(--c1)', 'var(--c2)']} unit="tỷ đồng"
                tip={(d) => (
                  <><b>{lbl(d.ky)}</b><br />Shop {ty(d.a)} tỷ · Sàn {ty(d.b)} tỷ
                    <br />Shop gánh {Math.round((d.a / Math.max(1, d.a + d.b)) * 100)}% tổng khuyến mãi</>
                )}
              />
            </section>

            <section>
              <h2>Tỷ trọng shop gánh · {dodText}</h2>
              <p className="sub">
                Con số này tăng nghĩa là mình đang tự bỏ tiền nhiều hơn để giữ giá, chứ không phải
                sàn đang tài trợ thêm.
              </p>
              <DeltaChart
                data={shown.map((r) => ({
                  ky: r.ky,
                  v: Math.round((r.seller_disc / Math.max(1, r.seller_disc + r.platform_disc)) * 1000) / 10,
                }))}
                color="var(--c1)" fmt={(v) => `${v}`} label={lbl} unit="% khuyến mãi do shop gánh"
                tip={(d) => <><b>{lbl(d.ky)}</b><br />Shop gánh {d.v}%</>}
              />
            </section>

            <section>
              <h2>Bảng khuyến mãi từng SKU</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Model</th><th className="n">Giá niêm yết</th><th className="n">Giá bán TB</th>
                    <th className="n">Shop giảm (đ)</th><th className="n">Shop giảm %</th>
                    <th className="n">Sàn giảm (đ)</th><th className="n">Sàn giảm %</th>
                    <th className="n">Tổng giảm %</th><th className="n">SL bán</th>
                  </tr></thead>
                  <tbody>
                    {skuF.map((s) => (
                      <tr key={s.product_id}>
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

        {/* =================== HUỶ ĐƠN =================== */}
        {tab === 'Huỷ đơn' && (
          <>
            <section>
              <h2>Bao lâu sau khi đặt thì đơn bị huỷ</h2>
              <p className="sub">Hai cụm rõ rệt, và chúng là hai bài toán khác nhau — xem ghi chú bên dưới.</p>
              <BarChart
                data={lapse.map((l) => ({ ky: l.khoang, v: l.so_luong }))}
                color="var(--c2)" fmt={n0} label={(k) => k} unit="máy"
                tip={(d) => {
                  const row = lapse.find((l) => l.khoang === d.ky)
                  return <><b>{d.ky}</b><br />{n0(d.v)} máy · {row?.pct}% tổng số đơn huỷ</>
                }}
              />
              <div className="tablewrap" style={{ marginTop: 18 }}>
                <table>
                  <thead><tr><th>Khoảng thời gian</th><th className="n">Số máy</th><th className="n">Tỷ trọng</th><th className="n">Cộng dồn</th></tr></thead>
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
                <b>Cụm thứ nhất — huỷ trong vòng 1 giờ.</b> Đơn chết trước khi kịp đóng gói.
                Đây là khách đặt nhầm, đặt thử, hoặc hệ thống tự huỷ vì quá hạn thanh toán.
                Xử lý bằng luồng xác nhận đơn, không phải bằng vận chuyển.
                <br /><br />
                <b>Cụm thứ hai — huỷ ở mốc 3–7 ngày.</b> Đúng cửa sổ giao hàng.
                Đây là đơn đã đi đường rồi khách từ chối nhận, khớp với lý do
                &ldquo;giao gói hàng thất bại&rdquo;. Tiền ship đã mất thật.
              </div>
            </section>

            <section>
              <h2>Tỷ lệ huỷ theo {kyText} · {dodText}</h2>
              <p className="sub">Mục tiêu nội bộ là dưới 40%. Đường lưới giữa là một nửa giá trị lớn nhất.</p>
              <DeltaChart
                data={pt((r) => r.cancel_rate)} color="var(--bad)" fmt={(v) => `${v}`} label={lbl} unit="% huỷ"
                tip={(d) => {
                  const row = shown.find((r) => r.ky === d.ky)
                  return <><b>{lbl(d.ky)}</b><br />Huỷ {d.v}%<br />{n0(row?.sl_huy ?? 0)} / {n0(row?.so_luong ?? 0)} máy</>
                }}
              />
            </section>

            <section>
              <h2>SKU huỷ nhiều nhất</h2>
              <p className="sub">Sắp theo tỷ lệ huỷ, chỉ lấy SKU bán từ 30 máy trở lên.</p>
              <RowBars
                rows={skuF.filter((s) => s.so_luong >= 30)
                  .slice()
                  .sort((a, b) => b.cancel_rate - a.cancel_rate)
                  .slice(0, 14)
                  .map((s) => ({
                    nhan: s.model,
                    segs: [{ v: s.cancel_rate, color: s.cancel_rate > 70 ? 'var(--bad)' : 'var(--c2)', ten: 'Tỷ lệ huỷ (%)' }],
                    phu: `${pct(s.cancel_rate)} · ${n0(s.so_luong)} máy`,
                  }))}
              />
            </section>

            <section>
              <h2>Bảng huỷ đơn từng SKU</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Model</th><th className="n">SL bán</th><th className="n">Huỷ</th><th className="n">Huỷ %</th>
                    <th className="n">Huỷ sau (median)</th><th className="n">Huỷ sau (TB)</th>
                    <th className="n">GMV mất</th>
                  </tr></thead>
                  <tbody>
                    {skuF.slice()
                      .sort((a, b) => b.sl_huy - a.sl_huy)
                      .map((s) => (
                        <tr key={s.product_id}>
                          <td>
                            <span className="sw sm" style={{ background: s.category === 'robot' ? 'var(--c1)' : 'var(--c2)' }} />
                            {s.model}
                          </td>
                          <td className="n">{n0(s.so_luong)}</td>
                          <td className="n">{n0(s.sl_huy)}</td>
                          <td className="n" style={{ color: s.cancel_rate > 70 ? 'var(--bad)' : 'inherit' }}>{pct(s.cancel_rate)}</td>
                          <td className="n">{s.gio_huy_trung_vi != null ? `${Math.round(s.gio_huy_trung_vi)}h` : '—'}</td>
                          <td className="n muted">{s.gio_huy_tb != null ? `${Math.round(s.gio_huy_tb)}h` : '—'}</td>
                          <td className="n" style={{ color: 'var(--bad)' }}>{tr(s.gia_ban_tb * s.sl_huy)}tr</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="foot">GMV mất là ước lượng: giá bán trung bình nhân số máy bị huỷ.</p>
            </section>
          </>
        )}

        {/* =================== PNL =================== */}
        {tab === 'PnL' && (
          <>
            <section>
              <h2>Từ giá niêm yết tới tiền về</h2>
              <p className="sub">
                Cộng dồn toàn kỳ, chỉ đơn hoàn tất. Đây là bản nháp — còn thiếu giá vốn,
                phí sàn và chi phí quảng cáo.
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
                  { nhan: 'Giá niêm yết', v: t.gia_niem_yet, kieu: 'base' },
                  { nhan: 'Shop giảm giá', v: -t.shop_giam_gia, kieu: 'tru' },
                  { nhan: 'NMV — shop ghi nhận', v: t.nmv, kieu: 'moc' },
                  { nhan: 'Sàn giảm giá (TikTok trả)', v: -t.san_giam_gia, kieu: 'ghi' },
                  { nhan: 'Khách thực trả', v: t.khach_tra, kieu: 'moc' },
                  { nhan: 'Shop trợ giá vận chuyển', v: -shipTot, kieu: 'tru' },
                  { nhan: 'Còn thiếu: giá vốn · phí sàn · hoa hồng · ads', v: 0, kieu: 'thieu' },
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
                        <div className="wf-v">{s.v === 0 ? '—' : `${s.v < 0 ? '−' : ''}${ty(Math.abs(s.v))} tỷ`}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              <div className="note hot">
                <b>Con số đắt nhất không nằm trong bảng trên.</b> GMV mất vì huỷ đơn là{' '}
                <b>{ty(pnl.reduce((a, r) => a + Number(r.gmv_mat_do_huy || 0), 0))} tỷ</b>, và riêng tiền
                shop trợ giá vận chuyển cho những đơn đó là{' '}
                <b>{n0(ship.reduce((a, r) => a + Number(r.ship_dot_cho_don_huy || 0), 0))}đ</b> —
                đã chi ra, không thu lại được gì.
              </div>
            </section>

            <section>
              <h2>NMV và phần bị bào mòn, theo tháng</h2>
              <p className="sub">
                Cột chồng: phần xanh là NMV shop ghi nhận, phần đỏ là tiền shop tự giảm giá.
                Cộng lại bằng giá niêm yết của đơn hoàn tất. Đơn vị tỷ đồng.
              </p>
              <StackChart
                data={pnl.filter((r) => Number(r.gia_niem_yet || 0) > 0)
                  .map((r) => ({ ky: r.thang, a: Number(r.nmv || 0), b: Number(r.shop_giam_gia || 0) }))}
                fmt={ty} label={mmyy} names={['NMV', 'Shop giảm giá']}
                colors={['var(--ok)', 'var(--bad)']} unit="tỷ đồng"
                tip={(d) => (
                  <><b>{mmyy(d.ky)}</b><br />NMV {ty(d.a)} tỷ · Shop giảm {ty(d.b)} tỷ
                    <br />Shop giảm {Math.round((d.b / Math.max(1, d.a + d.b)) * 1000) / 10}% giá niêm yết</>
                )}
              />
            </section>

            <section>
              <h2>PnL theo tháng</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Tháng</th><th className="n">Giá niêm yết</th><th className="n">Shop giảm</th>
                    <th className="n">Sàn giảm</th><th className="n">NMV</th><th className="n">Khách trả</th>
                    <th className="n">GMV mất do huỷ</th><th className="n">Shop trợ ship</th>
                    <th className="n">Ship đốt cho đơn huỷ</th>
                  </tr></thead>
                  <tbody>
                    {pnl.filter((r) => Number(r.gia_niem_yet || 0) > 0).map((r) => {
                      const s = ship.find((x) => x.thang === r.thang)
                      return (
                        <tr key={r.thang}>
                          <td className="k">{mmyy(r.thang)}</td>
                          <td className="n">{ty(r.gia_niem_yet)}</td>
                          <td className="n" style={{ color: 'var(--bad)' }}>−{ty(r.shop_giam_gia)}</td>
                          <td className="n muted">−{ty(r.san_giam_gia)}</td>
                          <td className="n"><b>{ty(r.nmv)}</b></td>
                          <td className="n">{ty(r.khach_tra)}</td>
                          <td className="n" style={{ color: 'var(--bad)' }}>{ty(r.gmv_mat_do_huy)}</td>
                          <td className="n">{ty(s?.shop_tro_gia_ship ?? 0)}</td>
                          <td className="n" style={{ color: 'var(--bad)' }}>{ty(s?.ship_dot_cho_don_huy ?? 0)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="foot">Đơn vị: tỷ đồng</p>
            </section>
          </>
        )}

        <div className="note">
          <b>Chưa có trong trang này:</b> Livestream, Advertising và Product Funnel.
          Ba phần đó cần adapter mới cắm vào khung đồng bộ — dữ liệu chưa nằm trong database.
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

function deltaText(d: number | null, ky: string) {
  if (d == null) return undefined
  const mui = d > 0 ? '▲' : d < 0 ? '▼' : '·'
  return `${mui} ${Math.abs(d)}% so với ${ky} trước`
}

/* ============================ CSS ============================ */

const CSS = `
.wrap{--ground:#FBFAFA;--surface:#fff;--surface-2:#F3F1F2;--ink:#17151A;--ink-2:#4A444C;
  --muted:#7C737D;--line:#E3DFE1;--line-s:#CFC8CB;
  --c1:#2563A8;--c2:#C2620B;--c3:#5B4A9E;--ok:#1F7A4D;--bad:#C1121F;
  background:var(--ground);color:var(--ink);min-height:100vh;
  font-family:"Be Vietnam Pro",system-ui,-apple-system,sans-serif;
  max-width:1100px;margin:0 auto;padding:40px 20px 96px}
@media (prefers-color-scheme:dark){.wrap{--ground:#131215;--surface:#1B191D;--surface-2:#232025;
  --ink:#F2EFF1;--ink-2:#C6BEC6;--muted:#8F8691;--line:#312D33;--line-s:#453F47;
  --c1:#4E93DD;--c2:#C07E1E;--c3:#9B8AE0;--ok:#5FCB92;--bad:#FF6B7B}}
.wrap *{box-sizing:border-box}
.eyebrow{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 11px}
.wrap h1{font-size:32px;font-weight:700;letter-spacing:-.02em;margin:0}
.lede{color:var(--ink-2);margin:11px 0 0;font-size:15.5px;max-width:70ch}
.wrap section{margin-top:44px}
.wrap h2{font-size:18.5px;font-weight:600;letter-spacing:-.01em;margin:0}
.wrap h3{font-size:14px;font-weight:600;margin:0 0 4px;color:var(--ink-2)}
.sub{color:var(--ink-2);margin:7px 0 0;font-size:14.5px;max-width:70ch}
.foot{color:var(--muted);font-size:12.5px;margin:8px 0 0}
.muted{color:var(--muted);font-weight:400}
.up{color:var(--ok)}
.down{color:var(--bad)}
.lnk{font:inherit;font-size:12.5px;background:none;border:0;padding:0;color:var(--c1);
  cursor:pointer;text-decoration:underline}

.filters{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px}
.seg{display:inline-flex;background:var(--surface-2);border:1px solid var(--line);border-radius:5px;padding:2px}
.seg button{font:inherit;font-size:13.5px;padding:6px 13px;border:0;background:transparent;
  color:var(--ink-2);border-radius:4px;cursor:pointer}
.seg button.on{background:var(--surface);color:var(--ink);font-weight:500;
  box-shadow:0 1px 2px rgba(0,0,0,.08)}
.seg button:focus-visible{outline:2px solid var(--c1);outline-offset:1px}

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

/* ---- tầng biểu đồ (charts.tsx) ----
   Mọi thứ nằm trong luồng: khung cao cố định, cột co giãn, nhãn nằm dưới cột
   chứ không định vị tuyệt đối. Đó là lý do không còn đè chữ. */
.unit{font-size:12px;color:var(--muted);margin:14px 0 0}
.unit-inline{color:var(--muted);font-size:12px}
.cframe{position:relative;margin-top:14px;padding-top:8px}
.gridline{position:absolute;left:0;right:0;top:8px;border-top:1px dashed var(--line);
  pointer-events:none;z-index:0}
.gridline.half{top:133px}
.gridline span{position:absolute;right:0;top:-8px;background:var(--ground);padding:0 4px;
  font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums}
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
  font-weight:500;background:var(--surface-2);position:sticky;top:0}
.wrap thead th.srt{cursor:pointer;user-select:none}
.wrap thead th.srt:hover{color:var(--ink)}
.wrap thead th[data-on="1"]{color:var(--c1)}
.car{font-size:9px}
.wrap tbody tr:last-child td{border-bottom:0}
.wrap tbody tr:hover td{background:var(--surface-2)}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.k{font-variant-numeric:tabular-nums}

.waterfall{display:grid;gap:8px;margin-top:22px}
.wf{display:grid;grid-template-columns:minmax(160px,1.2fr) 2fr auto;gap:13px;align-items:center;font-size:14px}
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
  box-shadow:0 4px 14px rgba(0,0,0,.16);pointer-events:none;max-width:260px}

.note{margin-top:26px;padding:14px 16px;background:var(--surface-2);border:1px solid var(--line);
  border-left:2px solid var(--line-s);border-radius:3px;font-size:14px;color:var(--ink-2);line-height:1.6}
.note.warn{border-left-color:var(--c2)}
.note.hot{border-left-color:var(--bad)}
.note b{color:var(--ink)}
`
