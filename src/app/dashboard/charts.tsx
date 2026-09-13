'use client'

import { useState } from 'react'

/* ===================================================================
   Tầng biểu đồ dùng chung.

   Ba luật bố cục, rút ra từ lỗi đè chữ ở bản trước:
   1. Nhãn trục và giá trị đều nằm TRONG luồng, không dùng position:absolute.
      Đè chữ ở bản trước là do trộn hai cách định vị.
   2. Giá trị chỉ in trên đỉnh cột khi có ít hơn 15 cột. Nhiều hơn thì
      đọc bằng tooltip, ép in ra là chồng lên nhau.
   3. Nhãn trục tự thưa: nhiều cột thì chỉ in mỗi cột thứ n.
   =================================================================== */

export type Pt = { ky: string; v: number }
export type Pt2 = { ky: string; a: number; b: number }

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

/** Khung biểu đồ: đường lưới đỉnh có nhãn giá trị lớn nhất, và vạch đáy. */
function Frame({ max, fmt, children }: { max: number; fmt: (v: number) => string; children: React.ReactNode }) {
  return (
    <div className="cframe">
      <div className="gridline"><span>{fmt(max)}</span></div>
      <div className="gridline half"><span>{fmt(max / 2)}</span></div>
      {children}
    </div>
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
      <div className="legend">
        {names.map((nm, i) => (
          <span key={nm}><i className="sw" style={{ background: colors[i] }} />{nm}</span>
        ))}
        {unit && <span className="unit-inline">{unit}</span>}
      </div>
      <Frame max={max} fmt={fmt}>
        <div className="plot">
          {data.map((d, i) => {
            const tot = d.a + d.b
            return (
              <div className="col" key={d.ky} onMouseMove={move(tip(d))} onMouseLeave={out}>
                <div className="bwrap">
                  {showVal && <span className="bval">{fmt(tot)}</span>}
                  <div className="stack" style={{ height: `${(tot / max) * 100}%` }}>
                    <div className="sseg top" style={{ flexGrow: d.a, background: colors[0] }} />
                    <div className="gap" />
                    <div className="sseg" style={{ flexGrow: d.b, background: colors[1] }} />
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
