import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/** Ngưỡng KPI của team. Vượt là cảnh báo. */
const CANCEL_KPI = 40

type Kpi = {
  tong_don: number; don_huy: number; cancel_rate: number
  gmv_hoan_tat: number; aov: number; don_vi_sp: number
  tu_ngay: string; den_ngay: string
}
type Monthly = { thang: string; don: number; huy: number; cancel_rate: number; gmv: number; aov: number }
type Cod = { loai: string; don: number; huy: number; cancel_rate: number; aov: number }
type Reason = { ly_do: string; don: number; pct: number }
type Sku = { product_name: string; don_vi_ban: number; don_vi_hoan_tat: number; doanh_thu: number }

const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n))
const ty = (n: number) => (n / 1_000_000_000).toFixed(2) + ' tỷ'
const num = (n: number) => new Intl.NumberFormat('vi-VN').format(n)

export default async function Dashboard() {
  const db = supabaseAdmin()
  const [kpiRes, monthlyRes, codRes, reasonRes, skuRes] = await Promise.all([
    db.from('v_kpi').select('*').single(),
    db.from('v_monthly').select('*'),
    db.from('v_cod').select('*'),
    db.from('v_cancel_reasons').select('*').limit(7),
    db.from('v_top_sku').select('*').limit(8),
  ])

  const kpi = kpiRes.data as Kpi | null
  const monthly = (monthlyRes.data ?? []) as Monthly[]
  const cod = (codRes.data ?? []) as Cod[]
  const reasons = (reasonRes.data ?? []) as Reason[]
  const skus = (skuRes.data ?? []) as Sku[]

  if (!kpi) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-16">
        <h1 className="text-2xl font-semibold">Chưa có dữ liệu</h1>
        <p className="mt-2 text-sm opacity-70">Chạy đồng bộ đơn hàng trước đã.</p>
      </main>
    )
  }

  const maxCancel = Math.max(60, ...monthly.map((m) => Number(m.cancel_rate) || 0))
  const maxGmv = Math.max(1, ...monthly.map((m) => Number(m.gmv) || 0))
  const maxReason = Math.max(1, ...reasons.map((r) => r.don))
  const maxSku = Math.max(1, ...skus.map((s) => Number(s.doanh_thu) || 0))

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <main className="wrap">
        <header>
          <p className="eyebrow">Roborock Official VN · TikTok Shop</p>
          <h1>Đơn hàng</h1>
          <p className="lede">
            {num(kpi.tong_don)} đơn từ {kpi.tu_ngay} đến {kpi.den_ngay}. Tự cập nhật mỗi lần đồng bộ chạy.
          </p>
        </header>

        <section className="tiles">
          <Tile label="Tổng đơn" value={num(kpi.tong_don)} sub={`${num(kpi.don_vi_sp)} đơn vị sản phẩm`} />
          <Tile
            label="Cancel rate"
            value={`${kpi.cancel_rate}%`}
            sub={`${num(kpi.don_huy)} đơn huỷ · KPI ≤ ${CANCEL_KPI}%`}
            tone={Number(kpi.cancel_rate) > CANCEL_KPI ? 'bad' : 'good'}
          />
          <Tile label="GMV hoàn tất" value={ty(Number(kpi.gmv_hoan_tat))} sub="chỉ tính đơn COMPLETED" />
          <Tile label="AOV" value={vnd(Number(kpi.aov)) + 'đ'} sub="trung bình đơn hoàn tất" />
        </section>

        {/* ---- Cancel rate theo tháng ---- */}
        <section>
          <h2>Cancel rate theo tháng</h2>
          <p className="sub">Đường đứt là ngưỡng KPI {CANCEL_KPI}%. Cột đỏ là tháng vượt ngưỡng.</p>

          <div className="chart" style={{ ['--kpi' as string]: `${(1 - CANCEL_KPI / maxCancel) * 100}%` }}>
            <div className="kpi-line" aria-hidden="true">
              <span>{CANCEL_KPI}%</span>
            </div>
            {monthly.map((m) => {
              const v = Number(m.cancel_rate) || 0
              const over = v > CANCEL_KPI
              return (
                <div className="col" key={m.thang} title={`${m.thang}: ${v}% — ${num(m.huy)}/${num(m.don)} đơn`}>
                  <div className="bar-wrap">
                    <div
                      className="bar"
                      style={{ height: `${(v / maxCancel) * 100}%`, background: over ? 'var(--bad)' : 'var(--ok)' }}
                    />
                  </div>
                  <div className="val">{v}%</div>
                  <div className="lbl">{m.thang.slice(5)}/{m.thang.slice(2, 4)}</div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ---- GMV theo tháng ---- */}
        <section>
          <h2>GMV hoàn tất theo tháng</h2>
          <p className="sub">Chỉ đơn đã COMPLETED. Tháng gần nhất còn nhiều đơn đang giao nên sẽ thấp giả tạo.</p>

          <div className="chart">
            {monthly.map((m) => {
              const v = Number(m.gmv) || 0
              return (
                <div className="col" key={m.thang} title={`${m.thang}: ${vnd(v)}đ`}>
                  <div className="bar-wrap">
                    <div className="bar" style={{ height: `${(v / maxGmv) * 100}%`, background: 'var(--c1)' }} />
                  </div>
                  <div className="val">{v > 0 ? (v / 1_000_000_000).toFixed(1) : '—'}</div>
                  <div className="lbl">{m.thang.slice(5)}/{m.thang.slice(2, 4)}</div>
                </div>
              )
            })}
          </div>
          <p className="foot">Đơn vị: tỷ đồng</p>
        </section>

        {/* ---- COD vs trả trước ---- */}
        <section>
          <h2>COD so với trả trước</h2>
          <p className="sub">Hình thức thanh toán là yếu tố chi phối cancel rate mạnh nhất.</p>

          <div className="cards">
            {cod.map((c, i) => (
              <div className="card" key={c.loai}>
                <div className="card-head">
                  <span className="dot" style={{ background: i === 0 ? 'var(--c1)' : 'var(--c2)' }} />
                  <b>{c.loai}</b>
                  <span className="muted">{num(c.don)} đơn</span>
                </div>
                <div className="big">{c.cancel_rate}%</div>
                <div className="muted">cancel rate</div>
                <div className="track">
                  <div
                    className="fill"
                    style={{ width: `${c.cancel_rate}%`, background: i === 0 ? 'var(--c1)' : 'var(--c2)' }}
                  />
                </div>
                <div className="muted" style={{ marginTop: 10 }}>AOV {vnd(Number(c.aov))}đ</div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Lý do huỷ ---- */}
        <section>
          <h2>Vì sao đơn bị huỷ</h2>
          <p className="sub">Trên tổng {num(kpi.don_huy)} đơn đã huỷ.</p>

          <div className="rows">
            {reasons.map((r) => (
              <div className="row" key={r.ly_do}>
                <div className="row-lbl" title={r.ly_do}>{r.ly_do}</div>
                <div className="row-track">
                  <div className="row-fill" style={{ width: `${(r.don / maxReason) * 100}%` }} />
                </div>
                <div className="row-val">{num(r.don)}<span className="muted"> · {r.pct}%</span></div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Top SKU ---- */}
        <section>
          <h2>Sản phẩm theo doanh thu hoàn tất</h2>
          <p className="sub">
            Cột &ldquo;bán&rdquo; là số đơn vị đặt, &ldquo;hoàn tất&rdquo; là số thực sự giao thành công.
            Khoảng cách giữa hai cột chính là chỗ đang mất tiền.
          </p>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th className="n">Bán</th>
                  <th className="n">Hoàn tất</th>
                  <th className="n">Tỷ lệ</th>
                  <th className="n">Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {skus.map((s) => {
                  const rate = s.don_vi_ban ? Math.round((s.don_vi_hoan_tat / s.don_vi_ban) * 100) : 0
                  return (
                    <tr key={s.product_name}>
                      <td>
                        <div className="sku" title={s.product_name}>{shortName(s.product_name)}</div>
                        <div className="row-track thin">
                          <div
                            className="row-fill"
                            style={{ width: `${(Number(s.doanh_thu) / maxSku) * 100}%` }}
                          />
                        </div>
                      </td>
                      <td className="n">{num(s.don_vi_ban)}</td>
                      <td className="n">{num(s.don_vi_hoan_tat)}</td>
                      <td className="n" style={{ color: rate < 30 ? 'var(--bad)' : 'inherit' }}>{rate}%</td>
                      <td className="n">{(Number(s.doanh_thu) / 1_000_000).toFixed(0)}tr</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="note">
          <b>Đọc số cẩn thận.</b> Dữ liệu lấy theo <i>thời điểm cập nhật</i> đơn, nên các tháng cũ
          bị thiếu những đơn huỷ xong không còn được động tới — cancel rate của tháng cũ sẽ thấp giả tạo.
          Tháng đầy đủ nhất là các tháng gần đây. Trước khi mang số đi họp, đối chiếu một tháng
          với con số Seller Center báo để chốt chung một định nghĩa.
        </div>
      </main>
    </>
  )
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value" style={tone ? { color: tone === 'bad' ? 'var(--bad)' : 'var(--ok)' } : undefined}>
        {value}
      </div>
      <div className="tile-sub">{sub}</div>
    </div>
  )
}

/** Tên sản phẩm TikTok rất dài — cắt lấy phần nhận dạng được. */
function shortName(name: string) {
  const cut = name.split('|')[0].replace(/^\[[^\]]*\]\s*/, '').trim()
  return cut.length > 58 ? cut.slice(0, 58) + '…' : cut
}

const CSS = `
.wrap{--ground:#FBFAFA;--surface:#fff;--surface-2:#F3F1F2;--ink:#17151A;--ink-2:#4A444C;
  --muted:#7C737D;--line:#E3DFE1;--c1:#2563A8;--c2:#C2620B;--ok:#1F7A4D;--bad:#C1121F;
  background:var(--ground);color:var(--ink);min-height:100vh;
  font-family:"Be Vietnam Pro",system-ui,-apple-system,sans-serif;
  max-width:1000px;margin:0 auto;padding:44px 20px 96px}
@media (prefers-color-scheme:dark){.wrap{--ground:#131215;--surface:#1B191D;--surface-2:#232025;
  --ink:#F2EFF1;--ink-2:#C6BEC6;--muted:#8F8691;--line:#312D33;
  --c1:#4E93DD;--c2:#C07E1E;--ok:#5FCB92;--bad:#FF6B7B}}
.wrap *{box-sizing:border-box}
.eyebrow{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 12px}
.wrap h1{font-size:34px;font-weight:700;letter-spacing:-.02em;margin:0}
.lede{color:var(--ink-2);margin:12px 0 0;font-size:16px}
.wrap section{margin-top:48px}
.wrap h2{font-size:19px;font-weight:600;letter-spacing:-.01em;margin:0}
.sub{color:var(--ink-2);margin:8px 0 0;font-size:14.5px;max-width:66ch}
.foot{color:var(--muted);font-size:12.5px;margin:8px 0 0}
.muted{color:var(--muted);font-weight:400}

.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:4px;overflow:hidden;margin-top:32px}
.tile{background:var(--surface);padding:16px 18px}
.tile-label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.tile-value{font-size:28px;font-weight:650;letter-spacing:-.02em;margin-top:8px;font-variant-numeric:tabular-nums}
.tile-sub{font-size:12.5px;color:var(--muted);margin-top:4px;line-height:1.4}

.chart{display:flex;align-items:flex-end;gap:10px;height:210px;margin-top:22px;position:relative;
  padding-bottom:38px;border-bottom:1px solid var(--line)}
.kpi-line{position:absolute;left:0;right:0;top:var(--kpi);border-top:1px dashed var(--bad);opacity:.7}
.kpi-line span{position:absolute;right:0;top:-8px;font-size:10.5px;color:var(--bad);
  background:var(--ground);padding:0 4px}
.col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;min-width:0}
.bar-wrap{flex:1;display:flex;align-items:flex-end}
.bar{width:100%;border-radius:4px 4px 0 0;min-height:2px;transition:opacity .15s}
.col:hover .bar{opacity:.82}
.val{font-size:11.5px;font-variant-numeric:tabular-nums;text-align:center;margin-top:6px;color:var(--ink-2)}
.lbl{position:absolute;bottom:12px;font-size:11px;color:var(--muted);text-align:center;width:100%;left:0}
.col{position:relative}

.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:22px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:16px 18px}
.card-head{display:flex;align-items:center;gap:8px;font-size:14px}
.dot{width:9px;height:9px;border-radius:2px;flex:none}
.big{font-size:32px;font-weight:650;letter-spacing:-.02em;margin-top:12px;font-variant-numeric:tabular-nums}
.track{height:7px;background:var(--surface-2);border-radius:4px;overflow:hidden;margin-top:12px}
.fill{height:100%;border-radius:4px}

.rows{display:grid;gap:11px;margin-top:22px}
.row{display:grid;grid-template-columns:minmax(140px,1.3fr) 2fr auto;gap:14px;align-items:center;font-size:14px}
.row-lbl{color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row-track{height:9px;background:var(--surface-2);border-radius:4px;overflow:hidden}
.row-track.thin{height:5px;margin-top:6px}
.row-fill{height:100%;background:var(--c2);border-radius:4px}
.row-val{font-variant-numeric:tabular-nums;white-space:nowrap;font-size:13.5px}
@media (max-width:620px){.row{grid-template-columns:1fr auto;gap:8px}.row-track{grid-column:1/-1}}

.tablewrap{overflow-x:auto;margin-top:20px;border:1px solid var(--line);border-radius:4px}
.wrap table{border-collapse:collapse;width:100%;min-width:600px;background:var(--surface);font-size:14px}
.wrap th,.wrap td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:top}
.wrap thead th{font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--muted);
  font-weight:500;background:var(--surface-2)}
.wrap tbody tr:last-child td{border-bottom:0}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.sku{font-size:13.5px;line-height:1.4}

.note{margin-top:44px;padding:15px 17px;background:var(--surface-2);border:1px solid var(--line);
  border-left:2px solid var(--muted);border-radius:3px;font-size:14px;color:var(--ink-2);line-height:1.6}
.note b{color:var(--ink)}
`
