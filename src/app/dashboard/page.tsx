import { supabaseAdmin } from '@/lib/supabase'
import { fetchAll, num } from '@/lib/dashboard/tai'
import Dashboard, {
  type Monthly, type Daily, type Sku, type SkuPeriod,
  type Segment, type Ship,
  type CampTong, type CampMatrix,
  type HanhTrinh, type TransitModel, type LiveOverview, type AdsObjective, type AdsObjectiveDay,
  type HuyAffiliate,
  type AdsVs, type AdsMonth, type AdsCampaign,
  type LiveDaily, type LiveMonth, type LiveRoomMonth, type LiveSession, type LiveLgm,
  type KenhMonth, type KenhDay, type KenhSku,
} from './Dashboard'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const db = supabaseAdmin()

  try {
    const [m, d, s, sm, sd, seg, ship, av, am, ac, ld, lm, lr, ls, lg, kn, kd, ks, ct, cmx, ht, tm, lo, ao, aod, haf] = await Promise.all([
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
      fetchAll<HanhTrinh>(db, 'v_don_hanh_trinh'),
      fetchAll<TransitModel>(db, 'v_transit_model'),
      fetchAll<LiveOverview>(db, 'v_live_overview_daily'),
      fetchAll<AdsObjective>(db, 'v_ads_objective_monthly'),
      fetchAll<AdsObjectiveDay>(db, 'v_ads_objective_daily'),
      fetchAll<HuyAffiliate>(db, 'v_huy_affiliate'),
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
        campTong={num(ct)} campMatrix={num(cmx)}
        hanhTrinh={num(ht)} transitModel={num(tm)} liveOverview={num(lo)} adsObjective={num(ao)} adsObjectiveDay={num(aod)}
        huyAffiliate={num(haf)}
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
