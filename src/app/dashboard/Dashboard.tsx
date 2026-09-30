'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
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
/** Ba view phân tích huỷ theo NGÀY CAMPAIGN. Cách chia ngày nằm trong hàm
 *  f_loai_ngay() ở Postgres, không nằm ở đây — sửa taxonomy thì sửa view. */
export type CampTong = {
  ngay: string; category: string; loai_ngay: string; thu_tu_ngay: number
  tong_item: number; so_huy: number; nmv_dat: number; nmv_huy: number
}
/** v_huy_chi_tiet — một dòng cho mỗi tổ hợp (ngày đặt, category, mốc thời gian
 *  tới lúc huỷ, đã lấy hàng chưa, nhóm lý do). sau_lay lấy từ collection_time
 *  của TikTok: có collection_time nghĩa là shipper đã lấy hàng rồi. */
export type HuyChiTiet = {
  ngay: string; category: string; loai_ngay: string; thu_tu_ngay: number
  khoang: string; thu_tu: number; sau_lay: boolean
  ly_do: string; thu_tu_ly_do: number; nguoi_huy: string
  so_luong: number; nmv_huy: number; gio_tong: number; sl_co_gio: number
  gio_tu_luc_lay: number | null; sl_co_lay: number
}
/** v_live_overview_daily — tổng quan live cấp SHOP từ endpoint 202609.
 *  `shows` là số SUY RA từ show_gpm, không phải số TikTok trả thẳng. */
export type LiveOverview = {
  ngay: string
  views: number | null; shows: number | null; show_gpm: number | null
  live_attributed_gmv: number | null; live_gmv: number | null
  live_indirect_gmv: number | null
  sku_orders: number | null; items_sold: number | null
  live_ctr: number | null; ctor_sku_order: number | null
  avg_viewing_duration: number | null
  tap_through: number | null; pct_gian_tiep: number | null
}
/** v_don_hanh_trinh — mốc thời gian của một đơn, theo kết cục.
 *  thang null = toàn kỳ, category null = gộp hai ngành. Trung vị không cộng
 *  được nên DB tính sẵn từng tổ hợp; giao diện chỉ nhặt đúng dòng. */
export type HanhTrinh = {
  thang: string | null; category: string | null; ket_cuc: string
  so_don: number
  lay_tv: number | null; lay_tb: number | null
  giao_tv: number | null; giao_tb: number | null
  huy_tv: number | null; huy_tb: number | null
  transit_p25: number | null; transit_tv: number | null
  transit_p75: number | null; transit_tb: number | null
}
/** v_transit_model — số giờ hàng nằm ngoài kho trước khi đơn bị huỷ. */
export type TransitModel = {
  thang: string | null; category: string | null; model: string
  so_don: number; transit_tv: number | null; transit_tb: number | null
}
/** v_huy_model — huỷ theo model, tách trước/sau khi shipper lấy hàng. */
export type HuyModel = {
  ngay: string; category: string; model: string
  tong_item: number; huy: number; huy_instant: number
  huy_truoc: number; huy_sau: number
  nmv_dat: number; nmv_huy_sau: number; nmv_huy_truoc: number
}
export type CampMatrix = {
  ngay: string; category: string
  dat_loai: string; dat_thu_tu: number; huy_loai: string; huy_thu_tu: number
  so_luong: number; nmv_huy: number
}
export type Ship = {
  ngay: string; so_don: number; phi_ship_goc: number; phi_ship_khach_tra: number
  shop_tro_gia_ship: number; san_tro_gia_ship: number; ship_dot_cho_don_huy: number
}

/* ---- quảng cáo ----
   cost_vnd đã quy đổi theo tỷ giá trong app_settings (USD account), cột
   nguyên tệ vẫn giữ trong database để đối chiếu hoá đơn TikTok.

   gross_revenue và orders là CON SỐ CỦA TIKTOK, do TikTok tự quy kết cho
   quảng cáo. Chúng KHÔNG so sánh trực tiếp được với Seller GMV/NMV: đây là
   doanh thu gộp trước huỷ, và một đơn có thể được nhiều campaign cùng nhận
   công. Tháng 9/2026: TikTok báo 4.703 đơn trong khi cả shop chỉ có 2.350 —
   chênh lệch đó là do quy kết trùng, không phải dữ liệu sai. */
export type AdsVs = {
  ngay: string
  ads_cost_vnd: number; lgm_vnd: number; pgm_vnd: number; cads_vnd: number
  tiktok_revenue_vnd: number; ads_orders: number
  gmv: number; nmv: number; net_pcs: number
  ads_pct_nmv: number | null; nmv_per_ad_dong: number | null
  /** Quy đổi sẵn trong view theo app_settings.fx_usd_vnd — tab Advertising
   *  hiển thị USD vì ngân sách quảng cáo được duyệt bằng USD. */
  ads_cost_usd: number; lgm_usd: number; pgm_usd: number; cads_usd: number
  gmv_usd: number; nmv_usd: number
}
export type AdsMonth = {
  thang: string; promotion_type: string
  cost_vnd: number; net_cost_vnd: number; gross_revenue_vnd: number
  orders: number; campaigns: number; cost_usd: number
}
export type AdsCampaign = {
  thang: string; campaign_id: string; campaign_name: string
  promotion_type: string; advertiser_name: string | null
  koc_handle: string | null; model_hint: string | null; room_hint: string | null
  cost_vnd: number; gross_revenue_vnd: number; orders: number; roas: number | null
  cost_usd: number
}

/* ---- livestream ---- */
type LiveBase = {
  phien: number; gio_live: number; gmv: number; pcs: number
  don: number; don_tao: number; khach: number; sp_len: number; sp_ban: number
  views: number; viewers: number; likes: number; comments: number; shares: number
  followers: number; impressions: number; clicks: number; xem_tb_giay: number
}
export type LiveDaily = LiveBase & { ngay: string; nhom: string; so_phong: number }
export type LiveMonth = LiveBase & { thang: string; nhom: string; so_phong: number; so_ngay: number }
export type LiveRoomMonth = LiveBase & {
  thang: string; username: string; ten: string; nhom: string
}
/** Chi tiêu LIVE GMV Max quy về từng phòng, theo ngày. Phòng được suỹ ra từ
 *  tên campaign — RV/Robovac/Official VN → Official, HV/Handvac/Shop VN → Máy
 *  lau sàn, HE/Lifestyle → Lifestyle. Quy ước này do Kiên xác nhận, nó phụ
 *  thuộc vào cách đặt tên campaign: đổi quy ước đặt tên là phải sửa view
 *  v_live_lgm_daily. */
export type LiveLgm = { ten: string; ngay: string; lgm_vnd: number }

/** Hiệu quả theo kênh bán, theo tháng. `kenh` là tên phòng live, 'Creator live',
 *  'Ngoài live' hoặc 'Live (không rõ phòng)'. `phu_song` là % line item của
 *  tháng đó có room_id — dưới ngưỡng thì cách chia kênh không đáng tin. */
export type KenhMonth = {
  thang: string; kenh: string; phu_song: number
  so_luong: number; sl_chua_huy: number; sl_huy: number; cancel_rate: number
  gmv: number; nmv: number; khach_tra: number
  seller_disc_chua_huy: number; platform_disc_chua_huy: number
  pcs_robot: number; pcs_handheld: number
}

export type KenhDay = {
  ngay: string; kenh: string; phu_song: number
  so_luong: number; sl_chua_huy: number; sl_huy: number; cancel_rate: number
  gmv: number; nmv: number; pcs_robot: number; pcs_handheld: number
}

/** Sản phẩm × kênh bán × tháng. */
export type KenhSku = {
  thang: string; kenh: string; model: string; category: string; phu_song: number
  so_luong: number; sl_chua_huy: number; sl_huy: number; cancel_rate: number
  gmv: number; nmv: number
}

export type LiveSession = {
  session_id: string; ngay: string; username: string; ten: string; nhom: string
  title: string | null; duration_phut: number; gmv: number; items_sold: number
  sku_orders: number; created_sku_orders: number; customers: number
  views: number; viewers: number; likes: number
  comments: number; shares: number; new_followers: number
  product_impressions: number; product_clicks: number; avg_viewing_duration: number
}

type Props = {
  monthly: Monthly[]; daily: Daily[]; sku: Sku[]
  skuMonthly: SkuPeriod[]; skuDaily: SkuPeriod[]
  segMonthly: Segment[]; shipDaily: Ship[]
  adsVs: AdsVs[]; adsMonthly: AdsMonth[]; adsCampaigns: AdsCampaign[]
  liveDaily: LiveDaily[]; liveMonthly: LiveMonth[]
  liveRooms: LiveRoomMonth[]; liveSessions: LiveSession[]; liveLgm: LiveLgm[]
  kenhMonthly: KenhMonth[]; kenhDaily: KenhDay[]; kenhSku: KenhSku[]
  campTong: CampTong[]; campMatrix: CampMatrix[]; huyChiTiet: HuyChiTiet[]
  huyModel: HuyModel[]; hanhTrinh: HanhTrinh[]; transitModel: TransitModel[]
  liveOverview: LiveOverview[]
}

/* ============================== helpers ============================== */

const n0 = (v: number) => new Intl.NumberFormat('en-US').format(Math.round(v || 0))
const bn = (v: number) => ((v || 0) / 1e9).toFixed(2)
/** Số giờ -> chuỗi dễ đọc. Dưới 48h vẫn để theo giờ vì đó là thang mà
 *  người vận hành nghĩ; từ 48h trở lên đổi sang ngày cho đỡ phải nhẩm. */
const gioNgay = (h: number) => (h < 1 ? `${Math.round(h * 60)} min`
  : h < 48 ? `${Math.round(h * 10) / 10}h`
    : `${Math.round((h / 24) * 10) / 10} days`)
const mn = (v: number) => ((v || 0) / 1e6).toFixed(0)
/** Triệu VND, một chữ số lẻ. Dùng cho các tỷ suất nhỏ — GMV trên 1.000
 *  lượt xem hay GMV mỗi giờ live rơi vào vài triệu, in ra theo tỷ thì
 *  cả cột thành 0.00. */
const mn1 = (v: number) => ((v || 0) / 1e6).toFixed(1)
/** USD hai chữ số thập phân — tab Advertising chạy bằng đô, vì ngân sách
 *  quảng cáo được duyệt và báo cáo bằng đô. */
const usd = (v: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(v || 0)
/** Một chữ số lẻ. Làm tròn ngay ở đây vì có chỗ truyền vào số thực chưa
 *  làm tròn (tỷ trọng cộng từ nhiều nhóm), in thẳng ra thành 44.5652...% */
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 10) / 10}%`)
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

/* ============================ điều hướng ============================
   Dashboard chia làm 7 phần đánh số, cộng Glossary để tra cứu. Mỗi phần
   liệt kê sẵn các khối bên trong kèm số hiệu (4.4, 5.2…) để trong họp chỉ
   cần gọi số là mọi người mở đúng chỗ.

   Thứ tự nhãn ở đây PHẢI khớp thứ tự khối trong JSX — có kiểm tra tự động
   bên dưới, lệch là hiện cảnh báo ngay trên thanh điều hướng.
   ==================================================================== */

const SECTIONS = [
  {
    id: 'Summary', ten: 'Summary',
    groups: [
      { ten: '', subs: ['At a glance'] },
      { ten: 'Month over month', ghi: 'this sheet is MoM — day by day lives on Sales',
        subs: ['GMV, NMV, cancellations', 'NMV, ads and ATR', 'LGM vs PGM', 'Headline table'] },
      { ten: 'Channels', ghi: 'Official VN, Handheld, Lifestyle', subs: ['By channel'] },
    ],
  },
  {
    id: 'Sales', ten: 'Sales',
    groups: [
      { ten: 'Totals', ghi: 'whole filtered range', subs: ['Range totals', 'GMV, NMV, cancellations'] },
      { ten: 'Daily', ghi: 'DoD, regardless of the toggle', subs: ['NMV, ads and ATR', 'LGM vs PGM'] },
      { ten: 'Subsidy', subs: ['Valid subsidy vs NMV'] },
      { ten: 'By period', ghi: 'follows the DoD / MoM toggle',
        subs: ['Seller NMV', 'Net quantity', 'Robot vs handheld', 'Detail table'] },
    ],
  },
  {
    id: 'Products', ten: 'Products',
    groups: [
      { ten: 'Category', ghi: 'robot vs handheld',
        subs: ['Cards', 'Seller NMV', 'Cancellation rate', 'Detail table'] },
      { ten: 'Price band', subs: ['Net quantity', 'Cancellation rate'] },
      { ten: 'Models', subs: ['Gross vs net', 'By month', 'Model mix', 'Top models',
        'Full table'] },
    ],
  },
  {
    id: 'Advertising', ten: 'Advertising',
    groups: [
      { ten: 'Daily', ghi: 'DoD', subs: ['Spend and ATR', 'Spend vs Seller NMV', 'Day by day'] },
      { ten: 'Monthly', ghi: 'MoM', subs: ['NMV, ads and ATR', 'LGM vs PGM', 'Spend by month'] },
      { ten: 'Campaigns', ghi: 'TikTok ads reporting', subs: ['Ranking'] },
    ],
  },
  {
    id: 'Livestream', ten: 'Livestream',
    groups: [
      { ten: '', subs: ['Key numbers', 'Daily overview'] },
      { ten: 'Our revenue', ghi: 'from orders, net of cancellations',
        subs: ['Revenue by room', 'Products by room', 'Hours and schedule'] },
      { ten: 'Top of funnel', ghi: 'shop level — feed impressions, TikTok attribution',
        subs: ['Feed into the room'] },
      { ten: 'Room performance', ghi: 'from TikTok live reporting, gross GMV',
        subs: ['Rooms side by side', 'Traffic and engagement', 'Funnel'] },
      { ten: 'Day by day', ghi: 'TikTok live',
        subs: ['Room by period', 'Audience', 'Conversion', 'Engagement vs CTR'] },
      { ten: 'Detail', subs: ['Top sessions', 'Creator rooms'] },
    ],
  },
  {
    id: 'Discounts', ten: 'Discounts',
    groups: [
      { ten: '', subs: ['Key numbers'] },
      { ten: 'Daily', ghi: 'DoD',
        subs: ['Booked vs kept', 'Customer vs platform', 'Daily detail',
        'Valid subsidy by model', 'Funding split by model', 'Discount spend', 'Discount rates',
        'Detail by model'] },
      { ten: 'Monthly', ghi: 'MoM', subs: ['Overview', 'Funding split', 'NMV composition', 'Booked vs kept'] },
      { ten: 'Price band', subs: ['Valid subsidy', 'Voucher placement'] },
    ],
  },
  {
    id: 'Cancellations', ten: 'Cancellations',
    groups: [
      { ten: '', subs: ['Key numbers', 'Journey of an order', 'Rate per period'] },
      { ten: 'When they die', ghi: 'and what each one costs',
        subs: ['Time to cancel', 'Before or after pickup'] },
      { ten: 'Why they die', subs: ['Reason mix'] },
      { ten: 'Where in the month', ghi: 'sale calendar',
        subs: ['Across the month', 'Reason by campaign day', 'Order day vs cancel day'] },
      { ten: 'Which products',
        subs: ['By model', 'Worst models', 'Before vs after pickup', 'Detail table'] },
    ],
  },
  {
    id: 'P&L', ten: 'P&L',
    groups: [
      { ten: 'Per unit', ghi: 'platform fees appear only on this sheet',
        subs: ['List price to cash', 'What erodes NMV'] },
      { ten: 'Month by month', subs: ['P&L by month'] },
    ],
  },
  { id: 'Glossary', ten: 'Glossary', groups: [] },
] as const

type Sec = (typeof SECTIONS)[number]['id']

/** Số hiệu của phần, ví dụ Products là 3. Glossary không đánh số. */
const secNo = (id: Sec) => {
  const i = SECTIONS.findIndex((s) => s.id === id)
  return id === 'Glossary' ? null : i + 1
}

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
        ten: 'Collected / after pickup',
        dinh_nghia: 'Whether the courier had already taken the parcel when the order was cancelled.',
        ct: 'TikTok\u2019s collection_time is present on the order',
        ghi_chu: 'This is what decides the cost. Before pickup the loss is the sale. After pickup it is also outbound shipping, packing, the return leg and the restock, plus the days the unit spends unsellable in transit. The boundary sits almost exactly at 48 hours of cancel lapse.',
        canh_bao: true,
      },
      {
        ten: 'Campaign day',
        dinh_nghia: 'Where a date sits in that month\u2019s sale calendar.',
        ct: 'DDAY = double date (4/4, 5/5 \u2026 9/9) \u00b7 D-3\u2026D-1 before it \u00b7 D+1\u2026D+3 after it \u00b7 MMS = 14\u201315 \u00b7 Payday = 24\u201325 \u00b7 BAU = the rest',
        ghi_chu: 'D+1\u2026D+3 is not a TikTok label \u2014 it is ours, added because the question is what happens to orders AFTER a campaign ends. When a D+ day collides with MMS (December, November), D+ wins.',
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
    nhom: 'Advertising',
    mo_ta: 'Ad spend is money we paid, so it can sit beside Seller NMV. Anything TikTok attributes to its own ads cannot.',
    terms: [
      {
        ten: 'ATR — ad take rate',
        dinh_nghia: 'Share of recognised revenue eaten by advertising.',
        ct: 'Total ad spend ÷ Seller NMV',
        ghi_chu: 'Both sides are real money: spend we were billed for, revenue on orders that were not cancelled. This is the number to bring to a budget conversation. It is NOT ROAS — the denominator is all sales, including organic.',
      },
      {
        ten: 'LGM / PGM',
        dinh_nghia: 'The two GMV Max campaign types on TikTok Shop: LIVE GMV Max runs against a livestream, Product GMV Max against a product listing.',
        ghi_chu: 'TikTok calls them LIVE_GMV_MAX and PRODUCT_GMV_MAX. They live in a separate reporting endpoint from ordinary auction ads, keyed on the shop rather than the ad account.',
      },
      {
        ten: 'C-Ads',
        dinh_nghia: 'Consideration and branding campaigns bought through the ordinary ad auction.',
        ghi_chu: 'No sales attribution at all, by design — they are bought for reach, not orders. Small in money next to GMV Max.',
      },
      {
        ten: 'TikTok ROAS',
        dinh_nghia: "TikTok's own return figure: the revenue it attributes to a campaign divided by that campaign's spend.",
        ghi_chu: 'Kept only in the campaign table, and only for ranking campaigns against each other. It counts accessories as orders, counts revenue before cancellations, and lets several campaigns claim the same order. In Sep 2026 it reported 4,703 orders against 2,350 machine orders in the shop.',
        canh_bao: true,
      },
      {
        ten: 'Ad spend in VND',
        dinh_nghia: 'Spend from USD ad accounts converted at a single fixed rate.',
        ghi_chu: 'The rate lives in app_settings.fx_usd_vnd so it can be changed without a deploy. The original currency is kept in the database for reconciling TikTok invoices. Comparisons across distant months carry whatever error the fixed rate introduces.',
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

/** Các chỉ số so sánh được giữa ba phòng live. Một nơi khai báo, hai lưới dùng
 *  chung — thêm một dòng ở đây là cả hai lưới có thêm lựa chọn. */
type LiveAgg = {
  lgm: number; gmv: number; pcs: number; don: number; donTao: number; khach: number
  views: number; viewers: number; likes: number; comments: number; shares: number
  followers: number; imp: number; clicks: number; gio: number; xemW: number; phien: number
}
type RoomMetric = 'gmv' | 'gpm' | 'views' | 'ctr' | 'gio' | 'watch' | 'pcs' | 'engage'
  | 'lgm' | 'roas' | 'atr'
const ROOM_METRICS: {
  id: RoomMetric; ten: string; don_vi: string
  /** Cao là xấu — ATR càng cao càng tốn, tô nhiệt ngược lại. */
  xau_cao?: boolean
  lay: (a: LiveAgg) => number | null
  fmt: (v: number) => string
}[] = [
  { id: 'gmv', ten: 'GMV', don_vi: 'VND bn',
    lay: (a) => a.gmv || null, fmt: (v) => ((v || 0) / 1e9).toFixed(2) },
  { id: 'lgm', ten: 'LGM spend', don_vi: 'VND mn',
    lay: (a) => a.lgm || null, fmt: (v) => ((v || 0) / 1e6).toFixed(1) },
  { id: 'roas', ten: 'GMV per LGM \u20ab', don_vi: '\u00d7',
    lay: (a) => (a.lgm > 0 ? Math.round((a.gmv / a.lgm) * 10) / 10 : null),
    fmt: (v) => `${v.toFixed(1)}\u00d7` },
  { id: 'atr', ten: 'ATR', don_vi: '%', xau_cao: true,
    lay: (a) => (a.gmv > 0 && a.lgm > 0 ? Math.round((a.lgm / a.gmv) * 1000) / 10 : null),
    fmt: (v) => `${v}%` },
  { id: 'gpm', ten: 'GMV / 1k views', don_vi: 'VND mn',
    lay: (a) => (a.views > 0 ? (a.gmv / a.views) * 1000 : null),
    fmt: (v) => ((v || 0) / 1e6).toFixed(1) },
  { id: 'views', ten: 'Views', don_vi: '',
    lay: (a) => a.views || null, fmt: (v) => new Intl.NumberFormat('en-US').format(Math.round(v || 0)) },
  { id: 'ctr', ten: 'Product CTR', don_vi: '%',
    lay: (a) => (a.imp > 0 ? Math.round((a.clicks / a.imp) * 10000) / 100 : null),
    fmt: (v) => `${v}%` },
  { id: 'engage', ten: 'Engagement rate', don_vi: '%',
    lay: (a) => (a.views > 0
      ? Math.round(((a.likes + a.comments + a.shares) / a.views) * 1000) / 10 : null),
    fmt: (v) => `${v}%` },
  { id: 'watch', ten: 'Watch time', don_vi: 'giây',
    lay: (a) => (a.gio > 0 ? Math.round(a.xemW / a.gio) : null), fmt: (v) => `${v}s` },
  { id: 'gio', ten: 'Hours live', don_vi: 'giờ',
    lay: (a) => a.gio || null, fmt: (v) => v.toFixed(1) },
  { id: 'pcs', ten: 'Units sold', don_vi: '',
    lay: (a) => a.pcs || null, fmt: (v) => new Intl.NumberFormat('en-US').format(Math.round(v || 0)) },
]
/* Sáu khoảng thời gian tới lúc huỷ. Hai đầu là hai vấn đề khác nhau nên
   tô hai họ màu khác nhau: nóng = huỷ sớm (lỗi ở bước xác nhận đơn),
   lạnh = huỷ muộn (khách từ chối nhận hàng). */
const KHOANG_MAU: Record<string, string> = {
  '0 - 1 hour': '#B31B4A', '1 - 6 hours': '#D4623A', '6 - 24 hours': '#E0A33C',
  '1 - 3 days': '#7FA8C9', '3 - 7 days': '#2563A8', 'over 7 days': '#31406B',
}
const KHOANG_TT = ['0 - 1 hour', '1 - 6 hours', '6 - 24 hours', '1 - 3 days', '3 - 7 days', 'over 7 days']

/* Mười hai mốc mịn của v_huy_chi_tiet. Mịn tới cấp NGÀY vì câu hỏi thật là
   "đơn đặt ngày 11 chết ngày nào" — mốc 3–4 days trả lời được, mốc 3–7 days
   thì không. Vạch 48h là ranh giới shipper đã lấy hàng: dưới vạch tô ấm
   (huỷ rẻ), trên vạch tô lạnh dần (huỷ đắt). */
const MOC_TT = ['0 - 1h', '1 - 3h', '3 - 6h', '6 - 12h', '12 - 24h', '1 - 2 days',
  '2 - 3 days', '3 - 4 days', '4 - 5 days', '5 - 6 days', '6 - 7 days', '7+ days']
const MOC_MAU: Record<string, string> = {
  '0 - 1h': '#B31B4A', '1 - 3h': '#C93A52', '3 - 6h': '#D4623A', '6 - 12h': '#E0A33C',
  '12 - 24h': '#E8C77A', '1 - 2 days': '#C9D4B8',
  '2 - 3 days': '#A9C4E0', '3 - 4 days': '#7FA8C9', '4 - 5 days': '#4E86B8',
  '5 - 6 days': '#2563A8', '6 - 7 days': '#1E4E85', '7+ days': '#31406B',
}
/** Mốc mịn thứ i rơi vào nhóm thô nào — dùng khi trục ngang đã hết chỗ. */
const khoangTho = (tt: number) =>
  tt <= 1 ? KHOANG_TT[0] : tt <= 3 ? KHOANG_TT[1] : tt <= 5 ? KHOANG_TT[2]
    : tt <= 7 ? KHOANG_TT[3] : tt <= 11 ? KHOANG_TT[4] : KHOANG_TT[5]
/** Mốc đầu tiên đã nằm sau khi shipper lấy hàng (thu_tu 7 = 2–3 days). */
const MOC_SAU_LAY = 7

/** Thứ tự đọc của các loại ngày campaign, trùng với f_thu_tu_ngay() ở DB. */
const NGAY_TT = ['D-3', 'D-2', 'D-1', 'DDAY', 'D+1', 'D+2', 'D+3',
  'MMS (14-15)', 'Payday (24-25)', 'BAU']
/** Ba cụm để đọc nhanh: trước / trong / sau DDAY, rồi hai loại sale khác, rồi BAU. */
const NGAY_MAU: Record<string, string> = {
  'D-3': '#7FA8C9', 'D-2': '#4E86B8', 'D-1': '#2563A8', 'DDAY': '#B31B4A',
  'D+1': '#C2620B', 'D+2': '#D4863A', 'D+3': '#E0A868',
  'MMS (14-15)': '#5B4A9E', 'Payday (24-25)': '#1F7A4D', 'BAU': '#8A94A6',
}

/* Chín nhóm lý do huỷ. Hai nhóm lớn nhất (giao thất bại, không còn nhu cầu)
   lấy màu đậm; nhóm "có giá tốt hơn" lấy màu nổi riêng vì nó là nhóm duy nhất
   trả lời trực tiếp câu hỏi về giá. */
const LYDO_TT = ['Delivery failed', 'No longer needed', 'Found a better price',
  'Unpaid in time', 'Payment problem', 'Wants to change the order',
  'Delivery cost too high', 'Seller side', 'Other']
const LYDO_MAU: Record<string, string> = {
  'Delivery failed': '#31406B', 'No longer needed': '#7FA8C9',
  'Found a better price': '#B31B4A', 'Unpaid in time': '#E0A33C',
  'Payment problem': '#C2620B', 'Wants to change the order': '#5B4A9E',
  'Delivery cost too high': '#1F7A4D', 'Seller side': '#D4623A',
  'Other': '#8A94A6',
}
/** Ai bấm huỷ. Dùng ở bảng, không dùng ở biểu đồ. */
const NGUOI_HUY: Record<string, string> = {
  SYSTEM: 'TikTok / hệ thống', BUYER: 'Khách', SELLER: 'Shop', UNKNOWN: '—',
}

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
/* ------------------- biểu đồ tổng quan đầu sheet Livestream ------------------- */

/**
 * Ba đại lượng, ba thang đo, một trục ngày.
 *
 *   cột chồng  = GMV từng phòng, cộng lại là GMV ngày đó   (trục trái, tỷ)
 *   đường      = GMV trên 1.000 lượt xem                    (trục phải, triệu)
 *   dải dưới   = chi tiêu LIVE GMV Max                      (thang riêng, triệu)
 *
 * Tiền ads KHÔNG vẽ chung khung với GMV. Nó chỉ bằng 4–6% GMV nên vẽ cùng
 * trục sẽ thành một đường dính đáy, còn nhét thành một tầng trong cột chồng
 * thì sai nghĩa — chi phí không phải một phần của doanh thu. Tách xuống dải
 * riêng, dùng chung trục ngày, đọc dọc vẫn thẳng hàng.
 *
 * Đường GMV/1k views có thang riêng vì nó vài triệu còn cột vài tỷ; nhãn
 * trục phải in đúng đơn vị của nó để không ai đọc nhầm sang trục trái.
 */
function LiveHead({ rows, series, fmtCot, fmtDuong, fmtAds }: {
  rows: {
    ngay: string; parts: number[]; tong: number; gpm: number; lgm: number
    views: number; phien: number
  }[]
  series: { ten: string; color: string }[]
  fmtCot: (v: number) => string
  fmtDuong: (v: number) => string
  fmtAds: (v: number) => string
}) {
  const [t, setT] = useState<{ on: boolean; x: number; y: number; body: React.ReactNode }>({
    on: false, x: 0, y: 0, body: null,
  })
  if (!rows.length) return null

  const maxCot = Math.max(1, ...rows.map((r) => r.tong))
  const maxGpm = Math.max(1, ...rows.map((r) => r.gpm))
  const maxAds = Math.max(1, ...rows.map((r) => r.lgm))
  const n = rows.length
  const sk = Math.max(1, Math.ceil(n / 13))
  const x = (i: number) => ((i + 0.5) / n) * 100
  const y = (v: number) => 100 - Math.min(100, (v / maxGpm) * 100)

  const tip = (r: typeof rows[number]) => (
    <><b>{r.ngay.slice(8, 10)}/{r.ngay.slice(5, 7)}</b><br />
      {series.map((sv, j) => (r.parts[j] > 0
        ? <span key={sv.ten}>{sv.ten}: {fmtCot(r.parts[j])}<br /></span> : null))}
      <b>Total {fmtCot(r.tong)}</b><br />
      GMV per 1k views {fmtDuong(r.gpm)}<br />
      LGM spend {fmtAds(r.lgm)}<br />
      {new Intl.NumberFormat('en-US').format(Math.round(r.views))} views · {r.phien} sessions</>
  )
  const hover = (r: typeof rows[number]) => ({
    onMouseMove: (e: React.MouseEvent) =>
      setT({ on: true, x: e.clientX + 14, y: e.clientY - 8, body: tip(r) }),
    onMouseLeave: () => setT((q) => ({ ...q, on: false })),
  })

  return (
    <>
      <div className="legend">
        {series.map((sv) => (
          <span key={sv.ten}><i className="sw" style={{ background: sv.color }} />{sv.ten}</span>
        ))}
        <span><i className="swl" style={{ background: 'var(--bad)' }} />GMV per 1k views (right)</span>
        <span><i className="sw" style={{ background: 'var(--c2)' }} />LGM spend (strip below)</span>
      </div>

      <div className="lh">
        <div className="lh-plot">
          <span className="lh-l lh-t">{fmtCot(maxCot)}</span>
          <span className="lh-l lh-m">{fmtCot(maxCot / 2)}</span>
          <span className="lh-r lh-t">{fmtDuong(maxGpm)}</span>
          <span className="lh-r lh-m">{fmtDuong(maxGpm / 2)}</span>
          <div className="lh-cols">
            {rows.map((r) => (
              <div className="lh-col" key={r.ngay} {...hover(r)}>
                <div className="lh-stack" style={{ height: `${(r.tong / maxCot) * 100}%` }}>
                  {series.map((sv, j) => ({ sv, v: r.parts[j] || 0 }))
                    .filter((z) => z.v > 0)
                    .reverse()
                    .map((z) => (
                      <div key={z.sv.ten} style={{ flexGrow: z.v, background: z.sv.color }} />
                    ))}
                </div>
              </div>
            ))}
          </div>
          <svg className="lh-line" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline
              points={rows.map((r, i) => `${x(i)},${y(r.gpm)}`).join(' ')}
              fill="none" stroke="var(--bad)" strokeWidth={2}
              vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="lh-ads">
          {rows.map((r) => (
            <div className="lh-col" key={r.ngay} {...hover(r)}>
              <div className="lh-abar" style={{ height: `${(r.lgm / maxAds) * 100}%` }} />
            </div>
          ))}
          <span className="lh-l lh-t">{fmtAds(maxAds)}</span>
        </div>

        <div className="lh-x">
          {rows.map((r, i) => (
            <div className="lh-col" key={r.ngay}>
              {i % sk === 0 ? `${r.ngay.slice(8, 10)}/${r.ngay.slice(5, 7)}` : ''}
            </div>
          ))}
        </div>
      </div>
      {t.on && <div className="tip" style={{ left: t.x, top: t.y }}>{t.body}</div>}
    </>
  )
}

/* ------------------ cột chồng + nhiều đường trục phải riêng ------------------ */

/**
 * Cột chồng n chuỗi, cộng thêm n đường dùng CHUNG một thang đo bên phải.
 *
 * ComboChart sẵn có chỉ nhận đúng hai chuỗi cột, và đường của nó phải dùng
 * chung thang với cột hoặc thang phần trăm 0–100. Ở đây cột là giờ (vài trăm)
 * còn đường là tiền (vài tỷ) — chênh nhau cả triệu lần, buộc phải có trục
 * riêng, nếu không đường sẽ nằm bẹp dưới đáy.
 *
 * Các đường dùng chung một thang để so được với nhau; mỗi đường một thang thì
 * ba phòng nhìn như nhau dù chênh lệch thật rất lớn.
 */
function StackLine({ rows, series, lines, fmtCot, fmtDuong, label, tip, moiNhan }: {
  rows: { ky: string; parts: number[] }[]
  series: { ten: string; color: string }[]
  lines: { ten: string; color: string; vals: (number | null)[] }[]
  fmtCot: (v: number) => string
  fmtDuong: (v: number) => string
  label: (k: string) => string
  tip: (i: number) => React.ReactNode
  /** Ép hiện nhãn ở MỌI cột. Dùng khi nhãn ngắn (ngày 1–31) và việc bỏ bớt
   *  làm mất chính cái người đọc đang dò: ngày nào là ngày nào. */
  moiNhan?: boolean
}) {
  const [t, setT] = useState<{ on: boolean; x: number; y: number; body: React.ReactNode }>({
    on: false, x: 0, y: 0, body: null,
  })
  if (!rows.length) return null
  const tong = rows.map((r) => r.parts.reduce((a2, b) => a2 + b, 0))
  const maxCot = Math.max(1, ...tong)
  const maxD = Math.max(1, ...lines.flatMap((l) => l.vals.map((v) => v ?? 0)))
  const n = rows.length
  const sk = moiNhan ? 1 : Math.max(1, Math.ceil(n / 13))
  const x = (i: number) => ((i + 0.5) / n) * 100
  const y = (v: number) => 100 - (v / maxD) * 100
  const hover = (i: number) => ({
    onMouseMove: (e: React.MouseEvent) =>
      setT({ on: true, x: e.clientX + 14, y: e.clientY - 8, body: tip(i) }),
    onMouseLeave: () => setT((q) => ({ ...q, on: false })),
  })

  return (
    <>
      <div className="legend">
        {series.map((sv) => (
          <span key={sv.ten}><i className="sw" style={{ background: sv.color }} />{sv.ten}</span>
        ))}
        {lines.map((l) => (
          <span key={l.ten}><i className="swl" style={{ background: l.color }} />{l.ten}</span>
        ))}
      </div>
      <div className="sl">
        <div className="sl-plot">
          <span className="sl-l sl-t">{fmtCot(maxCot)}</span>
          <span className="sl-l sl-m">{fmtCot(maxCot / 2)}</span>
          <span className="sl-r sl-t">{fmtDuong(maxD)}</span>
          <span className="sl-r sl-m">{fmtDuong(maxD / 2)}</span>
          <div className="sl-cols">
            {rows.map((r, i) => (
              <div className="sl-col" key={r.ky} {...hover(i)}>
                <div className="sl-stack" style={{ height: `${(tong[i] / maxCot) * 100}%` }}>
                  {series.map((sv, j2) => ({ sv, v: r.parts[j2] || 0 }))
                    .filter((z) => z.v > 0)
                    .reverse()
                    .map((z) => (
                      <div key={z.sv.ten} style={{ flexGrow: z.v, background: z.sv.color }} />
                    ))}
                </div>
              </div>
            ))}
          </div>
          <svg className="sl-line" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* Vẽ hai lượt: lượt đầu dày và cùng màu nền để tạo quầng, nhờ đó
                đường không chìm vào cột cùng màu của chính phòng đó. */}
            {lines.map((l) => (
              <polyline key={`halo-${l.ten}`}
                points={l.vals.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
                  .filter(Boolean).join(' ')}
                fill="none" stroke="var(--surface)" strokeWidth={6}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {lines.map((l) => (
              <polyline key={l.ten}
                points={l.vals.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
                  .filter(Boolean).join(' ')}
                fill="none" stroke={l.color} strokeWidth={2.5}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            ))}
          </svg>
          <div className="sl-dots">
            {rows.length <= 31 && lines.map((l) => l.vals.map((v, i) => (v == null ? null : (
              <span key={`${l.ten}-${i}`} className="sl-d"
                style={{ left: `${x(i)}%`, bottom: `${100 - y(v)}%`, background: l.color }} />
            ))))}
            {rows.length <= 31 && lines.map((l, li) => l.vals.map((v, i) => (v == null ? null : (
              <span key={`v-${l.ten}-${i}`} className={`sl-v${rows.length > 14 ? ' sm' : ''}`}
                style={{
                  left: `${x(i)}%`,
                  // Ba đường hay chạm nhau; đẩy nhãn của từng đường lệch nhau
                  // một nấc để chúng không đè lên nhau.
                  bottom: `calc(${100 - y(v)}% + ${9 + li * 15}px)`,
                  color: l.color,
                }}>{fmtDuong(v)}</span>
            ))))}
          </div>
        </div>
        <div className="sl-x">
          {rows.map((r, i) => (
            <div key={r.ky}>{i % sk === 0 ? label(r.ky) : ''}</div>
          ))}
        </div>
      </div>
      {t.on && <div className="tip" style={{ left: t.x, top: t.y }}>{t.body}</div>}
    </>
  )
}

/* ------------------------- đường cong nhiều chuỗi ------------------------- */

/**
 * Nhiều đường trên một trục, trục ngang là các nhóm rời rạc.
 *
 * Dùng cho đường cong phản hồi: nhóm ngày theo số giờ live rồi xem mỗi giờ
 * mang về bao nhiêu ở từng mức. Chỗ đường gãy xuống là chỗ thêm giờ không
 * còn đáng — thứ mà biểu đồ phân tán không chỉ ra được.
 *
 * Điểm có mẫu quá mỏng vẽ rỗng ruột thay vì tô đặc, để không ai đọc một
 * nhóm có 2 ngày như một nhóm có 30 ngày.
 */
function Curve({ cols, series, fmt, xNhan, yNhan, tip }: {
  cols: string[]
  series: { ten: string; color: string; vals: (number | null)[]; n?: number[] }[]
  fmt: (v: number) => string
  xNhan: string
  yNhan: string
  tip?: (i: number) => React.ReactNode
}) {
  const [t, setT] = useState<{ on: boolean; x: number; y: number; body: React.ReactNode }>({
    on: false, x: 0, y: 0, body: null,
  })
  const all = series.flatMap((sr) => sr.vals).filter((v): v is number => v != null)
  if (!all.length || !cols.length) return null
  const max = Math.max(...all) * 1.08
  const n = cols.length
  const x = (i: number) => ((i + 0.5) / n) * 100
  const y = (v: number) => 100 - (v / max) * 100

  return (
    <>
      <div className="legend">
        {series.map((sr) => (
          <span key={sr.ten}><i className="swl" style={{ background: sr.color }} />{sr.ten}</span>
        ))}
        <span className="unit-inline">{yNhan}</span>
      </div>
      <div className="cur">
        <div className="cur-plot">
          <span className="cur-l cur-t">{fmt(max)}</span>
          <span className="cur-l cur-m">{fmt(max / 2)}</span>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="cur-svg">
            {series.map((sr) => (
              <polyline key={sr.ten}
                points={sr.vals.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
                  .filter(Boolean).join(' ')}
                fill="none" stroke={sr.color} strokeWidth={2}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            ))}
          </svg>
          <div className="cur-dots">
            {series.map((sr) => sr.vals.map((v, i) => (v == null ? null : (
              <span key={`${sr.ten}-${i}`} className="cur-d"
                style={{
                  left: `${x(i)}%`, bottom: `${100 - y(v)}%`,
                  background: (sr.n?.[i] ?? 99) < 5 ? 'var(--surface)' : sr.color,
                  borderColor: sr.color,
                }} />
            ))))}
          </div>
          <div className="cur-hit">
            {cols.map((c, i) => (
              <div key={c}
                onMouseMove={(e) => setT({
                  on: true, x: e.clientX + 14, y: e.clientY - 8, body: tip ? tip(i) : c,
                })}
                onMouseLeave={() => setT((q) => ({ ...q, on: false }))} />
            ))}
          </div>
        </div>
        <div className="cur-x">{cols.map((c) => <div key={c}>{c}</div>)}</div>
        <div className="cur-xl">{xNhan}</div>
      </div>
      {t.on && <div className="tip" style={{ left: t.x, top: t.y }}>{t.body}</div>}
    </>
  )
}

/* ----------------------------- bubble scatter ----------------------------- */

/**
 * Mỗi chấm là MỘT NGÀY của MỘT PHÒNG. Trục X và Y là hai tỷ lệ, kích thước
 * chấm là GMV, màu là phòng.
 *
 * Bán kính vẽ theo CĂN BẬC HAI của GMV, không theo GMV: mắt người đọc bong
 * bóng bằng diện tích chứ không bằng bề ngang, vẽ thẳng theo giá trị thì
 * ngày to bị phóng đại gấp nhiều lần.
 *
 * Hai trục đều cắt ở phân vị 98 để một ngày dị biệt không dồn toàn bộ phần
 * còn lại vào một góc; những chấm vượt ngưỡng được ghim vào mép và viền đậm
 * lên để biết là đang bị cắt, chứ không im lặng giấu đi.
 */
function Bubbles({ pts, series, xNhan, yNhan, fmtX, fmtY, kichThuoc }: {
  pts: { key: string; x: number; y: number; v: number; color: string; body: React.ReactNode }[]
  series: { ten: string; color: string }[]
  xNhan: string
  yNhan: string
  fmtX: (v: number) => string
  fmtY: (v: number) => string
  /** Kích thước bong bóng đang biểu thị cái gì — in vào chú giải. Bắt buộc
   *  truyền: trước đây ghi cứng "GMV" nên mục 5.8 (kích thước là net pcs)
   *  chú thích sai suốt. */
  kichThuoc: string
}) {
  const [t, setT] = useState<{ on: boolean; x: number; y: number; body: React.ReactNode }>({
    on: false, x: 0, y: 0, body: null,
  })
  if (!pts.length) return null

  const cut = (xs: number[]) => {
    const a2 = xs.slice().sort((m, n) => m - n)
    return a2[Math.min(a2.length - 1, Math.floor(a2.length * 0.98))] || 1
  }
  const xMax = cut(pts.map((d) => d.x))
  const yMax = cut(pts.map((d) => d.y))
  const vMax = Math.max(...pts.map((d) => d.v), 1)
  const r = (v: number) => 4 + Math.sqrt(Math.max(0, v) / vMax) * 20

  return (
    <>
      <div className="legend">
        {series.map((sv) => (
          <span key={sv.ten}><i className="sw" style={{ background: sv.color }} />{sv.ten}</span>
        ))}
        <span className="unit-inline">bubble size = {kichThuoc}</span>
      </div>
      <div className="bub">
        <div className="bub-yl">{yNhan}</div>
        <div className="bub-main">
          <div className="bub-plot">
            <span className="bub-gt">{fmtY(yMax)}</span>
            <span className="bub-gm">{fmtY(yMax / 2)}</span>
            {pts.map((d) => {
              const over = d.x > xMax || d.y > yMax
              return (
                <span
                  key={d.key}
                  className={`bub-d${over ? ' over' : ''}`}
                  style={{
                    left: `${Math.min(100, (d.x / xMax) * 100)}%`,
                    bottom: `${Math.min(100, (d.y / yMax) * 100)}%`,
                    width: r(d.v) * 2, height: r(d.v) * 2,
                    marginLeft: -r(d.v), marginBottom: -r(d.v),
                    background: d.color,
                  }}
                  onMouseMove={(e) => setT({ on: true, x: e.clientX + 14, y: e.clientY - 8, body: d.body })}
                  onMouseLeave={() => setT((q) => ({ ...q, on: false }))}
                />
              )
            })}
          </div>
          <div className="bub-xa">
            <span>0</span><span>{fmtX(xMax / 2)}</span><span>{fmtX(xMax)}</span>
          </div>
          <div className="bub-xl">{xNhan}</div>
        </div>
      </div>
      {t.on && <div className="tip" style={{ left: t.x, top: t.y }}>{t.body}</div>}
    </>
  )
}

/* --------------------- so sánh nhiều chỉ số cùng lúc --------------------- */

/**
 * Mỗi ô là MỘT chỉ số, bên trong là ba phòng xếp cạnh nhau.
 *
 * Không gộp chung một trục: views/giờ tính bằng vạn còn comment trên 1.000
 * lượt xem chỉ vài đơn vị, chung trục thì cột nhỏ biến mất. Mỗi ô tự lấy
 * phòng cao nhất làm 100%, nên đọc được ngay ai hơn ai và hơn bao nhiêu,
 * còn giá trị thật in ngay cuối thanh.
 */
function CompareBars({ nhom }: {
  nhom: {
    ten: string; don_vi?: string; ghi_chu?: string
    fmt: (v: number) => string
    vals: { ten: string; color: string; v: number }[]
  }[]
}) {
  return (
    <div className="cmp">
      {nhom.map((m) => {
        const max = Math.max(1, ...m.vals.map((x) => x.v))
        const best = m.vals.reduce((a2, b) => (b.v > a2.v ? b : a2))
        return (
          <div className="cmp-card" key={m.ten}>
            <div className="cmp-t">
              {m.ten}{m.don_vi && <span className="cmp-u">{m.don_vi}</span>}
            </div>
            {m.vals.map((x) => (
              <div className="cmp-row" key={x.ten}>
                <div className="cmp-l" title={x.ten}>{x.ten}</div>
                <div className="cmp-track">
                  <div className="cmp-bar"
                    style={{
                      width: `${Math.max(2, (x.v / max) * 100)}%`,
                      background: x.color,
                      opacity: x.ten === best.ten ? 1 : 0.55,
                    }} />
                </div>
                <div className="cmp-v">{m.fmt(x.v)}</div>
              </div>
            ))}
            {m.ghi_chu && <div className="cmp-n">{m.ghi_chu}</div>}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------- phễu ------------------------------- */

/**
 * Phễu chuyển đổi, mỗi phòng một cột.
 *
 * Bề rộng vẽ theo THANG LOG. Impressions gấp ~180 lần số click, vẽ tuyến tính
 * thì từ bậc hai trở đi chỉ còn một vạch mờ, nhìn không ra gì. Log giữ được
 * hình phễu mà vẫn trung thực về thứ bậc — số tuyệt đối và % chuyển đổi in
 * ngay trên từng bậc, đó mới là thứ để đọc.
 */
function Funnel({ rooms }: {
  rooms: { ten: string; color: string; stages: { ten: string; v: number }[] }[]
}) {
  const all = rooms.flatMap((r) => r.stages.map((x) => x.v)).filter((v) => v > 0)
  if (!all.length) return null
  const hi = Math.log10(Math.max(...all))
  const lo = Math.log10(Math.min(...all))
  const w = (v: number) =>
    v <= 0 ? 4 : 16 + (hi === lo ? 84 : ((Math.log10(v) - lo) / (hi - lo)) * 84)

  return (
    <div className="funnels">
      {rooms.map((r) => (
        <div className="fn-card" key={r.ten}>
          <div className="fn-head" style={{ borderColor: r.color }}>{r.ten}</div>
          {r.stages.map((st, i) => {
            const prev = i > 0 ? r.stages[i - 1].v : 0
            const conv = i > 0 && prev > 0 ? Math.round((st.v / prev) * 1000) / 10 : null
            return (
              <div className="fn-row" key={st.ten}>
                <div className="fn-lab">{st.ten}</div>
                <div className="fn-track">
                  <div className="fn-bar"
                    style={{ width: `${w(st.v)}%`, background: r.color, opacity: 1 - i * 0.14 }}>
                    <span className="fn-v">{new Intl.NumberFormat('en-US').format(Math.round(st.v))}</span>
                  </div>
                  {conv != null && <div className="fn-conv">{conv}%</div>}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* ---------------------- hành trình một đơn hàng ----------------------- */

/**
 * Ba đường đời của một đơn, vẽ trên cùng một trục thời gian thật.
 *
 * Trục để TUYẾN TÍNH chứ không log, dù đường "huỷ trước lấy hàng" vì thế co
 * lại thành một chấm ở gốc — đó đúng là sự thật của nó: đơn chết trong vài
 * phút. Log hoá sẽ kéo dài nó ra thành một đoạn trông ngang ngửa các đường
 * kia, tức là vẽ sai điều quan trọng nhất của biểu đồ này.
 *
 * Mỗi đường vẽ theo TRUNG VỊ; trung bình đánh dấu bằng một hình thoi rỗng,
 * vì đuôi dài kéo trung bình lệch hẳn (huỷ trước lấy hàng: trung vị 6 phút,
 * trung bình 4,7 giờ) và giấu chênh lệch đó đi thì người đọc không biết mình
 * đang nhìn cái nào.
 */
function Timeline({ tracks, maxGio, fmtT }: {
  tracks: {
    ten: string; color: string; n: number; pct: number
    lay: number | null; layTb: number | null
    ket: number; ketTb: number
    ketNhan: string
  }[]
  maxGio: number
  fmtT: (h: number) => string
}) {
  if (!tracks.length) return null
  const x = (h: number) => Math.min(100, (h / maxGio) * 100)
  const moc = Array.from({ length: Math.floor(maxGio / 24) + 1 }, (_, i) => i)
  /* Nhãn mặc định canh giữa mốc. Sát hai mép thì canh mép, nếu không nhãn của
     mốc ~0 sẽ tràn sang cột tên ở bên trái và đè lên nhau. */
  const neo = (px: number): React.CSSProperties =>
    px < 10 ? { left: `${px}%`, transform: 'translateX(0)', textAlign: 'left' }
      : px > 90 ? { left: `${px}%`, transform: 'translateX(-100%)', textAlign: 'right' }
        : { left: `${px}%` }

  return (
    <div className="tl" style={{ '--tlh': `${tracks.length * 48}px` } as React.CSSProperties}>
      <div className="tl-grid">
        {moc.map((d) => (
          <span key={d} className="tl-gl" style={{ left: `${x(d * 24)}%` }}>
            <i />
            <b>{d === 0 ? 'order' : `${d}d`}</b>
          </span>
        ))}
      </div>
      {tracks.map((t) => (
        <div className="tl-row" key={t.ten}>
          <div className="tl-lbl">
            <b style={{ color: t.color }}>{t.ten}</b>
            <span className="muted">{n0(t.n)} units · {pct(t.pct)}</span>
          </div>
          <div className="tl-track">
            {/* đoạn trong kho: từ lúc đặt tới lúc shipper lấy */}
            {t.lay != null && (
              <div className="tl-seg kho" style={{ left: 0, width: `${x(t.lay)}%` }} />
            )}
            {/* đoạn trên đường: từ lúc lấy tới lúc kết thúc */}
            <div className="tl-seg" style={{
              left: `${x(t.lay ?? 0)}%`,
              width: `${Math.max(0.6, x(t.ket) - x(t.lay ?? 0))}%`,
              background: t.color,
            }} />
            {t.lay != null && (
              <span className="tl-dot" style={{ left: `${x(t.lay)}%` }} title="picked up" />
            )}
            <span className="tl-end" style={{ left: `${x(t.ket)}%`, background: t.color }} />
            <span className="tl-avg" style={{ left: `${x(t.ketTb)}%`, borderColor: t.color }}
              title={`average ${fmtT(t.ketTb)}`} />
            <span className="tl-t" style={neo(x(t.ket))}>
              {t.ketNhan} {fmtT(t.ket)}
            </span>
            {t.lay != null && (
              <span className="tl-t sm" style={neo(x(t.lay))}>picked up {fmtT(t.lay)}</span>
            )}
          </div>
        </div>
      ))}
      <div className="legend" style={{ marginTop: 6 }}>
        <span><i className="sw" style={{ background: 'var(--line-s)' }} />in the warehouse</span>
        <span><i className="sw" style={{ background: 'var(--muted)' }} />with the courier</span>
        <span><i className="tl-avg st" />average (bars are the median)</span>
      </div>
    </div>
  )
}

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
  monthly, daily, sku, skuMonthly, skuDaily, segMonthly, shipDaily,
  adsVs, adsMonthly, adsCampaigns,
  liveDaily, liveMonthly, liveRooms, liveSessions, liveLgm, kenhMonthly, kenhDaily, kenhSku,
  campTong, campMatrix, huyChiTiet, huyModel, hanhTrinh, transitModel, liveOverview,
}: Props) {
  /* Chiều cao dải lọc dính. Đo thật thay vì đặt hằng số, vì nó đổi theo độ
     rộng màn hình và theo dòng "Showing:" của từng sheet — đặt sai thì thanh
     trái chui xuống dưới dải, hoặc bấm mục lục xong tiêu đề bị che. */
  const stickRef = useRef<HTMLDivElement>(null)
  const [stickH, setStickH] = useState(112)
  useEffect(() => {
    const el = stickRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStickH(el.offsetHeight))
    ro.observe(el)
    setStickH(el.offsetHeight)
    return () => ro.disconnect()
  }, [])

  const [huySort, setHuySort] = useState<'sau' | 'instant'>('sau')
  const [sec, setSec] = useState<Sec>('Summary')
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
  const [mixMetric, setMixMetric] = useState<'gmv' | 'so_luong' | 'cancel'>('gmv')
  /** Bảng model mix: bật thì mỗi ô là % của cột ngày đó thay vì số tuyệt đối. */
  const [mixShare, setMixShare] = useState(false)
  const [modelSel, setModelSel] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [momMetric, setMomMetric] = useState<'net' | 'gross' | 'cancel'>('net')
  /** Chỉ số đang xem ở hai lưới phòng × ngày và phòng × tháng. */
  const [roomMetric, setRoomMetric] = useState<RoomMetric>('gmv')
  /** Chỉ số đang xem ở lưới kênh × tháng (doanh thu thật của shop). */
  const [kenhMetric, setKenhMetric] = useState<'nmv' | 'cancel' | 'atr' | 'pcs'>('nmv')
  /** Phần 5.6 xem theo tháng hay theo ngày. */
  const [kenhNgay, setKenhNgay] = useState(false)
  /** Phòng đang xem ở biểu đồ NMV vs ATR. 'all' = gộp ba phòng nhà. */
  const [kenhRoom, setKenhRoom] = useState<string>('all')
  /** Chỉ số ở bảng sản phẩm × phòng. */
  const [skuMetric, setSkuMetric] = useState<'nmv' | 'pcs' | 'cancel' | 'mix'>('nmv')
  /** Lưới phòng × kỳ: xem theo tháng hay theo ngày. */
  const [luoiNgay, setLuoiNgay] = useState(false)
  /** Đường cong giờ live: xem tiền mỗi giờ hay tiền mỗi ngày. */
  const [gioMetric, setGioMetric] = useState<'per_hour' | 'per_day'>('per_hour')
  /** Lọc đường cong theo mức chi LGM của ngày đó, để tách ảnh hưởng của
   *  tiền quảng cáo ra khỏi ảnh hưởng của số giờ live. */
  const [gioAds, setGioAds] = useState<'all' | 'low' | 'mid' | 'high'>('all')

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


  /** Tổng của CẢ khoảng đang lọc, cộng khoảng liền trước cùng độ dài để so.
   *  Bốn ô đầu tab Overview trước đây lấy kỳ cuối cùng, nên khi lọc theo ngày
   *  chúng chỉ là số của MỘT ngày trong khi dòng "Showing:" nói cả tháng —
   *  nhìn vào tưởng số sai. Giờ ô khớp đúng với bộ lọc. */
  const allShown = useMemo(() => rollup(src, cat), [src, cat])
  const span = useMemo(() => {
    const sum = (rows: Rolled[], ky: string): Rolled => {
      const a = ZERO(ky)
      for (const r of rows) for (const f of SUM_FIELDS) a[f] += r[f]
      a.cancel_rate = p1(a.sl_huy, a.so_luong)
      return a
    }
    const first = shown[0]?.ky
    const i = first ? allShown.findIndex((r) => r.ky === first) : -1
    const before = i > 0 ? allShown.slice(Math.max(0, i - shown.length), i) : []
    return {
      cur: sum(shown, 'cur'),
      prev: before.length ? sum(before, 'prev') : undefined,
      n: shown.length,
      nPrev: before.length,
    }
  }, [shown, allShown])
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

  /** Model mix: GIỮ ĐỦ mọi model, không gom "Other".
   *
   *  Trước đây cắt top 8 cho biểu đồ cột chồng dễ nhìn, nhưng bảng thì khác —
   *  30 dòng vẫn đọc được, mà gom lại thì đúng những model nhỏ cần soi lại bị
   *  giấu đi. Ở đây gom số thô theo model × kỳ, phần quy đổi ra con số hiển
   *  thị để bảng tự lo, vì tỷ lệ huỷ không cộng dồn được như tiền và cái. */
  const mix = useMemo(() => {
    type O = { gmv: number; net: number; gross: number; huy: number }
    const z = (): O => ({ gmv: 0, net: 0, gross: 0, huy: 0 })
    const tong = new Map<string, O>()
    const byKy = new Map<string, Map<string, O>>()
    for (const r of skuRows) {
      const add = (o: O) => {
        o.gmv += Number(r.gmv || 0)
        o.net += Number(r.sl_chua_huy || 0)
        o.gross += Number(r.so_luong || 0)
        o.huy += Number(r.so_luong || 0) - Number(r.sl_chua_huy || 0)
      }
      add(tong.get(r.model) ?? (tong.set(r.model, z()), tong.get(r.model)!))
      const m = byKy.get(r.ky) ?? new Map<string, O>()
      add(m.get(r.model) ?? (m.set(r.model, z()), m.get(r.model)!))
      byKy.set(r.ky, m)
    }
    // Xếp theo chỉ số đang chọn; riêng tỷ lệ huỷ thì xếp theo sản lượng gộp,
    // nếu xếp theo chính tỷ lệ thì model bán 1 cái mà huỷ 1 cái sẽ đứng đầu.
    const diem = (o: O) =>
      mixMetric === 'gmv' ? o.gmv : mixMetric === 'so_luong' ? o.net : o.gross
    const models = Array.from(tong.entries())
      .sort((a, b) => diem(b[1]) - diem(a[1]))
      .map((e) => e[0])
    const series = models.map((m, i) => ({ ten: m, color: PALETTE[i % PALETTE.length] }))
    const kys = Array.from(byKy.keys()).sort()
    return { series, models, kys, byKy, tong, z }
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

  /* ---- quảng cáo ----
     Ngày chạy theo cùng bộ lọc với tab Discounts; phần MoM chạy theo tháng
     đã chọn. Chi tiêu là con số chắc chắn (mình trả tiền thật), còn doanh thu
     và đơn là quy kết của TikTok — hai nhóm để riêng, không trộn. */
  const adsDays = useMemo(
    () => adsVs.filter((r) => dayKeys.has(r.ngay)).sort((a, b) => a.ngay.localeCompare(b.ngay)),
    [adsVs, dayKeys],
  )
  /** Tỷ giá suy ngược từ chính dữ liệu view, thay vì nhét cứng vào code: đổi
   *  app_settings.fx_usd_vnd trong database là mọi con số ở đây đổi theo. */
  const FX = useMemo(() => {
    for (const r of adsVs) {
      const v = Number(r.ads_cost_vnd || 0)
      const u = Number(r.ads_cost_usd || 0)
      if (v > 0 && u > 0) return v / u
    }
    return 26500
  }, [adsVs])

  /** Toàn bộ tab Advertising tính bằng USD. ATR là tỷ lệ nên không đổi khi
   *  đổi đơn vị — tử và mẫu cùng quy đổi bằng một tỷ giá. */
  const adsTotals = useMemo(() => {
    const t = { cost: 0, lgm: 0, pgm: 0, cads: 0, orders: 0, gmv: 0, nmv: 0 }
    for (const r of adsDays) {
      t.cost += Number(r.ads_cost_usd || 0)
      t.lgm += Number(r.lgm_usd || 0)
      t.pgm += Number(r.pgm_usd || 0)
      t.cads += Number(r.cads_usd || 0)
      t.orders += Number(r.ads_orders || 0)
      t.gmv += Number(r.gmv_usd || 0)
      t.nmv += Number(r.nmv_usd || 0)
    }
    return t
  }, [adsDays])

  const adsMonths = useMemo(() => {
    const keep = new Set(goodMonths.map((m) => m.slice(0, 7)))
    const map = new Map<string, { ky: string; lgm: number; pgm: number; cads: number; rev: number; orders: number }>()
    for (const r of adsMonthly) {
      const k = String(r.thang).slice(0, 7)
      if (!keep.has(k)) continue
      const cur = map.get(k) ?? { ky: `${k}-01`, lgm: 0, pgm: 0, cads: 0, rev: 0, orders: 0 }
      const c = Number(r.cost_usd || 0)
      if (r.promotion_type === 'LIVE_GMV_MAX') cur.lgm += c
      else if (r.promotion_type === 'PRODUCT_GMV_MAX') cur.pgm += c
      else cur.cads += c
      cur.rev += Number(r.gross_revenue_vnd || 0)
      cur.orders += Number(r.orders || 0)
      map.set(k, cur)
    }
    return Array.from(map.values()).sort((a, b) => a.ky.localeCompare(b.ky))
  }, [adsMonthly, goodMonths])

  /** Chi tiêu quảng cáo theo tháng (USD), để tab MoM Summary lấy ra một con số. */
  const adsByMonth = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of adsMonthly) {
      const k = String(r.thang).slice(0, 7)
      m.set(k, (m.get(k) ?? 0) + Number(r.cost_usd || 0))
    }
    return m
  }, [adsMonthly])

  /** Chi tiêu quảng cáo trong đúng khoảng mà tab Overview đang lọc.
   *  keys chứa khoá tháng ('2026-09-01') khi xem theo tháng, khoá ngày khi xem
   *  theo ngày — nên phải so khớp theo đúng dạng đang dùng. */
  const adsSpanUsd = useMemo(() => {
    let cost = 0
    for (const r of adsVs) {
      const hit = byMonth ? keys.has(`${r.ngay.slice(0, 7)}-01`) : keys.has(r.ngay)
      if (hit) cost += Number(r.ads_cost_usd || 0)
    }
    return cost
  }, [adsVs, keys, byMonth])

  /** Bảng xếp hạng campaign: gộp các tháng đang chọn, bỏ campaign không tiêu đồng nào. */
  const adsCamps = useMemo(() => {
    const keep = new Set(goodMonths.map((m) => m.slice(0, 7)))
    const map = new Map<string, {
      id: string; ten: string; loai: string; koc: string | null; model: string | null
      cost: number; rev: number; orders: number
    }>()
    for (const r of adsCampaigns) {
      if (!keep.has(String(r.thang).slice(0, 7))) continue
      const cur = map.get(r.campaign_id) ?? {
        id: r.campaign_id, ten: r.campaign_name, loai: r.promotion_type,
        koc: r.koc_handle, model: r.model_hint, cost: 0, rev: 0, orders: 0,
      }
      cur.cost += Number(r.cost_usd || 0)
      cur.rev += Number(r.gross_revenue_vnd || 0)
      cur.orders += Number(r.orders || 0)
      map.set(r.campaign_id, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost)
  }, [adsCampaigns, goodMonths])

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

  /* ================= phân tích huỷ =================
     Ba useMemo dưới đây đều đọc v_huy_chi_tiet — một view duy nhất chứa:
     mốc thời gian tới lúc huỷ (mịn tới cấp ngày), đã-lấy-hàng-chưa, và nhóm
     lý do. Mẫu số (mọi đơn đặt trong ngày) nằm ở v_lapse_campaign_tong.

     Ranh giới quan trọng nhất là 48 giờ: dưới 48h gần như toàn bộ đơn huỷ
     trước khi shipper lấy hàng — chỉ mất cơ hội bán; trên 48h thì 94–99%
     đã lấy hàng rồi, tức mất cả tiền ship và công kho. Cờ sau_lay lấy từ
     collection_time của TikTok, không phải suy ra từ số giờ. */

  const camp = useMemo(() => {
    const giu = (ngay: string) => (byMonth ? keys.has(`${ngay.slice(0, 7)}-01`) : keys.has(ngay))
    const catOk = (c: string) => cat === 'all' || c === cat

    const tong = new Map<string, {
      loai: string; tt: number; item: number; huy: number; nmvHuy: number; ngay: Set<string>
    }>()
    for (const r of campTong) {
      if (!giu(r.ngay) || !catOk(r.category)) continue
      const c = tong.get(r.loai_ngay)
        ?? { loai: r.loai_ngay, tt: r.thu_tu_ngay, item: 0, huy: 0, nmvHuy: 0, ngay: new Set<string>() }
      c.item += Number(r.tong_item || 0)
      c.huy += Number(r.so_huy || 0)
      c.nmvHuy += Number(r.nmv_huy || 0)
      c.ngay.add(r.ngay)
      tong.set(r.loai_ngay, c)
    }

    // Cơ cấu mốc thời gian gộp về 6 nhóm thô cho biểu đồ theo loại ngày —
    // 12 nhóm mịn trên một trục 10 cột thì không đọc được.
    const mix = new Map<string, number[]>()
    for (const r of huyChiTiet) {
      if (!giu(r.ngay) || !catOk(r.category)) continue
      const arr = mix.get(r.loai_ngay) ?? Array(KHOANG_TT.length).fill(0)
      arr[KHOANG_TT.indexOf(khoangTho(r.thu_tu))] += Number(r.so_luong || 0)
      mix.set(r.loai_ngay, arr)
    }

    const rows = NGAY_TT
      .map((loai) => {
        const t = tong.get(loai)
        if (!t || !t.item) return null
        const raw = mix.get(loai) ?? Array(KHOANG_TT.length).fill(0)
        const sHuy = raw.reduce((a, b) => a + b, 0)
        // Chuẩn hoá về 100 để StackLine vẽ mọi cột cao bằng nhau — cột ở đây
        // là cơ cấu, không phải lượng; lượng đã có ở cột Cancelled trong bảng.
        const parts = sHuy ? raw.map((v) => (v / sHuy) * 100) : Array(KHOANG_TT.length).fill(0)
        return {
          loai, tt: t.tt, soNgay: t.ngay.size,
          item: t.item, huy: t.huy, nmvHuy: t.nmvHuy,
          rate: p1(t.huy, t.item),
          parts,
          nhanh: parts[0] + parts[1] + parts[2],   // huỷ trong 24h
          cham: parts[4] + parts[5],               // huỷ từ ngày thứ 3 trở đi
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    const bau = rows.find((r) => r.loai === 'BAU')
    return { rows, bau }
  }, [campTong, huyChiTiet, keys, byMonth, cat])

  /* ---- huỷ theo dòng chảy của tháng ----
     Trục ngang là thời gian thật, chạy từ đầu tháng tới cuối tháng, để thấy
     nguyên hình dạng: BAU → D-3 → D-2 → D-1 → DDAY → D+1... → MMS → ... →
     Payday → BAU. Loại ngày chỉ còn là NHÃN dưới mốc thời gian.

     Hai chế độ, chọn tự động theo số ngày đang lọc:
     - ≤ 45 ngày: mỗi cột là MỘT NGÀY THẬT. Nhãn luôn đúng vì mỗi ngày chỉ
       thuộc một loại.
     - dài hơn: gộp theo số ngày trong tháng (1–31) để trục không vỡ. Lúc này
       ngày 9 vừa là DDAY của tháng 9 vừa là ngày thường của tháng 8, nên nhãn
       để trống khi các tháng không thống nhất; tooltip liệt kê ra. */

  const NGAY_TOI_DA = 45

  const campNgay = useMemo(() => {
    const giu = (ngay: string) => (byMonth ? keys.has(`${ngay.slice(0, 7)}-01`) : keys.has(ngay))
    const catOk = (c: string) => cat === 'all' || c === cat

    const ngayCo = new Set<string>()
    for (const r of campTong) if (giu(r.ngay) && catOk(r.category)) ngayCo.add(r.ngay)
    const theoNgayThat = ngayCo.size > 0 && ngayCo.size <= NGAY_TOI_DA
    // Khoá gom nhóm: ngày thật, hoặc số ngày trong tháng
    const khoa = (ngay: string) => (theoNgayThat ? ngay : ngay.slice(8, 10))

    const tong = new Map<string, {
      item: number; huy: number; nmvHuy: number; ngay: Set<string>; nhan: Set<string>
    }>()
    for (const r of campTong) {
      if (!giu(r.ngay) || !catOk(r.category)) continue
      const k = khoa(r.ngay)
      const c = tong.get(k)
        ?? { item: 0, huy: 0, nmvHuy: 0, ngay: new Set<string>(), nhan: new Set<string>() }
      c.item += Number(r.tong_item || 0)
      c.huy += Number(r.so_huy || 0)
      c.nmvHuy += Number(r.nmv_huy || 0)
      c.ngay.add(r.ngay)
      c.nhan.add(r.loai_ngay)
      tong.set(k, c)
    }

    // Cơ cấu 12 mốc mịn + tách trước/sau khi shipper lấy hàng
    const mix = new Map<string, number[]>()
    const lay = new Map<string, { truoc: number; sau: number }>()
    for (const r of huyChiTiet) {
      if (!giu(r.ngay) || !catOk(r.category)) continue
      const k = khoa(r.ngay)
      const sl = Number(r.so_luong || 0)
      const a = mix.get(k) ?? Array(12).fill(0)
      a[r.thu_tu - 1] += sl
      mix.set(k, a)
      const l = lay.get(k) ?? { truoc: 0, sau: 0 }
      if (r.sau_lay) l.sau += sl; else l.truoc += sl
      lay.set(k, l)
    }

    const rows = Array.from(tong.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((k) => {
        const t = tong.get(k) as NonNullable<ReturnType<typeof tong.get>>
        if (!t.item) return null
        const raw = mix.get(k) ?? Array(12).fill(0)
        const sHuy = raw.reduce((a, b) => a + b, 0)
        const l = lay.get(k) ?? { truoc: 0, sau: 0 }
        return {
          ky: k,
          // Nhãn trục: chỉ SỐ NGÀY cho gọn — 30 nhãn "01/09" dính vào nhau không
          // đọc được, mà tháng đã nằm ở tiêu đề. Chỉ ngày 1 của mỗi tháng mới
          // kèm tháng, để lúc khoảng lọc bắc qua hai tháng vẫn biết ranh giới.
          nhanTruc: !theoNgayThat ? String(Number(k))
            : k.slice(8, 10) === '01' ? `1/${Number(k.slice(5, 7))}`
              : String(Number(k.slice(8, 10))),
          dauThang: theoNgayThat && k.slice(8, 10) === '01',
          soNgay: t.ngay.size,
          item: t.item, huy: t.huy, nmvHuy: t.nmvHuy,
          rate: p1(t.huy, t.item),
          parts: sHuy ? raw.map((v) => (v / sHuy) * 100) : Array(12).fill(0),
          soLuong: raw,
          sauLay: l.sau,
          // % trên tổng ĐƠN HUỶ — cơ cấu của phần đã mất
          pctSau: p1(l.sau, l.truoc + l.sau),
          // % trên tổng ĐƠN ĐẶT — gánh nặng kho thật của ngày đó. Cùng mẫu số
          // với tỷ lệ huỷ chung ở 7.2 nên hai con số so thẳng được với nhau.
          pctSauDat: p1(l.sau, t.item),
          nhan: t.nhan.size === 1 ? Array.from(t.nhan)[0] : null,
          nhanCoThe: Array.from(t.nhan).filter((x) => x !== 'BAU'),
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    return { rows, theoNgayThat }
  }, [campTong, huyChiTiet, keys, byMonth, cat])

  /* ---- lý do huỷ ----
     Lý do nằm ở cấp ĐƠN (orders.cancel_reason), không ở cấp dòng sản phẩm,
     nên mỗi dòng của đơn thừa hưởng lý do của đơn đó — cùng cách đếm với
     mọi số huỷ khác trên dashboard. */

  const lyDo = useMemo(() => {
    const rows = huyChiTiet
      .filter((r) => (byMonth ? keys.has(`${r.ngay.slice(0, 7)}-01`) : keys.has(r.ngay)))
      .filter((r) => cat === 'all' || r.category === cat)

    type O = {
      ly_do: string; tt: number; sl: number; nmv: number; gio: number; nGio: number
      sauLay: number; nguoi: Map<string, number>
    }
    const tong = new Map<string, O>()
    const theoKy = new Map<string, number[]>()
    const theoNgay = new Map<string, number[]>()

    for (const r of rows) {
      const sl = Number(r.so_luong || 0)
      const j = LYDO_TT.indexOf(r.ly_do)
      if (j < 0) continue

      const c = tong.get(r.ly_do)
        ?? { ly_do: r.ly_do, tt: r.thu_tu_ly_do, sl: 0, nmv: 0, gio: 0, nGio: 0, sauLay: 0, nguoi: new Map() }
      c.sl += sl
      c.nmv += Number(r.nmv_huy || 0)
      c.gio += Number(r.gio_tong || 0)
      c.nGio += Number(r.sl_co_gio || 0)
      if (r.sau_lay) c.sauLay += sl
      c.nguoi.set(r.nguoi_huy, (c.nguoi.get(r.nguoi_huy) ?? 0) + sl)
      tong.set(r.ly_do, c)

      const ky = byMonth ? `${r.ngay.slice(0, 7)}-01` : r.ngay
      const a1 = theoKy.get(ky) ?? Array(LYDO_TT.length).fill(0)
      a1[j] += sl; theoKy.set(ky, a1)

      const a2 = theoNgay.get(r.loai_ngay) ?? Array(LYDO_TT.length).fill(0)
      a2[j] += sl; theoNgay.set(r.loai_ngay, a2)
    }

    const tongSl = Array.from(tong.values()).reduce((a, r) => a + r.sl, 0)
    const bang = LYDO_TT
      .map((l) => tong.get(l))
      .filter((r): r is O => !!r && r.sl > 0)
      .map((r) => ({
        ly_do: r.ly_do,
        sl: r.sl,
        pct: p1(r.sl, tongSl),
        nmv: r.nmv,
        gioTb: r.nGio ? Math.round(r.gio / r.nGio) : null,
        pctSauLay: p1(r.sauLay, r.sl),
        // Ai bấm huỷ nhiều nhất cho lý do này
        nguoi: Array.from(r.nguoi.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'UNKNOWN',
      }))
    // Chỉ giữ các nhóm lý do thực sự có số, để chú giải không đầy màu chết
    const co = LYDO_TT.filter((l) => (tong.get(l)?.sl ?? 0) > 0)

    const chuanHoa = (m: Map<string, number[]>, thuTu: string[]) => thuTu
      .filter((k) => m.has(k))
      .map((k) => {
        const raw = m.get(k) as number[]
        const t = raw.reduce((a, b) => a + b, 0)
        return { ky: k, parts: co.map((l) => (t ? (raw[LYDO_TT.indexOf(l)] / t) * 100 : 0)), n: t }
      })

    const kyTT = Array.from(theoKy.keys()).sort((a, b) => a.localeCompare(b))
    return {
      bang, co, tongSl,
      theoKy: chuanHoa(theoKy, kyTT),
      theoNgay: chuanHoa(theoNgay, NGAY_TT),
    }
  }, [huyChiTiet, keys, byMonth, cat])

  /* ---- trước hay sau khi shipper lấy hàng ----
     Câu hỏi vận hành thật sự. Đơn chết trước khi lấy hàng chỉ mất cơ hội bán;
     đơn chết sau khi lấy hàng mất tiền ship hai chiều, công đóng gói, và quay
     đầu về kho. Mốc thời gian mịn ở đây là để đọc được kiểu "đơn ngày 11 chết
     ngày 15" — nó rơi vào mốc 3–4 days. */

  const pickup = useMemo(() => {
    const rows = huyChiTiet
      .filter((r) => (byMonth ? keys.has(`${r.ngay.slice(0, 7)}-01`) : keys.has(r.ngay)))
      .filter((r) => cat === 'all' || r.category === cat)

    // cơ cấu 12 mốc mịn theo NGÀY ĐẶT (hoặc tháng, theo thanh lọc)
    const mocTheoKy = new Map<string, number[]>()
    // trước / sau khi lấy hàng, theo kỳ
    const layTheoKy = new Map<string, { truoc: number; sau: number; gioLay: number; nLay: number }>()
    // 12 mốc mịn cộng dồn cả kỳ, tách trước/sau
    const moc = Array.from({ length: 12 }, () => ({ truoc: 0, sau: 0, nmv: 0 }))
    let truoc = 0; let sau = 0; let gioLay = 0; let nLay = 0

    for (const r of rows) {
      const sl = Number(r.so_luong || 0)
      const ky = byMonth ? `${r.ngay.slice(0, 7)}-01` : r.ngay
      const a = mocTheoKy.get(ky) ?? Array(12).fill(0)
      a[r.thu_tu - 1] += sl
      mocTheoKy.set(ky, a)

      const b = layTheoKy.get(ky) ?? { truoc: 0, sau: 0, gioLay: 0, nLay: 0 }
      const m = moc[r.thu_tu - 1]
      if (r.sau_lay) {
        b.sau += sl; sau += sl; m.sau += sl
        b.gioLay += Number(r.gio_tu_luc_lay || 0); b.nLay += Number(r.sl_co_lay || 0)
        gioLay += Number(r.gio_tu_luc_lay || 0); nLay += Number(r.sl_co_lay || 0)
      } else {
        b.truoc += sl; truoc += sl; m.truoc += sl
      }
      m.nmv += Number(r.nmv_huy || 0)
      layTheoKy.set(ky, b)
    }

    const kyTT = Array.from(mocTheoKy.keys()).sort((a, b) => a.localeCompare(b))
    const theoKy = kyTT.map((k) => {
      const raw = mocTheoKy.get(k) as number[]
      const t = raw.reduce((x, y) => x + y, 0)
      const l = layTheoKy.get(k) as { truoc: number; sau: number; gioLay: number; nLay: number }
      return {
        ky: k, n: t,
        // chuẩn hoá về 100: đây là cơ cấu trong một ngày, không phải lượng
        parts: t ? raw.map((v) => (v / t) * 100) : Array(12).fill(0),
        soLuong: raw,
        truoc: l.truoc, sau: l.sau,
        pctSau: p1(l.sau, l.truoc + l.sau),
      }
    })

    return {
      theoKy,
      moc: moc.map((m, i) => ({
        khoang: MOC_TT[i], truoc: m.truoc, sau: m.sau, nmv: m.nmv,
        tong: m.truoc + m.sau, pctSau: p1(m.sau, m.truoc + m.sau),
      })).filter((m) => m.tong > 0),
      truoc, sau, tong: truoc + sau,
      pctSau: p1(sau, truoc + sau),
      gioTrongTayShipper: nLay ? Math.round((gioLay / nLay) * 10) / 10 : null,
    }
  }, [huyChiTiet, keys, byMonth, cat])

  /* ---- hành trình đơn hàng ----
     Trung vị không gộp được giữa các kỳ, nên thay vì cố tính lại ở client ta
     nhặt đúng dòng DB đã tính: chọn một tháng thì lấy dòng tháng đó, còn lại
     lấy dòng toàn kỳ. Vì thế phần này KHÔNG chạy theo bộ lọc ngày (7d/30d) —
     có nói rõ ngay dưới tiêu đề để không ai đọc nhầm. */

  const motThang = goodMonths.length === 1 ? goodMonths[0] : null

  const hanhTrinhRows = useMemo(() => {
    const catKey = cat === 'all' ? null : cat
    const lay = (kc: string) => hanhTrinh.find(
      (r) => r.ket_cuc === kc && r.thang === motThang && r.category === catKey,
    )
    const d = lay('delivered')
    const sau = lay('cancel_after')
    const truoc = lay('cancel_before')
    const tong = (d?.so_don ?? 0) + (sau?.so_don ?? 0) + (truoc?.so_don ?? 0)
    if (!tong) return null

    const tracks = [
      d && {
        ten: 'Delivered', color: 'var(--ok)', n: d.so_don, pct: p1(d.so_don, tong),
        lay: d.lay_tv, layTb: d.lay_tb,
        ket: d.giao_tv ?? 0, ketTb: d.giao_tb ?? 0, ketNhan: 'delivered',
      },
      sau && {
        ten: 'Cancelled after pickup', color: 'var(--bad)', n: sau.so_don, pct: p1(sau.so_don, tong),
        lay: sau.lay_tv, layTb: sau.lay_tb,
        ket: sau.huy_tv ?? 0, ketTb: sau.huy_tb ?? 0, ketNhan: 'cancelled',
      },
      truoc && {
        ten: 'Cancelled before pickup', color: 'var(--c2)', n: truoc.so_don, pct: p1(truoc.so_don, tong),
        lay: null, layTb: null,
        ket: truoc.huy_tv ?? 0, ketTb: truoc.huy_tb ?? 0, ketNhan: 'cancelled',
      },
    ].filter(Boolean) as NonNullable<Parameters<typeof Timeline>[0]['tracks']>

    // Trục dài tới hết đường dài nhất, làm tròn lên mốc ngày cho dễ đọc
    const xa = Math.max(...tracks.map((t) => Math.max(t.ket, t.ketTb)))
    return { tracks, tong, maxGio: Math.ceil(xa / 24) * 24, sau, truoc, d }
  }, [hanhTrinh, motThang, cat])

  /** Số giờ giam hàng theo model, cùng cách nhặt dòng như trên. */
  const transitTheoModel = useMemo(() => {
    const catKey = cat === 'all' ? null : cat
    const m = new Map<string, { tv: number | null; tb: number | null; n: number }>()
    for (const r of transitModel) {
      if (r.thang !== motThang || r.category !== catKey) continue
      m.set(r.model, { tv: r.transit_tv, tb: r.transit_tb, n: r.so_don })
    }
    return m
  }, [transitModel, motThang, cat])

  /* ---- huỷ theo model, trước vs sau khi lấy hàng ----
     Hai nhóm này VÉT CẠN: trước + sau = đúng tỷ lệ huỷ, mẫu số là ĐƠN ĐẶT.
     Trước-lấy-hàng gần như toàn bộ là huỷ tức thì (trung vị 6 phút, 90% trong
     24h) — chuyện của phòng live và luồng checkout. Sau-lấy-hàng sớm nhất
     cũng 40h vì phải đợi shipper tới (trung vị 6,7 ngày) — chuyện vận hành. */

  const HUY_MODEL_TOI_THIEU = 30

  const modelHuy = useMemo(() => {
    const giu = (ngay: string) => (byMonth ? keys.has(`${ngay.slice(0, 7)}-01`) : keys.has(ngay))
    const m = new Map<string, {
      model: string; cat: string; dat: number; huy: number; instant: number
      truoc: number; sau: number; nmvSau: number; nmvTruoc: number
    }>()
    for (const r of huyModel) {
      if (!giu(r.ngay) || (cat !== 'all' && r.category !== cat)) continue
      const c = m.get(r.model)
        ?? { model: r.model, cat: r.category, dat: 0, huy: 0, instant: 0, truoc: 0, sau: 0, nmvSau: 0, nmvTruoc: 0 }
      c.dat += Number(r.tong_item || 0)
      c.huy += Number(r.huy || 0)
      c.instant += Number(r.huy_instant || 0)
      c.truoc += Number(r.huy_truoc || 0)
      c.sau += Number(r.huy_sau || 0)
      c.nmvSau += Number(r.nmv_huy_sau || 0)
      c.nmvTruoc += Number(r.nmv_huy_truoc || 0)
      m.set(r.model, c)
    }
    // Liệt kê ĐỦ model, không cắt bớt — nhưng model quá ít đơn thì đẩy xuống
    // cuối và làm mờ, vì một model 3 đơn huỷ 2 sẽ ra 67% và nhảy lên đầu bảng
    // trong khi chẳng nói lên điều gì.
    const rows = Array.from(m.values())
      .map((r) => ({
        ...r,
        mong: r.dat < HUY_MODEL_TOI_THIEU,
        pctHuy: p1(r.huy, r.dat),
        pctInstant: p1(r.instant, r.dat),
        pctTruoc: p1(r.truoc, r.dat),
        pctSau: p1(r.sau, r.dat),
      }))
    const tong = {
      dat: rows.reduce((a, r) => a + r.dat, 0),
      huy: rows.reduce((a, r) => a + r.huy, 0),
      truoc: rows.reduce((a, r) => a + r.truoc, 0),
      sau: rows.reduce((a, r) => a + r.sau, 0),
      nmvSau: rows.reduce((a, r) => a + r.nmvSau, 0),
    }
    // Mốc "trên/dưới trung bình" chỉ tính trên các model đủ dày, để một vài
    // model lẻ không kéo mốc đi và làm cả cột đổi màu.
    const day = rows.filter((r) => !r.mong)
    const tb = {
      truoc: p1(day.reduce((a, r) => a + r.truoc, 0), day.reduce((a, r) => a + r.dat, 0)),
      sau: p1(day.reduce((a, r) => a + r.sau, 0), day.reduce((a, r) => a + r.dat, 0)),
    }
    rows.sort((a, b) => (a.mong === b.mong
      ? (huySort === 'sau' ? b.pctSau - a.pctSau : b.pctTruoc - a.pctTruoc)
      : (a.mong ? 1 : -1)))
    return { rows, tb, tong, soMong: rows.length - day.length, soModel: rows.length }
  }, [huyModel, keys, byMonth, cat, huySort])

  /* ---- ma trận ngày đặt × ngày huỷ ----
     Trả lời trực tiếp câu hỏi: đơn đặt ngày DDAY thì chết vào loại ngày nào.
     Mỗi hàng chuẩn hoá về 100% theo hàng, vì lượng huỷ giữa các loại ngày
     lệch nhau hàng chục lần. */

  const campMx = useMemo(() => {
    const giu = (ngay: string) => (byMonth ? keys.has(`${ngay.slice(0, 7)}-01`) : keys.has(ngay))
    const cell = new Map<string, number>()
    const hangTong = new Map<string, number>()
    for (const r of campMatrix) {
      if (!giu(r.ngay) || (cat !== 'all' && r.category !== cat)) continue
      const v = Number(r.so_luong || 0)
      cell.set(`${r.dat_loai}|${r.huy_loai}`, (cell.get(`${r.dat_loai}|${r.huy_loai}`) ?? 0) + v)
      hangTong.set(r.dat_loai, (hangTong.get(r.dat_loai) ?? 0) + v)
    }
    const hang = NGAY_TT.filter((l) => (hangTong.get(l) ?? 0) > 0)
    const cot = NGAY_TT.filter((l) => hang.some((h) => (cell.get(`${h}|${l}`) ?? 0) > 0))
    return { cell, hangTong, hang, cot }
  }, [campMatrix, keys, byMonth, cat])
  /** Ô số liệu đầu phần Discounts. Chạy theo bộ lọc NGÀY như cả phần đó. */
  const discTotals = useMemo(() => {
    const t = { booked: 0, valid: 0, seller: 0, list: 0, nmv: 0 }
    for (const r of dayShown) {
      t.booked += r.platform_disc
      t.valid += r.platform_disc_chua_huy
      t.seller += r.seller_disc
      t.list += r.gia_goc
      t.nmv += r.nmv
    }
    return t
  }, [dayShown])

  /** Ô số liệu đầu phần Cancellations. Chạy theo bộ lọc kỳ chung. */
  const cancelTotals = useMemo(() => {
    const t = { gross: 0, huy: 0, mat: 0, subMat: 0, nmv: 0 }
    for (const r of shown) {
      t.gross += r.so_luong
      t.huy += r.sl_huy
      t.mat += r.gmv_mat_do_huy
      t.subMat += r.platform_disc - r.platform_disc_chua_huy
      t.nmv += r.nmv
    }
    return t
  }, [shown])

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
  /** Doanh thu theo tháng quy sang USD, ghép với chi tiêu quảng cáo cùng tháng.
   *  Cột là Seller GMV tách thành NMV (đặc) và phần mất vì huỷ (nhạt), đường là
   *  ATR. Ba thứ này phải nằm chung một biểu đồ vì NMV vừa là phần đặc của cột
   *  vừa là mẫu số của ATR — huỷ tăng thì ATR xấu đi dù chi tiêu không đổi. */
  const adsRevMonths = useMemo(() => {
    const keep = goodMonths.map((m) => m.slice(0, 7))
    return keep.map((k) => {
      const sale = momRows.find((r) => r.ky.slice(0, 7) === k)
      const nmv = (sale?.nmv ?? 0) / FX
      const cost = adsByMonth.get(k) ?? 0
      // Cột = Seller NMV, tách thành tiền ads và phần còn lại. Hai phần cộng
      // lại đúng bằng NMV, và tỷ lệ phần ads trên cả cột CHÍNH LÀ ATR — nên
      // đường ATR và hình dạng cột nói cùng một chuyện.
      const rest = Math.max(0, nmv - cost)
      return { ky: `${k}-01`, nmv, cost, rest, atr: nmv > 0 ? p1(cost, nmv) : null }
    })
  }, [goodMonths, momRows, adsByMonth, FX])

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

  /** Model mix dạng bảng: model xuống dòng, kỳ chạy ngang, thêm cột Total.
   *  Bảng dễ đọc hơn cột chồng khi có nhiều model và ~30 ngày — mắt không
   *  phải ước lượng chiều cao từng khúc nữa. */
  const mixTable = useMemo(() => {
    const cols = [...mix.kys.map(lbl), 'Total']
    const pc = (v: number, t: number) => (t ? Math.round((v / t) * 1000) / 10 : null)
    const lay = (o: { gmv: number; net: number; gross: number; huy: number } | undefined) => {
      if (!o) return null
      if (mixMetric === 'gmv') return o.gmv || null
      if (mixMetric === 'so_luong') return o.net || null
      return o.gross > 0 ? pc(o.huy, o.gross) : null
    }
    // Tổng mỗi cột, chỉ dùng cho chế độ "% của kỳ" (không áp dụng cho tỷ lệ huỷ).
    const colTot = mix.kys.map((k) => {
      let t = 0
      for (const o of (mix.byKy.get(k) ?? new Map()).values()) {
        t += mixMetric === 'gmv' ? o.gmv : o.net
      }
      return t
    })
    const grand = colTot.reduce((x, y) => x + y, 0)

    const rows = mix.series.map((sr) => {
      const per = mix.kys.map((k) => mix.byKy.get(k)?.get(sr.ten))
      const tot = mix.tong.get(sr.ten)
      const vals =
        mixMetric !== 'cancel' && mixShare
          ? [
            ...per.map((o, i) => pc(o ? (mixMetric === 'gmv' ? o.gmv : o.net) : 0, colTot[i])),
            pc(tot ? (mixMetric === 'gmv' ? tot.gmv : tot.net) : 0, grand),
          ]
          : [...per.map(lay), lay(tot)]
      return { label: sr.ten, color: sr.color, vals }
    })

    // Dòng Total: tiền và cái thì cộng, tỷ lệ huỷ thì tính lại trên tổng.
    const tongKy = mix.kys.map((k) => {
      const o = mix.z()
      for (const x of (mix.byKy.get(k) ?? new Map()).values()) {
        o.gmv += x.gmv; o.net += x.net; o.gross += x.gross; o.huy += x.huy
      }
      return o
    })
    const tongAll = mix.z()
    for (const o of mix.tong.values()) {
      tongAll.gmv += o.gmv; tongAll.net += o.net; tongAll.gross += o.gross; tongAll.huy += o.huy
    }
    rows.push({
      label: 'Total',
      color: undefined as unknown as string,
      vals:
        mixMetric !== 'cancel' && mixShare
          ? [...colTot.map((t) => (t ? 100 : null)), grand ? 100 : null]
          : [...tongKy.map(lay), lay(tongAll)],
    })
    return { cols, rows }
  }, [mix, mixShare, mixMetric, lbl])
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

  /* ---------------------------- livestream ----------------------------
     Chỉ nghe bộ lọc chip tháng, không nghe nút 7/30 ngày: một phiên live là
     một sự kiện rời rạc, cắt theo cửa sổ trượt thì tháng nào cũng dở dang.

     Dữ liệu chỉ có từ ~04/2026: API chặn tra ngược quá 180 ngày.

     Tài khoản KOC KHÔNG có số tương tác (view, comment, share đều 0) —
     TikTok chỉ cấp phần đó cho tài khoản chính chủ của shop. Nên mọi chỉ số
     dựa trên view chỉ tính cho ba phòng nhà, không gộp KOC vào rồi chia. */
  const liveKeep = useMemo(
    () => new Set(goodMonths.map((m) => m.slice(0, 7))),
    [goodMonths],
  )

  const liveTot = useMemo(() => {
    const z = () => ({
      phien: 0, gio: 0, gmv: 0, pcs: 0, don: 0, donTao: 0, khach: 0, views: 0, viewers: 0,
      likes: 0, comments: 0, shares: 0, followers: 0, imp: 0, clicks: 0, xemW: 0,
    })
    const own = z(); const koc = z()
    for (const r of liveMonthly) {
      if (!liveKeep.has(String(r.thang).slice(0, 7))) continue
      const t = r.nhom === 'own' ? own : koc
      const gio = Number(r.gio_live || 0)
      t.phien += Number(r.phien || 0); t.gio += gio
      t.gmv += Number(r.gmv || 0); t.pcs += Number(r.pcs || 0)
      t.don += Number(r.don || 0); t.donTao += Number(r.don_tao || 0)
      t.khach += Number(r.khach || 0)
      t.views += Number(r.views || 0); t.viewers += Number(r.viewers || 0)
      t.likes += Number(r.likes || 0)
      t.comments += Number(r.comments || 0); t.shares += Number(r.shares || 0)
      t.followers += Number(r.followers || 0)
      t.imp += Number(r.impressions || 0); t.clicks += Number(r.clicks || 0)
      // Thời lượng xem TB bình quân theo số giờ live, không phải theo tháng.
      t.xemW += Number(r.xem_tb_giay || 0) * gio
    }
    return { own, koc, gmv: own.gmv + koc.gmv, phien: own.phien + koc.phien }
  }, [liveMonthly, liveKeep])

  /** Một dòng cho mỗi phòng, gộp các tháng đang chọn. */
  const liveRoomAgg = useMemo(() => {
    const map = new Map<string, {
      username: string; ten: string; nhom: string
      phien: number; gio: number; gmv: number; pcs: number
      don: number; donTao: number; khach: number; spLen: number; spBan: number
      views: number; viewers: number; likes: number; comments: number
      shares: number; followers: number
      imp: number; clicks: number; xemW: number
    }>()
    for (const r of liveRooms) {
      if (!liveKeep.has(String(r.thang).slice(0, 7))) continue
      const cur = map.get(r.username) ?? {
        username: r.username, ten: r.ten, nhom: r.nhom,
        phien: 0, gio: 0, gmv: 0, pcs: 0, don: 0, donTao: 0, khach: 0,
        spLen: 0, spBan: 0,
        views: 0, viewers: 0, likes: 0, comments: 0, shares: 0, followers: 0,
        imp: 0, clicks: 0, xemW: 0,
      }
      const gio = Number(r.gio_live || 0)
      cur.phien += Number(r.phien || 0); cur.gio += gio
      cur.gmv += Number(r.gmv || 0); cur.pcs += Number(r.pcs || 0)
      cur.don += Number(r.don || 0); cur.donTao += Number(r.don_tao || 0)
      cur.khach += Number(r.khach || 0)
      cur.spLen += Number(r.sp_len || 0); cur.spBan += Number(r.sp_ban || 0)
      cur.views += Number(r.views || 0); cur.viewers += Number(r.viewers || 0)
      cur.likes += Number(r.likes || 0)
      cur.comments += Number(r.comments || 0); cur.shares += Number(r.shares || 0)
      cur.followers += Number(r.followers || 0)
      cur.imp += Number(r.impressions || 0); cur.clicks += Number(r.clicks || 0)
      // Thời lượng xem TB bình quân theo số GIỜ live: một phiên 12 tiếng không
      // thể cân bằng điểm với một phiên 2 tiếng.
      cur.xemW += Number(r.xem_tb_giay || 0) * gio
      map.set(r.username, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.gmv - a.gmv)
  }, [liveRooms, liveKeep])

  const liveOwnRooms = useMemo(() => liveRoomAgg.filter((r) => r.nhom === 'own'), [liveRoomAgg])
  const liveKocRooms = useMemo(() => liveRoomAgg.filter((r) => r.nhom !== 'own'), [liveRoomAgg])

  /** Các tháng có dữ liệu live, theo thứ tự thời gian. */
  const liveMonthKeys = useMemo(() => {
    const set = new Set<string>()
    for (const r of liveMonthly) {
      const k = String(r.thang).slice(0, 7)
      if (liveKeep.has(k)) set.add(k)
    }
    return Array.from(set).sort()
  }, [liveMonthly, liveKeep])

  /** Theo tháng: cột GMV own vs KOC, đường CTR sản phẩm của ba phòng nhà. */
  const liveMonthRows = useMemo(() => {
    const m = new Map<string, {
      ky: string; own: number; koc: number; views: number; viewers: number; imp: number
      clicks: number; don: number; donTao: number; gio: number; gioOwn: number; phien: number
      likes: number; comments: number; shares: number; followers: number; xemW: number
    }>()
    for (const k of liveMonthKeys) {
      m.set(k, {
        ky: `${k}-01`, own: 0, koc: 0, views: 0, viewers: 0, imp: 0, clicks: 0,
        don: 0, donTao: 0, gio: 0, gioOwn: 0, phien: 0,
        likes: 0, comments: 0, shares: 0, followers: 0, xemW: 0,
      })
    }
    for (const r of liveMonthly) {
      const k = String(r.thang).slice(0, 7)
      const cur = m.get(k)
      if (!cur) continue
      const g = Number(r.gmv || 0)
      if (r.nhom === 'own') {
        const gio = Number(r.gio_live || 0)
        cur.own += g
        cur.gioOwn += gio
        cur.views += Number(r.views || 0)
        cur.viewers += Number(r.viewers || 0)
        cur.imp += Number(r.impressions || 0)
        cur.clicks += Number(r.clicks || 0)
        cur.likes += Number(r.likes || 0)
        cur.comments += Number(r.comments || 0)
        cur.shares += Number(r.shares || 0)
        cur.followers += Number(r.followers || 0)
        cur.xemW += Number(r.xem_tb_giay || 0) * gio
      } else cur.koc += g
      cur.don += Number(r.don || 0)
      cur.donTao += Number(r.don_tao || 0)
      cur.gio += Number(r.gio_live || 0)
      cur.phien += Number(r.phien || 0)
    }
    return Array.from(m.values())
  }, [liveMonthly, liveMonthKeys])

  /** Theo ngày, gộp own + KOC. Chỉ lấy ngày thuộc các tháng đang chọn. */
  const liveDays = useMemo(() => {
    const m = new Map<string, {
      ngay: string; own: number; koc: number; views: number; viewers: number
      gio: number; gioOwn: number; phien: number
      imp: number; clicks: number; don: number; donTao: number; pcs: number
      likes: number; comments: number; shares: number; followers: number; xemW: number
    }>()
    for (const r of liveDaily) {
      const k = String(r.ngay)
      if (!liveKeep.has(k.slice(0, 7))) continue
      const cur = m.get(k) ?? {
        ngay: k, own: 0, koc: 0, views: 0, viewers: 0, gio: 0, gioOwn: 0, phien: 0,
        imp: 0, clicks: 0, don: 0, donTao: 0, pcs: 0,
        likes: 0, comments: 0, shares: 0, followers: 0, xemW: 0,
      }
      if (r.nhom === 'own') {
        const gio = Number(r.gio_live || 0)
        cur.own += Number(r.gmv || 0)
        cur.gioOwn += gio
        cur.views += Number(r.views || 0)
        cur.viewers += Number(r.viewers || 0)
        cur.imp += Number(r.impressions || 0)
        cur.clicks += Number(r.clicks || 0)
        cur.likes += Number(r.likes || 0)
        cur.comments += Number(r.comments || 0)
        cur.shares += Number(r.shares || 0)
        cur.followers += Number(r.followers || 0)
        cur.xemW += Number(r.xem_tb_giay || 0) * gio
      } else cur.koc += Number(r.gmv || 0)
      cur.gio += Number(r.gio_live || 0)
      cur.phien += Number(r.phien || 0)
      cur.don += Number(r.don || 0)
      cur.donTao += Number(r.don_tao || 0)
      cur.pcs += Number(r.pcs || 0)
      m.set(k, cur)
    }
    return Array.from(m.values()).sort((a, b) => a.ngay.localeCompare(b.ngay))
  }, [liveDaily, liveKeep])

  /* ---- đầu phễu: từ feed vào phòng live ----
     Số ở CẤP SHOP, không tách được theo phòng. Nguồn là endpoint 202609,
     khác với endpoint từng phiên nên views lệch nhau ~6% — đã đối chiếu
     product impressions và clicks thì hai nguồn khớp trong 1%, tức cùng một
     tập, chỉ khác cách đếm lượt xem. */

  const dauPheu = useMemo(() => {
    const rows = liveOverview
      .filter((r) => liveKeep.has(String(r.ngay).slice(0, 7)))
      .slice()
      .sort((a, b) => String(a.ngay).localeCompare(String(b.ngay)))
    if (!rows.length) return null

    const t = rows.reduce((a, r) => ({
      shows: a.shows + Number(r.shows || 0),
      views: a.views + Number(r.views || 0),
      gmv: a.gmv + Number(r.live_attributed_gmv || 0),
      giao: a.giao + Number(r.live_gmv || 0),
      gianTiep: a.gianTiep + Number(r.live_indirect_gmv || 0),
      don: a.don + Number(r.sku_orders || 0),
    }), { shows: 0, views: 0, gmv: 0, giao: 0, gianTiep: 0, don: 0 })

    // Gộp theo kỳ để vẽ, theo đúng thanh lọc DoD / MoM phía trên
    const m = new Map<string, { ky: string; shows: number; views: number; gmv: number; gianTiep: number }>()
    for (const r of rows) {
      const ky = byMonth ? `${String(r.ngay).slice(0, 7)}-01` : String(r.ngay)
      const c = m.get(ky) ?? { ky, shows: 0, views: 0, gmv: 0, gianTiep: 0 }
      c.shows += Number(r.shows || 0)
      c.views += Number(r.views || 0)
      c.gmv += Number(r.live_attributed_gmv || 0)
      c.gianTiep += Number(r.live_indirect_gmv || 0)
      m.set(ky, c)
    }
    const ky = Array.from(m.values())
      .sort((a, b) => a.ky.localeCompare(b.ky))
      .map((r) => ({ ...r, tap: p1(r.views, r.shows), pctGt: p1(r.gianTiep, r.gmv) }))

    // Ba tầng dưới lấy số THẬT từ bảng phiên, không suy ra — đã kiểm chéo
    // với phép suy từ live_ctr / ctor_sku_order, lệch dưới 1,5%.
    const duoi = liveDays.reduce((a, r) => ({
      imp: a.imp + r.imp, clicks: a.clicks + r.clicks, don: a.don + r.don,
    }), { imp: 0, clicks: 0, don: 0 })

    return {
      rows, ky, tong: t, duoi,
      tap: p1(t.views, t.shows),
      pctGt: p1(t.gianTiep, t.gmv),
    }
  }, [liveOverview, liveKeep, byMonth, liveDays])

  /** GMV từng phòng theo NGÀY. v_live_daily chỉ gộp theo nhóm nên phần này
   *  phải dựng từ chính bảng phiên — mỗi phiên tính vào ngày bắt đầu. */
  const liveDayRoom = useMemo(() => {
    const names = liveOwnRooms.map((r) => r.ten)
    const idx = new Map(names.map((n, i) => [n, i]))
    const byDay = new Map<string, number[]>()
    for (const r of liveSessions) {
      const k = String(r.ngay)
      if (!liveKeep.has(k.slice(0, 7))) continue
      const row = byDay.get(k) ?? new Array(names.length + 1).fill(0)
      const at = r.nhom === 'own' ? idx.get(r.ten) : names.length
      if (at == null) continue
      row[at] += Number(r.gmv || 0)
      byDay.set(k, row)
    }
    const days = Array.from(byDay.keys()).sort()
    const series = [
      ...names.map((n, i) => ({ ten: n, color: PALETTE[i % PALETTE.length] })),
      { ten: 'KOC', color: GREY },
    ]
    return {
      names, series, days,
      data: days.map((d) => ({ ky: d, parts: byDay.get(d) ?? [] })),
      get: (d: string, i: number) => byDay.get(d)?.[i] ?? 0,
    }
  }, [liveSessions, liveOwnRooms, liveKeep])

  /** Phòng × ngày và phòng × tháng, đầy đủ chỉ số — dựng từ bảng phiên vì
   *  v_live_daily chỉ gộp theo nhóm own/koc. Hai lưới so sánh dùng chung. */
  const liveGrid = useMemo(() => {
    const z = (): LiveAgg => ({
      lgm: 0, gmv: 0, pcs: 0, don: 0, donTao: 0, khach: 0, views: 0, viewers: 0,
      likes: 0, comments: 0, shares: 0, followers: 0, imp: 0, clicks: 0,
      gio: 0, xemW: 0, phien: 0,
    })
    const cong = (t: LiveAgg, r: LiveSession) => {
      const gio = Number(r.duration_phut || 0) / 60
      t.gmv += Number(r.gmv || 0); t.pcs += Number(r.items_sold || 0)
      t.don += Number(r.sku_orders || 0); t.donTao += Number(r.created_sku_orders || 0)
      t.khach += Number(r.customers || 0)
      t.views += Number(r.views || 0); t.viewers += Number(r.viewers || 0)
      t.likes += Number(r.likes || 0); t.comments += Number(r.comments || 0)
      t.shares += Number(r.shares || 0); t.followers += Number(r.new_followers || 0)
      t.imp += Number(r.product_impressions || 0); t.clicks += Number(r.product_clicks || 0)
      t.gio += gio; t.xemW += Number(r.avg_viewing_duration || 0) * gio
      t.phien += 1
    }
    const ngay = new Map<string, Map<string, LiveAgg>>()
    const thang = new Map<string, Map<string, LiveAgg>>()
    const days = new Set<string>()
    const months = new Set<string>()
    for (const r of liveSessions) {
      const d = String(r.ngay)
      const m = d.slice(0, 7)
      if (!liveKeep.has(m)) continue
      const who = r.nhom === 'own' ? r.ten : 'KOC'
      days.add(d); months.add(m)
      const dm = ngay.get(who) ?? new Map<string, LiveAgg>()
      const da = dm.get(d) ?? z(); cong(da, r); dm.set(d, da); ngay.set(who, dm)
      const mm = thang.get(who) ?? new Map<string, LiveAgg>()
      const ma = mm.get(m) ?? z(); cong(ma, r); mm.set(m, ma); thang.set(who, mm)
    }
    // Tiền LGM đổ vào sau, chỉ cộng cho ngày thực sự có phiên live: ngày có
    // chi mà không live thì không có mẫu số nào để so, đưa vào chỉ làm nhiễu.
    for (const r of liveLgm) {
      const d = String(r.ngay)
      const m = d.slice(0, 7)
      if (!liveKeep.has(m)) continue
      const v = Number(r.lgm_vnd || 0)
      if (!v) continue
      const da = ngay.get(r.ten)?.get(d)
      if (da) da.lgm += v
      const ma = thang.get(r.ten)?.get(m)
      if (ma) ma.lgm += v
    }

    return {
      days: Array.from(days).sort(),
      months: Array.from(months).sort(),
      ngay, thang,
      hang: [...liveOwnRooms.map((r) => r.ten), 'KOC'],
    }
  }, [liveSessions, liveLgm, liveKeep, liveOwnRooms])

  /** Mỗi ngày của mỗi phòng nhà thành một bong bóng: engagement × CTR × GMV. */
  const bubblePts = useMemo(() => {
    const out: {
      key: string; ten: string; ngay: string; x: number; y: number; v: number; color: string
      views: number; gio: number
    }[] = []
    liveOwnRooms.forEach((r, i) => {
      const dm = liveGrid.ngay.get(r.ten)
      if (!dm) return
      for (const [d, ag] of dm) {
        if (ag.views <= 0 || ag.imp <= 0 || ag.gmv <= 0) continue
        out.push({
          key: `${r.username}-${d}`, ten: r.ten, ngay: d,
          x: Math.round(((ag.likes + ag.comments + ag.shares) / ag.views) * 1000) / 10,
          y: Math.round((ag.clicks / ag.imp) * 10000) / 100,
          v: ag.gmv, color: PALETTE[i % PALETTE.length],
          views: ag.views, gio: ag.gio,
        })
      }
    })
    return out.sort((m, n) => n.v - m.v)
  }, [liveOwnRooms, liveGrid])

  /** Trung vị từng phòng, để đọc đám bong bóng mà không phải nheo mắt. */
  const bubbleMid = useMemo(() => {
    const mid = (xs: number[]) => {
      if (!xs.length) return 0
      const a2 = xs.slice().sort((m, n) => m - n)
      const h = Math.floor(a2.length / 2)
      return a2.length % 2 ? a2[h] : (a2[h - 1] + a2[h]) / 2
    }
    return liveOwnRooms.map((r, i) => {
      const mine = bubblePts.filter((b) => b.ten === r.ten)
      return {
        ten: r.ten, color: PALETTE[i % PALETTE.length], n: mine.length,
        x: mid(mine.map((b) => b.x)), y: mid(mine.map((b) => b.y)), v: mid(mine.map((b) => b.v)),
      }
    })
  }, [bubblePts, liveOwnRooms])

  /** Tổng LGM từng phòng trong khoảng đang lọc, chỉ tính ngày có live. */
  const lgmTong = useMemo(() => {
    const m = new Map<string, number>()
    for (const [who, dm] of liveGrid.ngay) {
      let t = 0
      for (const ag of dm.values()) t += ag.lgm
      m.set(who, t)
    }
    return m
  }, [liveGrid])

  const lgmOwn = useMemo(
    () => liveOwnRooms.reduce((t, r) => t + (lgmTong.get(r.ten) ?? 0), 0),
    [liveOwnRooms, lgmTong],
  )
  /** GMV thu về trên mỗi đồng LGM. */
  const lgmLai = (gmv: number, lgm: number) => (lgm > 0 ? `${(gmv / lgm).toFixed(1)}×` : '—')

  /** Dữ liệu cho biểu đồ tổng quan đầu sheet: GMV chồng theo phòng, GMV/1k
   *  views và tiền LGM, cùng một trục ngày. Chỉ tính ba phòng nhà. */
  const headRows = useMemo(() => {
    const names = liveOwnRooms.map((r) => r.ten)
    return liveGrid.days.map((d) => {
      const parts = names.map((nm) => liveGrid.ngay.get(nm)?.get(d)?.gmv ?? 0)
      let views = 0; let lgm = 0; let phien = 0
      for (const nm of names) {
        const ag = liveGrid.ngay.get(nm)?.get(d)
        if (!ag) continue
        views += ag.views; lgm += ag.lgm; phien += ag.phien
      }
      const tong = parts.reduce((m, n) => m + n, 0)
      return { ngay: d, parts, tong, views, lgm, phien, gpm: views > 0 ? (tong / views) * 1000 : 0 }
    }).filter((r) => r.tong > 0)
  }, [liveGrid, liveOwnRooms])

  const mDef = useMemo(
    () => ROOM_METRICS.find((m) => m.id === roomMetric) ?? ROOM_METRICS[0],
    [roomMetric],
  )

  /** Một hàng của lưới: lấy giá trị chỉ số đang chọn cho từng cột. */
  const gridRows = (
    src: Map<string, Map<string, LiveAgg>>,
    cols: string[],
    boKoc = false,
  ) =>
    liveGrid.hang
      .filter((h) => !(boKoc && h === 'KOC'))
      .map((h, i) => ({
        label: h,
        color: h === 'KOC' ? GREY : PALETTE[i % PALETTE.length],
        vals: cols.map((c) => {
          const a2 = src.get(h)?.get(c)
          return a2 ? mDef.lay(a2) : null
        }),
      }))

  /** Vài mốc theo ngày cho hàng ô đầu sheet: ngày mạnh nhất, ngày gần nhất
   *  và mức tăng giảm so với ngày liền trước. */
  const liveDayStats = useMemo(() => {
    const tot = liveDays.map((d) => ({ ngay: d.ngay, v: d.own + d.koc }))
    if (!tot.length) return null
    const best = tot.reduce((a2, b) => (b.v > a2.v ? b : a2))
    const last = tot[tot.length - 1]
    const prev = tot.length > 1 ? tot[tot.length - 2] : null
    const sum = tot.reduce((a2, b) => a2 + b.v, 0)
    return { n: tot.length, avg: sum / tot.length, best, last, prev }
  }, [liveDays])

  /** Lưới phòng × ngày chỉ vẽ nổi vài chục cột; chọn cả 6 tháng là 175 ngày
   *  nên cắt còn 45 ngày gần nhất, phần còn lại đọc ở bảng bên dưới. */
  const gridDays = useMemo(() => liveGrid.days.slice(-45), [liveGrid])

  const liveTop = useMemo(
    () => liveSessions
      .filter((r) => liveKeep.has(String(r.ngay).slice(0, 7)))
      .sort((a, b) => Number(b.gmv || 0) - Number(a.gmv || 0)),
    [liveSessions, liveKeep],
  )

  /** GMV trên 1.000 lượt xem — thước đo hiệu quả duy nhất so sánh được giữa
      ba phòng, vì quy mô traffic của chúng chênh nhau nhiều. */
  /** Nhãn cột hẹp: bỏ tiền tố 'Roborock' cho đỡ cắt chữ. */
  const shortRoom = (t: string) => t.replace(/^Roborock\s*/i, '') || t
  const per1k = (gmv: number, views: number) => (views > 0 ? (gmv / views) * 1000 : 0)
  /** Số lần trên 1.000 lượt xem — dùng cho comment, share, follow. */
  const k1 = (v: number, views: number) => (views > 0 ? Math.round((v / views) * 1000 * 10) / 10 : 0)

  /* ---- hiệu quả theo kênh bán ----
     Ngưỡng phủ sóng 60%: TikTok chỉ trả room_id trên line item từ 05/2026, và
     tới 07/2026 mới phủ ổn định ~65–70%. Tháng nào dưới ngưỡng thì null KHÔNG
     có nghĩa là "ngoài live" mà là "không biết" — vẽ ra chỉ gây hiểu sai, nên
     cắt hẳn khỏi bảng thay vì để người đọc tự đoán. */
  const KENH_NGUONG = 60
  const kenhThang = useMemo(() => {
    const ok = new Set<string>()
    for (const r of kenhMonthly) {
      const k = String(r.thang).slice(0, 7)
      // Hai điều kiện: đủ phủ sóng tag phòng, VÀ nằm trong các tháng đang chọn
      // ở thanh chip phía trên. Thiếu vế sau thì phần này đứng yên khi lọc.
      if (Number(r.phu_song || 0) >= KENH_NGUONG && liveKeep.has(k)) ok.add(k)
    }
    return Array.from(ok).sort()
  }, [kenhMonthly, liveKeep])

  const kenhBang = useMemo(() => {
    const keep = new Set(kenhThang)
    // Ba phòng nhà trước, rồi tới các kênh còn lại — thứ tự cố định để bảng
    // không nhảy khi một kênh trống tháng.
    const uu = ['Roborock Official VN', 'Roborock Máy lau sàn', 'Roborock Lifestyle VN']
    const rows = new Map<string, Map<string, KenhMonth>>()
    for (const r of kenhMonthly) {
      const k = String(r.thang).slice(0, 7)
      if (!keep.has(k)) continue
      const m = rows.get(r.kenh) ?? new Map<string, KenhMonth>()
      m.set(k, r)
      rows.set(r.kenh, m)
    }
    const ten = [
      ...uu.filter((x) => rows.has(x)),
      ...Array.from(rows.keys()).filter((x) => !uu.includes(x)).sort(),
    ]
    const tong = new Map<string, { nmv: number; net: number; gross: number }>()
    for (const k of kenhThang) {
      let nmv = 0; let net = 0; let gross = 0
      for (const m of rows.values()) {
        const r = m.get(k)
        if (!r) continue
        nmv += Number(r.nmv || 0); net += Number(r.sl_chua_huy || 0); gross += Number(r.so_luong || 0)
      }
      tong.set(k, { nmv, net, gross })
    }
    const phu = new Map<string, number>()
    for (const r of kenhMonthly) {
      const k = String(r.thang).slice(0, 7)
      if (keep.has(k)) phu.set(k, Number(r.phu_song || 0))
    }
    return { ten, rows, tong, phu, thang: kenhThang }
  }, [kenhMonthly, kenhThang])

  /** Chi tiêu LGM gộp theo kênh × tháng, để tính ATR trên doanh thu THẬT.
   *  ATR ở phần 5.3 tính trên GMV gộp TikTok báo cho phiên live; cái này tính
   *  trên Seller NMV của chính shop nên luôn cao hơn, và nó mới là con số
   *  đúng nghĩa "quảng cáo ăn bao nhiêu phần doanh thu". */
  /** Bảng LGM gọi nhóm creator là 'KOC', bảng kênh gọi là 'Creator live'.
   *  Dịch một chỗ ở đây thay vì nhớ quy đổi ở mọi nơi tra cứu. */
  const khoaLgm = (ten: string) => (ten === 'Creator live' ? 'KOC' : ten)

  const lgmKenhThang = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of liveLgm) {
      const k = `${r.ten}|${String(r.ngay).slice(0, 7)}`
      m.set(k, (m.get(k) ?? 0) + Number(r.lgm_vnd || 0))
    }
    return m
  }, [liveLgm])

  /** LGM theo kênh × NGÀY — cùng nguồn với bản tháng, chỉ khác độ chia. */
  const lgmKenhNgay = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of liveLgm) m.set(`${r.ten}|${r.ngay}`, (m.get(`${r.ten}|${r.ngay}`) ?? 0) + Number(r.lgm_vnd || 0))
    return m
  }, [liveLgm])

  /** Khuôn dữ liệu kênh theo ngày, cùng hình dạng với kenhBang để hai chế độ
   *  tháng/ngày dùng chung một đoạn vẽ. Lưới ngày cắt 45 ngày gần nhất. */
  const kenhBangNgay = useMemo(() => {
    const uu = ['Roborock Official VN', 'Roborock Máy lau sàn', 'Roborock Lifestyle VN']
    const rows = new Map<string, Map<string, KenhDay>>()
    const ngays = new Set<string>()
    for (const r of kenhDaily) {
      if (Number(r.phu_song || 0) < KENH_NGUONG) continue
      const d = String(r.ngay)
      if (!liveKeep.has(d.slice(0, 7))) continue
      ngays.add(d)
      const m = rows.get(r.kenh) ?? new Map<string, KenhDay>()
      m.set(d, r)
      rows.set(r.kenh, m)
    }
    const ten = [
      ...uu.filter((x) => rows.has(x)),
      ...Array.from(rows.keys()).filter((x) => !uu.includes(x)).sort(),
    ]
    const tatCa = Array.from(ngays).sort()
    return { ten, rows, thang: tatCa, luoi: tatCa.slice(-45) }
  }, [kenhDaily, liveKeep])

  const KENH_METRICS = useMemo(() => ([
    { id: 'nmv' as const, ten: 'Seller NMV', don_vi: 'VND bn', xau_cao: false,
      lay: (r: KenhMonth | KenhDay) => Number(r.nmv || 0) || null,
      fmt: (v: number) => ((v || 0) / 1e9).toFixed(2) },
    { id: 'pcs' as const, ten: 'Net pcs', don_vi: '', xau_cao: false,
      lay: (r: KenhMonth | KenhDay) => Number(r.sl_chua_huy || 0) || null,
      fmt: (v: number) => n0(v) },
    { id: 'cancel' as const, ten: 'Cancellation rate', don_vi: '%', xau_cao: true,
      lay: (r: KenhMonth | KenhDay) => Number(r.cancel_rate || 0) || null,
      fmt: (v: number) => `${v}%` },
    { id: 'atr' as const, ten: 'ATR on Seller NMV', don_vi: '%', xau_cao: true,
      lay: (r: KenhMonth | KenhDay) => {
        const khoa = 'thang' in r
          ? `${khoaLgm(r.kenh)}|${String(r.thang).slice(0, 7)}`
          : `${khoaLgm(r.kenh)}|${String((r as KenhDay).ngay)}`
        const lgm = ('thang' in r ? lgmKenhThang : lgmKenhNgay).get(khoa) ?? 0
        const nmv = Number(r.nmv || 0)
        return lgm > 0 && nmv > 0 ? Math.round((lgm / nmv) * 1000) / 10 : null
      },
      fmt: (v: number) => `${v}%` },
  ]), [lgmKenhThang])

  const kDef = useMemo(
    () => KENH_METRICS.find((m) => m.id === kenhMetric) ?? KENH_METRICS[0],
    [KENH_METRICS, kenhMetric],
  )

  /** Cột chồng Seller NMV theo tháng, tách theo kênh. */
  /** Ba phòng chính chủ, theo đúng thứ tự dùng ở mọi nơi khác. */
  const PHONG_NHA = ['Roborock Official VN', 'Roborock Máy lau sàn', 'Roborock Lifestyle VN']

  /** NMV tách làm hai phần: tiền LGM và phần còn lại sau quảng cáo.
   *  Hai phần cộng lại đúng bằng NMV, nên phần màu chiếm bao nhiêu của cột
   *  CHÍNH LÀ ATR vẽ trên đường — hình và đường tự kiểm tra lẫn nhau. */
  const kenhAtr = useMemo(() => {
    const kb = kenhNgay ? kenhBangNgay : kenhBang
    const lgmMap = kenhNgay ? lgmKenhNgay : lgmKenhThang
    const phong = kenhRoom === 'all'
      ? PHONG_NHA.filter((t) => kb.ten.includes(t))
      : [kenhRoom]
    return kb.thang.map((k) => {
      let nmv = 0
      let lgm = 0
      for (const t of phong) {
        nmv += Number(kb.rows.get(t)?.get(k)?.nmv ?? 0)
        lgm += lgmMap.get(`${t}|${k}`) ?? 0
      }
      return {
        ky: kenhNgay ? k : `${k}-01`,
        nmv, lgm,
        rest: Math.max(0, nmv - lgm),
        atr: nmv > 0 && lgm > 0 ? Math.round((lgm / nmv) * 1000) / 10 : null,
      }
    })
  }, [kenhBang, kenhBangNgay, kenhNgay, kenhRoom, lgmKenhThang, lgmKenhNgay])

  /** Sản phẩm × phòng, gộp các tháng đủ phủ sóng tag phòng.
   *
   *  Bảng này trả lời "phòng nào bán được model nào" — thứ mà GMV phiên live
   *  của TikTok không nói được, vì nó không tách theo sản phẩm. Ở đây tách
   *  được là nhờ đi từ đơn hàng: mỗi dòng hàng có cả model lẫn room_id. */
  const skuKenh = useMemo(() => {
    const cot = [...PHONG_NHA, 'Ngoài live']
    const rows = new Map<string, Map<string, { nmv: number; net: number; gross: number; huy: number }>>()
    const tongCot = new Map<string, number>()
    for (const r of kenhSku) {
      if (Number(r.phu_song || 0) < KENH_NGUONG) continue
      if (!liveKeep.has(String(r.thang).slice(0, 7))) continue
      if (!cot.includes(r.kenh)) continue
      const m = rows.get(r.model) ?? new Map()
      const cur = m.get(r.kenh) ?? { nmv: 0, net: 0, gross: 0, huy: 0 }
      cur.nmv += Number(r.nmv || 0)
      cur.net += Number(r.sl_chua_huy || 0)
      cur.gross += Number(r.so_luong || 0)
      cur.huy += Number(r.sl_huy || 0)
      m.set(r.kenh, cur)
      rows.set(r.model, m)
      tongCot.set(r.kenh, (tongCot.get(r.kenh) ?? 0) + Number(r.nmv || 0))
    }
    // Xếp model theo NMV của ba phòng nhà, không tính "Ngoài live" — bảng này
    // để soi phòng live, model chỉ bán ngoài live không nên đứng đầu.
    const diem = (m: Map<string, { nmv: number }>) =>
      PHONG_NHA.reduce((t, k) => t + (m.get(k)?.nmv ?? 0), 0)
    const models = Array.from(rows.entries())
      .filter(([, m]) => diem(m) > 0)
      .sort((x, y) => diem(y[1]) - diem(x[1]))
      .map((e) => e[0])
    return { cot, rows, models, tongCot }
  }, [kenhSku, liveKeep])

  const SKU_METRICS = [
    { id: 'nmv' as const, ten: 'Seller NMV', don_vi: 'VND bn', xau_cao: false,
      lay: (o: { nmv: number }) => o.nmv || null,
      fmt: (v: number) => ((v || 0) / 1e9).toFixed(2) },
    { id: 'pcs' as const, ten: 'Net pcs', don_vi: '', xau_cao: false,
      lay: (o: { net: number }) => o.net || null,
      fmt: (v: number) => n0(v) },
    // Ô dưới 5 pcs gộp thì bỏ trống: bán 1 cái huỷ 1 cái ra "100%" trông y hệt
    // một vấn đề thật, mà thực ra chẳng nói lên gì.
    { id: 'cancel' as const, ten: 'Cancellation rate', don_vi: '%', xau_cao: true,
      lay: (o: { gross: number; huy: number }) =>
        (o.gross >= 5 ? Math.round((o.huy / o.gross) * 1000) / 10 : null),
      fmt: (v: number) => `${v}%` },
    { id: 'mix' as const, ten: 'Share of room', don_vi: '%', xau_cao: false,
      lay: () => null, fmt: (v: number) => `${v}%` },
  ]
  const sDef = useMemo(
    () => SKU_METRICS.find((m) => m.id === skuMetric) ?? SKU_METRICS[0],
    [skuMetric],
  )

  /** Giờ live đặt cạnh doanh thu THẬT của chính phòng đó.
   *
   *  Hai nguồn khác nhau ghép lại: số giờ lấy từ bảng phiên live, NMV lấy từ
   *  đơn hàng có gắn phòng. Chỉ giữ những ngày có cả hai — ngày phòng có live
   *  nhưng tag phòng chưa phủ thì bỏ, không vẽ thành "live mà không ra đồng
   *  nào". */
  const gioNmvNgay = useMemo(() => {
    const out: {
      key: string; ten: string; ngay: string; gio: number; nmv: number
      pcs: number; phien: number; lgm: number; color: string
    }[] = []
    PHONG_NHA.forEach((ten, i) => {
      if (!kenhBangNgay.ten.includes(ten)) return
      for (const d of kenhBangNgay.thang) {
        const live = liveGrid.ngay.get(ten)?.get(d)
        const don = kenhBangNgay.rows.get(ten)?.get(d)
        if (!live || live.gio <= 0) continue
        out.push({
          key: `${ten}-${d}`, ten, ngay: d,
          gio: live.gio,
          nmv: Number(don?.nmv ?? 0),
          pcs: Number(don?.sl_chua_huy ?? 0),
          phien: live.phien,
          lgm: lgmKenhNgay.get(`${ten}|${d}`) ?? 0,
          color: PALETTE[i % PALETTE.length],
        })
      }
    })
    return out
  }, [kenhBangNgay, liveGrid, lgmKenhNgay])

  /** Đường cong phản hồi: gom ngày theo số giờ live rồi tính tiền trên mỗi
   *  giờ ở từng mức. Đây mới là thứ chỉ ra điểm gãy — phân tán từng ngày
   *  nhiễu quá, không đọc ra xu hướng.
   *
   *  Tiền mỗi giờ tính bằng TỔNG NMV chia TỔNG GIỜ của nhóm, không phải trung
   *  bình của các tỷ lệ ngày: một ngày live 1 tiếng bán được 1 máy sẽ kéo lệch
   *  trung bình cộng rất mạnh. */
  const gioCurve = useMemo(() => {
    const canh = [0, 2, 4, 6, 8, 10, 12, 14, 16]
    const nhan = canh.map((c, i) =>
      (i === canh.length - 1 ? `${c}h+` : `${c}–${canh[i + 1]}h`))
    const oNao = (g: number) => {
      for (let i = canh.length - 1; i >= 0; i--) if (g >= canh[i]) return i
      return 0
    }
    const rooms = PHONG_NHA.filter((t) => kenhBangNgay.ten.includes(t))
    const series = rooms.map((ten, i) => {
      // Ngưỡng chi chia theo TỪNG PHÒNG: ba phòng tiêu ở ba mức rất khác nhau,
      // lấy chung một ngưỡng thì "chi cao" sẽ toàn là Official.
      const chi = gioNmvNgay.filter((x) => x.ten === ten).map((x) => x.lgm).sort((m, n2) => m - n2)
      const q = (p2: number) => (chi.length ? chi[Math.floor((chi.length - 1) * p2)] : 0)
      const t1 = q(1 / 3)
      const t2 = q(2 / 3)
      const hop = (v: number) =>
        gioAds === 'all' ? true
          : gioAds === 'low' ? v <= t1
            : gioAds === 'mid' ? v > t1 && v <= t2
              : v > t2
      const gom = canh.map(() => ({ nmv: 0, gio: 0, ngay: 0, lgm: 0 }))
      let chiTong = 0
      let chiNgay = 0
      for (const b2 of gioNmvNgay) {
        if (b2.ten !== ten) continue
        if (!hop(b2.lgm)) continue
        const o = gom[oNao(b2.gio)]
        o.nmv += b2.nmv; o.gio += b2.gio; o.ngay += 1; o.lgm += b2.lgm
        chiTong += b2.lgm; chiNgay += 1
      }
      return {
        ten, color: PALETTE[i % PALETTE.length], gom,
        // Ngưỡng cắt và mức chi trung bình của đúng nhóm đang chọn, để chú
        // thích bên dưới nói được "một ngày ở nhóm này tiêu khoảng bao nhiêu".
        t1, t2, chiTB: chiNgay > 0 ? chiTong / chiNgay : 0, chiNgay,
        vals: gom.map((o) => {
          if (o.ngay < 2) return null
          return gioMetric === 'per_hour'
            ? (o.gio > 0 ? o.nmv / o.gio : null)
            : o.nmv / o.ngay
        }),
        n: gom.map((o) => o.ngay),
      }
    })
    return { nhan, series }
  }, [gioNmvNgay, kenhBangNgay, gioMetric, gioAds])

  /** Nhịp live theo tháng: mỗi tháng phòng lên sóng bao nhiêu NGÀY, mỗi ngày
   *  dài bao nhiêu, và một giờ đáng bao nhiêu tiền.
   *
   *  Tách "số ngày lên sóng" khỏi "độ dài mỗi ngày" là chủ ý: tổng giờ tháng
   *  là tích của hai thứ đó, mà hai thứ đó chịu hai quyết định vận hành khác
   *  nhau — bao nhiêu buổi, và mỗi buổi kéo bao lâu. */
  /** Các kỳ của phần 5.9: tháng hay ngày, theo nút kỳ chung. */
  const nhipKy = useMemo(
    () => (byMonth ? kenhBang.thang : kenhBangNgay.thang),
    [byMonth, kenhBang, kenhBangNgay],
  )

  const nhipThang = useMemo(() => {
    const rooms = PHONG_NHA.filter((t) => kenhBangNgay.ten.includes(t))
    // Khung giờ cho điểm ngọt: cùng cách chia với đường cong ở trên.
    const canh = [0, 2, 4, 6, 8, 10, 12, 14, 16]
    const oNao = (g: number) => {
      for (let i = canh.length - 1; i >= 0; i--) if (g >= canh[i]) return i
      return 0
    }
    const giua = (i: number) => (i === canh.length - 1 ? 18 : canh[i] + 1)

    return rooms.map((ten, i) => {
      const mine = gioNmvNgay.filter((x) => x.ten === ten)
      // Gom theo THÁNG hay theo NGÀY tuỳ nút kỳ chung ở đầu trang, để phần này
      // đổi theo cùng lúc với mọi phần khác thay vì cố định ở tháng.
      const thang = new Map<string, { ngay: number; gio: number; nmv: number; phien: number }>()
      for (const x of mine) {
        const k = byMonth ? x.ngay.slice(0, 7) : x.ngay
        const o = thang.get(k) ?? { ngay: 0, gio: 0, nmv: 0, phien: 0 }
        o.ngay += 1; o.gio += x.gio; o.nmv += x.nmv; o.phien += x.phien
        thang.set(k, o)
      }
      // Khung giờ/ngày cho tiền mỗi giờ cao nhất, chỉ xét khung có từ 5 ngày.
      const gom = canh.map(() => ({ nmv: 0, gio: 0, n: 0 }))
      for (const x of mine) {
        const o = gom[oNao(x.gio)]
        o.nmv += x.nmv; o.gio += x.gio; o.n += 1
      }
      let best = -1
      let bestV = -1
      gom.forEach((o, j) => {
        if (o.n < 5 || o.gio <= 0) return
        const v = o.nmv / o.gio
        if (v > bestV) { bestV = v; best = j }
      })
      const ngayList = Array.from(thang.values()).map((o) => o.ngay).sort((m, n2) => m - n2)
      const ngayTV = ngayList.length
        ? ngayList[Math.floor((ngayList.length - 1) / 2)]
        : 0
      return {
        ten, color: PALETTE[i % PALETTE.length], thang,
        bestKhung: best >= 0
          ? (best === canh.length - 1 ? '16h+' : `${canh[best]}–${canh[best + 1]}h`)
          : null,
        bestTrenGio: bestV > 0 ? bestV : null,
        bestNgay: bestV > 0 ? gom[best].n : 0,
        ngayTV,
        goiY: best >= 0 && ngayTV > 0 ? giua(best) * ngayTV : null,
      }
    })
  }, [gioNmvNgay, kenhBangNgay, byMonth])

  /** Cùng phép ghép nhưng theo tháng, để có bảng NMV trên mỗi giờ live. */
  const gioNmvThang = useMemo(() => PHONG_NHA
    .filter((t) => kenhBang.ten.includes(t))
    .map((ten, i) => ({
      ten, color: PALETTE[i % PALETTE.length],
      o: kenhBang.thang.map((k) => {
        const gio = liveGrid.thang.get(ten)?.get(k)?.gio ?? 0
        const nmv = Number(kenhBang.rows.get(ten)?.get(k)?.nmv ?? 0)
        const phien = liveGrid.thang.get(ten)?.get(k)?.phien ?? 0
        return { ky: k, gio, nmv, phien, tren_gio: gio > 0 ? nmv / gio : 0 }
      }),
    })), [kenhBang, liveGrid])

  /* ---- hai biểu đồ dùng chung cho MoM Summary, Overview và Advertising ----
     Cùng một biểu đồ đặt ở ba chỗ thì phải là MỘT đoạn mã, không phải ba bản
     sao — sửa một lần là cả ba đổi theo, không có chuyện lệch nhau. Cả hai
     luôn chạy theo tháng, chỉ nghe bộ lọc chip tháng. */
  const chartRevAtr = (no: string) => (
    <section>
      <h2><span className="hno">{no}</span>Seller NMV, ad spend and ATR by month — {monthNote}</h2>
      <p className="sub">
        Column height is Seller NMV, split into what advertising cost and what was left after it.
        The two parts add up to Seller NMV, so the coloured share of each column IS the ATR drawn
        on the red line. All figures in USD.
      </p>
      <ComboChart
        data={adsRevMonths.map((m) => ({ ky: m.ky, a: m.cost, b: m.rest }))}
        names={['Ad spend', 'Seller NMV after ads']}
        colors={['var(--c2)', 'var(--c1-soft)']}
        lines={[{
          ten: 'ATR (right axis)',
          color: 'var(--bad)', truc: 'pct',
          vals: adsRevMonths.map((m) => m.atr),
          showVals: true,
          fmtVal: (v) => `${v}%`,
        }]}
        fmt={usd} label={mmyy} unit="USD"
        tip={(d, i) => {
          const m = adsRevMonths[i]
          if (!m) return null
          return (
            <><b>{mmyy(d.ky)}</b><br />
              Seller NMV {usd(m.nmv)}<br />
              · ad spend {usd(m.cost)}<br />
              · left after ads {usd(m.rest)}<br />
              ATR {pct(m.atr)}</>
          )
        }}
      />
    </section>
  )

  /* ---- bản THEO NGÀY của hai biểu đồ trên, dùng cho tab Sales ----
     Tab Summary là nơi đọc theo tháng; Sales chạy theo bộ lọc ngày như mọi
     phần còn lại của nó. Trước đây Sales cắm luôn bản theo tháng, nên lọc
     một tháng là cả hai biểu đồ co lại thành đúng MỘT cột — nhìn vô nghĩa. */
  const chartRevAtrDay = (no: string) => (
    <section>
      <h2><span className="hno">{no}</span>Seller NMV, ad spend and ATR — {dayNote}</h2>
      <p className="sub">
        Column height is Seller NMV for the day, split into what advertising cost and what was left
        after it. The two parts add up to Seller NMV, so the coloured share of each column IS the
        ATR drawn on the red line. All figures in USD.
      </p>
      <ComboChart
        data={adsDays.map((r) => {
          const cost = Number(r.ads_cost_usd || 0)
          const nmv = Number(r.nmv_usd || 0)
          return { ky: r.ngay, a: cost, b: Math.max(0, nmv - cost) }
        })}
        names={['Ad spend', 'Seller NMV after ads']}
        colors={['var(--c2)', 'var(--c1-soft)']}
        lines={[{
          ten: 'ATR (right axis)',
          color: 'var(--bad)', truc: 'pct',
          vals: adsDays.map((r) =>
            (Number(r.nmv_usd || 0) > 0 ? p1(Number(r.ads_cost_usd || 0), Number(r.nmv_usd)) : null)),
          showVals: true,
          fmtVal: (v) => `${v}%`,
        }]}
        fmt={usd} label={ddmm} unit="USD"
        tip={(d, i) => {
          const r = adsDays[i]
          if (!r) return null
          const cost = Number(r.ads_cost_usd || 0)
          const nmv = Number(r.nmv_usd || 0)
          return (
            <><b>{ddmm(d.ky)}</b><br />
              Seller NMV {usd(nmv)}<br />
              · ad spend {usd(cost)}<br />
              · left after ads {usd(Math.max(0, nmv - cost))}<br />
              ATR {pct(nmv > 0 ? p1(cost, nmv) : null)}</>
          )
        }}
      />
    </section>
  )

  const chartAdsMixDay = (no: string) => (
    <section>
      <h2><span className="hno">{no}</span>LIVE vs Product GMV Max — {dayNote}</h2>
      <p className="sub">
        Daily budget mix. C-Ads and branding sit on top in grey — small in money, but they are the
        only spend with no direct sales attribution.
      </p>
      <MultiStack
        data={adsDays.map((r) => ({
          ky: r.ngay,
          parts: [Number(r.lgm_usd || 0), Number(r.pgm_usd || 0), Number(r.cads_usd || 0)],
        }))}
        series={[
          { ten: 'LIVE GMV Max', color: 'var(--c1)' },
          { ten: 'Product GMV Max', color: 'var(--c2)' },
          { ten: 'C-Ads and branding', color: GREY },
        ]}
        fmt={usd} label={ddmm} unit="USD"
        tip={(d) => (
          <><b>{ddmm(d.ky)}</b><br />
            LGM {usd(d.parts[0])}<br />
            PGM {usd(d.parts[1])}<br />
            C-Ads {usd(d.parts[2])}<br />
            Total {usd(d.parts[0] + d.parts[1] + d.parts[2])}</>
        )}
      />
    </section>
  )

  const chartAdsMix = (no: string) => (
    <section>
      <h2><span className="hno">{no}</span>LIVE vs Product GMV Max — {monthNote}</h2>
      <p className="sub">
        Always monthly, so the shift in budget mix is readable. C-Ads and branding sit on top in
        grey — small in money, but they are the only spend with no direct sales attribution.
      </p>
      <MultiStack
        data={adsMonths.map((m) => ({ ky: m.ky, parts: [m.lgm, m.pgm, m.cads] }))}
        series={[
          { ten: 'LIVE GMV Max', color: 'var(--c1)' },
          { ten: 'Product GMV Max', color: 'var(--c2)' },
          { ten: 'C-Ads and branding', color: GREY },
        ]}
        fmt={usd} label={mmyy} unit="USD"
        tip={(d) => (
          <><b>{mmyy(d.ky)}</b><br />
            LGM {usd(d.parts[0])}<br />
            PGM {usd(d.parts[1])}<br />
            C-Ads {usd(d.parts[2])}<br />
            Total {usd(d.parts[0] + d.parts[1] + d.parts[2])}</>
        )}
      />
    </section>
  )


  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="wrap" style={{ '--stick': `${stickH}px` } as React.CSSProperties}>
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

      {/* Thanh lọc dính lên đầu khi cuộn. Tách khỏi <header> vì sticky chỉ
          có tác dụng trong phạm vi thẻ cha — nằm trong header thì nó rời đi
          cùng lúc header cuộn khỏi màn hình, đúng lúc cần nó nhất. */}
      <div className="stick" ref={stickRef}>
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
          {sec === 'Summary'
            ? `Always monthly — the day ranges do not apply here. Showing ${monthNote}.`
            : sec === 'Discounts'
              ? `Mostly day-level. Showing ${dayNote}. The monthly blocks at the bottom follow the month chips instead.`
              : sec === 'Glossary'
                ? 'Reference only — the filters above do not apply here.'
                : `Showing: ${periodNote}. Every chart and table in this section follows this filter.`}
        </p>
      </div>

      <div className="body">
        {/* Thanh điều hướng trái. Dưới 1100px nó tự nằm ngang thành dải tab
            như cũ, nên mở trên điện thoại không vỡ. */}
        <nav className="side">
          {SECTIONS.map((sc) => {
            const no = secNo(sc.id)
            const on = sec === sc.id
            return (
              <div key={sc.id} className={`side-g ${on ? 'on' : ''}`}>
                <button className="side-s" onClick={() => setSec(sc.id)}>
                  {no && <span className="side-n">{no}</span>}
                  {sc.ten}
                </button>
                {on && sc.groups.length > 0 && (
                  <div className="side-subs">
                    {sc.groups.map((g, gi) => {
                      // Số hiệu chạy liền qua các nhóm: 5.1…5.14, không khởi động lại
                      // ở mỗi nhóm — để gọi "mở 5.11" là ra đúng một chỗ duy nhất.
                      const base = sc.groups.slice(0, gi).reduce((n, x) => n + x.subs.length, 0)
                      return (
                        <div key={g.ten || gi} className="side-grp">
                          {g.ten && <div className="side-gl">{g.ten}</div>}
                          {'ghi' in g && g.ghi && <div className="side-gn">{g.ghi}</div>}
                          {g.subs.map((t, i) => (
                            <a key={t} href={`#s${no}-${base + i + 1}`}>
                              <span className="side-n2">{no}.{base + i + 1}</span>{t}
                            </a>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <main className="main">

        {/* ====================== SUMMARY ====================== */}
        {sec === 'Summary' && (
          <>
            {(() => {
              const c = momRows[momRows.length - 1]
              const p = momRows[momRows.length - 2]
              if (!c) return null
              const capture = (r?: Rolled) => (r ? p1(r.platform_disc_chua_huy, r.platform_disc) : undefined)
              const subShare = (r?: Rolled) => (r ? p1(r.platform_disc_chua_huy, r.nmv) : undefined)
              return (
                <>
                  <section id="s1-1">
                    <h2><span className="hno">1.1</span>{mmyy(c.ky)} at a glance</h2>
                    <p className="sub">
                      The latest month in view, against the month before it. Rates move in
                      percentage points; everything else in percent.
                    </p>
                    <div className="tiles" style={{ marginTop: 20 }}>
                      <Tile label="Seller NMV" value={bn(c.nmv)} unit=" bn"
                        sub={deltaText(delta(c.nmv, p?.nmv), 'month')} />
                      <Tile label="Net pcs" value={n0(c.sl_chua_huy)} unit=" pcs"
                        sub={deltaText(delta(c.sl_chua_huy, p?.sl_chua_huy), 'month')} />
                      <Tile label="Seller GMV" value={bn(c.gmv)} unit=" bn"
                        sub={deltaText(delta(c.gmv, p?.gmv), 'month')} />
                      <Tile label="Gross pcs" value={n0(c.so_luong)} unit=" pcs"
                        sub={deltaText(delta(c.so_luong, p?.so_luong), 'month')} />
                      <Tile label="Cancellation rate" value={pct(c.cancel_rate)}
                        tone={c.cancel_rate > 40 ? 'bad' : 'ok'}
                        sub={ppText(c.cancel_rate, p?.cancel_rate)} />
                      <Tile label="Valid subsidy" value={bn(c.platform_disc_chua_huy)} unit=" bn"
                        sub={deltaText(delta(c.platform_disc_chua_huy, p?.platform_disc_chua_huy), 'month')} />
                      <Tile label="Capture rate" value={pct(capture(c) ?? 0)}
                        tone={(capture(c) ?? 0) < 40 ? 'bad' : 'ok'}
                        sub={ppText(capture(c), capture(p))} />
                      <Tile label="Subsidy % of NMV" value={pct(subShare(c) ?? 0)}
                        sub={ppText(subShare(c), subShare(p))} />
                      <Tile label="Ad spend" value={usd(adsByMonth.get(c.ky.slice(0, 7)) ?? 0)} unit=" USD"
                        sub={deltaText(delta(adsByMonth.get(c.ky.slice(0, 7)), p && adsByMonth.get(p.ky.slice(0, 7))), 'month')} />
                      <Tile label="ATR — ad take rate"
                        value={pct(p1(adsByMonth.get(c.ky.slice(0, 7)) ?? 0, c.nmv / FX))}
                        tone={p1(adsByMonth.get(c.ky.slice(0, 7)) ?? 0, c.nmv / FX) > 25 ? 'bad' : 'ok'}
                        sub={ppText(
                          p1(adsByMonth.get(c.ky.slice(0, 7)) ?? 0, c.nmv / FX),
                          p ? p1(adsByMonth.get(p.ky.slice(0, 7)) ?? 0, p.nmv / FX) : undefined,
                        )} />
                    </div>
                    <div className="note warn">
                      <b>{mmyy(c.ky)} is not finished settling.</b> Orders placed late in the month
                      have not run their course, and the biggest cancellation cluster lands 3–7 days
                      after the order. Expect the cancellation rate to rise and Seller NMV to drift
                      down before this month closes.
                    </div>
                  </section>
                </>
              )
            })()}

            <section id="s1-2">
              <h2><span className="hno">1.2</span>The month-over-month picture</h2>
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

            <div id="s1-3">{chartRevAtr('1.3')}</div>

            <div id="s1-4">{chartAdsMix('1.4')}</div>

            <section id="s1-5">
              <h2><span className="hno">1.5</span>Headline numbers by month</h2>
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

            <section id="s1-6">
              <h2><span className="hno">1.6</span>Seller NMV by channel — MoM</h2>
              <p className="sub">
                Our own revenue, after cancellations, split by the live room that produced the
                order. TikTok tags each order line with the live room it came from, so this is the
                shop&rsquo;s real money per channel &mdash; not the gross GMV TikTok reports against
                a session.
              </p>
              {!kenhBang.thang.length ? (
                <div className="note warn">
                  No month yet has enough room tagging to split channels. TikTok only began
                  returning the live room on order lines in May 2026.
                </div>
              ) : (
                <>
                  <div className="tablewrap">
                    <table>
                      <thead><tr>
                        <th>Channel</th>
                        {kenhBang.thang.map((k) => (
                          <th className="n" key={k}>{mmyy(`${k}-01`)}<div className="uhint">bn</div></th>
                        ))}
                        <th className="n">Share</th>
                      </tr></thead>
                      <tbody>
                        {kenhBang.ten.map((ten, i2) => {
                          const cuoi = kenhBang.thang[kenhBang.thang.length - 1]
                          const r = kenhBang.rows.get(ten)?.get(cuoi)
                          const t = kenhBang.tong.get(cuoi)
                          const own = ten.startsWith('Roborock')
                          return (
                            <tr key={ten}>
                              <td>
                                {own && <i className="sw" style={{ background: PALETTE[i2 % PALETTE.length], marginRight: 7 }} />}
                                <span className={own ? '' : 'muted'}>{ten}</span>
                              </td>
                              {kenhBang.thang.map((k, ki) => {
                                const cur = kenhBang.rows.get(ten)?.get(k)
                                const pre = ki > 0 ? kenhBang.rows.get(ten)?.get(kenhBang.thang[ki - 1]) : undefined
                                return (
                                  <td className="n" key={k}>
                                    {cur ? bn(Number(cur.nmv)) : <span className="muted">—</span>}{' '}
                                    <Dd a={cur ? Number(cur.nmv) : undefined} b={pre ? Number(pre.nmv) : undefined} />
                                  </td>
                                )
                              })}
                              <td className="n"><b>{pct(p1(Number(r?.nmv ?? 0), t?.nmv ?? 0))}</b></td>
                            </tr>
                          )
                        })}
                        <tr className="tot">
                          <td><b>All channels</b></td>
                          {kenhBang.thang.map((k) => (
                            <td className="n" key={k}><b>{bn(kenhBang.tong.get(k)?.nmv ?? 0)}</b></td>
                          ))}
                          <td className="n">100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <h3 style={{ marginTop: 26 }}>Net pcs and cancellation rate</h3>
                  <div className="tablewrap">
                    <table>
                      <thead><tr>
                        <th>Channel</th>
                        {kenhBang.thang.map((k) => (
                          <th className="n" key={k}>{mmyy(`${k}-01`)}<div className="uhint">net pcs · cancel</div></th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {kenhBang.ten.map((ten) => (
                          <tr key={ten}>
                            <td><span className={ten.startsWith('Roborock') ? '' : 'muted'}>{ten}</span></td>
                            {kenhBang.thang.map((k) => {
                              const r = kenhBang.rows.get(ten)?.get(k)
                              if (!r) return <td className="n muted" key={k}>—</td>
                              return (
                                <td className="n" key={k}>
                                  {n0(Number(r.sl_chua_huy))}
                                  <span className="muted" style={{ marginLeft: 6 }}>
                                    {pct(Number(r.cancel_rate))}
                                  </span>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <h3 style={{ marginTop: 26 }}>LIVE GMV Max spend and ATR</h3>
                  <div className="tablewrap">
                    <table>
                      <thead><tr>
                        <th>Channel</th>
                        {kenhBang.thang.map((k) => (
                          <th className="n" key={k}>{mmyy(`${k}-01`)}
                            <div className="uhint">LGM mn · ATR</div></th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {kenhBang.ten.map((ten) => {
                          // Chỉ ba phòng nhà và KOC mới có chi tiêu LGM. "Ngoài live"
                          // và "Live (không rõ phòng)" không gắn được ngân sách nào,
                          // để trống thay vì in 0% — 0% trông như quảng cáo miễn phí.
                          const coAds = kenhBang.thang.some(
                            (k) => (lgmKenhThang.get(`${khoaLgm(ten)}|${k}`) ?? 0) > 0)
                          return (
                            <tr key={ten}>
                              <td><span className={ten.startsWith('Roborock') ? '' : 'muted'}>{ten}</span></td>
                              {kenhBang.thang.map((k) => {
                                const lgm = lgmKenhThang.get(`${khoaLgm(ten)}|${k}`) ?? 0
                                const nmv = Number(kenhBang.rows.get(ten)?.get(k)?.nmv ?? 0)
                                if (!coAds) return <td className="n muted" key={k}>—</td>
                                return (
                                  <td className="n" key={k}>
                                    {lgm > 0 ? mn1(lgm) : <span className="muted">—</span>}
                                    <span className="muted" style={{ margin: '0 5px' }}>·</span>
                                    <b style={{
                                      color: lgm > 0 && nmv > 0 && p1(lgm, nmv) > 25
                                        ? 'var(--bad)' : 'inherit',
                                    }}>
                                      {lgm > 0 && nmv > 0 ? pct(p1(lgm, nmv)) : '—'}
                                    </b>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                        <tr className="tot">
                          <td><b>All live channels</b></td>
                          {kenhBang.thang.map((k) => {
                            let lgm = 0
                            let nmv = 0
                            for (const ten of kenhBang.ten) {
                              const x = lgmKenhThang.get(`${khoaLgm(ten)}|${k}`) ?? 0
                              if (x <= 0) continue
                              lgm += x
                              nmv += Number(kenhBang.rows.get(ten)?.get(k)?.nmv ?? 0)
                            }
                            return (
                              <td className="n" key={k}>
                                {mn1(lgm)}
                                <span className="muted" style={{ margin: '0 5px' }}>·</span>
                                <b>{nmv > 0 ? pct(p1(lgm, nmv)) : '—'}</b>
                              </td>
                            )
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="foot">
                    <b>ATR</b> here is that channel&rsquo;s LIVE GMV Max spend divided by the revenue
                    that channel actually kept, so it is ads measured against real money rather than
                    against gross session GMV. Red above 25%. The total row covers only the channels
                    that carry ad spend &mdash; &ldquo;Ngoài live&rdquo; has no live budget to
                    attribute, so it is left blank rather than shown as 0%.
                  </p>

                  <div className="note warn">
                    <b>Only months where most order lines carry a room tag are shown.</b> TikTok
                    started returning the live room on order lines in May 2026 and reached steady
                    coverage from July{' '}
                    ({kenhBang.thang.map((k) => `${mmyy(`${k}-01`)} ${kenhBang.phu.get(k)}%`).join(' · ')}).
                    Anything earlier is left out rather than shown as &ldquo;outside live&rdquo;,
                    because an untagged line back then means <i>unknown</i>, not <i>not from a
                    live</i>. Even in the months shown, roughly a third of lines carry no tag; those
                    sit in &ldquo;Ngoài live&rdquo;, so treat that row as an upper bound.
                    &ldquo;Live (không rõ phòng)&rdquo; is a tagged line whose room is older than the
                    175-day live history we can pull.
                  </div>
                </>
              )}
            </section>

          </>
        )}

        {/* ======================= SALES ======================= */}
        {sec === 'Sales' && (
          <>
            <section id="s2-1">
              <h2><span className="hno">2.1</span>{periodNote} — totals</h2>
              <p className="sub">
                The whole filtered range added up ({span.n} {periodWord}{span.n === 1 ? '' : 's'}),
                not just the latest one.{' '}
                {span.nPrev
                  ? `Compared with the ${span.nPrev} ${periodWord}${span.nPrev === 1 ? '' : 's'} immediately before it.`
                  : 'No earlier range of the same length to compare against.'}
              </p>
              <div className="tiles" style={{ marginTop: 20 }}>
                <Tile label="Seller NMV" value={bn(span.cur.nmv)} unit=" bn"
                  sub={deltaText(delta(span.cur.nmv, span.prev?.nmv), 'range')} />
                <Tile label="Net quantity" value={n0(span.cur.sl_chua_huy)} unit=" pcs"
                  sub={deltaText(delta(span.cur.sl_chua_huy, span.prev?.sl_chua_huy), 'range')} />
                <Tile label="Seller GMV" value={bn(span.cur.gmv)} unit=" bn"
                  sub={deltaText(delta(span.cur.gmv, span.prev?.gmv), 'range')} />
                <Tile label="Cancellation rate" value={pct(span.cur.cancel_rate)}
                  tone={span.cur.cancel_rate > 40 ? 'bad' : 'ok'}
                  sub={`${n0(span.cur.sl_huy)} of ${n0(span.cur.so_luong)} pcs cancelled`} />
                <Tile label="Ad spend" value={usd(adsSpanUsd)} unit=" USD"
                  sub="all four Roborock ad accounts" />
                <Tile label="ATR — ad take rate" value={pct(p1(adsSpanUsd, span.cur.nmv / FX))}
                  tone={p1(adsSpanUsd, span.cur.nmv / FX) > 25 ? 'bad' : 'ok'}
                  sub="ad spend ÷ Seller NMV" />
                <Tile label="Valid subsidy" value={bn(span.cur.platform_disc_chua_huy)} unit=" bn"
                  sub={`TikTok money on orders that survived · ${pct(p1(span.cur.platform_disc_chua_huy, span.cur.platform_disc))} of what was booked`} />
                <Tile label="Subsidy rate" value={pct(p1(span.cur.platform_disc_chua_huy, span.cur.nmv))}
                  sub={`valid subsidy ÷ Seller NMV · we funded ${bn(span.cur.seller_disc_chua_huy)} bn`} />
              </div>
            </section>

            <section id="s2-2">
              <h2><span className="hno">2.2</span>Seller GMV, Seller NMV and cancellation rate in one picture</h2>
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

            <div id="s2-3">{chartRevAtrDay('2.3')}</div>

            <div id="s2-4">{chartAdsMixDay('2.4')}</div>

            <section id="s2-5">
              <h2><span className="hno">2.5</span>Valid subsidy against Seller NMV — {periodNote}</h2>
              <p className="sub">
                Columns are the money that actually came off the price on orders that survived,
                split by who paid for it: TikTok on the bottom, us on top. The two lines answer two
                different questions. <b style={{ color: 'var(--bad)' }}>Red &mdash; how deep is the
                discounting?</b> TikTok&rsquo;s subsidy measured against Seller NMV.{' '}
                <b style={{ color: 'var(--ok)' }}>Green &mdash; who is paying for it?</b> TikTok&rsquo;s
                share of the whole discount: at 40% TikTok funds 40 đồng of every 100 đồng taken off
                the price and we fund the other 60. It says nothing about how large the discount is
                &mdash; only who carries it.
              </p>
              <ComboChart
                data={shown.map((r) => ({
                  ky: r.ky, a: r.platform_disc_chua_huy, b: r.seller_disc_chua_huy,
                }))}
                names={['TikTok — valid subsidy', 'Us — seller discount']}
                colors={['var(--c1)', 'var(--c2)']}
                lines={[
                  {
                    ten: 'Subsidy ÷ Seller NMV (right axis)',
                    color: 'var(--bad)', truc: 'pct',
                    vals: shown.map((r) => (r.nmv > 0 ? p1(r.platform_disc_chua_huy, r.nmv) : null)),
                    showVals: true, fmtVal: (v) => `${v}%`,
                  },
                  {
                    ten: 'TikTok share of the discount (right axis)',
                    color: 'var(--ok)', truc: 'pct',
                    vals: shown.map((r) => {
                      const t = r.platform_disc_chua_huy + r.seller_disc_chua_huy
                      return t > 0 ? p1(r.platform_disc_chua_huy, t) : null
                    }),
                    showVals: true, fmtVal: (v) => `${v}%`,
                  },
                ]}
                fmt={bn} label={lbl} unit="VND bn"
                tip={(d, i2) => {
                  const r = shown[i2]
                  if (!r) return null
                  const t = r.platform_disc_chua_huy + r.seller_disc_chua_huy
                  return (
                    <><b>{lbl(d.ky)}</b><br />
                      Valid subsidy {bn(r.platform_disc_chua_huy)}<br />
                      · booked {bn(r.platform_disc)} · kept {pct(p1(r.platform_disc_chua_huy, r.platform_disc))}<br />
                      Our discount {bn(r.seller_disc_chua_huy)}<br />
                      Seller NMV {bn(r.nmv)}<br />
                      Subsidy rate {pct(r.nmv > 0 ? p1(r.platform_disc_chua_huy, r.nmv) : null)}<br />
                      TikTok funded {pct(t > 0 ? p1(r.platform_disc_chua_huy, t) : null)} of the discount</>
                  )
                }}
              />
              <div className="tablewrap" style={{ marginTop: 18 }}>
                <table>
                  <thead><tr>
                    <th>{periodWord === 'month' ? 'Month' : 'Day'}</th>
                    <th className="n">Seller NMV</th>
                    <th className="n">Subsidy booked</th>
                    <th className="n">Valid subsidy</th>
                    <th className="n">Kept</th>
                    <th className="n">Subsidy rate</th>
                    <th className="n">Our discount</th>
                    <th className="n">TikTok share</th>
                  </tr></thead>
                  <tbody>
                    {shown.slice().reverse().map((r) => {
                      const t = r.platform_disc_chua_huy + r.seller_disc_chua_huy
                      return (
                        <tr key={r.ky}>
                          <td>{lbl(r.ky)}</td>
                          <td className="n">{bn(r.nmv)}</td>
                          <td className="n muted">{bn(r.platform_disc)}</td>
                          <td className="n"><b>{bn(r.platform_disc_chua_huy)}</b></td>
                          <td className="n muted">{pct(p1(r.platform_disc_chua_huy, r.platform_disc))}</td>
                          <td className="n">{pct(r.nmv > 0 ? p1(r.platform_disc_chua_huy, r.nmv) : null)}</td>
                          <td className="n">{bn(r.seller_disc_chua_huy)}</td>
                          <td className="n">{pct(t > 0 ? p1(r.platform_disc_chua_huy, t) : null)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="foot">
                Money in VND bn. <b>Booked</b> is every voucher TikTok attached at checkout;{' '}
                <b>valid</b> is what remained on orders that were not cancelled &mdash; only the
                second one is money TikTok really spent, and the gap between them is large because
                the cancellation rate is high. <b>Kept</b> is valid ÷ booked. Subsidy here is
                platform voucher money only; it is not the platform fee, which lives on the P&amp;L
                tab.
              </p>
            </section>

            <section id="s2-6">
              <h2><span className="hno">2.6</span>Seller NMV per {periodWord} · {dod}</h2>
              <p className="sub">Cancelled orders already removed.</p>
              <DeltaChart
                data={pt((r) => r.nmv)} color="var(--c1)" fmt={bn} label={lbl} unit="VND bn"
                tip={(d, dl) => (
                  <><b>{lbl(d.ky)}</b><br />Seller NMV {n0(d.v)} VND
                    {dl != null && <><br />{dl >= 0 ? '▲' : '▼'} {Math.abs(dl)}% vs previous period</>}</>
                )}
              />
            </section>

            <section id="s2-7">
              <h2><span className="hno">2.7</span>Net quantity per {periodWord} · {dod}</h2>
              <p className="sub">Units that have not been cancelled.</p>
              <DeltaChart
                data={pt((r) => r.sl_chua_huy)} color="var(--c3)" fmt={n0} label={lbl} unit="pcs"
                tip={(d, dl) => (
                  <><b>{lbl(d.ky)}</b><br />{n0(d.v)} net pcs
                    {dl != null && <><br />{dl >= 0 ? '▲' : '▼'} {Math.abs(dl)}% vs previous period</>}</>
                )}
              />
            </section>

            <section id="s2-8">
              <h2><span className="hno">2.8</span>Robot vs handheld mix</h2>
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

            <section id="s2-9">
              <h2><span className="hno">2.9</span>Detail by {periodWord}</h2>
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

        {/* ===================== PRODUCTS ===================== */}
        {sec === 'Products' && (
          <>
            <section id="s3-1">
              <h2><span className="hno">3.1</span>Robot and handheld side by side — {periodNote}</h2>
              <div className="cards">
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
              </div>
            </section>

            <section id="s3-2">
              <h2><span className="hno">3.2</span>Seller NMV by category per {periodWord}</h2>
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

            <section id="s3-3">
              <h2><span className="hno">3.3</span>Cancellation rate by category · {dod}</h2>
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

            <section id="s3-4">
              <h2><span className="hno">3.4</span>Category detail by {periodWord}</h2>
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

            <section id="s3-5">
              <h2><span className="hno">3.5</span>Net quantity by price band</h2>
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

            <section id="s3-6">
              <h2><span className="hno">3.6</span>Cancellation rate by price band</h2>
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

            <div className="filters" style={{ marginTop: 26 }}>
              <select className="drop wide" value={modelSel} onChange={(e) => setModelSel(e.target.value)}>
                <option value="">All models ({allModels.length})</option>
                {allModels.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {modelSel && <button className="lnk" onClick={() => setModelSel('')}>Clear model filter</button>}
            </div>

            <section id="s3-7">
              <h2><span className="hno">3.7</span>Gross vs net units and cancellation rate — {scopeLabel}</h2>
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

            <section id="s3-8">
              <h2><span className="hno">3.8</span>Model performance by month</h2>
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
              <section id="s3-9">
                <h2><span className="hno">3.9</span>Model mix per {periodWord}</h2>
                <p className="sub">
                  Every model that sold in the period, biggest first &mdash; nothing folded into
                  &ldquo;Other&rdquo;. Cancellation rate is cancelled pcs ÷ gross pcs, so it is
                  recalculated on the totals rather than summed, and the share view does not apply
                  to it.
                </p>
                <div className="seg" style={{ marginTop: 14 }}>
                  {(['gmv', 'so_luong', 'cancel'] as const).map((k) => (
                    <button key={k} className={mixMetric === k ? 'on' : ''} onClick={() => setMixMetric(k)}>
                      {k === 'gmv' ? 'By Seller GMV' : k === 'so_luong' ? 'By net pcs' : 'By cancellation rate'}
                    </button>
                  ))}
                </div>
                {mixMetric !== 'cancel' && (
                  <div className="seg" style={{ marginTop: 8 }}>
                    {([[false, 'Absolute'], [true, 'Share of period']] as const).map(([k, l]) => (
                      <button key={l} className={mixShare === k ? 'on' : ''} onClick={() => setMixShare(k)}>{l}</button>
                    ))}
                  </div>
                )}
                <Matrix
                  corner={`Model · ${mixMetric === 'cancel' ? 'cancelled %'
                    : mixShare ? '% of ' + periodWord
                      : mixMetric === 'gmv' ? 'VND bn' : 'net pcs'}`}
                  cols={mixTable.cols}
                  rows={mixTable.rows}
                  heat={mixMetric === 'cancel' ? 'high-bad' : 'high-good'}
                  fmt={mixMetric === 'cancel' ? (v) => `${v}%`
                    : mixShare ? (v) => `${v}%`
                      : mixMetric === 'gmv' ? bn : n0}
                />
              </section>
            )}

            <section id="s3-10">
              <h2><span className="hno">3.10</span>Top models by Seller NMV — {periodNote}</h2>
              <RowBars
                rows={skuF.slice().sort((a, b) => b.nmv - a.nmv).slice(0, 15).map((s) => ({
                  nhan: s.model,
                  segs: [{ v: s.nmv, color: s.category === 'robot' ? 'var(--c1)' : 'var(--c2)', ten: 'Seller NMV' }],
                  phu: `${mn(s.nmv)}m · ${n0(s.sl_chua_huy)} net pcs`,
                }))}
              />
            </section>

            <section id="s3-11">
              <h2><span className="hno">3.11</span>Full table, grouped by category</h2>
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

        {/* ==================== ADVERTISING ==================== */}
        {sec === 'Advertising' && (
          <>
            <section id="s4-1">
              <h2><span className="hno">4.1</span>{dayNote} — ad spend</h2>
              <p className="sub">
                This tab is in USD, the currency the ad budget is set in. VND accounts and VND
                revenue are converted at one fixed rate held in the database, so ATR is unaffected
                by the conversion. Original currencies stay in the database for reconciling TikTok
                invoices.
              </p>
              <div className="tiles" style={{ marginTop: 20 }}>
                <Tile label="Ad spend" value={usd(adsTotals.cost)} unit=" USD" />
                <Tile label="LIVE GMV Max" value={usd(adsTotals.lgm)} unit=" USD"
                  sub={`${pct(p1(adsTotals.lgm, adsTotals.cost))} of spend`} />
                <Tile label="Product GMV Max" value={usd(adsTotals.pgm)} unit=" USD"
                  sub={`${pct(p1(adsTotals.pgm, adsTotals.cost))} of spend`} />
                <Tile label="C-Ads and branding" value={usd(adsTotals.cads)} unit=" USD"
                  sub={`${pct(p1(adsTotals.cads, adsTotals.cost))} of spend`} />
                <Tile label="ATR — ad take rate" value={pct(p1(adsTotals.cost, adsTotals.nmv))}
                  tone={p1(adsTotals.cost, adsTotals.nmv) > 25 ? 'bad' : 'ok'}
                  sub={`ad spend ÷ Seller NMV ${usd(adsTotals.nmv)} USD`} />
                <Tile label="Seller NMV per ad dollar" value={adsTotals.cost ? (adsTotals.nmv / adsTotals.cost).toFixed(2) : '—'}
                  sub="inverse of ATR — all sales, not attributed" />
              </div>
              <div className="note warn">
                <b>TikTok&rsquo;s own revenue and order counts are deliberately kept out of this tab.</b>{' '}
                They do not measure the same thing we do. In Sep 2026 TikTok reported 4,703 attributed
                orders against 2,350 machine orders in the shop &mdash; it counts accessories, and one
                order can be claimed by several campaigns at once. Its revenue implies an average order
                of 6.3 mn when our cheapest machine is around 6 mn and the bulk sell at 15&ndash;25 mn.
                Everything above is money we actually paid, against revenue we actually recognised.
              </div>
            </section>

            <section id="s4-2">
              <h2><span className="hno">4.2</span>Spend per day, against Seller NMV · DoD</h2>
              <p className="sub">
                Columns split LIVE GMV Max from Product GMV Max. The red line is ATR &mdash; total
                ad spend (including C-Ads) divided by that day&rsquo;s Seller NMV, on the right axis.
              </p>
              <ComboChart
                data={adsDays.map((r) => ({ ky: r.ngay, a: Number(r.lgm_usd || 0), b: Number(r.pgm_usd || 0) }))}
                names={['LIVE GMV Max', 'Product GMV Max']}
                colors={['var(--c1)', 'var(--c2)']}
                lines={[{
                  ten: 'ATR — ad spend ÷ Seller NMV (right axis)',
                  color: 'var(--bad)', truc: 'pct',
                  vals: adsDays.map((r) => (Number(r.nmv || 0) > 0 ? p1(Number(r.ads_cost_vnd || 0), Number(r.nmv)) : null)),
                  showVals: true,
                  fmtVal: (v) => `${v}%`,
                }]}
                fmt={usd} label={ddmm} unit="USD"
                tip={(d) => {
                  const r = adsDays.find((x) => x.ngay === d.ky)
                  if (!r) return null
                  return (
                    <><b>{ddmm(d.ky)}</b><br />
                      LGM {usd(Number(r.lgm_usd))} · PGM {usd(Number(r.pgm_usd))}<br />
                      C-Ads {usd(Number(r.cads_usd))}<br />
                      Total spend {usd(Number(r.ads_cost_usd))}<br />
                      Seller NMV {usd(Number(r.nmv_usd))}<br />
                      ATR {pct(p1(Number(r.ads_cost_usd), Number(r.nmv_usd)))}</>
                  )
                }}
              />
            </section>

            <section id="s4-3">
              <h2><span className="hno">4.3</span>Day by day</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Day</th>
                    <th className="n">LGM</th><th className="n">PGM</th><th className="n">C-Ads</th>
                    <th className="n">Total spend</th>
                    <th className="n">Seller NMV</th><th className="n">ATR %</th>
                    <th className="n">Net pcs</th>
                  </tr></thead>
                  <tbody>
                    {adsDays.slice().reverse().map((r) => {
                      const cost = Number(r.ads_cost_usd || 0)
                      const share = Number(r.nmv_usd || 0) > 0 ? p1(cost, Number(r.nmv_usd)) : null
                      return (
                        <tr key={r.ngay}>
                          <td>{ddmm(r.ngay)}</td>
                          <td className="n">{usd(Number(r.lgm_usd))}</td>
                          <td className="n">{usd(Number(r.pgm_usd))}</td>
                          <td className="n">{usd(Number(r.cads_usd))}</td>
                          <td className="n"><b>{usd(cost)}</b></td>
                          <td className="n">{usd(Number(r.nmv_usd))}</td>
                          <td className="n">{pct(share)}</td>
                          <td className="n">{n0(Number(r.net_pcs))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="foot">
                Money in USD, net pcs after cancellations. Every column here is ours &mdash; nothing
                on this table comes from TikTok&rsquo;s attribution.
              </p>
            </section>

            <div id="s4-4">{chartRevAtr('4.4')}</div>

            <div id="s4-5">{chartAdsMix('4.5')}</div>

            <section id="s4-6">
              <h2><span className="hno">4.6</span>Ad spend by month — {monthNote}</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Month</th>
                    <th className="n">LGM</th><th className="n">PGM</th><th className="n">C-Ads</th>
                    <th className="n">Total spend</th>
                    <th className="n">Seller NMV</th><th className="n">ATR %</th>
                    <th className="n">LGM share</th>
                  </tr></thead>
                  <tbody>
                    {adsMonths.map((m) => {
                      const total = m.lgm + m.pgm + m.cads
                      const sale = momRows.find((r) => r.ky.slice(0, 7) === m.ky.slice(0, 7))
                      const nmvUsd = sale ? sale.nmv / FX : 0
                      return (
                        <tr key={m.ky}>
                          <td>{mmyy(m.ky)}</td>
                          <td className="n">{usd(m.lgm)}</td>
                          <td className="n">{usd(m.pgm)}</td>
                          <td className="n">{usd(m.cads)}</td>
                          <td className="n"><b>{usd(total)}</b></td>
                          <td className="n">{sale ? usd(nmvUsd) : '—'}</td>
                          <td className="n">{nmvUsd > 0 ? pct(p1(total, nmvUsd)) : '—'}</td>
                          <td className="n">{total > 0 ? pct(p1(m.lgm, total)) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="foot">All money in USD.</p>
            </section>

            <section id="s4-7">
              <h2><span className="hno">4.7</span>Campaigns — {monthNote}</h2>
              <p className="sub">
                Every campaign that spent in the selected months, biggest first. KOC handle and model
                are read off the campaign name, so they follow the team&rsquo;s naming convention — a
                renamed campaign shows a dash rather than a guess.
              </p>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Campaign</th><th>Type</th><th>KOC</th><th>Model</th>
                    <th className="n">Spend</th><th className="n">Share of spend</th>
                    <th className="n">TikTok ROAS</th>
                  </tr></thead>
                  <tbody>
                    {adsCamps.slice(0, 60).map((c) => (
                      <tr key={c.id}>
                        <td>{c.ten}</td>
                        <td>{c.loai === 'LIVE_GMV_MAX' ? 'LGM' : c.loai === 'PRODUCT_GMV_MAX' ? 'PGM' : 'C-Ads'}</td>
                        <td>{c.koc ?? <span className="muted">—</span>}</td>
                        <td>{c.model ?? <span className="muted">—</span>}</td>
                        <td className="n"><b>{usd(c.cost)}</b></td>
                        <td className="n">{pct(p1(c.cost, adsTotals.cost))}</td>
                        <td className="n muted">{c.cost > 0 ? (c.rev / c.cost).toFixed(1) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="foot">
                Spend in USD. Showing the top 60 of {n0(adsCamps.length)} campaigns. The last column
                is TikTok&rsquo;s own ROAS, kept only because it is the one signal that exists per
                campaign &mdash; our order data cannot be traced back to a campaign. Read it as a
                ranking between campaigns, never as a return on our own revenue.
              </p>
            </section>
          </>
        )}

        {/* ===================== LIVESTREAM ===================== */}
        {sec === 'Livestream' && (
          <>
            <section id="s5-1">
              <h2><span className="hno">5.1</span>Livestream — {monthNote}</h2>
              <p className="sub">
                Session data straight from TikTok Shop, not from our order table. It starts in
                Apr 2026: the API refuses any window older than about 180 days. The sheet follows
                the month chips above and then reads day by day inside them &mdash; the 7- and
                30-day buttons do not apply, because a session is a discrete event and a sliding
                window cuts months in half.
              </p>
              <div className="tiles" style={{ marginTop: 20 }}>
                <Tile label="Live GMV" value={bn(liveTot.gmv)} unit=" bn"
                  sub={`${pct(p1(liveTot.own.gmv, liveTot.gmv))} from our own rooms`} />
                <Tile label="Per day" value={liveDayStats ? bn(liveDayStats.avg) : '—'} unit=" bn"
                  sub={liveDayStats ? `average across ${liveDayStats.n} days with a session` : ''} />
                <Tile label="Best day" value={liveDayStats ? bn(liveDayStats.best.v) : '—'} unit=" bn"
                  sub={liveDayStats ? ddmm(liveDayStats.best.ngay) : ''} />
                <Tile label="Latest day" value={liveDayStats ? bn(liveDayStats.last.v) : '—'} unit=" bn"
                  sub={liveDayStats
                    ? `${ddmm(liveDayStats.last.ngay)} · ${liveDayStats.prev
                      ? `${liveDayStats.last.v >= liveDayStats.prev.v ? '+' : ''}${Math.round(
                        ((liveDayStats.last.v - liveDayStats.prev.v) / (liveDayStats.prev.v || 1)) * 100)}% DoD`
                      : 'no prior day'}`
                    : ''} />
                <Tile label="Sessions" value={n0(liveTot.phien)}
                  sub={`${n0(liveTot.own.gio)} hours live in our rooms`} />
                <Tile label="GMV per 1k views" value={mn1(per1k(liveTot.own.gmv, liveTot.own.views))}
                  unit=" mn" sub={`${n0(liveTot.own.views)} views · our rooms only`} />
                <Tile label="Product CTR" value={pct(p1(liveTot.own.clicks, liveTot.own.imp))}
                  sub={`click to order ${pct(p1(liveTot.own.don, liveTot.own.clicks))}`} />
                <Tile label="GMV from creator rooms" value={bn(liveTot.koc.gmv)} unit=" bn"
                  tone={p1(liveTot.koc.gmv, liveTot.gmv) < 5 ? 'bad' : undefined}
                  sub={`${pct(p1(liveTot.koc.gmv, liveTot.gmv))} of live GMV · ${n0(liveTot.koc.phien)} sessions`} />
              </div>
              <div className="note warn">
                <b>Creator rooms report no engagement at all.</b> TikTok only releases views,
                comments, shares and product impressions for the shop&rsquo;s own official accounts,
                so every KOC row shows zero on those columns. That is a permission boundary, not a
                quiet room. Their GMV, units and orders are real and are counted.
              </div>
            </section>

            <section id="s5-2">
              <h2><span className="hno">5.2</span>Daily overview · DoD</h2>
              <p className="sub">
                Column height is that day&rsquo;s live GMV, split by room. The red line is GMV per
                1.000 views on its own right-hand scale. The strip underneath is LIVE GMV Max spend
                on the same days.
              </p>
              <LiveHead
                rows={headRows}
                series={liveOwnRooms.map((r, i2) => ({
                  ten: r.ten, color: PALETTE[i2 % PALETTE.length],
                }))}
                fmtCot={(v) => `${bn(v)} bn`}
                fmtDuong={(v) => `${mn1(v)} mn`}
                fmtAds={(v) => `${mn1(v)} mn`}
              />
              <div className="tablewrap" style={{ marginTop: 14 }}>
                <table className="mini">
                  <thead><tr>
                    <th>Room</th>
                    <th className="n">LGM spend<div className="uhint">mn</div></th>
                    <th className="n">Share of ads</th>
                    <th className="n">Share of GMV</th>
                    <th className="n">Index</th>
                    <th className="n">GMV per ₫</th>
                    <th className="n">ATR</th>
                  </tr></thead>
                  <tbody>
                    {liveOwnRooms.map((r, i2) => {
                      const lgm = lgmTong.get(r.ten) ?? 0
                      const sAds = p1(lgm, lgmOwn)
                      const sGmv = p1(r.gmv, liveTot.own.gmv)
                      const idx = sGmv > 0 ? sAds / sGmv : 0
                      return (
                        <tr key={r.username}>
                          <td>
                            <i className="sw" style={{ background: PALETTE[i2 % PALETTE.length], marginRight: 7 }} />
                            {r.ten}
                          </td>
                          <td className="n">{mn1(lgm)}</td>
                          <td className="n"><b>{pct(sAds)}</b></td>
                          <td className="n">{pct(sGmv)}</td>
                          <td className="n"
                            style={{ color: idx > 1.15 ? 'var(--bad)' : idx < 0.85 ? 'var(--c1)' : 'inherit' }}>
                            {sGmv > 0 ? `${idx.toFixed(2)}×` : '—'}
                          </td>
                          <td className="n">{lgmLai(r.gmv, lgm)}</td>
                          <td className="n">{pct(p1(lgm, r.gmv))}</td>
                        </tr>
                      )
                    })}
                    <tr className="tot">
                      <td><b>All three</b></td>
                      <td className="n">{mn1(lgmOwn)}</td>
                      <td className="n">100%</td>
                      <td className="n">100%</td>
                      <td className="n muted">—</td>
                      <td className="n">{lgmLai(liveTot.own.gmv, lgmOwn)}</td>
                      <td className="n">{pct(p1(lgmOwn, liveTot.own.gmv))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="foot">
                <b>Index</b> is share of ads ÷ share of GMV. Above 1 the room takes more of the
                budget than it brings back in live GMV; below 1 it brings back more than it costs.
                It is a weighting check, not a verdict &mdash; a room can sit above 1 on purpose
                while it is being grown, and GMV Max bids toward a GMV target, so spend follows
                results as much as it drives them.
              </p>
              <p className="foot">
                Ad spend is drawn as a separate strip rather than a fourth stack segment or a second
                line, on purpose. LGM runs at 4&ndash;6% of live GMV, so on the same axis it would
                be a flat line along the bottom; stacked into the column it would read as part of
                the revenue, which it is not. Three quantities, three honest scales, one row of
                days. Only our own rooms are counted here.
              </p>
            
              <h3 style={{ marginTop: 30 }}>Day by day, room by room</h3>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Day</th>
                    <th className="n">Sessions</th><th className="n">Hours</th>
                    {liveDayRoom.names.map((nm) => (
                      <th className="n" key={nm}>{nm}<div className="uhint">bn</div></th>
                    ))}
                    <th className="n">KOC<div className="uhint">bn</div></th>
                    <th className="n">Total<div className="uhint">bn</div></th>
                    <th className="n">DoD</th>
                    <th className="n">Views</th>
                    <th className="n">GMV / 1k views<div className="uhint">mn</div></th>
                    <th className="n">CTR</th><th className="n">Units</th>
                  </tr></thead>
                  <tbody>
                    {liveDays.slice().reverse().map((d, i, arr) => {
                      const tot = d.own + d.koc
                      const prev = arr[i + 1]
                      const prevTot = prev ? prev.own + prev.koc : undefined
                      return (
                        <tr key={d.ngay}>
                          <td>{ddmm(d.ngay)}</td>
                          <td className="n">{n0(d.phien)}</td>
                          <td className="n">{n0(d.gio)}</td>
                          {liveDayRoom.names.map((nm, k) => (
                            <td className="n" key={nm}>{bn(liveDayRoom.get(d.ngay, k))}</td>
                          ))}
                          <td className="n muted">{bn(d.koc)}</td>
                          <td className="n"><b>{bn(tot)}</b></td>
                          <td className="n"><Dd a={tot} b={prevTot} /></td>
                          <td className="n">{n0(d.views)}</td>
                          <td className="n">{mn1(per1k(d.own, d.views))}</td>
                          <td className="n">{pct(d.imp > 0 ? p1(d.clicks, d.imp) : null)}</td>
                          <td className="n">{n0(d.pcs)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="foot">
                Newest day first. DoD compares each day with the previous day that had a session,
                which on a Monday means the weekend, not last Friday &mdash; check the dates before
                reading a swing as a trend.
              </p>
            </section>

            <section id="s5-3">
              <h2><span className="hno">5.3</span>Revenue by room — {kenhNgay ? 'DoD' : 'MoM'}</h2>
              <p className="sub">
                Everything above this point uses the GMV TikTok books against a live session, gross,
                before cancellations. This block uses <b>our own order data</b> instead: revenue
                after cancellations, attributed to a room through the live-room tag TikTok puts on
                each order line. The two will not tie, and the gap is the cancellation.
              </p>
              <div className="seg" style={{ marginTop: 14 }}>
                {([[false, 'By month'], [true, 'By day']] as const).map(([k, l]) => (
                  <button key={l} className={kenhNgay === k ? 'on' : ''}
                    onClick={() => setKenhNgay(k)}>{l}</button>
                ))}
              </div>
              {!kenhBang.thang.length ? (
                <div className="note warn">
                  None of the months selected above have enough room tagging on order lines to
                  split revenue by room. TikTok began tagging in May 2026 and only reached usable
                  coverage from July &mdash; pick a month from July 2026 onward, or clear the month
                  filter.
                </div>
              ) : (
                <>
                  <div className="chips" style={{ marginTop: 16 }}>
                    <span className="chips-l">Room</span>
                    {[{ id: 'all', ten: 'All three rooms' },
                      ...PHONG_NHA.map((t) => ({ id: t, ten: shortRoom(t) }))].map((o) => (
                      <button key={o.id} className={`chip ${kenhRoom === o.id ? 'on' : ''}`}
                        onClick={() => setKenhRoom(o.id)}>{o.ten}</button>
                    ))}
                  </div>
                  <ComboChart
                    data={kenhAtr.map((r) => ({ ky: r.ky, a: r.lgm, b: r.rest }))}
                    names={['LGM spend', 'Seller NMV after ads']}
                    colors={['var(--c2)', 'var(--c1-soft)']}
                    lines={[{
                      ten: 'ATR on Seller NMV (right axis)',
                      color: 'var(--bad)', truc: 'pct',
                      vals: kenhAtr.map((r) => r.atr),
                      showVals: true,
                      fmtVal: (v) => `${v}%`,
                    }]}
                    fmt={bn} label={kenhNgay ? ddmm : mmyy} unit="VND bn"
                    tip={(d, i2) => {
                      const r = kenhAtr[i2]
                      if (!r) return null
                      return (
                        <><b>{(kenhNgay ? ddmm : mmyy)(d.ky)}</b><br />
                          Seller NMV {bn(r.nmv)}<br />
                          · LGM spend {bn(r.lgm)}<br />
                          · left after ads {bn(r.rest)}<br />
                          ATR {pct(r.atr)}</>
                      )
                    }}
                  />
                  <p className="foot">
                    Column height is Seller NMV &mdash; the revenue this room actually kept &mdash;
                    split into what LIVE GMV Max cost and what was left after it. The two parts add
                    up to Seller NMV, so the coloured share of each column <i>is</i> the ATR drawn on
                    the red line.
                  </p>

                  <div className="chips" style={{ marginTop: 18 }}>
                    <span className="chips-l">Metric</span>
                    {KENH_METRICS.map((m) => (
                      <button key={m.id} className={`chip ${kenhMetric === m.id ? 'on' : ''}`}
                        onClick={() => setKenhMetric(m.id)}>{m.ten}</button>
                    ))}
                  </div>
                  <Matrix
                    corner={`Channel · ${kDef.ten}`}
                    cols={(kenhNgay ? kenhBangNgay.luoi : kenhBang.thang)
                      .map((k) => (kenhNgay ? ddmm(k) : mmyy(`${k}-01`)))}
                    fmt={kDef.fmt}
                    heat={kDef.xau_cao ? 'high-bad' : 'high-good'}
                    rows={(kenhNgay ? kenhBangNgay : kenhBang).ten.map((t, i2) => ({
                      label: t,
                      color: t.startsWith('Roborock') ? PALETTE[i2 % PALETTE.length] : GREY,
                      vals: (kenhNgay ? kenhBangNgay.luoi : kenhBang.thang).map((k) => {
                        const r = (kenhNgay ? kenhBangNgay : kenhBang).rows.get(t)?.get(k)
                        return r ? kDef.lay(r) : null
                      }),
                    }))}
                  />
                  <p className="foot">
                    {kDef.ten}{kDef.don_vi ? ` (${kDef.don_vi})` : ''} per channel per{' '}
                    {kenhNgay ? 'day' : 'month'}.{' '}
                    {kenhNgay && kenhBangNgay.thang.length > kenhBangNgay.luoi.length &&
                      `The grid shows the most recent ${kenhBangNgay.luoi.length} of ${kenhBangNgay.thang.length} days; the chart above covers them all. `}
                    <b>ATR on Seller NMV</b> is that room&rsquo;s LIVE GMV Max spend divided by the
                    revenue the room actually kept. It runs far above the ATR in section 5.3, which
                    divides the same spend by TikTok&rsquo;s gross session GMV &mdash; same numerator,
                    a much bigger denominator. This one is the honest version, because cancelled
                    orders never paid for the ads.
                  </p>
                  <div className="note warn">
                    Only months where most order lines carry a room tag are included{' '}
                    ({kenhBang.thang.map((k) => `${mmyy(`${k}-01`)} ${kenhBang.phu.get(k)}%`).join(' · ')}).
                    TikTok began tagging in May 2026. Roughly a third of lines still carry no tag
                    and land in &ldquo;Ngoài live&rdquo;, so read that row as an upper bound.
                  </div>
                </>
              )}
            </section>

            <section id="s5-4">
              <h2><span className="hno">5.4</span>Products by room</h2>
              <p className="sub">
                Which room sells which machine. TikTok&rsquo;s own live reporting cannot answer this
                &mdash; it gives one GMV figure per session with no product breakdown. This comes
                from the order lines instead, where each line carries both the model and the live
                room, so revenue, units and cancellations are all real and all ours.
              </p>
              {!skuKenh.models.length ? (
                <div className="note warn">
                  None of the months selected above have enough room tagging on order lines to
                  split products by room. Usable coverage starts in July 2026 &mdash; pick a month
                  from then onward, or clear the month filter.
                </div>
              ) : (
                <>
                  <div className="chips" style={{ marginTop: 14 }}>
                    <span className="chips-l">Metric</span>
                    {SKU_METRICS.map((m) => (
                      <button key={m.id} className={`chip ${skuMetric === m.id ? 'on' : ''}`}
                        onClick={() => setSkuMetric(m.id)}>{m.ten}</button>
                    ))}
                  </div>
                  <Matrix
                    corner={`Model · ${sDef.ten}`}
                    cols={[...skuKenh.cot.map(shortRoom), 'All rooms']}
                    fmt={sDef.fmt}
                    heat={sDef.xau_cao ? 'high-bad' : 'high-good'}
                    rows={skuKenh.models.map((m) => {
                      const per = skuKenh.rows.get(m)
                      const gop = { nmv: 0, net: 0, gross: 0, huy: 0 }
                      for (const k of skuKenh.cot) {
                        const o = per?.get(k)
                        if (!o) continue
                        gop.nmv += o.nmv; gop.net += o.net; gop.gross += o.gross; gop.huy += o.huy
                      }
                      const oneVal = (k: string) => {
                        const o = per?.get(k)
                        if (!o) return null
                        if (skuMetric === 'mix') {
                          const t = skuKenh.tongCot.get(k) ?? 0
                          return t > 0 ? Math.round((o.nmv / t) * 1000) / 10 || null : null
                        }
                        return sDef.lay(o)
                      }
                      return {
                        label: m,
                        vals: [
                          ...skuKenh.cot.map(oneVal),
                          skuMetric === 'mix' ? null : sDef.lay(gop),
                        ],
                      }
                    })}
                  />
                  <p className="foot">
                    {sDef.ten}{sDef.don_vi ? ` (${sDef.don_vi})` : ''} per model per room, summed
                    over the months where order lines carry a room tag{' '}
                    ({kenhBang.thang.map((k) => mmyy(`${k}-01`)).join(' · ')}).{' '}
                    <b>Share of room</b> reads down a column: what share of that room&rsquo;s live
                    revenue each model brought, so it shows the room&rsquo;s product mix rather than
                    its size. Cancellation rate is recalculated on gross units, never averaged
                    across cells, and a cell under 5 gross units is left blank &mdash; one unit
                    sold and cancelled reads as 100% and means nothing. Models are ordered by revenue across the three own rooms, so a
                    model that only ever sells outside live does not head the table.
                  </p>
                </>
              )}
            </section>

            <section id="s5-5">
              <h2><span className="hno">5.5</span>Hours and schedule</h2>
              <p className="sub">
                Days are grouped by how long the room streamed that day. The line shows what an
                hour of streaming was worth inside each group, so it reads left to right as: does
                the next hour still pay?
              </p>
              {!gioNmvNgay.length ? (
                <div className="note warn">
                  No day in the selected months has both a live session and room-tagged orders.
                  Usable coverage starts in July 2026.
                </div>
              ) : (
                <>
                  <div className="seg" style={{ marginBottom: 4 }}>
                    {([['per_hour', 'NMV per live hour'], ['per_day', 'NMV per live day']] as const)
                      .map(([k, l]) => (
                        <button key={k} className={gioMetric === k ? 'on' : ''}
                          onClick={() => setGioMetric(k)}>{l}</button>
                      ))}
                  </div>
                  <div className="chips" style={{ marginTop: 12, marginBottom: 6 }}>
                    <span className="chips-l">Ad budget</span>
                    {([['all', 'All days'], ['low', 'Low-spend days'],
                      ['mid', 'Mid-spend days'], ['high', 'High-spend days']] as const).map(([k, l]) => (
                      <button key={k} className={`chip ${gioAds === k ? 'on' : ''}`}
                        onClick={() => setGioAds(k)}>{l}</button>
                    ))}
                  </div>
                  <div className="tablewrap" style={{ marginTop: 4, marginBottom: 10 }}>
                    <table className="mini">
                      <thead><tr>
                        <th>Room</th>
                        <th className="n">Low-spend days<div className="uhint">LGM mn / day</div></th>
                        <th className="n">Mid-spend days<div className="uhint">LGM mn / day</div></th>
                        <th className="n">High-spend days<div className="uhint">LGM mn / day</div></th>
                        <th className="n">In this view<div className="uhint">avg · days</div></th>
                      </tr></thead>
                      <tbody>
                        {gioCurve.series.map((r) => (
                          <tr key={r.ten}>
                            <td>
                              <i className="sw" style={{ background: r.color, marginRight: 7 }} />
                              {shortRoom(r.ten)}
                            </td>
                            <td className="n muted">up to {mn1(r.t1)}</td>
                            <td className="n muted">{mn1(r.t1)} – {mn1(r.t2)}</td>
                            <td className="n muted">above {mn1(r.t2)}</td>
                            <td className="n">
                              <b>{mn1(r.chiTB)}</b>
                              <span className="muted"> · {r.chiNgay} days</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="foot" style={{ marginTop: 0, marginBottom: 10 }}>
                    Each room&rsquo;s own days are sorted by that day&rsquo;s LIVE GMV Max spend and
                    cut into three equal groups. Thirds are cut per room because the rooms spend on
                    very different scales &mdash; a cheap day for Official VN would be an expensive
                    one for Lifestyle. The last column is what a day in the current selection
                    actually cost on average, so the budget you are holding still is a real number,
                    not a label.
                  </p>
                  <Curve
                    cols={gioCurve.nhan}
                    series={gioCurve.series}
                    fmt={(v) => `${mn1(v)} mn`}
                    xNhan="Hours streamed in the day"
                    yNhan={gioMetric === 'per_hour' ? 'VND mn per live hour' : 'VND mn per live day'}
                    tip={(i2) => (
                      <><b>{gioCurve.nhan[i2]}</b><br />
                        {gioCurve.series.map((sr) => {
                          const o = sr.gom[i2]
                          if (!o || o.ngay === 0) return null
                          return (
                            <span key={sr.ten}>
                              {shortRoom(sr.ten)}: {o.ngay} day{o.ngay === 1 ? '' : 's'} ·{' '}
                              {o.gio > 0 ? `${mn1(o.nmv / o.gio)} mn/h` : '—'} ·{' '}
                              {mn1(o.nmv / o.ngay)} mn/day ·{' '}
                              LGM {mn1(o.lgm / o.ngay)} mn/day<br />
                            </span>
                          )
                        })}</>
                    )}
                  />
                  <p className="foot">
                    Days are grouped by how long the room streamed, then each group&rsquo;s total
                    revenue is divided by its total hours &mdash; not by averaging the daily ratios,
                    which one short lucky day would distort. <b>Where a line turns down is where an
                    extra hour stops paying for itself.</b> A hollow dot marks a group with fewer
                    than 5 days; groups under 2 days are not drawn at all.
                  </p>
                  <div className="note warn">
                    <b>Hours and ad money move together, so the plain curve cannot separate them.</b>{' '}
                    A long day is usually also a mega-sale day with a big budget behind it, which is
                    why the line keeps climbing. The spend filter splits each room&rsquo;s days into
                    its own low, middle and top third by LIVE GMV Max spend &mdash; thirds are cut
                    per room because the three rooms spend on very different scales. Pick one third
                    and the budget is roughly held still: whatever slope survives inside it is the
                    part that hours actually contribute. Even then this is observation, not an
                    experiment; the only clean test is to hold the budget and change the schedule.
                  </div>

                  <h3 style={{ marginTop: 26 }}>Hours, revenue and revenue per hour</h3>
                  <div className="tablewrap">
                    <table>
                      <thead><tr>
                        <th>Room</th>
                        {kenhBang.thang.map((k) => (
                          <th className="n" key={k}>{mmyy(`${k}-01`)}
                            <div className="uhint">hours · bn · mn/h</div></th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {gioNmvThang.map((r) => (
                          <tr key={r.ten}>
                            <td>
                              <i className="sw" style={{ background: r.color, marginRight: 7 }} />
                              {r.ten}
                            </td>
                            {r.o.map((x) => (
                              <td className="n" key={x.ky}>
                                {x.gio > 0 ? n0(x.gio) : <span className="muted">—</span>}
                                <span className="muted" style={{ margin: '0 5px' }}>·</span>
                                {bn(x.nmv)}
                                <span className="muted" style={{ margin: '0 5px' }}>·</span>
                                <b>{x.gio > 0 ? mn1(x.tren_gio) : '—'}</b>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="foot">
                    Each cell is hours streamed · Seller NMV in VND bn · <b>NMV per live hour in VND
                    mn</b>. The last one is the number to read across rooms: it says what an hour of
                    that room is worth, independent of how many hours it ran. Hours come from the
                    live session table, revenue from room-tagged order lines, so only months with
                    usable tagging appear{' '}
                    ({kenhBang.thang.map((k) => mmyy(`${k}-01`)).join(' · ')}).
                  </p>
                  <div className="note warn">
                    An order is tagged to the room, not to the hour, so a day with a late session can
                    book revenue the next morning. Read a single bubble as a rough pairing; read the
                    cloud, and the per-hour column, as the real signal.
                  </div>
                </>
              )}
            
              <h3 style={{ marginTop: 30 }}>Streaming schedule vs revenue</h3>
              <p className="sub">
                A month of streaming is two separate decisions: <b>how many days</b> the room goes
                live, and <b>how long</b> each of those days runs. Total hours is just the two
                multiplied, so looking only at the total hides which of the two actually moved.
              </p>
              {!nhipThang.length ? (
                <div className="note warn">
                  No month in the current filter has both live sessions and room-tagged orders.
                </div>
              ) : (
                <>
                  <StackLine
                    rows={nhipKy.map((k) => ({
                      ky: k,
                      parts: nhipThang.map((r) => r.thang.get(k)?.gio ?? 0),
                    }))}
                    series={nhipThang.map((r) => ({ ten: `${shortRoom(r.ten)} — hours`, color: r.color }))}
                    lines={nhipThang.map((r) => ({
                      ten: `${shortRoom(r.ten)} — NMV`,
                      color: r.color,
                      vals: nhipKy.map((k) => {
                        const o = r.thang.get(k)
                        return o ? o.nmv : null
                      }),
                    }))}
                    fmtCot={(v) => `${n0(v)}h`}
                    fmtDuong={(v) => `${bn(v)} bn`}
                    label={(k) => (byMonth ? mmyy(`${k}-01`) : ddmm(k))}
                    tip={(i2) => {
                      const k = nhipKy[i2]
                      let gio = 0
                      let nmv = 0
                      for (const r of nhipThang) {
                        const o = r.thang.get(k)
                        if (!o) continue
                        gio += o.gio; nmv += o.nmv
                      }
                      return (
                        <><b>{byMonth ? mmyy(`${k}-01`) : ddmm(k)}</b><br />
                          {nhipThang.map((r) => {
                            const o = r.thang.get(k)
                            if (!o) return null
                            return (
                              <span key={r.ten}>
                                {shortRoom(r.ten)}: {n0(o.gio)}h · {bn(o.nmv)} bn
                                {byMonth ? ` · ${n0(o.ngay)} days` : ''}<br />
                              </span>
                            )
                          })}
                          <b>Total {n0(gio)}h · {bn(nmv)} bn</b><br />
                          {gio > 0 ? `${mn1(nmv / gio)} mn per live hour` : ''}</>
                      )
                    }}
                  />
                  <p className="foot">
                    Columns stack the three rooms&rsquo; hours, so their height is the total the shop
                    streamed; each room also gets its own revenue line in the same colour, all three
                    sharing one right-hand scale so they stay comparable with each other. Hours run
                    in the hundreds and revenue in the billions, so columns and lines cannot share an
                    axis &mdash; only the <i>shape</i> of a line against its own colour of column is
                    meaningful, never the gap between line and column. The period follows the range
                    buttons at the top of the page.
                  </p>

                  <h3 style={{ marginTop: 26 }}>The month broken into its two parts</h3>
                  <p className="sub" style={{ marginTop: 2 }}>
                    Always monthly, whatever the range buttons say &mdash; a day has
                    only one day in it, so days × hours per day only means something
                    over a month.
                  </p>
                  <div className="tablewrap">
                    <table>
                      <thead><tr>
                        <th>Room</th>
                        {kenhBang.thang.map((k) => (
                          <th className="n" key={k}>{mmyy(`${k}-01`)}
                            <div className="uhint">days × h/day = h</div></th>
                        ))}
                        <th className="n">Best day length<div className="uhint">by NMV / hour</div></th>
                        <th className="n">That implies<div className="uhint">hours / month</div></th>
                      </tr></thead>
                      <tbody>
                        {nhipThang.map((r) => (
                          <tr key={r.ten}>
                            <td>
                              <i className="sw" style={{ background: r.color, marginRight: 7 }} />
                              {r.ten}
                            </td>
                            {kenhBang.thang.map((k) => {
                              const o = r.thang.get(k)
                              if (!o) return <td className="n muted" key={k}>—</td>
                              return (
                                <td className="n" key={k}>
                                  {n0(o.ngay)}
                                  <span className="muted" style={{ margin: '0 4px' }}>×</span>
                                  {(o.gio / o.ngay).toFixed(1)}
                                  <span className="muted" style={{ margin: '0 4px' }}>=</span>
                                  <b>{n0(o.gio)}</b>
                                </td>
                              )
                            })}
                            <td className="n">
                              {r.bestKhung ?? <span className="muted">—</span>}
                              {r.bestTrenGio != null && (
                                <div className="muted" style={{ fontSize: '.85em' }}>
                                  {mn1(r.bestTrenGio)} mn/h · {r.bestNgay} days
                                </div>
                              )}
                            </td>
                            <td className="n">
                              <b>{r.goiY != null ? `≈ ${n0(r.goiY)}h` : '—'}</b>
                              {r.goiY != null && (
                                <div className="muted" style={{ fontSize: '.85em' }}>
                                  at {r.ngayTV} live days
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="foot">
                    <b>Best day length</b> is the day-length band where an hour of that room earned
                    the most, counting only bands with at least 5 days behind them. <b>That implies</b>
                    {' '}multiplies the middle of that band by the room&rsquo;s usual number of live
                    days per month.
                  </p>
                  <div className="note warn">
                    <b>Read the last two columns as arithmetic, not as a target.</b> They restate what
                    already happened over three months; they are not a forecast, and they cannot tell
                    long days apart from big-budget days &mdash; use the ad-budget filter in 5.8 for
                    that. A room whose best band is the longest one has simply not been run long
                    enough to find its ceiling, which is a statement about the data, not about the
                    room. Before changing a schedule on this, check it against the budget-held view
                    above and run it as a real test for two weeks.
                  </div>
                </>
              )}
            </section>

            <section id="s5-6">
              <h2><span className="hno">5.6</span>From the feed into the room — {periodNote}</h2>
              <p className="sub">
                The step the dashboard could not see until now: people scrolling past a live room,
                and how many of them tapped in. <b>Shows</b> is how often a room was put in front of
                someone; <b>tap-through</b> is the share who went in. Everything below this line was
                already measured — this is the funnel finally starting where the traffic starts.
                <br /><br />
                <span className="muted">
                  Shop level, not per room — TikTok reports it for the shop&rsquo;s linked accounts
                  as a whole. Shows is <b>derived</b>: TikTok gives GMV per 1,000 shows, so shows =
                  attributed GMV ÷ show GPM × 1,000. Cross-checked against the per-session numbers,
                  product impressions and clicks agree within 1.5%, so the two sources describe the
                  same traffic; views differ by about 6% because the two endpoints count a view
                  slightly differently.
                </span>
              </p>
              {dauPheu ? (
                <>
                  <div className="tiles" style={{ marginTop: 20 }}>
                    <Tile label="Tap-through rate" value={pct(dauPheu.tap)}
                      sub={`${n0(dauPheu.tong.views)} entered of ${n0(dauPheu.tong.shows)} shown`} />
                    <Tile label="Times a room was shown" value={mn1(dauPheu.tong.shows)} unit="m"
                      sub="feed impressions of the live room" />
                    <Tile label="TikTok-attributed live GMV" value={bn(dauPheu.tong.gmv)} unit=" bn"
                      sub="TikTok's attribution, not our order data" />
                    <Tile label="Of that, indirect" value={pct(dauPheu.pctGt)}
                      sub={`${bn(dauPheu.tong.gianTiep)} bn bought after leaving the room`} />
                  </div>

                  <h3 style={{ marginTop: 30 }}>The whole funnel, top to bottom</h3>
                  <p className="sub">
                    Log scale — each step is a fraction of a percent of the one above it, and on a
                    linear axis everything after the first bar would be a sliver.
                  </p>
                  <Funnel
                    rooms={[{
                      ten: 'All linked rooms',
                      color: 'var(--c1)',
                      stages: [
                        { ten: 'Shown in feed', v: dauPheu.tong.shows },
                        { ten: 'Entered the room', v: dauPheu.tong.views },
                        { ten: 'Product impressions', v: dauPheu.duoi.imp },
                        { ten: 'Product clicks', v: dauPheu.duoi.clicks },
                        { ten: 'Paid SKU orders', v: dauPheu.duoi.don },
                      ],
                    }]}
                  />

                  <h3 style={{ marginTop: 30 }}>Shows and tap-through, {periodWord} by {periodWord}</h3>
                  <StackLine
                    rows={dauPheu.ky.map((r) => ({ ky: r.ky, parts: [r.views, Math.max(0, r.shows - r.views)] }))}
                    series={[
                      { ten: 'Entered the room', color: 'var(--c1)' },
                      { ten: 'Scrolled past', color: 'var(--c1-soft)' },
                    ]}
                    lines={[{ ten: 'Tap-through rate', color: 'var(--bad)', vals: dauPheu.ky.map((r) => r.tap) }]}
                    fmtCot={(v) => `${mn1(v)}m`}
                    fmtDuong={(v) => `${v}%`}
                    label={lbl}
                    tip={(i) => {
                      const r = dauPheu.ky[i]
                      if (!r) return null
                      return (
                        <><b>{lbl(r.ky)}</b><br />
                          Shown {n0(r.shows)}<br />
                          Entered {n0(r.views)} · <b style={{ color: 'var(--bad)' }}>{pct(r.tap)}</b><br />
                          <span className="muted">Attributed GMV {bn(r.gmv)} bn · indirect {pct(r.pctGt)}</span>
                        </>
                      )
                    }}
                  />
                  <div className="note">
                    <b>Tap-through is the cheapest lever in the funnel.</b> Every step below it is
                    measured in fractions of a percent, so a point gained here carries all the way
                    down; a point gained at product-click level does not. It is also the step LGM
                    actually buys — ad money buys shows, and what the thumbnail, the title and the
                    first ten seconds do with those shows is what this line measures.
                    <br /><br />
                    <b>Indirect GMV is the part nothing else on this dashboard counts.</b> It is the
                    buyer who watched, left, and bought later. Judging a room only on what closed
                    inside the session understates it by exactly this much.
                  </div>
                </>
              ) : (
                <p className="sub muted">
                  No shop-level data in the selected months. This table is filled by the daily sync
                  chain (orders → ads → live); if it stays empty, that chain has stopped.
                </p>
              )}
            </section>

            <section id="s5-7">
              <h2><span className="hno">5.7</span>Rooms side by side</h2>
              <p className="sub">
                The rooms differ enough in scale that totals alone mislead. GMV per 1k views is the
                column to read across &mdash; it puts a big room with cheap traffic next to a small
                room with expensive traffic on the same footing.
              </p>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Room</th>
                    <th className="n">Sessions</th><th className="n">Hours</th>
                    <th className="n">GMV<div className="uhint">bn</div></th>
                    <th className="n">GMV / day<div className="uhint">bn</div></th>
                    <th className="n">GMV / hour<div className="uhint">mn</div></th>
                    <th className="n">Views</th>
                    <th className="n">GMV / 1k views<div className="uhint">mn</div></th>
                    <th className="n">CTR</th><th className="n">Click to order</th>
                    <th className="n">Watch</th><th className="n">Units</th>
                    <th className="n">LGM spend<div className="uhint">mn</div></th>
                    <th className="n">GMV per ₫</th>
                    <th className="n">ATR</th>
                  </tr></thead>
                  <tbody>
                    {liveOwnRooms.map((r) => (
                      <tr key={r.username}>
                        <td>{r.ten}<div className="muted" style={{ fontSize: '.85em' }}>@{r.username}</div></td>
                        <td className="n">{n0(r.phien)}</td>
                        <td className="n">{n0(r.gio)}</td>
                        <td className="n"><b>{bn(r.gmv)}</b></td>
                        <td className="n">{liveDayStats ? bn(r.gmv / liveDayStats.n) : '—'}</td>
                        <td className="n">{r.gio > 0 ? mn1(r.gmv / r.gio) : '—'}</td>
                        <td className="n">{n0(r.views)}</td>
                        <td className="n"><b>{mn1(per1k(r.gmv, r.views))}</b></td>
                        <td className="n">{pct(p1(r.clicks, r.imp))}</td>
                        <td className="n">{pct(p1(r.don, r.clicks))}</td>
                        <td className="n">{r.gio > 0 ? `${Math.round(r.xemW / r.gio)}s` : '—'}</td>
                        <td className="n">{n0(r.pcs)}</td>
                        <td className="n">{mn1(lgmTong.get(r.ten) ?? 0)}</td>
                        <td className="n"><b>{lgmLai(r.gmv, lgmTong.get(r.ten) ?? 0)}</b></td>
                        <td className="n"
                          style={{ color: p1(lgmTong.get(r.ten) ?? 0, r.gmv) > 6 ? 'var(--bad)' : 'inherit' }}>
                          {pct(p1(lgmTong.get(r.ten) ?? 0, r.gmv))}
                        </td>
                      </tr>
                    ))}
                    <tr className="tot">
                      <td><b>All three</b></td>
                      <td className="n">{n0(liveTot.own.phien)}</td>
                      <td className="n">{n0(liveTot.own.gio)}</td>
                      <td className="n"><b>{bn(liveTot.own.gmv)}</b></td>
                      <td className="n">{liveDayStats ? bn(liveTot.own.gmv / liveDayStats.n) : '—'}</td>
                      <td className="n">{liveTot.own.gio > 0 ? mn1(liveTot.own.gmv / liveTot.own.gio) : '—'}</td>
                      <td className="n">{n0(liveTot.own.views)}</td>
                      <td className="n"><b>{mn1(per1k(liveTot.own.gmv, liveTot.own.views))}</b></td>
                      <td className="n">{pct(p1(liveTot.own.clicks, liveTot.own.imp))}</td>
                      <td className="n">{pct(p1(liveTot.own.don, liveTot.own.clicks))}</td>
                      <td className="n muted">—</td>
                      <td className="n">{n0(liveTot.own.pcs)}</td>
                      <td className="n">{mn1(lgmOwn)}</td>
                      <td className="n"><b>{lgmLai(liveTot.own.gmv, lgmOwn)}</b></td>
                      <td className="n">{pct(p1(lgmOwn, liveTot.own.gmv))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="foot">
                GMV in VND bn, gross &mdash; what TikTok books for the session, before cancellations.
                It will not tie to Seller NMV elsewhere in this dashboard. Watch is the average
                viewing duration per session.
              </p>
              <p className="foot">
                LGM spend is assigned to a room from the campaign name &mdash; RV / Robovac /
                &ldquo;Official VN&rdquo; to Official, HV / Handvac / &ldquo;Shop VN&rdquo; to Máy
                lau sàn, HE / Lifestyle to Lifestyle. Every LGM campaign matches one of those, so
                nothing is left unassigned, but the mapping is only as good as the naming
                convention: a campaign named some other way would land in the wrong room silently.
                ATR here is LGM ÷ gross live GMV of that room, which is not the shop-wide ATR on the
                Advertising tab &mdash; that one is all ad spend over Seller NMV.
              </p>
            </section>

            <section id="s5-8">
              <h2><span className="hno">5.8</span>Traffic and engagement by room</h2>
              <p className="sub">
                Everything here is per 1.000 views rather than a total, because the three rooms pull
                very different volumes and raw counts only restate that. Views counts every entry
                into the room; viewers counts people, so views ÷ viewers is how often the same
                person came back during a stream.
              </p>
              <CompareBars
                nhom={[
                  {
                    ten: 'Views per hour', don_vi: 'views',
                    fmt: (v) => n0(v),
                    ghi_chu: 'How fast the room fills while it is live.',
                    vals: liveOwnRooms.map((r, i) => ({
                      ten: shortRoom(r.ten), color: PALETTE[i % PALETTE.length],
                      v: r.gio > 0 ? r.views / r.gio : 0,
                    })),
                  },
                  {
                    ten: 'Watch time', don_vi: 'seconds',
                    fmt: (v) => `${Math.round(v)}s`,
                    ghi_chu: 'Average time a view lasts, weighted by hours streamed.',
                    vals: liveOwnRooms.map((r, i) => ({
                      ten: shortRoom(r.ten), color: PALETTE[i % PALETTE.length],
                      v: r.gio > 0 ? r.xemW / r.gio : 0,
                    })),
                  },
                  {
                    ten: 'Views per viewer', don_vi: '×',
                    fmt: (v) => v.toFixed(2),
                    ghi_chu: 'Above 1 means the same person came back during the stream.',
                    vals: liveOwnRooms.map((r, i) => ({
                      ten: shortRoom(r.ten), color: PALETTE[i % PALETTE.length],
                      v: r.viewers > 0 ? r.views / r.viewers : 0,
                    })),
                  },
                  {
                    ten: 'Engagement rate', don_vi: '% of views',
                    fmt: (v) => `${v}%`,
                    ghi_chu: 'Likes, comments and shares together, against views.',
                    vals: liveOwnRooms.map((r, i) => ({
                      ten: shortRoom(r.ten), color: PALETTE[i % PALETTE.length],
                      v: p1(r.likes + r.comments + r.shares, r.views),
                    })),
                  },
                  {
                    ten: 'Like rate', don_vi: '% of views',
                    fmt: (v) => `${v}%`,
                    vals: liveOwnRooms.map((r, i) => ({
                      ten: shortRoom(r.ten), color: PALETTE[i % PALETTE.length],
                      v: p1(r.likes, r.views),
                    })),
                  },
                  {
                    ten: 'Comments', don_vi: 'per 1k views',
                    fmt: (v) => v.toFixed(2),
                    vals: liveOwnRooms.map((r, i) => ({
                      ten: shortRoom(r.ten), color: PALETTE[i % PALETTE.length],
                      v: k1(r.comments, r.views),
                    })),
                  },
                  {
                    ten: 'Shares', don_vi: 'per 1k views',
                    fmt: (v) => v.toFixed(2),
                    vals: liveOwnRooms.map((r, i) => ({
                      ten: shortRoom(r.ten), color: PALETTE[i % PALETTE.length],
                      v: k1(r.shares, r.views),
                    })),
                  },
                  {
                    ten: 'New followers', don_vi: 'per 1k views',
                    fmt: (v) => v.toFixed(2),
                    vals: liveOwnRooms.map((r, i) => ({
                      ten: shortRoom(r.ten), color: PALETTE[i % PALETTE.length],
                      v: k1(r.followers, r.views),
                    })),
                  },
                  {
                    ten: 'Product impressions', don_vi: 'per view',
                    fmt: (v) => v.toFixed(2),
                    ghi_chu: 'How often the product card is shown to each view.',
                    vals: liveOwnRooms.map((r, i) => ({
                      ten: shortRoom(r.ten), color: PALETTE[i % PALETTE.length],
                      v: r.views > 0 ? r.imp / r.views : 0,
                    })),
                  },
                  {
                    ten: 'Product CTR', don_vi: '% of impressions',
                    fmt: (v) => `${v}%`,
                    vals: liveOwnRooms.map((r, i) => ({
                      ten: shortRoom(r.ten), color: PALETTE[i % PALETTE.length],
                      v: p1(r.clicks, r.imp),
                    })),
                  },
                  {
                    ten: 'GMV per 1k views', don_vi: 'VND mn',
                    fmt: (v) => mn1(v),
                    ghi_chu: 'What all of the above finally adds up to.',
                    vals: liveOwnRooms.map((r, i) => ({
                      ten: shortRoom(r.ten), color: PALETTE[i % PALETTE.length],
                      v: per1k(r.gmv, r.views),
                    })),
                  },
                  {
                    ten: 'GMV per hour', don_vi: 'VND mn',
                    fmt: (v) => mn1(v),
                    vals: liveOwnRooms.map((r, i) => ({
                      ten: shortRoom(r.ten), color: PALETTE[i % PALETTE.length],
                      v: r.gio > 0 ? r.gmv / r.gio : 0,
                    })),
                  },
                ]}
              />
              <p className="foot">
                Each panel scales to its own leader, so bar length compares rooms within a metric
                and never across metrics. The faded bars are the rooms behind on that one measure.
              </p>

              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Room</th>
                    <th className="n">Views</th><th className="n">Viewers</th>
                    <th className="n">Views / viewer</th>
                    <th className="n">Views / hour</th>
                    <th className="n">Watch</th>
                    <th className="n">Like rate</th>
                    <th className="n">Comments<div className="uhint">per 1k views</div></th>
                    <th className="n">Shares<div className="uhint">per 1k views</div></th>
                    <th className="n">New followers</th>
                    <th className="n">Follows<div className="uhint">per 1k views</div></th>
                  </tr></thead>
                  <tbody>
                    {liveOwnRooms.map((r) => (
                      <tr key={r.username}>
                        <td>{r.ten}</td>
                        <td className="n">{n0(r.views)}</td>
                        <td className="n">{n0(r.viewers)}</td>
                        <td className="n">{r.viewers > 0 ? (r.views / r.viewers).toFixed(2) : '—'}</td>
                        <td className="n">{r.gio > 0 ? n0(r.views / r.gio) : '—'}</td>
                        <td className="n">{r.gio > 0 ? `${Math.round(r.xemW / r.gio)}s` : '—'}</td>
                        <td className="n">{pct(p1(r.likes, r.views))}</td>
                        <td className="n">{k1(r.comments, r.views)}</td>
                        <td className="n">{k1(r.shares, r.views)}</td>
                        <td className="n">{n0(r.followers)}</td>
                        <td className="n">{k1(r.followers, r.views)}</td>
                      </tr>
                    ))}
                    <tr className="tot">
                      <td><b>All three</b></td>
                      <td className="n">{n0(liveTot.own.views)}</td>
                      <td className="n">{n0(liveTot.own.viewers)}</td>
                      <td className="n">
                        {liveTot.own.viewers > 0 ? (liveTot.own.views / liveTot.own.viewers).toFixed(2) : '—'}
                      </td>
                      <td className="n">{liveTot.own.gio > 0 ? n0(liveTot.own.views / liveTot.own.gio) : '—'}</td>
                      <td className="n">{liveTot.own.gio > 0 ? `${Math.round(liveTot.own.xemW / liveTot.own.gio)}s` : '—'}</td>
                      <td className="n">{pct(p1(liveTot.own.likes, liveTot.own.views))}</td>
                      <td className="n">{k1(liveTot.own.comments, liveTot.own.views)}</td>
                      <td className="n">{k1(liveTot.own.shares, liveTot.own.views)}</td>
                      <td className="n">{n0(liveTot.own.followers)}</td>
                      <td className="n">{k1(liveTot.own.followers, liveTot.own.views)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="foot">
                Like rate is likes ÷ views, so it can pass 100% &mdash; one viewer taps the heart
                many times. Read it as enthusiasm per view, not as a share of the audience. Watch is
                the average viewing duration, weighted by hours streamed so a 12-hour session does
                not count the same as a 2-hour one.
              </p>
            </section>

            <section id="s5-9">
              <h2><span className="hno">5.9</span>Funnel by room</h2>
              <p className="sub">
                From a view to a paid order. Each percentage is against the step immediately above
                it, so a weak room shows exactly where it loses people rather than only that it
                sells less.
              </p>
              <Funnel
                rooms={liveOwnRooms.map((r, i) => ({
                  ten: r.ten,
                  color: PALETTE[i % PALETTE.length],
                  stages: [
                    { ten: 'Product impressions', v: r.imp },
                    { ten: 'Product clicks', v: r.clicks },
                    { ten: 'Orders created', v: r.donTao },
                    { ten: 'Paid SKU orders', v: r.don },
                    { ten: 'Customers', v: r.khach },
                  ],
                }))}
              />
              <p className="foot">
                Bar width is on a log scale, because impressions outnumber clicks by roughly 180 to
                1 and a linear funnel would collapse every step after the first into a sliver. The
                number on each bar and the percentage beside it are the real figures — read those,
                and use the shape only to see where a room narrows.
              </p>

              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Room</th>
                    <th className="n">Views</th>
                    <th className="n">Impressions</th><th className="n">per view</th>
                    <th className="n">Clicks</th><th className="n">CTR</th>
                    <th className="n">Orders created</th><th className="n">click to order</th>
                    <th className="n">Paid orders</th><th className="n">paid</th>
                    <th className="n">Customers</th><th className="n">Units</th>
                    <th className="n">Units / customer</th>
                    <th className="n">SKUs listed / sold</th>
                  </tr></thead>
                  <tbody>
                    {liveOwnRooms.map((r) => (
                      <tr key={r.username}>
                        <td>{r.ten}</td>
                        <td className="n">{n0(r.views)}</td>
                        <td className="n">{n0(r.imp)}</td>
                        <td className="n muted">{r.views > 0 ? (r.imp / r.views).toFixed(2) : '—'}</td>
                        <td className="n">{n0(r.clicks)}</td>
                        <td className="n muted">{pct(p1(r.clicks, r.imp))}</td>
                        <td className="n">{n0(r.donTao)}</td>
                        <td className="n muted">{pct(p1(r.donTao, r.clicks))}</td>
                        <td className="n"><b>{n0(r.don)}</b></td>
                        <td className="n muted"
                          style={{ color: p1(r.don, r.donTao) < 90 ? 'var(--bad)' : 'inherit' }}>
                          {pct(p1(r.don, r.donTao))}
                        </td>
                        <td className="n">{n0(r.khach)}</td>
                        <td className="n">{n0(r.pcs)}</td>
                        <td className="n">{r.khach > 0 ? (r.pcs / r.khach).toFixed(2) : '—'}</td>
                        <td className="n muted">{n0(r.spLen)} / {n0(r.spBan)}</td>
                      </tr>
                    ))}
                    <tr className="tot">
                      <td><b>All three</b></td>
                      <td className="n">{n0(liveTot.own.views)}</td>
                      <td className="n">{n0(liveTot.own.imp)}</td>
                      <td className="n muted">
                        {liveTot.own.views > 0 ? (liveTot.own.imp / liveTot.own.views).toFixed(2) : '—'}
                      </td>
                      <td className="n">{n0(liveTot.own.clicks)}</td>
                      <td className="n muted">{pct(p1(liveTot.own.clicks, liveTot.own.imp))}</td>
                      <td className="n">{n0(liveTot.own.donTao)}</td>
                      <td className="n muted">{pct(p1(liveTot.own.donTao, liveTot.own.clicks))}</td>
                      <td className="n"><b>{n0(liveTot.own.don)}</b></td>
                      <td className="n muted">{pct(p1(liveTot.own.don, liveTot.own.donTao))}</td>
                      <td className="n">{n0(liveTot.own.khach)}</td>
                      <td className="n">{n0(liveTot.own.pcs)}</td>
                      <td className="n">
                        {liveTot.own.khach > 0 ? (liveTot.own.pcs / liveTot.own.khach).toFixed(2) : '—'}
                      </td>
                      <td className="n muted">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="foot">
                &ldquo;Paid&rdquo; is paid SKU orders ÷ orders created, inside the live session
                itself. It is not the shop cancellation rate on the Cancellations tab &mdash; that
                one is measured much later, after delivery falls through, and runs far lower.
              </p>
            </section>

            <section id="s5-10">
              <h2><span className="hno">5.10</span>Room by period</h2>
              <p className="sub">
                The same numbers as a grid. Reading along a row shows how steady a room is; reading
                down a column shows which room carried a given day. Shading is relative to the
                largest cell.
              </p>
              <div className="seg" style={{ marginTop: 14 }}>
                {([[false, 'By month'], [true, 'By day']] as const).map(([k, l]) => (
                  <button key={l} className={luoiNgay === k ? 'on' : ''}
                    onClick={() => setLuoiNgay(k)}>{l}</button>
                ))}
              </div>
              <div className="chips" style={{ marginTop: 8 }}>
                <span className="chips-l">Metric</span>
                {ROOM_METRICS.map((m) => (
                  <button key={m.id} className={`chip ${roomMetric === m.id ? 'on' : ''}`}
                    onClick={() => setRoomMetric(m.id)}>{m.ten}</button>
                ))}
              </div>
              <Matrix
                corner={`Room · ${mDef.ten}`}
                cols={luoiNgay ? gridDays.map(ddmm) : liveGrid.months.map((m) => mmyy(`${m}-01`))}
                fmt={mDef.fmt}
                heat={mDef.xau_cao ? 'high-bad' : 'high-good'}
                rows={luoiNgay
                  ? gridRows(liveGrid.ngay, gridDays)
                  : gridRows(liveGrid.thang, liveGrid.months)}
              />
              <p className="foot">
                {mDef.ten}{mDef.don_vi ? ` (${mDef.don_vi})` : ''} per room per {luoiNgay ? 'day' : 'month'}. An empty
                cell means no session in that period.
                {luoiNgay && liveGrid.days.length > gridDays.length &&
                  ` Showing the most recent ${gridDays.length} of ${liveGrid.days.length} days — the full history is in the table below.`}
              </p>
            
              <h3 style={{ marginTop: 30 }}>Shop total by month</h3>
              <p className="sub">
                The long view behind the daily charts. Six months is all the API allows, so read the
                trend rather than the level.
              </p>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Month</th>
                    <th className="n">Sessions</th><th className="n">Hours</th>
                    <th className="n">Our rooms<div className="uhint">bn</div></th>
                    <th className="n">Creators<div className="uhint">bn</div></th>
                    <th className="n">Total<div className="uhint">bn</div></th>
                    <th className="n">Views</th>
                    <th className="n">GMV / 1k views<div className="uhint">mn</div></th>
                    <th className="n">CTR</th>
                    <th className="n">Watch</th>
                    <th className="n">Like rate</th>
                    <th className="n">Comments<div className="uhint">per 1k</div></th>
                    <th className="n">Follows<div className="uhint">per 1k</div></th>
                  </tr></thead>
                  <tbody>
                    {liveMonthRows.map((m, i) => {
                      const prev = liveMonthRows[i - 1]
                      return (
                        <tr key={m.ky}>
                          <td>{mmyy(m.ky)}</td>
                          <td className="n">{n0(m.phien)}</td>
                          <td className="n">{n0(m.gio)}</td>
                          <td className="n"><b>{bn(m.own)}</b></td>
                          <td className="n muted">{bn(m.koc)}</td>
                          <td className="n">
                            {bn(m.own + m.koc)}{' '}
                            <Dd a={m.own + m.koc} b={prev ? prev.own + prev.koc : undefined} />
                          </td>
                          <td className="n">{n0(m.views)}</td>
                          <td className="n"><b>{mn1(per1k(m.own, m.views))}</b></td>
                          <td className="n">{pct(m.imp > 0 ? p1(m.clicks, m.imp) : null)}</td>
                          <td className="n">{m.gioOwn > 0 ? `${Math.round(m.xemW / m.gioOwn)}s` : '—'}</td>
                          <td className="n">{pct(p1(m.likes, m.views))}</td>
                          <td className="n">{k1(m.comments, m.views)}</td>
                          <td className="n">{k1(m.followers, m.views)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
                        </section>

            <section id="s5-11">
              <h2><span className="hno">5.11</span>Audience per day</h2>
              <p className="sub">
                Columns split each day&rsquo;s views into people seen for the first time that day
                and the views they came back for. The red line is the engagement rate &mdash; likes,
                comments and shares together, against views.
              </p>
              <ComboChart
                data={liveDays.map((d) => ({ ky: d.ngay, a: d.viewers, b: Math.max(0, d.views - d.viewers) }))}
                names={['Viewers', 'Repeat views']}
                colors={['var(--c1)', 'var(--c1-soft)']}
                lines={[{
                  ten: 'Engagement rate — likes, comments and shares ÷ views (right axis)',
                  color: 'var(--bad)', truc: 'pct',
                  vals: liveDays.map((d) => (d.views > 0 ? p1(d.likes + d.comments + d.shares, d.views) : null)),
                  showVals: true,
                  fmtVal: (v) => `${v}%`,
                }]}
                fmt={n0} label={ddmm} unit="views"
                tip={(d, i) => {
                  const r = liveDays[i]
                  if (!r) return null
                  return (
                    <><b>{ddmm(d.ky)}</b><br />
                      Views {n0(r.views)} from {n0(r.viewers)} viewers<br />
                      {r.viewers > 0 ? (r.views / r.viewers).toFixed(2) : '—'} views per viewer<br />
                      Watch {r.gioOwn > 0 ? `${Math.round(r.xemW / r.gioOwn)}s` : '—'}<br />
                      Likes {n0(r.likes)} · comments {n0(r.comments)} · shares {n0(r.shares)}<br />
                      New followers {n0(r.followers)}</>
                  )
                }}
              />
              <p className="foot">Our own rooms only — creator rooms report no engagement data.</p>
            </section>

            <section id="s5-12">
              <h2><span className="hno">5.12</span>Traffic and conversion per day</h2>
              <p className="sub">
                Columns are live GMV split between our rooms and creator rooms. The red line is the
                product click-through rate in our rooms &mdash; impressions that turned into a tap
                on the product card.
              </p>
              <ComboChart
                data={liveDays.map((d) => ({ ky: d.ngay, a: d.own, b: d.koc }))}
                names={['Our rooms', 'Creator rooms']}
                colors={['var(--c1)', GREY]}
                lines={[{
                  ten: 'Product CTR, our rooms (right axis)',
                  color: 'var(--bad)', truc: 'pct',
                  vals: liveDays.map((d) => (d.imp > 0 ? p1(d.clicks, d.imp) : null)),
                  showVals: true,
                  fmtVal: (v) => `${v}%`,
                }]}
                fmt={bn} label={ddmm} unit="VND bn"
                tip={(d, i) => {
                  const r = liveDays[i]
                  if (!r) return null
                  return (
                    <><b>{ddmm(d.ky)}</b><br />
                      Our rooms {bn(r.own)} · creators {bn(r.koc)}<br />
                      {n0(r.phien)} sessions · {n0(r.gio)} hours<br />
                      Views {n0(r.views)}<br />
                      GMV per 1k views {mn1(per1k(r.own, r.views))} mn<br />
                      CTR {pct(r.imp > 0 ? p1(r.clicks, r.imp) : null)}</>
                  )
                }}
              />
            </section>

            <section id="s5-13">
              <h2><span className="hno">5.13</span>Engagement vs CTR vs GMV</h2>
              <p className="sub">
                One bubble is one day of one room. Across: engagement rate. Up: product CTR. Size:
                that day&rsquo;s GMV. If talking to the room is what drives people to tap the
                product, the cloud runs bottom-left to top-right and the big bubbles sit in the top
                right. If it does not, the cloud is flat and the big bubbles sit anywhere.
              </p>
              <Bubbles
                pts={bubblePts.map((b) => ({
                  key: b.key, x: b.x, y: b.y, v: b.v, color: b.color,
                  body: (
                    <><b>{b.ten}</b> · {ddmm(b.ngay)}<br />
                      Engagement {b.x}% · CTR {b.y}%<br />
                      GMV {bn(b.v)} bn<br />
                      {n0(b.views)} views · {b.gio.toFixed(1)} hours</>
                  ),
                }))}
                series={liveOwnRooms.map((r, i2) => ({
                  ten: r.ten, color: PALETTE[i2 % PALETTE.length],
                }))}
                xNhan="Engagement rate — (likes + comments + shares) ÷ views"
                yNhan="Product CTR — clicks ÷ impressions"
                kichThuoc="live GMV"
                fmtX={(v) => `${Math.round(v)}%`}
                fmtY={(v) => `${v.toFixed(2)}%`}
              />
              <div className="tablewrap" style={{ marginTop: 18 }}>
                <table>
                  <thead><tr>
                    <th>Room</th><th className="n">Days plotted</th>
                    <th className="n">Median engagement</th>
                    <th className="n">Median CTR</th>
                    <th className="n">Median GMV<div className="uhint">bn</div></th>
                  </tr></thead>
                  <tbody>
                    {bubbleMid.map((m) => (
                      <tr key={m.ten}>
                        <td>
                          <i className="sw" style={{ background: m.color, marginRight: 7 }} />
                          {m.ten}
                        </td>
                        <td className="n">{n0(m.n)}</td>
                        <td className="n">{m.x.toFixed(1)}%</td>
                        <td className="n">{m.y.toFixed(2)}%</td>
                        <td className="n"><b>{bn(m.v)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="foot">
                Medians, not averages &mdash; one 9.9 day would drag an average and say nothing
                about an ordinary day. Both axes are cut at the 98th percentile so a single outlier
                cannot flatten everything else into a corner; a bubble pinned to the edge with a
                dashed outline is one that ran past the cut. Days with no views, no impressions or
                no GMV are left out rather than drawn at zero.
              </p>
            </section>

            <section id="s5-14">
              <h2><span className="hno">5.14</span>Top sessions</h2>
              <p className="sub">
                The {Math.min(40, liveTop.length)} biggest of {n0(liveTop.length)} sessions in the
                selected months. Worth reading next to the title &mdash; the stream name is the only
                record of what was actually being run that day.
              </p>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Day</th><th>Room</th><th>Title</th>
                    <th className="n">Hours</th>
                    <th className="n">GMV<div className="uhint">bn</div></th>
                    <th className="n">Units</th><th className="n">Views</th>
                    <th className="n">GMV / 1k views<div className="uhint">mn</div></th>
                    <th className="n">Watch</th>
                  </tr></thead>
                  <tbody>
                    {liveTop.slice(0, 40).map((r) => (
                      <tr key={r.session_id}>
                        <td>{ddmm(String(r.ngay))}</td>
                        <td>{r.ten}</td>
                        <td style={{ maxWidth: 260 }}>{r.title || <span className="muted">—</span>}</td>
                        <td className="n">{(Number(r.duration_phut || 0) / 60).toFixed(1)}</td>
                        <td className="n"><b>{bn(Number(r.gmv))}</b></td>
                        <td className="n">{n0(Number(r.items_sold))}</td>
                        <td className="n">{Number(r.views) > 0 ? n0(Number(r.views)) : <span className="muted">—</span>}</td>
                        <td className="n">
                          {Number(r.views) > 0 ? mn1(per1k(Number(r.gmv), Number(r.views))) : <span className="muted">—</span>}
                        </td>
                        <td className="n">
                          {Number(r.avg_viewing_duration) > 0
                            ? `${Math.round(Number(r.avg_viewing_duration))}s`
                            : <span className="muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="s5-15">
              <h2><span className="hno">5.15</span>Creator rooms</h2>
              <p className="sub">
                Rooms that sold our products but are not ours. They register themselves the first
                time one appears, so the list grows on its own as the team works with new creators.
                Engagement columns are blank by design &mdash; see the note at the top.
              </p>
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Creator</th>
                    <th className="n">Sessions</th><th className="n">Hours</th>
                    <th className="n">GMV<div className="uhint">bn</div></th>
                    <th className="n">GMV / hour<div className="uhint">mn</div></th>
                    <th className="n">Units</th><th className="n">SKU orders</th>
                    <th className="n">Share of live GMV</th>
                  </tr></thead>
                  <tbody>
                    {liveKocRooms.map((r) => (
                      <tr key={r.username}>
                        <td>@{r.username}</td>
                        <td className="n">{n0(r.phien)}</td>
                        <td className="n">{n0(r.gio)}</td>
                        <td className="n"><b>{bn(r.gmv)}</b></td>
                        <td className="n">{r.gio > 0 ? mn1(r.gmv / r.gio) : '—'}</td>
                        <td className="n">{n0(r.pcs)}</td>
                        <td className="n">{n0(r.don)}</td>
                        <td className="n">{pct(p1(r.gmv, liveTot.gmv))}</td>
                      </tr>
                    ))}
                    {!liveKocRooms.length && (
                      <tr><td colSpan={8} className="muted">No creator sessions in this period.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="foot">
                Bear in mind that LIVE GMV Max spend runs largely on these rooms while the GMV booked
                against their sessions is small &mdash; an order that starts in a creator room but
                closes later, or through a video, is not counted here.
              </p>
            </section>
          </>
        )}

        {/* ===================== DISCOUNTS ===================== */}
        {sec === 'Discounts' && (
          <>
            <div className="filters" style={{ marginTop: 26 }}>
              <select className="drop wide" value={modelSel} onChange={(e) => setModelSel(e.target.value)}>
                <option value="">All models ({allModels.length})</option>
                {allModels.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {modelSel && <button className="lnk" onClick={() => setModelSel('')}>Clear model filter</button>}
            </div>

            <section id="s6-1">
              <h2><span className="hno">6.1</span>{dayNote} — key numbers</h2>
              <p className="sub">
                Discount money for the filtered days. Booked is what was put behind the orders;
                valid is what survived to an order that was not cancelled.
              </p>
              <div className="tiles" style={{ marginTop: 20 }}>
                <Tile label="Subsidy booked" value={bn(discTotals.booked)} unit=" bn"
                  sub="TikTok's voucher, every order status" />
                <Tile label="Valid subsidy" value={bn(discTotals.valid)} unit=" bn"
                  sub="on orders that survived" />
                <Tile label="Capture rate" value={pct(p1(discTotals.valid, discTotals.booked))}
                  tone={p1(discTotals.valid, discTotals.booked) < 40 ? 'bad' : 'ok'}
                  sub="valid ÷ booked" />
                <Tile label="Valid subsidy % of Seller NMV" value={pct(p1(discTotals.valid, discTotals.nmv))}
                  sub={`Seller NMV ${bn(discTotals.nmv)} bn`} />
                <Tile label="Seller-funded discount" value={bn(discTotals.seller)} unit=" bn"
                  sub="our own money, hits margin" />
                <Tile label="Seller discount % of list" value={pct(p1(discTotals.seller, discTotals.list))}
                  sub={`list price ${bn(discTotals.list)} bn`} />
                <Tile label="Total discount % of list"
                  value={pct(p1(discTotals.seller + discTotals.booked, discTotals.list))}
                  sub="seller + platform together" />
              </div>
            </section>

            <section id="s6-2">
              <h2><span className="hno">6.2</span>Subsidy booked and capture rate per day · DoD</h2>
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

            <section id="s6-3">
              <h2><span className="hno">6.3</span>Who paid for the revenue, per day</h2>
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

            <section id="s6-4">
              <h2><span className="hno">6.4</span>Subsidy detail per day</h2>
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

            <section id="s6-5">
              <h2><span className="hno">6.5</span>Valid subsidy by model, per day</h2>
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

            <section id="s6-6">
              <h2><span className="hno">6.6</span>Who funds the discount — {dayNote}</h2>
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

            <section id="s6-7">
              <h2><span className="hno">6.7</span>Discount spend per day</h2>
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

            <section id="s6-8">
              <h2><span className="hno">6.8</span>Discount rates per day</h2>
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

            <section id="s6-9">
              <h2><span className="hno">6.9</span>Discount detail by model — {dayNote}</h2>
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

            <section id="s6-10">
              <h2><span className="hno">6.10</span>Monthly overview</h2>
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

            <section id="s6-11">
              <h2><span className="hno">6.11</span>Who funds the discount, month by month</h2>
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

            <section id="s6-12">
              <h2><span className="hno">6.12</span>What Seller NMV is actually made of</h2>
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

            <section id="s6-13">
              <h2><span className="hno">6.13</span>Subsidy booked vs subsidy kept, by month</h2>
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

            <section id="s6-14">
              <h2><span className="hno">6.14</span>Valid subsidy as a share of Seller NMV, by price band</h2>
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

            <section id="s6-15">
              <h2><span className="hno">6.15</span>Where the platform is putting its voucher money</h2>
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

        {/* =================== CANCELLATIONS =================== */}
        {sec === 'Cancellations' && (
          <>
            <section id="s7-1">
              <h2><span className="hno">7.1</span>{periodNote} — key numbers</h2>
              <p className="sub">
                What cancellations cost over the filtered range, in money as well as in units.
              </p>
              <div className="tiles" style={{ marginTop: 20 }}>
                <Tile label="Cancellation rate" value={pct(p1(cancelTotals.huy, cancelTotals.gross))}
                  tone={p1(cancelTotals.huy, cancelTotals.gross) > 40 ? 'bad' : 'ok'}
                  sub={`${n0(cancelTotals.huy)} of ${n0(cancelTotals.gross)} pcs`} />
                <Tile label="Value lost to cancellations" value={bn(cancelTotals.mat)} unit=" bn"
                  sub="Seller GMV that never became revenue" />
                <Tile label="Seller NMV kept" value={bn(cancelTotals.nmv)} unit=" bn"
                  sub="what survived" />
                <Tile label="Subsidy lost with them" value={bn(cancelTotals.subMat)} unit=" bn"
                  sub="TikTok voucher that died with the order" />
                <Tile label={`Cancelled ${pickup.moc[0]?.khoang ?? 'early'}`}
                  value={pct(p1(pickup.moc[0]?.tong ?? 0, pickup.tong))}
                  sub="share of all cancellations — see 7.3" />
                <Tile label="Cancelled after pickup" value={pct(pickup.pctSau)}
                  tone={pickup.pctSau > 40 ? 'bad' : 'ok'}
                  sub="parcel had already shipped — see 7.4" />
              </div>
            </section>

            <section id="s7-2">
              <h2><span className="hno">7.2</span>The journey of an order — {motThang ? mmyy(motThang) : 'all months'}</h2>
              <p className="sub">
                Three ways an order can end, on one real time axis. Bars are <b>medians</b>; the open
                diamond is the <b>average</b>. Where the two are far apart, a long tail is pulling
                the average — read the median. Grey is the stretch in the warehouse, colour is the
                stretch with the courier.
                <br /><br />
                <span className="muted">
                  Medians cannot be recombined across periods, so this block reads a figure the
                  database computed per month. It follows the <b>month chips</b> and the category
                  toggle, but not the 7-day / 30-day ranges — pick one month to see that month.
                </span>
              </p>
              {hanhTrinhRows ? (
                <>
                  <Timeline tracks={hanhTrinhRows.tracks} maxGio={hanhTrinhRows.maxGio} fmtT={gioNgay} />
                  <div className="tablewrap" style={{ marginTop: 22 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Outcome</th><th className="n">Units</th><th className="n">Share</th>
                          <th className="n">Picked up</th><th className="n">Ends</th>
                          <th className="n">Median</th><th className="n">Average</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hanhTrinhRows.tracks.map((t) => (
                          <tr key={t.ten}>
                            <td><span className="sw sm" style={{ background: t.color }} />{t.ten}</td>
                            <td className="n">{n0(t.n)}</td>
                            <td className="n">{pct(t.pct)}</td>
                            <td className="n muted">{t.lay == null ? 'never' : gioNgay(t.lay)}</td>
                            <td className="n muted">{t.ketNhan}</td>
                            <td className="n">{gioNgay(t.ket)}</td>
                            <td className="n muted">{gioNgay(t.ketTb)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="note hot">
                    <b>A failed parcel occupies the road about three times as long as a good one.</b>
                    {' '}A delivered order reaches the buyer around{' '}
                    {hanhTrinhRows.d ? gioNgay(hanhTrinhRows.d.giao_tv ?? 0) : '—'} after it is
                    placed. One that will be refused is not cancelled until{' '}
                    {hanhTrinhRows.sau ? gioNgay(hanhTrinhRows.sau.huy_tv ?? 0) : '—'}, because the
                    courier works through its redelivery attempts — typically three, a day apart —
                    before giving up and sending it back. In that window the unit is out of the
                    warehouse, unsellable, and already carrying its shipping cost.
                    <br /><br />
                    <b>The third path never moves at all.</b> Cancelled-before-pickup orders die at a
                    median of{' '}
                    {hanhTrinhRows.truoc ? gioNgay(hanhTrinhRows.truoc.huy_tv ?? 0) : '—'} — the
                    average of {hanhTrinhRows.truoc ? gioNgay(hanhTrinhRows.truoc.huy_tb ?? 0) : '—'}{' '}
                    is the tail of a few that linger, not the typical case. These cost the sale and
                    nothing else, which is why they are worth separating from the ones above.
                  </div>
                </>
              ) : (
                <p className="sub muted">No orders in the selected period.</p>
              )}
            </section>

            <section id="s7-3">
              <h2><span className="hno">7.3</span>Cancellation rate per {periodWord} · {dod}</h2>
              <p className="sub">Internal target is 40% or below.</p>
              <DeltaChart
                data={pt((r) => r.cancel_rate)} color="var(--bad)" fmt={(v) => `${v}`} label={lbl} unit="% cancelled"
                tip={(d) => {
                  const r = shown.find((x) => x.ky === d.ky)
                  return <><b>{lbl(d.ky)}</b><br />Cancelled {d.v}%<br />{n0(r?.sl_huy ?? 0)} of {n0(r?.so_luong ?? 0)} pcs</>
                }}
              />
            </section>

            <section id="s7-4">
              <h2><span className="hno">7.4</span>How long after ordering do orders die — {periodNote}</h2>
              <p className="sub">
                Twelve buckets at day resolution, and one line drawn through them: whether the
                courier had already collected the parcel. That line is what decides the cost, and
                TikTok stamps it on the order itself (<code>collection_time</code>) rather than
                leaving it to be inferred from the clock.
              </p>
              <BarChart
                data={pickup.moc.map((m) => ({ ky: m.khoang, v: m.tong }))}
                color="var(--c2)" fmt={n0} label={(k) => k} unit="pcs"
                tip={(d) => {
                  const m = pickup.moc.find((x) => x.khoang === d.ky)
                  if (!m) return null
                  return (
                    <><b>{d.ky}</b><br />{n0(d.v)} pcs · {pct(p1(m.tong, pickup.tong))} of all cancellations<br />
                      After pickup {pct(m.pctSau)} · value lost {bn(m.nmv)} bn</>
                  )
                }}
              />
              <div className="tablewrap" style={{ marginTop: 18 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Time to cancel</th><th className="n">Pcs</th><th className="n">Share</th>
                      <th className="n">Cumulative</th><th className="n">Before pickup</th>
                      <th className="n">After pickup</th><th className="n">% after</th>
                      <th className="n">Value lost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let run = 0
                      return pickup.moc.map((m) => {
                        const share = p1(m.tong, pickup.tong)
                        run += share
                        const sau = MOC_TT.indexOf(m.khoang) + 1 >= MOC_SAU_LAY
                        return (
                          <tr key={m.khoang} style={sau ? { background: 'rgba(193,18,31,0.05)' } : undefined}>
                            <td><span className="sw sm" style={{ background: MOC_MAU[m.khoang] }} />{m.khoang}</td>
                            <td className="n">{n0(m.tong)}</td>
                            <td className="n">{pct(share)}</td>
                            <td className="n muted">{pct(run)}</td>
                            <td className="n">{n0(m.truoc)}</td>
                            <td className="n">{n0(m.sau)}</td>
                            <td className="n" style={{ color: m.pctSau > 50 ? 'var(--bad)' : 'inherit' }}>{pct(m.pctSau)}</td>
                            <td className="n">{bn(m.nmv)} bn</td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>
              <div className="note hot">
                <b>Two clusters, two different problems.</b> The first hour is the order dying before
                anyone touches it — mis-taps, test orders, a payment that never went through. That is
                fixed in the order-confirmation flow, not in logistics. The second cluster sits in the
                delivery window: the parcel shipped and the buyer refused it at the door.
                <br /><br />
                <b>The boundary is sharp and it is at 48 hours.</b> Everything cancelled inside two
                days died before pickup; from the 2–3 day bucket onward, 94–99% died after it. That
                gives one operating rule — a cancellation inside 48h is a lost sale, past 48h it is
                an operations loss. 7.4 tracks that split over time.
              </div>
            </section>

            <section id="s7-5">
              <h2><span className="hno">7.5</span>Before or after the courier collected — {periodNote} · {dod}</h2>
              <p className="sub">
                The one split that decides what a cancellation actually costs. TikTok stamps a
                <code> collection_time</code> on the order the moment the courier takes the parcel,
                so this is recorded fact, not inferred from the clock. A cancellation
                <b> before</b> collection costs the sale and nothing else. A cancellation
                <b> after</b> collection costs outbound shipping, packing, the return leg and the
                restock — and the unit is out of sellable stock for the days it spends in transit.
              </p>
              <div className="tiles" style={{ marginTop: 20 }}>
                <Tile label="Cancelled after collection" value={pct(pickup.pctSau)}
                  tone={pickup.pctSau > 40 ? 'bad' : 'ok'}
                  sub={`${n0(pickup.sau)} of ${n0(pickup.tong)} cancelled pcs`} />
                <Tile label="Cancelled before collection" value={pct(100 - pickup.pctSau)}
                  sub={`${n0(pickup.truoc)} pcs — sale lost, nothing shipped`} />
                <Tile label="Time in the courier's hands"
                  value={pickup.gioTrongTayShipper == null ? '—' : n0(pickup.gioTrongTayShipper)}
                  unit="h" sub="collection to cancellation, average" />
                <Tile label="Value lost after collection"
                  value={bn(pickup.moc.filter((m) => MOC_TT.indexOf(m.khoang) + 1 >= MOC_SAU_LAY)
                    .reduce((a, m) => a + m.nmv, 0))}
                  unit=" bn" sub="NMV on parcels that had already shipped" />
              </div>

              <h3 style={{ marginTop: 30 }}>How the split moves, {periodWord} by {periodWord}</h3>
              <p className="sub">
                Twelve buckets at day resolution, each column normalised to 100% — so this reads as
                the <i>shape</i> of a {periodWord}&rsquo;s cancellations, not its volume. Warm bands
                are cancellations before pickup, cool bands after. Read it by order date: if orders
                placed on the 11th–13th are being cancelled on the 15th, the <b>3 - 4 days</b> and
                <b> 4 - 5 days</b> bands on those dates fatten — and because those bands sit past
                the 48-hour line, every one of those parcels had already shipped. The red line is
                the share of that {periodWord}&rsquo;s cancellations that happened after pickup.
              </p>
              <StackLine
                rows={pickup.theoKy.map((r) => ({ ky: r.ky, parts: r.parts }))}
                series={MOC_TT.map((k) => ({ ten: k, color: MOC_MAU[k] }))}
                lines={[{ ten: 'After pickup, % of cancellations', color: 'var(--bad)',
                  vals: pickup.theoKy.map((r) => r.pctSau) }]}
                fmtCot={(v) => `${Math.round(v)}%`}
                fmtDuong={(v) => `${Math.round(v)}%`}
                label={lbl}
                tip={(i) => {
                  const r = pickup.theoKy[i]
                  if (!r) return null
                  return (
                    <><b>{lbl(r.ky)}</b> · {n0(r.n)} cancelled pcs<br />
                      After pickup {pct(r.pctSau)} ({n0(r.sau)} pcs)<br />
                      <span className="muted">— mix —</span><br />
                      {MOC_TT.map((k, j) => (r.parts[j] > 0.5 ? (
                        <span key={k}><i className="sw" style={{ background: MOC_MAU[k] }} />
                          {k} {pct(Math.round(r.parts[j] * 10) / 10)} · {n0(r.soLuong[j])} pcs<br /></span>
                      ) : null))}
                    </>
                  )
                }}
              />
              <div className="note hot">
                <b>Why this matters more than the headline cancellation rate.</b> Half the
                cancellations on this account happen after the parcel has left — the average one
                spends about a week in the courier&rsquo;s hands before it dies. Those are the ones
                with a real cost attached, and they are almost all the same reason code (7.5:
                delivery failed). The other half never shipped, and while they still cost the sale,
                fixing them is a different job: firmer orders in the live room, a checkout that
                works, and a price the buyer will not immediately go looking to beat.
                <br /><br />
                <b>One caveat on the newest dates.</b> A cancellation that will land at day 5 has
                not happened yet on a date five days old, so the most recent columns are missing
                their cool bands and will look better than they end up. Read the last week of any
                range as provisional.
              </div>
            </section>

            <section id="s7-6">
              <h2><span className="hno">7.6</span>Why orders are cancelled — {periodNote} · {dod}</h2>
              <p className="sub">
                TikTok returns a reason and an initiator on every cancelled order, so this is the
                shop&rsquo;s own data, not an inference from timing. The wording arrives in
                Vietnamese, English and Chinese for the same reason, so it is folded into nine
                groups. Each column is one {periodWord}, normalised to 100% — the mix, not the
                volume. Volume per {periodWord} is already in 7.2.
              </p>
              <StackLine
                rows={lyDo.theoKy.map((r) => ({ ky: r.ky, parts: r.parts }))}
                series={lyDo.co.map((l) => ({ ten: l, color: LYDO_MAU[l] }))}
                lines={[]}
                fmtCot={(v) => `${Math.round(v)}%`}
                /* Không có đường nào nên trục phải để trống, nếu không nó in ra 1 và 0.5. */
                fmtDuong={() => ''}
                label={lbl}
                tip={(i) => {
                  const r = lyDo.theoKy[i]
                  if (!r) return null
                  return (
                    <><b>{lbl(r.ky)}</b> · {n0(r.n)} cancelled pcs<br />
                      {lyDo.co.map((l, j) => (r.parts[j] > 0.5 ? (
                        <span key={l}><i className="sw" style={{ background: LYDO_MAU[l] }} />
                          {l} {pct(Math.round(r.parts[j] * 10) / 10)}<br /></span>
                      ) : null))}
                    </>
                  )
                }}
              />
              <div className="tablewrap" style={{ marginTop: 18 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Reason</th><th>Who cancelled</th><th className="n">Pcs</th>
                      <th className="n">Share</th><th className="n">Avg lapse</th>
                      <th className="n">Value lost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lyDo.bang.map((r) => (
                      <tr key={r.ly_do}>
                        <td><span className="sw sm" style={{ background: LYDO_MAU[r.ly_do] }} />{r.ly_do}</td>
                        <td className="muted">{NGUOI_HUY[r.nguoi] ?? r.nguoi}</td>
                        <td className="n">{n0(r.sl)}</td>
                        <td className="n">{pct(r.pct)}</td>
                        <td className="n muted">{r.gioTb == null ? '—' : `${n0(r.gioTb)}h`}</td>
                        <td className="n">{bn(r.nmv)} bn</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="note hot">
                <b>The two clusters in 7.3 now have names.</b> The first-hour cluster is
                buyer-initiated — &ldquo;no longer needed&rdquo;, a payment that would not go
                through, a better price found elsewhere; average lapse 1–3 hours. The day 3–7
                cluster is almost entirely <b>Delivery failed</b>, cancelled by TikTok, average
                lapse around a week: the parcel went out and the buyer refused it at the door. Those
                are two different owners and two different fixes — the first belongs to the live
                room and the checkout flow, the second to logistics and to how firm the order was
                when it was taken.
              </div>
            </section>

            <section id="s7-7">
              <h2><span className="hno">7.7</span>Cancellations across the month — {periodNote}</h2>
              <p className="sub">
                Time runs left to right through the month, so the whole shape is visible rather than
                only the days that have names. The names sit under the axis:
                <b> DDAY</b> is the double date (4/4, 5/5 … 9/9), <b>D-3</b> to <b>D-1</b> the three
                days before it, <b>D+1</b> to <b>D+3</b> the three days after, <b>MMS</b> the
                14th–15th, <b>Payday</b> the 24th–25th, everything else BAU. Bars are the mix of
                time-to-cancel, each column normalised to 100%.
                <br /><br />
                <b>The red line is the warehouse load</b> — of every unit ordered that day, the
                share the courier collected and that was <i>then</i> cancelled. Those are the only
                cancellations carrying a real bill: outbound shipping, packing, the return leg, the
                restock, and the days the unit spends unsellable in transit. Everything else died
                before anything moved. It uses the same denominator as the plain cancellation rate
                in 7.2, so the gap between the two is the half of the problem logistics never
                touches. Each column&rsquo;s tooltip carries all three readings.
                <br /><br />
                {campNgay.theoNgayThat ? (
                  <> One column is one real date, so every label is exact.</>
                ) : (
                  <> The range is longer than {NGAY_TOI_DA} days, so columns are folded onto day
                    1–31 of the month. DDAY moves with the month — the 9th is DDAY in September but
                    an ordinary day in August — so a folded column whose months disagree is left
                    unlabelled and the tooltip says what it is mixing. <b>Pick a single month</b>
                    to get one column per date and every name in its right place.</>
                )}
              </p>
              <StackLine
                moiNhan={campNgay.rows.length <= 34}
                rows={campNgay.rows.map((r) => ({ ky: r.ky, parts: r.parts }))}
                series={MOC_TT.map((k) => ({ ten: k, color: MOC_MAU[k] }))}
                lines={[{ ten: 'Cancelled after pickup, % of units ordered that day',
                  color: 'var(--bad)', vals: campNgay.rows.map((r) => r.pctSauDat) }]}
                fmtCot={(v) => `${Math.round(v)}%`}
                fmtDuong={(v) => `${Math.round(v)}%`}
                label={(k) => campNgay.rows.find((r) => r.ky === k)?.nhanTruc ?? k}
                tip={(i) => {
                  const r = campNgay.rows[i]
                  if (!r) return null
                  return (
                    <><b>{r.nhanTruc}</b>{r.nhan && r.nhan !== 'BAU' ? ` · ${r.nhan}` : ''}
                      {campNgay.theoNgayThat ? '' : ` · ${r.soNgay} day${r.soNgay === 1 ? '' : 's'} in range`}<br />
                      <b style={{ color: 'var(--bad)' }}>After pickup {pct(r.pctSauDat)}</b>
                      {' '}— {n0(r.sauLay)} of {n0(r.item)} units ordered<br />
                      <span className="muted">= {pct(r.pctSau)} of this day&rsquo;s cancellations</span><br />
                      All cancellations {pct(r.rate)} — {n0(r.huy)} of {n0(r.item)} pcs<br />
                      Value lost {bn(r.nmvHuy)} bn<br />
                      {!r.nhan && r.nhanCoThe.length > 0 && (
                        <><span className="muted">Mixed across months: {r.nhanCoThe.join(', ')}</span><br /></>
                      )}
                      <span className="muted">— mix —</span><br />
                      {MOC_TT.map((k, j) => (r.parts[j] > 0.5 ? (
                        <span key={k}><i className="sw" style={{ background: MOC_MAU[k] }} />
                          {k} {pct(r.parts[j])} · {n0(r.soLuong[j])} pcs<br /></span>
                      ) : null))}
                    </>
                  )
                }}
              />
              {/* Hàng nhãn thứ hai: tên ngày campaign, canh đúng cột với biểu đồ trên.
                  Để trống khi các tháng đang lọc không thống nhất cho cột đó. */}
              <div className="dnhan">
                {campNgay.rows.map((r, i) => {
                  // MMS và Payday kéo dài hai ngày; in tên ở cả hai cột thì hai
                  // chữ dính vào nhau. Chỉ in ở cột đầu của mỗi chuỗi liên tiếp,
                  // màu chữ vẫn cho biết cột sau thuộc cùng một loại.
                  const truoc = campNgay.rows[i - 1]?.nhan
                  const hien = r.nhan && r.nhan !== 'BAU' && r.nhan !== truoc
                  return (
                    <div key={r.ky}>
                      {hien && (
                        <span style={{ color: NGAY_MAU[r.nhan as string] }}>
                          {(r.nhan as string).replace(' (14-15)', '').replace(' (24-25)', '')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <h3 style={{ marginTop: 30 }}>Rolled up by day type</h3>
              <p className="sub">
                The same days grouped into the named buckets, so the sale days can be compared
                against BAU on one line each.
              </p>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Campaign day</th><th className="n">Days</th>
                      <th className="n">Gross pcs</th><th className="n">Cancelled</th>
                      <th className="n">Cancel %</th><th className="n">vs BAU</th>
                      <th className="n">Within 24h</th><th className="n">Day 3+</th>
                      <th className="n">Value lost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {camp.rows.map((r) => {
                      const d = camp.bau ? Math.round((r.rate - camp.bau.rate) * 10) / 10 : null
                      return (
                        <tr key={r.loai}>
                          <td><span className="sw sm" style={{ background: NGAY_MAU[r.loai] }} />{r.loai}</td>
                          <td className="n muted">{r.soNgay}</td>
                          <td className="n">{n0(r.item)}</td>
                          <td className="n">{n0(r.huy)}</td>
                          <td className="n" style={{ color: r.rate > 70 ? 'var(--bad)' : 'inherit' }}>{pct(r.rate)}</td>
                          <td className="n muted">
                            {r.loai === 'BAU' || d == null ? '—' : `${d > 0 ? '+' : ''}${d} pp`}
                          </td>
                          <td className="n">{pct(r.nhanh)}</td>
                          <td className="n">{pct(r.cham)}</td>
                          <td className="n">{bn(r.nmvHuy)} bn</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="note">
                <b>How to read the two columns on the right.</b> &ldquo;Within 24h&rdquo; is the
                order-confirmation problem — the order dies before anyone touches it. &ldquo;Day
                3+&rdquo; is the delivery window — the parcel shipped and the buyer refused it, and
                that is the one where a competitor&rsquo;s price during the wait is a plausible
                cause. A day type whose cancellation rate is high <i>and</i> whose mix leans to Day
                3+ is losing buyers after they had time to shop around; one that leans to the first
                hour is losing them at checkout, which is a different fix.
              </div>
            </section>

            <section id="s7-8">
              <h2><span className="hno">7.8</span>Reason mix by campaign day — {periodNote}</h2>
              <p className="sub">
                The same day types as 7.6, but split by <i>why</i> rather than <i>when</i>. Each row
                is 100% of the cancellations on that day type, so the columns say which reason a
                given kind of day over-produces relative to the others.
              </p>
              <Matrix
                corner="Campaign day"
                cols={lyDo.co}
                heat="high-bad"
                fmt={(v) => `${v}%`}
                rows={lyDo.theoNgay.map((r) => ({
                  label: r.ky,
                  sub: `${n0(r.n)} cancelled`,
                  color: NGAY_MAU[r.ky],
                  vals: r.parts.map((v) => (v > 0 ? Math.round(v * 10) / 10 : null)),
                }))}
              />
              <div className="note">
                Read this against 7.6&rsquo;s rate line. A day type whose cancellation rate is high
                <i> and</i> whose reasons lean to <b>Delivery failed</b> is losing buyers after the
                parcel shipped — an operations cost. One that leans to <b>Found a better price</b> or
                <b> No longer needed</b> is losing them at checkout, before anything moved, which is
                a pricing and order-quality problem instead.
              </div>
            </section>

            <section id="s7-9">
              <h2><span className="hno">7.9</span>Order day vs cancel day — {periodNote}</h2>
              <p className="sub">
                Where orders placed on each day type actually die. Each row is 100% of the
                cancellations from orders <i>placed</i> on that day type, split by the day type they
                were <i>cancelled</i> on. This is the direct test of the &ldquo;they compare prices
                later and cancel&rdquo; story: if DDAY buyers wait for mid-month to cancel, the DDAY
                row leans towards MMS rather than staying on the diagonal.
              </p>
              <Matrix
                corner="Placed on ↓ / cancelled on →"
                cols={campMx.cot}
                heat="high-bad"
                fmt={(v) => `${v}%`}
                rows={campMx.hang.map((h) => ({
                  label: h,
                  sub: `${n0(campMx.hangTong.get(h) ?? 0)} cancelled`,
                  color: NGAY_MAU[h],
                  vals: campMx.cot.map((c) => {
                    const t = campMx.hangTong.get(h) ?? 0
                    if (!t) return null
                    const v = campMx.cell.get(`${h}|${c}`) ?? 0
                    return v ? p1(v, t) : null
                  }),
                }))}
              />
              <div className="note">
                Read the diagonal first — an order cancelled on the same day type it was placed
                never left the campaign, so nothing external explains it. What matters is the mass
                that sits <i>off</i> the diagonal to the right: those orders survived the campaign
                and died later. The BAU column is large by construction, because BAU covers most
                days of the month; compare the named sale columns against each other, not against
                BAU.
              </div>
            </section>

            <section id="s7-10">
              <h2><span className="hno">7.10</span>Cancellation rate by model, month by month</h2>
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

            <section id="s7-11">
              <h2><span className="hno">7.11</span>Every model, worst first — {periodNote}</h2>
              <p className="sub">
                All {skuF.length} models that sold anything in the range, ranked by cancellation
                rate. The ones under {HUY_MODEL_TOI_THIEU} gross units are marked <i>thin</i>, drawn
                paler and held at the bottom — at that volume the percentage swings on one or two
                orders, so ranking them against the rest would put noise at the top. Nothing is
                dropped: a model missing from a chart is a problem nobody looks for.
              </p>
              <RowBars
                rows={skuF.slice()
                  .sort((a, b) => {
                    const am = a.so_luong < HUY_MODEL_TOI_THIEU
                    const bm = b.so_luong < HUY_MODEL_TOI_THIEU
                    return am === bm ? b.cancel_rate - a.cancel_rate : (am ? 1 : -1)
                  })
                  .map((s) => {
                    const mong = s.so_luong < HUY_MODEL_TOI_THIEU
                    return {
                      nhan: mong ? `${s.model} · thin` : s.model,
                      segs: [{
                        v: s.cancel_rate,
                        color: mong ? 'var(--line-s)'
                          : s.cancel_rate > 70 ? 'var(--bad)' : 'var(--c2)',
                        ten: 'Cancellation rate (%)',
                      }],
                      phu: `${pct(s.cancel_rate)} · ${n0(s.so_luong)} gross`,
                    }
                  })}
              />
            </section>

            <section id="s7-12">
              <h2><span className="hno">7.12</span>Before vs after pickup, by model — {periodNote}</h2>
              <p className="sub">
                One split, two owners. <b>Before pickup</b> means the order died while the parcel was
                still in the warehouse — nothing moved, the loss is the sale. <b>After pickup</b>
                means the courier already had it — outbound shipping, packing, the return leg, the
                restock, and the days the unit is unsellable in transit. The two are exhaustive:
                they add up exactly to the cancellation rate, and both are shares of units ordered.
                Every model that sold anything in the range is listed — {modelHuy.soModel} of them.
                The {modelHuy.soMong} with fewer than {HUY_MODEL_TOI_THIEU} units are marked
                <i> thin</i>, dimmed and pushed to the bottom: at that volume a percentage swings on
                one or two orders. They are still in the table because leaving a model out entirely
                is how a problem stays invisible.
                <b> Days in transit</b> is how long a failed parcel sat outside the warehouse before
                the order was closed — median first, average after the slash — counted from pickup,
                not from the order. Red past 7 days. Like 7.2 it comes from a per-month figure the
                database computed, so it follows the month chips and the category toggle but not the
                7-day / 30-day ranges.
                <br /><br />
                <b>How long each one takes.</b> Before-pickup cancels are almost all immediate —
                median 6 minutes, 90% inside 24 hours. After-pickup cancels cannot happen before the
                courier comes, so the earliest in this data is 40 hours; the median is 6.7 days and
                90% land inside 12 days. That is why the boundary in 7.3 sits at 48 hours: under two
                days is effectively always before pickup, over two days effectively always after.
              </p>
              <div className="filters" style={{ marginTop: 16 }}>
                <div className="seg">
                  <button className={huySort === 'sau' ? 'on' : ''} onClick={() => setHuySort('sau')}>
                    Sort by after pickup
                  </button>
                  <button className={huySort === 'instant' ? 'on' : ''} onClick={() => setHuySort('instant')}>
                    Sort by before pickup
                  </button>
                </div>
              </div>
              <div className="tablewrap" style={{ marginTop: 14 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Model</th><th className="n">Units ordered</th>
                      <th className="n">Before pickup</th>
                      <th className="n">After pickup</th>
                      <th className="n">Cancelled</th>
                      <th className="n">Days in transit</th>
                      <th className="n">Value lost after pickup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelHuy.rows.map((r) => (
                      <tr key={r.model} style={r.mong ? { opacity: 0.55 } : undefined}>
                        <td>
                          <span className="sw sm" style={{ background: r.cat === 'robot' ? 'var(--c1)' : 'var(--c2)' }} />
                          {r.model}
                          {r.mong && <span className="muted" style={{ fontSize: 11 }}> · thin</span>}
                        </td>
                        <td className="n muted">{n0(r.dat)}</td>
                        <td className="n" style={{ color: r.pctTruoc > modelHuy.tb.truoc ? 'var(--bad)' : 'inherit' }}>
                          {pct(r.pctTruoc)}
                        </td>
                        <td className="n" style={{ color: r.pctSau > modelHuy.tb.sau ? 'var(--bad)' : 'inherit' }}>
                          {pct(r.pctSau)}
                        </td>
                        <td className="n muted">{pct(r.pctHuy)}</td>
                        <td className="n" style={{ color: (transitTheoModel.get(r.model)?.tv ?? 0) > 168 ? 'var(--bad)' : 'inherit' }}>
                          {(() => {
                            const t = transitTheoModel.get(r.model)
                            if (!t?.tv) return <span className="muted">—</span>
                            return <>{Math.round((t.tv / 24) * 10) / 10}
                              <span className="muted" style={{ fontSize: 11 }}> / {Math.round(((t.tb ?? 0) / 24) * 10) / 10}</span></>
                          })()}
                        </td>
                        <td className="n">{bn(r.nmvSau)} bn</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 600 }}>
                      <td>All {modelHuy.soModel} models</td>
                      <td className="n muted">{n0(modelHuy.tong.dat)}</td>
                      <td className="n">{pct(modelHuy.tb.truoc)}</td>
                      <td className="n">{pct(modelHuy.tb.sau)}</td>
                      <td className="n muted">{pct(p1(modelHuy.tong.huy, modelHuy.tong.dat))}</td>
                      <td className="n muted">—</td>
                      <td className="n">{bn(modelHuy.tong.nmvSau)} bn</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="note">
                Red means above the average, which is taken over the non-thin models only. Red on the <b>left</b> and not the
                right means the model is being sold badly — the buyer backs out within minutes, which
                points at how it is pitched in the room, the price on screen, or a checkout that
                fails. Red on the <b>right</b> and not the left is the opposite: the order was firm
                enough to ship, and the box still came back — delivery, packaging, or an expectation
                set at the point of sale that the product did not meet. Different owners, and a model
                can be red on both.
              </div>
            </section>

            <section id="s7-13">
              <h2><span className="hno">7.13</span>Cancellation detail by model — {periodNote}</h2>
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

        {/* ======================== P&L ======================== */}
        {sec === 'P&L' && (
          <>
            <section id="s8-1">
              <h2><span className="hno">8.1</span>From list price to cash — {periodNote}</h2>
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

            <section id="s8-2">
              <h2><span className="hno">8.2</span>Seller NMV and what erodes it, by month</h2>
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

            <section id="s8-3">
              <h2><span className="hno">8.3</span>P&amp;L by month</h2>
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

        {/* ===================== GLOSSARY ===================== */}
        {sec === 'Glossary' && (
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
            <b>Not in this dashboard yet:</b> Livestream and Product Funnel. Each needs a new sync
            adapter — that data is not in the database.
          </div>
        </main>
      </div>
      </div>
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

/** Chênh lệch giữa hai tỷ lệ phải đọc bằng điểm phần trăm, không phải phần trăm.
 *  Huỷ đơn từ 80,1% xuống 48,2% là giảm 31,9 điểm — viết "giảm 39,8%" là gây hiểu nhầm. */
function ppText(a?: number, b?: number) {
  if (a == null || b == null) return undefined
  const d = Math.round((a - b) * 10) / 10
  const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '·'
  return `${arrow} ${Math.abs(d)} pp vs previous month`
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
.stick .foot{margin:7px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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

/* ---- dải lọc dính ----
   Cuộn tới phần 7.9 mà muốn đổi tháng thì không phải cuộn ngược lên đầu nữa.
   Chiều cao dải nằm ở biến --stick, do JS đo và gắn vào .wrap; .side và
   scroll-margin của các neo đều lấy theo nó nên luôn khớp. */
.wrap{--stick:112px}  /* dự phòng; JS đo lại ngay khi mount */
.stick{position:sticky;top:0;z-index:30;margin:26px -20px 0;padding:12px 20px 10px;
  background:var(--ground);border-bottom:1px solid var(--line)}
/* Đổ bóng nhẹ để biết nội dung đang chạy BÊN DƯỚI dải, không phải dính vào nó. */
.stick::after{content:"";position:absolute;left:0;right:0;top:100%;height:10px;
  background:linear-gradient(rgba(0,0,0,.05),transparent);pointer-events:none}
.filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:0}
.seg{display:inline-flex;background:var(--surface-2);border:1px solid var(--line);border-radius:5px;padding:2px}
.seg button{font:inherit;font-size:13.5px;padding:6px 13px;border:0;background:transparent;
  color:var(--ink-2);border-radius:4px;cursor:pointer;white-space:nowrap}
.seg button.on{background:var(--surface);color:var(--ink);font-weight:500;
  box-shadow:0 1px 2px rgba(0,0,0,.08)}
.seg button:focus-visible{outline:2px solid var(--c1);outline-offset:1px}
.chips{display:flex;gap:6px;flex-wrap:nowrap;align-items:center;margin-top:10px;
  overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
.chips::-webkit-scrollbar{display:none}
.chip{flex:none}
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

/* ---- bố cục hai cột: điều hướng trái, nội dung phải ----
   Thanh trái dính khi cuộn để lúc nào cũng biết mình đang ở phần nào.
   Dưới 1100px nó nằm ngang thành dải tab như bản cũ. */
.body{display:grid;grid-template-columns:232px minmax(0,1fr);gap:28px;margin-top:22px;
  align-items:start}
.main{min-width:0}

.side{position:sticky;top:calc(var(--stick) + 14px);display:flex;flex-direction:column;gap:2px;
  border-right:1px solid var(--line);padding-right:14px}
.side-gn{font-size:10.5px;color:var(--muted);padding:0 0 4px 14px;line-height:1.35;
  max-width:190px}
.side-g{display:flex;flex-direction:column}
.side-s{display:flex;align-items:baseline;gap:8px;width:100%;text-align:left;font:inherit;
  font-size:14px;padding:7px 9px;border:0;border-radius:6px;background:transparent;
  color:var(--ink-2);cursor:pointer}
.side-s:hover{background:var(--surface-2);color:var(--ink)}
.side-g.on>.side-s{background:var(--surface-2);color:var(--ink);font-weight:600}
.side-n{display:inline-block;min-width:14px;font-variant-numeric:tabular-nums;
  font-size:12px;color:var(--muted)}
.side-g.on>.side-s .side-n{color:var(--c1)}
.side-subs{margin:2px 0 10px;padding:0 0 0 9px}
.side-grp+.side-grp{margin-top:7px}
.side-gl{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--line-s);
  padding:3px 8px 2px}
.side-subs a{display:flex;gap:7px;padding:4px 8px;border-radius:5px;font-size:12.5px;
  line-height:1.35;color:var(--muted);text-decoration:none}
.side-subs a:hover{background:var(--surface-2);color:var(--ink-2)}
.side-n2{font-variant-numeric:tabular-nums;color:var(--line-s);flex:none;min-width:22px}

/* Số hiệu trước tiêu đề khối, để gọi "mở 4.4" trong họp là ai cũng tới đúng chỗ. */
.hno{font-variant-numeric:tabular-nums;font-size:.72em;font-weight:600;color:var(--muted);
  margin-right:9px;letter-spacing:.02em}

/* Nhảy tới neo mà không bị tiêu đề dính che mất. */
.wrap section[id],.wrap div[id^="s"]{scroll-margin-top:calc(var(--stick) + 16px)}

@media (max-width:1100px){
  .body{grid-template-columns:1fr;gap:0}
  .stick{margin-left:-14px;margin-right:-14px;padding-left:14px;padding-right:14px}
  .side{position:static;flex-direction:row;flex-wrap:wrap;border-right:0;padding-right:0;
    border-bottom:1px solid var(--line);margin-bottom:18px}
  .side-g{flex-direction:row;align-items:center}
  .side-subs{display:none}
}

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
/* ---- hành trình đơn hàng (Timeline) ---- */
.tl{margin-top:18px;position:relative}
.tl-grid{position:relative;height:16px;margin-left:190px}
.tl-gl:first-child b{transform:translateX(50%);display:inline-block}
.tl-gl{position:absolute;top:0;transform:translateX(-50%);text-align:center}
.tl-gl i{position:absolute;left:50%;top:14px;width:1px;height:calc(16px + var(--tlh,150px));
  background:var(--line)}
.tl-gl b{font-size:10px;font-weight:500;color:var(--muted);font-variant-numeric:tabular-nums}
.tl-row{display:flex;align-items:center;gap:0;margin-top:20px}
.tl-lbl{width:190px;flex:none;padding-right:22px;line-height:1.35}
.tl-lbl b{display:block;font-size:13.5px}
.tl-lbl span{display:block;font-size:11.5px}
/* Chiều cao 48px = 16 cho nhãn trên, 16 cho thanh, 16 cho nhãn dưới. Nhãn
   nằm trong phạm vi này nên hàng nọ không chạm hàng kia. */
.tl-track{position:relative;flex:1;height:48px}
.tl-seg{position:absolute;top:18px;height:12px;border-radius:2px}
.tl-seg.kho{background:var(--line-s)}
.tl-dot{position:absolute;top:20px;width:8px;height:8px;margin-left:-4px;border-radius:50%;
  background:var(--surface);border:2px solid var(--ink-2);box-sizing:border-box;z-index:2}
.tl-end{position:absolute;top:14px;width:3px;height:20px;margin-left:-1px;border-radius:2px}
.tl-avg{position:absolute;top:19px;width:10px;height:10px;margin-left:-5px;
  border:1.5px solid;transform:rotate(45deg);background:var(--surface)}
.tl-avg.st{position:static;display:inline-block;margin:0 5px 0 0;border-color:var(--muted);
  transform:rotate(45deg);width:9px;height:9px}
.tl-t{position:absolute;top:0;transform:translateX(-50%);font-size:10.5px;font-weight:600;
  white-space:nowrap;color:var(--ink-2);font-variant-numeric:tabular-nums;line-height:14px}
.tl-t.sm{top:auto;bottom:0;font-weight:500;color:var(--muted);font-size:10px}
@media (max-width:760px){
  .tl-grid{margin-left:0}
  .tl-row{flex-direction:column;align-items:stretch;gap:2px}
  .tl-lbl{width:auto;padding:0}
}
.wrap table{border-collapse:collapse;width:100%;min-width:680px;background:var(--surface);font-size:13px}
.wrap th,.wrap td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.wrap thead th{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);
  font-weight:500;background:var(--surface-2)}
.wrap thead th.srt{cursor:pointer;user-select:none}
.wrap thead th.srt:hover{color:var(--ink)}
.wrap thead th[data-on="1"]{color:var(--c1)}
.car{font-size:9px}
.wrap tbody tr:last-child td{border-bottom:0}
.wrap .uhint{font-weight:400;font-size:.8em;color:var(--muted)}
.wrap table.mini{font-size:12.5px}
.wrap table.mini td,.wrap table.mini th{padding-top:6px;padding-bottom:6px}
.wrap .lh{margin-top:14px}
.wrap .lh-plot{position:relative;height:270px;padding:0 46px;
  border-bottom:1px solid var(--line-s);
  background:linear-gradient(var(--line),var(--line)) 0 50%/100% 1px no-repeat}
.wrap .lh-cols,.wrap .lh-x{display:flex;gap:1px;height:100%;padding:0 46px;
  position:absolute;inset:0}
.wrap .lh-cols{align-items:flex-end}
.wrap .lh-col{flex:1;min-width:0;height:100%;display:flex;align-items:flex-end;justify-content:center}
.wrap .lh-stack{width:100%;display:flex;flex-direction:column-reverse;border-radius:2px 2px 0 0;
  overflow:hidden;min-height:1px}
.wrap .lh-line{position:absolute;inset:0 46px;width:calc(100% - 92px);height:100%;
  pointer-events:none;overflow:visible}
.wrap .lh-l,.wrap .lh-r{position:absolute;font-size:10.5px;color:var(--muted);
  font-variant-numeric:tabular-nums}
.wrap .lh-l{left:4px}
.wrap .lh-r{right:4px;color:var(--bad)}
.wrap .lh-t{top:-2px}
.wrap .lh-m{top:calc(50% - 7px)}
.wrap .lh-ads{position:relative;height:52px;margin-top:6px;padding:0 46px;
  display:flex;gap:1px;align-items:flex-end;border-bottom:1px solid var(--line-s)}
.wrap .lh-abar{width:100%;background:var(--c2);border-radius:2px 2px 0 0;min-height:1px}
.wrap .lh-x{position:static;display:flex;gap:1px;padding:5px 46px 0;height:auto}
.wrap .lh-x .lh-col{height:auto;font-size:10.5px;color:var(--muted);white-space:nowrap;
  font-variant-numeric:tabular-nums;align-items:center}
.wrap .sl{margin-top:14px}
.wrap .sl-plot{position:relative;height:300px;padding:0 56px;
  border-left:1px solid var(--line-s);border-bottom:1px solid var(--line-s);
  background:linear-gradient(var(--line),var(--line)) 0 50%/100% 1px no-repeat}
.wrap .sl-cols{position:absolute;inset:0;padding:0 56px;display:flex;gap:2px;align-items:flex-end}
.wrap .sl-col{flex:1;min-width:0;height:100%;display:flex;align-items:flex-end}
.wrap .sl-stack{width:100%;display:flex;flex-direction:column-reverse;overflow:hidden;
  border-radius:2px 2px 0 0;min-height:1px}
.wrap .sl-line,.wrap .sl-dots{position:absolute;inset:0 56px;width:calc(100% - 112px);height:100%;
  pointer-events:none;overflow:visible}
.wrap .sl-v.sm{font-size:8.5px;letter-spacing:-.3px}
.wrap .sl-v{position:absolute;transform:translateX(-50%);font-size:10.5px;font-weight:600;
  font-variant-numeric:tabular-nums;white-space:nowrap;background:var(--surface);
  border-radius:3px;padding:0 3px;line-height:1.35;pointer-events:none}
.wrap .sl-d{position:absolute;width:8px;height:8px;margin:0 0 -4px -4px;border-radius:50%;
  background:var(--bad)}
.wrap .sl-l,.wrap .sl-r{position:absolute;font-size:10.5px;color:var(--muted);
  font-variant-numeric:tabular-nums}
.wrap .sl-l{left:5px}
.wrap .sl-r{right:5px;color:var(--bad)}
.wrap .sl-t{top:-2px}
.wrap .sl-m{top:calc(50% - 7px)}
.wrap .sl-x{display:flex;gap:2px;padding:5px 56px 0}
.wrap .sl-x>div{flex:1;text-align:center;font-size:10.5px;color:var(--muted);
  font-variant-numeric:tabular-nums}
/* Hàng nhãn thứ hai dưới trục ngang của StackLine (tên ngày campaign).
   Padding và gap phải trùng .sl-x, nếu không nhãn lệch cột. */
.wrap .dnhan{display:flex;gap:2px;padding:2px 56px 0}
.wrap .dnhan>div{flex:1;min-width:0;text-align:left;font-size:9px;
  font-weight:600;letter-spacing:-.2px;white-space:nowrap;overflow:visible;position:relative}
.wrap .cur{margin-top:14px}
.wrap .cur-plot{position:relative;height:300px;padding:0 52px;
  border-left:1px solid var(--line-s);border-bottom:1px solid var(--line-s);
  background:linear-gradient(var(--line),var(--line)) 0 50%/100% 1px no-repeat}
.wrap .cur-svg{position:absolute;inset:0 52px;width:calc(100% - 104px);height:100%;overflow:visible}
.wrap .cur-dots{position:absolute;inset:0 52px;width:calc(100% - 104px);height:100%;
  pointer-events:none}
.wrap .cur-d{position:absolute;width:8px;height:8px;margin:0 0 -4px -4px;border-radius:50%;
  border:2px solid}
.wrap .cur-hit{position:absolute;inset:0 52px;width:calc(100% - 104px);height:100%;display:flex}
.wrap .cur-hit>div{flex:1}
.wrap .cur-l{position:absolute;left:5px;font-size:10.5px;color:var(--muted);
  font-variant-numeric:tabular-nums}
.wrap .cur-t{top:-2px}
.wrap .cur-m{top:calc(50% - 7px)}
.wrap .cur-x{display:flex;padding:5px 52px 0}
.wrap .cur-x>div{flex:1;text-align:center;font-size:10.5px;color:var(--muted);
  font-variant-numeric:tabular-nums}
.wrap .cur-xl{text-align:center;font-size:11px;color:var(--muted);padding-top:4px;
  letter-spacing:.04em}
.wrap .bub{display:flex;gap:8px;margin-top:16px}
.wrap .bub-yl{writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;
  color:var(--muted);text-align:center;padding:6px 0;letter-spacing:.04em}
.wrap .bub-main{flex:1;min-width:0}
.wrap .bub-plot{position:relative;height:340px;border-left:1px solid var(--line-s);
  border-bottom:1px solid var(--line-s);
  background:linear-gradient(var(--line),var(--line)) 0 50%/100% 1px no-repeat}
.wrap .bub-gt,.wrap .bub-gm{position:absolute;left:4px;font-size:10.5px;color:var(--muted);
  font-variant-numeric:tabular-nums}
.wrap .bub-gt{top:-1px}
.wrap .bub-gm{top:calc(50% - 7px)}
.wrap .bub-d{position:absolute;border-radius:50%;opacity:.5;cursor:default;
  border:1px solid rgba(255,255,255,.55)}
.wrap .bub-d:hover{opacity:.9}
.wrap .bub-d.over{border:2px dashed var(--ink-2);opacity:.75}
.wrap .bub-xa{display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);
  padding-top:4px;font-variant-numeric:tabular-nums}
.wrap .bub-xl{text-align:center;font-size:11px;color:var(--muted);padding-top:2px;
  letter-spacing:.04em}
.wrap .cmp{display:grid;gap:12px;margin-top:18px;
  grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.wrap .cmp-card{border:1px solid var(--line);border-radius:10px;padding:11px 13px 12px}
.wrap .cmp-t{font-size:12.5px;font-weight:600;margin-bottom:9px;display:flex;
  justify-content:space-between;align-items:baseline;gap:8px}
.wrap .cmp-u{font-weight:400;font-size:.82em;color:var(--muted);white-space:nowrap}
.wrap .cmp-row{display:flex;align-items:center;gap:7px;margin-bottom:5px}
.wrap .cmp-l{flex:0 0 78px;font-size:11px;color:var(--muted);overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.wrap .cmp-track{flex:1;height:14px;background:var(--line);border-radius:3px;overflow:hidden}
.wrap .cmp-bar{height:100%;border-radius:3px}
.wrap .cmp-v{flex:0 0 auto;font-size:11.5px;font-weight:600;
  font-variant-numeric:tabular-nums;white-space:nowrap;min-width:46px;text-align:right}
.wrap .cmp-n{font-size:11px;color:var(--muted);margin-top:7px;line-height:1.4}
.wrap .funnels{display:flex;gap:14px;flex-wrap:wrap;margin-top:18px}
.wrap .fn-card{flex:1 1 240px;min-width:240px;border:1px solid var(--line);border-radius:10px;padding:12px 14px 14px}
.wrap .fn-head{font-weight:600;font-size:.95em;padding-bottom:8px;margin-bottom:10px;border-bottom:2px solid}
.wrap .fn-row{margin-bottom:9px}
.wrap .fn-lab{font-size:.78em;color:var(--muted);margin-bottom:3px}
.wrap .fn-track{display:flex;align-items:center;gap:8px}
.wrap .fn-bar{height:22px;border-radius:4px;display:flex;align-items:center;justify-content:flex-end;
  padding-right:7px;box-sizing:border-box;min-width:46px}
.wrap .fn-v{font-size:.76em;font-weight:600;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap}
.wrap .fn-conv{font-size:.76em;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.wrap tr.tot td{border-top:1px solid var(--line);background:var(--surface-2,rgba(0,0,0,.03));font-weight:600}
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
