import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ADS } from '@/lib/ads/config'
import { adsGet, adsToken } from '@/lib/ads/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Đọc thông tin 13 ad account đã được uỷ quyền và lưu vào bảng ads_accounts,
 * để biết cái nào là Roborock VN mà không phải mở từng cái trong Ads Manager.
 */
export async function GET() {
  try {
    const { token, advertiserIds } = await adsToken()
    if (!advertiserIds.length) {
      return NextResponse.json({ error: 'Không có advertiser_id nào được lưu' }, { status: 400 })
    }

    const db = supabaseAdmin()
    const out: Record<string, unknown>[] = []

    // API nhận tối đa vài chục id một lần; chia mẻ 10 cho chắc.
    for (let i = 0; i < advertiserIds.length; i += 10) {
      const batch = advertiserIds.slice(i, i + 10)
      const body = await adsGet(ADS.PATHS.advertiserInfo, token, { advertiser_ids: batch })
      if (body.code !== 0) {
        await db.from('ads_debug').insert({ note: 'advertiser/info lỗi', payload: body })
        return NextResponse.json({ error: body.message, code: body.code }, { status: 400 })
      }
      const list = (body.data?.list ?? []) as Record<string, unknown>[]
      out.push(...list)
    }

    await db.from('ads_accounts').upsert(
      out.map((a) => ({
        advertiser_id: String(a.advertiser_id),
        name: (a.name ?? a.advertiser_name ?? null) as string | null,
        currency: (a.currency ?? null) as string | null,
        timezone: (a.timezone ?? a.display_timezone ?? null) as string | null,
        status: (a.status ?? null) as string | null,
        role: (a.role ?? null) as string | null,
        raw: a,
        synced_at: new Date().toISOString(),
      })),
      { onConflict: 'advertiser_id' },
    )

    return NextResponse.json({
      ok: true,
      count: out.length,
      accounts: out.map((a) => ({ id: a.advertiser_id, name: a.name, currency: a.currency })),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
