'use client'

import { useMemo, useState } from 'react'

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

/** Gộp nhiều dòng (mỗi category một dòng) thành một dòng tổng theo kỳ. */
function rollup<T extends Record<string, unknown>>(rows: T[], key: keyof T, cat: CatKey) {
  const filtered = cat === 'all' ? rows : rows.filter((r) => r.category === cat)
  const map = new Map<string, Record<string, number>>()
  for (const r of filtered) {
    const k = String(r[key])
    const cur = map.get(k) ?? {}
    for (const [f, v] of Object.entries(r)) {
      if (typeof v === 'number' || (!isNaN(Number(v)) && f !== 'thang' && f !== 'ngay')) {
        if (f === 'cancel_rate' || f === 'gio_huy_tb') continue
        cur[f] = (cur[f] ?? 0) + Number(v || 0)
      }
    }
    map.set(k, cur)
  }
  return Array.from(map.entries())
    .map(([k, v]) => ({
      ky: k,
      ...v,
      cancel_rate: v.so_luong ? Math.round((v.sl_huy / v.so_luong) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.ky.localeCompare(b.ky))
}

/* ============================ thành phần chung ============================ */

function Tip({ show, x, y, children }: { show: boolean; x: number; y: number; children: React.ReactNode }) {
  if (!show) return null
  return (
    <div className="tip" style={{ left: x, top: y }}>
      {children}
    </div>
  )
}

function useTip() {
  const [tip, setTip] = useState<{ show: boolean; x: number; y: number; body: React.ReactNode }>({
    show: false, x: 0, y: 0, body: null,
  })
  const on = (body: React.ReactNode) => (e: React.MouseEvent) =>
    setTip({ show: true, x: e.clientX + 14, y: e.clientY - 10, body })
  const off = () => setTip((t) => ({ ...t, show: false }))
  return { tip, on, off }
}

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

/** Cột đơn chuỗi. Nhãn trực tiếp trên đỉnh cột, không cần chú giải. */
function Bars({ data, color, fmt, label, tipBody }: {
  data: { ky: string; v: number }[]
  color: string
  fmt: (v: number) => string
  label: (k: string) => string
  tipBody: (d: { ky: string; v: number }) => React.ReactNode
}) {
  const { tip, on, off } = useTip()
  const max = Math.max(1, ...data.map((d) => d.v))
  return (
    <>
      <div className="chart">
        {data.map((d) => (
          <div className="col" key={d.ky} onMouseMove={on(tipBody(d))} onMouseLeave={off}>
            <div className="bw"><div className="bar" style={{ height: `${(d.v / max) * 100}%`, background: color }} /></div>
            <div className="cv">{fmt(d.v)}</div>
            <div className="cl">{label(d.ky)}</div>
          </div>
        ))}
      </div>
      <Tip show={tip.show} x={tip.x} y={tip.y}>{tip.body}</Tip>
    </>
  )
}

/** Cột chồng hai chuỗi, có chú giải + khe 2px giữa hai mảng. */
function StackBars({ data, fmt, label, names, colors, tipBody }: {
  data: { ky: string; a: number; b: number }[]
  fmt: (v: number) => string
  label: (k: string) => string
  names: [string, string]
  colors: [string, string]
  tipBody: (d: { ky: string; a: number; b: number }) => React.ReactNode
}) {
  const { tip, on, off } = useTip()
  const max = Math.max(1, ...data.map((d) => d.a + d.b))
  return (
    <>
      <div className="legend">
        {names.map((nm, i) => (
          <span key={nm}><i className="sw" style={{ background: colors[i] }} />{nm}</span>
        ))}
      </div>
      <div className="chart">
        {data.map((d) => (
          <div className="col" key={d.ky} onMouseMove={on(tipBody(d))} onMouseLeave={off}>
            <div className="bw">
              <div className="stack" style={{ height: `${((d.a + d.b) / max) * 100}%` }}>
                <div style={{ flex: d.a, background: colors[0], borderRadius: '4px 4px 0 0', minHeight: d.a ? 2 : 0 }} />
                <div style={{ height: 2 }} />
                <div style={{ flex: d.b, background: colors[1], minHeight: d.b ? 2 : 0 }} />
              </div>
            </div>
            <div className="cv">{fmt(d.a + d.b)}</div>
            <div className="cl">{label(d.ky)}</div>
          </div>
        ))}
      </div>
      <Tip show={tip.show} x={tip.x} y={tip.y}>{tip.body}</Tip>
    </>
  )
}

/* ============================ trang ============================ */

export default function Dashboard({ monthly, daily, sku, lapse, pnl, ship }: Props) {
  const [tab, setTab] = useState<Tab>('Tổng quan')
  const [cat, setCat] = useState<CatKey>('all')
  const [mode, setMode] = useState<'mom' | 'd30'>('mom')
  const [sortKey, setSortKey] = useState<keyof Sku>('nmv')

  const src = mode === 'mom' ? monthly : daily
  const series = useMemo(
    () => rollup(src as unknown as Record<string, unknown>[], mode === 'mom' ? 'thang' : 'ngay', cat),
    [src, mode, cat],
  )
  const shown = mode === 'mom' ? series.filter((r) => r.so_luong >= 20) : series.slice(-30)

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
              <Tile label="NMV" value={ty(cur?.nmv ?? 0)} unit=" tỷ"
                sub={deltaText(delta(cur?.nmv, prev?.nmv), kyText)} />
              <Tile label="GMV" value={ty(cur?.gmv ?? 0)} unit=" tỷ"
                sub={deltaText(delta(cur?.gmv, prev?.gmv), kyText)} />
              <Tile label="Số lượng bán" value={n0(cur?.so_luong ?? 0)} unit=" máy"
                sub={deltaText(delta(cur?.so_luong, prev?.so_luong), kyText)} />
              <Tile label="Cancel rate" value={pct(cur?.cancel_rate ?? 0)}
                tone={(cur?.cancel_rate ?? 0) > 40 ? 'bad' : 'ok'}
                sub={`${n0(cur?.sl_huy ?? 0)} máy bị huỷ`} />
            </section>

            <section>
              <h2>NMV theo {kyText}</h2>
              <p className="sub">Doanh thu shop thực ghi nhận, chỉ đơn hoàn tất. Đơn vị: tỷ đồng.</p>
              <Bars
                data={shown.map((r) => ({ ky: r.ky, v: r.nmv ?? 0 }))}
                color="var(--c1)" fmt={(v) => ty(v)} label={lbl}
                tipBody={(d) => <><b>{lbl(d.ky)}</b><br />NMV {n0(d.v)}đ</>}
              />
            </section>

            <section>
              <h2>Số lượng bán theo {kyText}</h2>
              <p className="sub">Đếm số máy, đã loại quà tặng và phụ kiện.</p>
              <StackBars
                data={(mode === 'mom' ? monthly : daily)
                  .reduce((acc: { ky: string; a: number; b: number }[], r) => {
                    const k = 'thang' in r ? (r as Monthly).thang : (r as Daily).ngay
                    let row = acc.find((x) => x.ky === k)
                    if (!row) { row = { ky: k, a: 0, b: 0 }; acc.push(row) }
                    if (r.category === 'robot') row.a += r.so_luong
                    else row.b += r.so_luong
                    return acc
                  }, [])
                  .sort((a, b) => a.ky.localeCompare(b.ky))
                  .filter((r) => (mode === 'mom' ? r.a + r.b >= 20 : true))
                  .slice(mode === 'mom' ? 0 : -30)}
                fmt={n0} label={lbl} names={['Robot', 'Handheld']} colors={['var(--c1)', 'var(--c2)']}
                tipBody={(d) => <><b>{lbl(d.ky)}</b><br />Robot {n0(d.a)} · Handheld {n0(d.b)}<br />Tổng {n0(d.a + d.b)} máy</>}
              />
            </section>

            <div className="note warn">
              <b>Tháng gần nhất luôn trông tệ hơn thực tế.</b> NMV chỉ tính đơn đã COMPLETED,
              mà đơn đặt trong tháng này phần lớn còn đang giao. Đừng so tháng đang chạy với tháng đã đóng.
            </div>
          </>
        )}

        {/* =================== NGÀNH HÀNG =================== */}
        {tab === 'Theo ngành hàng' && (
          <>
            <section className="cards">
              {(['robot', 'handheld'] as const).map((c, i) => {
                const rows = (mode === 'mom' ? monthly : daily).filter((r) => r.category === c)
                const sl = rows.reduce((s, r) => s + r.so_luong, 0)
                const nmv = rows.reduce((s, r) => s + Number(r.nmv || 0), 0)
                const gmv = rows.reduce((s, r) => s + Number(r.gmv || 0), 0)
                const huy = rows.reduce((s, r) => s + r.sl_huy, 0)
                return (
                  <div className="card" key={c}>
                    <div className="card-h">
                      <i className="sw" style={{ background: i === 0 ? 'var(--c1)' : 'var(--c2)' }} />
                      <b>{c === 'robot' ? 'Robot hút bụi' : 'Máy hút bụi cầm tay'}</b>
                    </div>
                    <div className="kv"><span>NMV</span><b>{ty(nmv)} tỷ</b></div>
                    <div className="kv"><span>GMV</span><b>{ty(gmv)} tỷ</b></div>
                    <div className="kv"><span>Số lượng</span><b>{n0(sl)} máy</b></div>
                    <div className="kv"><span>Cancel rate</span>
                      <b style={{ color: huy / sl > 0.4 ? 'var(--bad)' : 'inherit' }}>
                        {Math.round((huy / sl) * 1000) / 10}%
                      </b></div>
                    <div className="kv"><span>Giá bán TB</span><b>{n0(gmv / sl)}đ</b></div>
                  </div>
                )
              })}
            </section>

            <section>
              <h2>NMV hai ngành hàng theo {kyText}</h2>
              <p className="sub">Cột chồng, đơn vị tỷ đồng.</p>
              <StackBars
                data={(mode === 'mom' ? monthly : daily)
                  .reduce((acc: { ky: string; a: number; b: number }[], r) => {
                    const k = 'thang' in r ? (r as Monthly).thang : (r as Daily).ngay
                    let row = acc.find((x) => x.ky === k)
                    if (!row) { row = { ky: k, a: 0, b: 0 }; acc.push(row) }
                    if (r.category === 'robot') row.a += Number(r.nmv || 0)
                    else row.b += Number(r.nmv || 0)
                    return acc
                  }, [])
                  .sort((a, b) => a.ky.localeCompare(b.ky))
                  .slice(mode === 'mom' ? 0 : -30)}
                fmt={(v) => ty(v)} label={lbl} names={['Robot', 'Handheld']}
                colors={['var(--c1)', 'var(--c2)']}
                tipBody={(d) => <><b>{lbl(d.ky)}</b><br />Robot {ty(d.a)} tỷ · Handheld {ty(d.b)} tỷ</>}
              />
            </section>
          </>
        )}

        {/* =================== SKU =================== */}
        {tab === 'Theo SKU' && (
          <section>
            <h2>Hiệu quả từng SKU</h2>
            <p className="sub">Bấm vào tiêu đề cột để sắp xếp lại. Đang sắp theo <b>{String(sortKey)}</b>.</p>
            <div className="tablewrap">
              <table>
                <thead><tr>
                  <th>Model</th>
                  <Th k="so_luong" cur={sortKey} set={setSortKey}>Bán</Th>
                  <Th k="sl_hoan_tat" cur={sortKey} set={setSortKey}>Hoàn tất</Th>
                  <Th k="cancel_rate" cur={sortKey} set={setSortKey}>Huỷ %</Th>
                  <Th k="nmv" cur={sortKey} set={setSortKey}>NMV</Th>
                  <Th k="gia_ban_tb" cur={sortKey} set={setSortKey}>Giá bán TB</Th>
                  <Th k="gio_huy_trung_vi" cur={sortKey} set={setSortKey}>Huỷ sau</Th>
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
                      <td className="n" style={{ color: s.cancel_rate > 70 ? 'var(--bad)' : 'inherit' }}>{pct(s.cancel_rate)}</td>
                      <td className="n">{tr(s.nmv)}tr</td>
                      <td className="n">{n0(s.gia_ban_tb)}</td>
                      <td className="n">{s.gio_huy_trung_vi != null ? `${Math.round(s.gio_huy_trung_vi)}h` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
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
              <div className="rows">
                {skuF.slice(0, 14).map((s) => (
                  <div className="row" key={s.product_id}>
                    <div className="row-l" title={s.model}>{s.model}</div>
                    <div className="row-t">
                      <div className="row-f" style={{ width: `${s.pct_seller_disc}%`, background: 'var(--c1)' }} />
                      <div className="row-f" style={{ width: `${s.pct_platform_disc}%`, background: 'var(--c2)', marginLeft: 2 }} />
                    </div>
                    <div className="row-v">
                      <b>{pct(s.pct_seller_disc)}</b>
                      <span className="muted"> + {pct(s.pct_platform_disc)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="legend" style={{ marginTop: 14 }}>
                <span><i className="sw" style={{ background: 'var(--c1)' }} />Shop gánh</span>
                <span><i className="sw" style={{ background: 'var(--c2)' }} />Sàn gánh</span>
              </div>
            </section>

            <section>
              <h2>Tiền khuyến mãi theo {kyText}</h2>
              <p className="sub">Đơn vị tỷ đồng. Cột chồng: phần shop và phần sàn.</p>
              <StackBars
                data={shown.map((r) => ({ ky: r.ky, a: r.seller_disc ?? 0, b: r.platform_disc ?? 0 }))}
                fmt={(v) => ty(v)} label={lbl} names={['Shop gánh', 'Sàn gánh']}
                colors={['var(--c1)', 'var(--c2)']}
                tipBody={(d) => <><b>{lbl(d.ky)}</b><br />Shop {ty(d.a)} tỷ · Sàn {ty(d.b)} tỷ</>}
              />
            </section>
          </>
        )}

        {/* =================== HUỶ ĐƠN =================== */}
        {tab === 'Huỷ đơn' && (
          <>
            <section>
              <h2>Bao lâu sau khi đặt thì đơn bị huỷ</h2>
              <p className="sub">
                Hai cụm rõ rệt, và chúng là hai bài toán khác nhau — xem ghi chú bên dưới.
              </p>
              <Bars
                data={lapse.map((l) => ({ ky: l.khoang, v: l.so_luong }))}
                color="var(--c2)" fmt={n0} label={(k) => k}
                tipBody={(d) => {
                  const row = lapse.find((l) => l.khoang === d.ky)
                  return <><b>{d.ky}</b><br />{n0(d.v)} máy · {row?.pct}%</>
                }}
              />
              <div className="note hot">
                <b>Cụm thứ nhất — 30,8% huỷ trong vòng 1 giờ.</b> Đơn chết trước khi kịp đóng gói.
                Đây là khách đặt nhầm, đặt thử, hoặc hệ thống tự huỷ vì quá hạn thanh toán.
                Xử lý bằng luồng xác nhận đơn, không phải bằng vận chuyển.
                <br /><br />
                <b>Cụm thứ hai — 38,5% huỷ ở mốc 3–7 ngày.</b> Đúng cửa sổ giao hàng.
                Đây là đơn đã đi đường rồi khách từ chối nhận, khớp với lý do
                &ldquo;giao gói hàng thất bại&rdquo;. Tiền ship đã mất thật.
              </div>
            </section>

            <section>
              <h2>SKU huỷ nhiều nhất</h2>
              <p className="sub">Sắp theo tỷ lệ huỷ, chỉ lấy SKU bán từ 30 máy trở lên.</p>
              <div className="rows">
                {skuF.filter((s) => s.so_luong >= 30)
                  .slice()
                  .sort((a, b) => b.cancel_rate - a.cancel_rate)
                  .slice(0, 12)
                  .map((s) => (
                    <div className="row" key={s.product_id}>
                      <div className="row-l" title={s.model}>{s.model}</div>
                      <div className="row-t">
                        <div className="row-f" style={{
                          width: `${s.cancel_rate}%`,
                          background: s.cancel_rate > 70 ? 'var(--bad)' : 'var(--c2)',
                        }} />
                      </div>
                      <div className="row-v">{pct(s.cancel_rate)}
                        <span className="muted"> · {n0(s.so_luong)} máy</span></div>
                    </div>
                  ))}
              </div>
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
                const shipDot = ship.reduce((a, r) => a + Number(r.ship_dot_cho_don_huy || 0), 0)
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
              <h2>PnL theo tháng</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Tháng</th><th className="n">Giá niêm yết</th><th className="n">Shop giảm</th>
                    <th className="n">NMV</th><th className="n">Khách trả</th><th className="n">GMV mất do huỷ</th>
                  </tr></thead>
                  <tbody>
                    {pnl.filter((r) => Number(r.gia_niem_yet || 0) > 0).map((r) => (
                      <tr key={r.thang}>
                        <td className="k">{mmyy(r.thang)}</td>
                        <td className="n">{ty(r.gia_niem_yet)}</td>
                        <td className="n" style={{ color: 'var(--bad)' }}>−{ty(r.shop_giam_gia)}</td>
                        <td className="n"><b>{ty(r.nmv)}</b></td>
                        <td className="n">{ty(r.khach_tra)}</td>
                        <td className="n" style={{ color: 'var(--bad)' }}>{ty(r.gmv_mat_do_huy)}</td>
                      </tr>
                    ))}
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
  --c1:#2563A8;--c2:#C2620B;--ok:#1F7A4D;--bad:#C1121F;
  background:var(--ground);color:var(--ink);min-height:100vh;
  font-family:"Be Vietnam Pro",system-ui,-apple-system,sans-serif;
  max-width:1060px;margin:0 auto;padding:40px 20px 96px}
@media (prefers-color-scheme:dark){.wrap{--ground:#131215;--surface:#1B191D;--surface-2:#232025;
  --ink:#F2EFF1;--ink-2:#C6BEC6;--muted:#8F8691;--line:#312D33;--line-s:#453F47;
  --c1:#4E93DD;--c2:#C07E1E;--ok:#5FCB92;--bad:#FF6B7B}}
.wrap *{box-sizing:border-box}
.eyebrow{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 11px}
.wrap h1{font-size:32px;font-weight:700;letter-spacing:-.02em;margin:0}
.lede{color:var(--ink-2);margin:11px 0 0;font-size:15.5px;max-width:70ch}
.wrap section{margin-top:40px}
.wrap h2{font-size:18.5px;font-weight:600;letter-spacing:-.01em;margin:0}
.sub{color:var(--ink-2);margin:7px 0 0;font-size:14.5px;max-width:70ch}
.foot{color:var(--muted);font-size:12.5px;margin:8px 0 0}
.muted{color:var(--muted);font-weight:400}

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

.chart{display:flex;align-items:flex-end;gap:8px;height:215px;margin-top:20px;position:relative;
  padding-bottom:40px;border-bottom:1px solid var(--line)}
.col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;min-width:0;position:relative}
.bw{flex:1;display:flex;align-items:flex-end}
.bar{width:100%;border-radius:4px 4px 0 0;min-height:2px}
.stack{width:100%;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden}
.col:hover .bar,.col:hover .stack{opacity:.84}
.cv{font-size:11px;font-variant-numeric:tabular-nums;text-align:center;margin-top:5px;color:var(--ink-2)}
.cl{position:absolute;bottom:6px;font-size:10.5px;color:var(--muted);text-align:center;width:100%;left:0;
  line-height:1.3}

.legend{display:flex;gap:16px;margin-top:14px;font-size:13px;color:var(--ink-2);flex-wrap:wrap}
.legend span{display:inline-flex;align-items:center;gap:6px}
.sw{width:9px;height:9px;border-radius:2px;display:inline-block;flex:none}
.sw.sm{width:7px;height:7px;margin-right:7px}

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
.row-t{height:9px;background:var(--surface-2);border-radius:4px;overflow:hidden;display:flex}
.row-f{height:100%;border-radius:4px}
.row-v{font-variant-numeric:tabular-nums;white-space:nowrap;font-size:13px}
@media (max-width:640px){.row{grid-template-columns:1fr auto}.row-t{grid-column:1/-1}}

.tablewrap{overflow-x:auto;margin-top:18px;border:1px solid var(--line);border-radius:4px}
.wrap table{border-collapse:collapse;width:100%;min-width:680px;background:var(--surface);font-size:13.5px}
.wrap th,.wrap td{text-align:left;padding:10px 13px;border-bottom:1px solid var(--line)}
.wrap thead th{font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--muted);
  font-weight:500;background:var(--surface-2)}
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
  box-shadow:0 4px 14px rgba(0,0,0,.16);pointer-events:none;max-width:240px}

.note{margin-top:26px;padding:14px 16px;background:var(--surface-2);border:1px solid var(--line);
  border-left:2px solid var(--line-s);border-radius:3px;font-size:14px;color:var(--ink-2);line-height:1.6}
.note.warn{background:var(--surface-2);border-left-color:var(--c2)}
.note.hot{border-left-color:var(--bad)}
.note b{color:var(--ink)}
`
