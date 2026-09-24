import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { encrypt } from '@/lib/crypto'
import { ADS, adsAppId, adsAppSecret } from '@/lib/ads/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Nơi TikTok trả người dùng về sau khi bấm đồng ý uỷ quyền ad account.
 *
 * auth_code chỉ sống vài phút, nên phải đổi ngay tại đây thay vì copy tay.
 * Token của advertiser không hết hạn — không có refresh token để lưu.
 *
 * Mỗi advertiser_id lưu thành một dòng trong bảng connections với
 * provider = 'tiktok_ads', dùng lại đúng bảng mà TikTok Shop đang dùng.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('auth_code') ?? url.searchParams.get('code')
  if (!code) {
    return NextResponse.json(
      { error: 'Thiếu auth_code trên URL. Bấm lại link uỷ quyền trong TikTok for Business.' },
      { status: 400 },
    )
  }

  try {
    const res = await fetch(ADS.BASE + ADS.PATHS.accessToken, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        app_id: adsAppId(),
        secret: adsAppSecret(),
        auth_code: code,
        grant_type: 'auth_code',
      }),
    })

    const body = await res.json()
    // TikTok luôn trả HTTP 200, lỗi nằm ở body.code (0 là thành công).
    if (body?.code !== 0) {
      return NextResponse.json(
        { error: 'TikTok từ chối auth_code', code: body?.code, message: body?.message },
        { status: 400 },
      )
    }

    const token: string = body.data?.access_token
    const advertiserIds: string[] = body.data?.advertiser_ids ?? []
    const scope = Array.isArray(body.data?.scope) ? body.data.scope.join(',') : null
    if (!token) {
      return NextResponse.json({ error: 'Không thấy access_token trong phản hồi' }, { status: 502 })
    }

    const db = supabaseAdmin()
    const { data: shop } = await db.from('shops').select('id, name').limit(1).single()
    if (!shop) {
      return NextResponse.json({ error: 'Chưa có shop nào trong bảng shops' }, { status: 400 })
    }

    // Không có advertiser_ids thì vẫn lưu một dòng để không mất token.
    const rows = (advertiserIds.length ? advertiserIds : [null]).map((adv) => ({
      shop_id: shop.id,
      provider: 'tiktok_ads',
      external_account_id: adv,
      access_token_enc: encrypt(token),
      refresh_token_enc: null,
      access_expires_at: null,
      refresh_expires_at: null,
      scope,
      status: 'active',
      updated_at: new Date().toISOString(),
    }))

    // Uỷ quyền lại thì ghi đè dòng cũ của cùng advertiser thay vì nhân bản.
    await db
      .from('connections')
      .delete()
      .eq('shop_id', shop.id)
      .eq('provider', 'tiktok_ads')

    const { error } = await db.from('connections').insert(rows)
    if (error) {
      return NextResponse.json({ error: `Lưu token thất bại: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      shop: shop.name,
      advertiserIds,
      scope,
      hint: 'Đã lưu token quảng cáo. Quay lại chat báo cho Claude để dựng phần đồng bộ.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
