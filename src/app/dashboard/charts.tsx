'use client'

import { useState } from 'react'

/* ===================================================================
   Tầng biểu đồ dùng chung.

   Ba luật bố cục, rút ra từ lỗi đè chữ:
   1. Nhãn trục và giá trị đều nằm TRONG luồng, không dùng position:absolute.
   2. Giá trị chỉ in trên đỉnh cột khi có ít hơn 15 cột. Nhiều hơn thì
      đọc bằng tooltip, ép in ra là chồng lên nhau.
   3. Nhãn trục tự thưa: nhiều cột thì chỉ in mỗi cột thứ n.
   Nhãn số của trục nằm trong lề trái/phải của khung, không đè lên cột.
   =================================================================== */

export type Pt = { ky: string; v: number }
export type Pt2 = { ky: string; a: number; b: number }
export type PtN = { ky: string; parts: number[] }
export type Line = { ten: string; color: string; vals: (number | null)[]; truc: 'tien' | 'pct' }

const step = (n: number) => Math.max(1, Math.ceil(n / 13))

function useTip() {
  const [t, setT] = useState<{ on: boolean; x: number; y: number; body: React.ReactNode }>({
    on: false, x: 0, y: 0, body: null,
  })
  return {
    t,
    move: (body: React.ReactNode) => (e: React.MouseEvent) =>
      setT({ on: true, x: e.clientX + 14, y: e.clientY - 8, body }),
    out: () => setT((p) => ({ ...p, on: false })),
  }
}

function TipBox({ t }: { t: { on: boolean; x: number; y: number; body: React.ReactNode } }) {
  if (!t.on) return null
  return <div className="tip" style={{ left: t.x, top: t.y }}>{t.body}</div>
}

/** Khung: lưới ở đỉnh và giữa. Nhãn số nằm trong lề, không đè lên cột. */
function Frame({ max, fmt, pctAxis, children }: {
  max: number; fmt: (v: number) => string; pctAxis?: boolean; children: React.ReactNode
}) {
  return (
    <div className="cframe">
      <div className="gridline">
        <span className="gl">{fmt(max)}</span>
        {pctAxis && <span className="gr">100%</span>}
      </div>
      <div className="gridline half">
        <span className="gl">{fmt(max / 2)}</span>
        {pctAxis && <span className="gr">50%</span>}
      </div>
      {children}
    </div>
  )
}

function Legend({ items, unit }: {
  items: { ten: string; color: string; duong?: boolean }[]; unit?: string
}) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.ten}>
          <i className={it.duong ? 'swl' : 'sw'} style={{ background: it.color }} />
          {it.ten}
        </span>
      ))}
      {unit && <span className="unit-inline">{unit}</span>}
    </div>
  )
}

/** Đường kẻ phủ lên vùng cột. Trục % cố định 0–100 để không bịa ra
    những điểm cắt nhau giả do thang đo tự co giãn. */
function Lines({ lines, max, n }: { lines: Line[]; max: number; n: number }) {
  if (!n) return null
  const x = (i: number) => ((i + 0.5) / n) * 100
  const y = (v: number, truc: Line['truc']) =>
    100 - (truc === 'pct' ? Math.min(100, Math.max(0, v)) : (v / max) * 100)

  return (
    <svg className="lines" viewBox="0 0 100 100" preserveAspectRatio="none">
      {lines.map((ln) => (
        <polyline
          key={ln.ten}
          points={ln.vals
            .map((v, i) => (v == null ? null : `${x(i)},${y(v, ln.truc)}`))
            .filter(Boolean)
            .join(' ')}
          fill="none" stroke={ln.color} strokeWidth={2}
          vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

/* ------------------------------ cột đơn ------------------------------ */

export function BarChart({ data, color, fmt, label, tip, unit }: {
  data: Pt[]
  color: string
  fmt: (v: number) => string
  label: (k: string) => string
  tip: (d: Pt) => React.ReactNode
  unit?: string
}) {
  const { t, move, out } = useTip()
  const max = Math.max(1, ...data.map((d) => d.v))
  const sk = step(data.length)
  const showVal = data.length <= 14

  return (
    <>
      {unit && <p className="unit">{unit}</p>}
      <Frame max={max} fmt={fmt}>
        <div className="plot">
          {data.map((d, i) => (
            <div className="col" key={d.ky} onMouseMove={move(tip(d))} onMouseLeave={out}>
              <div className="bwrap">
                {showVal && <span className="bval">{fmt(d.v)}</span>}
                <div className="bar" style={{ height: `${(d.v / max) * 100}%`, background: color }} />
              </div>
              <div className="xlab">{i % sk === 0 ? label(d.ky) : ''}</div>
            </div>
          ))}
        </div>
      </Frame>
      <TipBox t={t} />
    </>
  )
}

/* ------------------------- cột chồng hai chuỗi ------------------------- */

export function StackChart({ data, fmt, label, names, colors, tip, unit }: {
  data: Pt2[]
  fmt: (v: number) => string
  label: (k: string) => string
  names: [string, string]
  colors: [string, string]
  tip: (d: Pt2) => React.ReactNode
  unit?: string
}) {
  const { t, move, out } = useTip()
  const max = Math.max(1, ...data.map((d) => d.a + d.b))
  const sk = step(data.length)
  const showVal = data.length <= 14

  return (
    <>
      <Legend items={[{ ten: names[0], color: colors[0] }, { ten: names[1], color: colors[1] }]} unit={unit} />
      <Frame max={max} fmt={fmt}>
        <div className="plot">
          {data.map((d, i) => {
            const tot = d.a + d.b
            return (
              <div className="col" key={d.ky} onMouseMove={move(tip(d))} onMouseLeave={out}>
                <div className="bwrap">
                  {showVal && <span className="bval">{fmt(tot)}</span>}
                  <div className="stack" style={{ height: `${(tot / max) * 100}%` }}>
                    <div className="sseg top" style={{ flexGrow: d.b, background: colors[1] }} />
                    <div className="gap" />
                    <div className="sseg" style={{ flexGrow: d.a, background: colors[0] }} />
                  </div>
                </div>
                <div className="xlab">{i % sk === 0 ? label(d.ky) : ''}</div>
              </div>
            )
          })}
        </div>
      </Frame>
      <TipBox t={t} />
    </>
  )
}

/* --------------------- cột chồng n chuỗi (theo model) --------------------- */

export function MultiStack({ data, series, fmt, label, tip, unit }: {
  data: PtN[]
  series: { ten: string; color: string }[]
  fmt: (v: number) => string
  label: (k: string) => string
  tip: (d: PtN) => React.ReactNode
  unit?: string
}) {
  const { t, move, out } = useTip()
  const totals = data.map((d) => d.parts.reduce((s, v) => s + (v || 0), 0))
  const max = Math.max(1, ...totals)
  const sk = step(data.length)
  const showVal = data.length <= 14

  return (
    <>
      <Legend items={series} unit={unit} />
      <Frame max={max} fmt={fmt}>
        <div className="plot">
          {data.map((d, i) => (
            <div className="col" key={d.ky} onMouseMove={move(tip(d))} onMouseLeave={out}>
              <div className="bwrap">
                {showVal && <span className="bval">{fmt(totals[i])}</span>}
                <div className="stack" style={{ height: `${(totals[i] / max) * 100}%` }}>
                  {series.map((s, j) => ({ s, v: d.parts[j] || 0 }))
                    .filter((x) => x.v > 0)
                    .reverse()
                    .map((x, k) => (
                      <div key={x.s.ten} className={`sseg${k === 0 ? ' top' : ''}`}
                        style={{ flexGrow: x.v, background: x.s.color, borderTop: '1px solid var(--surface)' }} />
                    ))}
                </div>
              </div>
              <div className="xlab">{i % sk === 0 ? label(d.ky) : ''}</div>
            </div>
          ))}
        </div>
      </Frame>
      <TipBox t={t} />
    </>
  )
}

/* ------------------ cột chồng + đường (combo) ------------------ */

export function ComboChart({ data, names, colors, lines, fmt, label, tip, unit }: {
  data: Pt2[]
  names: [string, string]
  colors: [string, string]
  lines: Line[]
  fmt: (v: number) => string
  label: (k: string) => string
  tip: (d: Pt2, i: number) => React.ReactNode
  unit?: string
}) {
  const { t, move, out } = useTip()
  const max = Math.max(
    1,
    ...data.map((d) => d.a + d.b),
    ...lines.filter((l) => l.truc === 'tien').flatMap((l) => l.vals.map((v) => v ?? 0)),
  )
  const sk = step(data.length)
  const hasPct = lines.some((l) => l.truc === 'pct')

  return (
    <>
      <Legend
        items={[
          { ten: names[0], color: colors[0] },
          { ten: names[1], color: colors[1] },
          ...lines.map((l) => ({ ten: l.ten, color: l.color, duong: true })),
        ]}
        unit={unit}
      />
      <Frame max={max} fmt={fmt} pctAxis={hasPct}>
        <div className="plot">
          <Lines lines={lines} max={max} n={data.length} />
          {data.map((d, i) => {
            const tot = d.a + d.b
            return (
              <div className="col" key={d.ky} onMouseMove={move(tip(d, i))} onMouseLeave={out}>
                <div className="bwrap">
                  <div className="stack" style={{ height: `${(tot / max) * 100}%` }}>
                    <div className="sseg top" style={{ flexGrow: d.b, background: colors[1] }} />
                    <div className="gap" />
                    <div className="sseg" style={{ flexGrow: d.a, background: colors[0] }} />
                  </div>
                </div>
                <div className="xlab">{i % sk === 0 ? label(d.ky) : ''}</div>
              </div>
            )
          })}
        </div>
      </Frame>
      <TipBox t={t} />
    </>
  )
}

/* --------------------- cột + biến động so với kỳ trước --------------------- */

export function DeltaChart({ data, color, fmt, label, tip, unit }: {
  data: Pt[]
  color: string
  fmt: (v: number) => string
  label: (k: string) => string
  tip: (d: Pt, delta: number | null) => React.ReactNode
  unit?: string
}) {
  const { t, move, out } = useTip()
  const max = Math.max(1, ...data.map((d) => d.v))
  const sk = step(data.length)

  const deltas = data.map((d, i) => {
    if (i === 0) return null
    const prev = data[i - 1].v
    if (!prev) return null
    return Math.round(((d.v - prev) / prev) * 1000) / 10
  })

  return (
    <>
      {unit && <p className="unit">{unit}</p>}
      <Frame max={max} fmt={fmt}>
        <div className="plot">
          {data.map((d, i) => {
            const dl = deltas[i]
            return (
              <div className="col" key={d.ky} onMouseMove={move(tip(d, dl))} onMouseLeave={out}>
                <div className="bwrap">
                  <div className="bar" style={{ height: `${(d.v / max) * 100}%`, background: color }} />
                </div>
                <div className={`dod ${dl == null ? '' : dl >= 0 ? 'up' : 'down'}`}>
                  {dl == null ? '·' : `${dl >= 0 ? '▲' : '▼'}${Math.abs(dl) >= 100 ? Math.round(Math.abs(dl)) : Math.abs(dl)}`}
                </div>
                <div className="xlab">{i % sk === 0 ? label(d.ky) : ''}</div>
              </div>
            )
          })}
        </div>
      </Frame>
      <TipBox t={t} />
    </>
  )
}

/* ------------------------------ thanh ngang ------------------------------ */

export function RowBars({ rows }: {
  rows: { nhan: string; segs: { v: number; color: string; ten: string }[]; phu?: string }[]
}) {
  const { t, move, out } = useTip()
  const max = Math.max(1, ...rows.map((r) => r.segs.reduce((s, g) => s + g.v, 0)))
  return (
    <>
      <div className="rows">
        {rows.map((r) => (
          <div className="row" key={r.nhan}>
            <div className="row-l" title={r.nhan}>{r.nhan}</div>
            <div
              className="row-t"
              onMouseMove={move(
                <><b>{r.nhan}</b><br />
                  {r.segs.map((g) => <span key={g.ten}>{g.ten}: {g.v}<br /></span>)}</>,
              )}
              onMouseLeave={out}
            >
              {r.segs.map((g, i) => (
                <div key={g.ten} style={{
                  width: `${(g.v / max) * 100}%`, background: g.color,
                  marginLeft: i ? 2 : 0, borderRadius: 4, height: '100%',
                }} />
              ))}
            </div>
            <div className="row-v">{r.phu}</div>
          </div>
        ))}
      </div>
      <TipBox t={t} />
    </>
  )
}
