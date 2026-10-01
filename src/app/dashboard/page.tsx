import { supabaseAdmin } from '@/lib/supabase'
import Dashboard, {
  type Monthly, type Daily, type Sku, type SkuPeriod,
  type Segment, type Ship,
  type CampTong, type CampMatrix, type HuyChiTiet, type HuyModel,
  type HanhTrinh, type TransitModel, type LiveOverview, type AdsObjective,
  type AdsVs, type AdsMonth, type AdsCampaign,
  type LiveDaily, type LiveMonth, type LiveRoomMonth, type LiveSession, type LiveLgm,
  type KenhMonth, type KenhDay, type KenhSku,
} from './Dashboard'

export const dynamic = 'force-dynamic'

/** PostgREST caps a single response (1000 rows by default) and several of
 *  these views are already past that. Page until a short page comes back. */
async function fetchAll<T>(db: ReturnType<typeof supabaseAdmin>, view: string): Promise<T[]> {
  const SIZE = 1000
  const out: T[] = []
  for (let page = 0; page < 25; page++) {
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
    const [m, d, s, sm, sd, seg, ship, av, am, ac, ld, lm, lr, ls, lg, kn, kd, ks, ct, cmx, hct, hm, ht, tm, lo, ao] = await Promise.all([
      fetchAll<Monthly>(db, 'v_perf_monthly'),
      fetchAll<Daily>(db, 'v_perf_daily'),
      fetchAll<Sku>(db, 'v_sku_perf'),
      fetchAll<SkuPeriod>(db, 'v_sku_monthly'),
      fetchAll<SkuPeriod>(db, 'v_sku_daily'),
      fetchAll<Segment>(db, 'v_segment_monthly'),
      fetchAll<Ship>(db, 'v_shipping_daily'),
      fetchAll<AdsVs>(db, 'v_ads_vs_sales_daily'),
      fetchAll<AdsMonth>(db, 'v_ads_perf_monthly'),
      fetchAll<AdsCampaign>(db, 'v_ads_campaign_monthly'),
      fetchAll<LiveDaily>(db, 'v_live_daily'),
      fetchAll<LiveMonth>(db, 'v_live_monthly'),
      fetchAll<LiveRoomMonth>(db, 'v_live_room_monthly'),
      fetchAll<LiveSession>(db, 'v_live_top_sessions'),
      fetchAll<LiveLgm>(db, 'v_live_lgm_daily'),
      fetchAll<KenhMonth>(db, 'v_kenh_monthly'),
      fetchAll<KenhDay>(db, 'v_kenh_daily'),
      fetchAll<KenhSku>(db, 'v_kenh_sku_monthly'),
      fetchAll<CampTong>(db, 'v_lapse_campaign_tong'),
      fetchAll<CampMatrix>(db, 'v_lapse_campaign_matrix'),
      fetchAll<HuyChiTiet>(db, 'v_huy_chi_tiet'),
      fetchAll<HuyModel>(db, 'v_huy_model'),
      fetchAll<HanhTrinh>(db, 'v_don_hanh_trinh'),
      fetchAll<TransitModel>(db, 'v_transit_model'),
      fetchAll<LiveOverview>(db, 'v_live_overview_daily'),
      fetchAll<AdsObjective>(db, 'v_ads_objective_monthly'),
    ])

    return (
      <Dashboard
        monthly={num(m)} daily={num(d)} sku={num(s)}
        skuMonthly={num(sm)} skuDaily={num(sd)}
        segMonthly={num(seg)} shipDaily={num(ship)}
        adsVs={num(av)} adsMonthly={num(am)} adsCampaigns={num(ac)}
        liveDaily={num(ld)} liveMonthly={num(lm)}
        liveRooms={num(lr)} liveSessions={num(ls)} liveLgm={num(lg)}
        kenhMonthly={num(kn)} kenhDaily={num(kd)} kenhSku={num(ks)}
        campTong={num(ct)} campMatrix={num(cmx)} huyChiTiet={num(hct)} huyModel={num(hm)}
        hanhTrinh={num(ht)} transitModel={num(tm)} liveOverview={num(lo)} adsObjective={num(ao)}
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
