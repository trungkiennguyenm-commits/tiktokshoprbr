import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * Trang trạng thái: shop nào đã nối, token còn sống bao lâu, sync chạy lần cuối khi nào.
 * Đây là trang đầu tiên cần mở khi có gì đó không chạy.
 */
export default async function SyncStatusPage() {
  const db = supabaseAdmin()

  const [{ data: shops }, { data: connections }, { data: runs }] = await Promise.all([
    db.from('shops').select('id, name, tts_shop_id, region'),
    db.from('connections').select('shop_id, provider, status, access_expires_at, scope'),
    db
      .from('sync_runs')
      .select('resource, status, started_at, finished_at, records_written, error_message')
      .order('started_at', { ascending: false })
      .limit(20),
  ])

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Trạng thái hệ thống</h1>

      <Section title="Shop đã kết nối">
        {!shops?.length ? (
          <Empty>
            Chưa có shop nào. Bấm link authorize của app trong Partner Center để kết nối.
          </Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {shops.map((s) => (
              <li key={s.id}>
                <span className="font-medium">{s.name}</span>
                <span className="text-neutral-500"> · {s.region} · {s.tts_shop_id}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Token">
        {!connections?.length ? (
          <Empty>Chưa có kết nối nào.</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {connections.map((c) => {
              const expires = c.access_expires_at ? new Date(c.access_expires_at) : null
              const hoursLeft = expires
                ? Math.round((expires.getTime() - Date.now()) / 3_600_000)
                : null
              return (
                <li key={`${c.shop_id}-${c.provider}`}>
                  <span className="font-mono text-xs">{c.provider}</span>{' '}
                  <span
                    className={
                      c.status === 'active' ? 'text-green-700' : 'text-red-700'
                    }
                  >
                    {c.status}
                  </span>
                  {hoursLeft !== null && (
                    <span className="text-neutral-500">
                      {' '}· còn {hoursLeft} giờ
                    </span>
                  )}
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {c.scope || '(chưa ghi nhận quyền)'}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section title="20 lần sync gần nhất">
        {!runs?.length ? (
          <Empty>Chưa chạy sync lần nào.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="py-2 pr-3">Resource</th>
                  <th className="py-2 pr-3">Trạng thái</th>
                  <th className="py-2 pr-3">Bắt đầu</th>
                  <th className="py-2">Ghi</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr key={i} className="border-t border-neutral-200">
                    <td className="py-2 pr-3 font-mono text-xs">{r.resource}</td>
                    <td className="py-2 pr-3">
                      {r.status}
                      {r.error_message && (
                        <div className="text-xs text-red-700">{r.error_message}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-neutral-500">
                      {new Date(r.started_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-2 tabular-nums">{r.records_written}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-500">{children}</p>
}
