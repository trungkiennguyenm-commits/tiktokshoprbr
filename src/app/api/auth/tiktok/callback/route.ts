import { NextResponse } from 'next/server'
import { exchangeAuthCode, getAuthorizedShops } from '@/lib/tts/auth'
import { encrypt } from '@/lib/crypto'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Nơi TikTok đá người dùng về sau khi chủ shop bấm đồng ý.
 * URL này phải khớp chính xác với Redirect URL khai trong Partner Center —
 * và nhớ bấm Publish changes sau khi đổi.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error || !code || code === 'null') {
    return html('Chưa cấp quyền', `Chủ shop đã từ chối hoặc huỷ giữa chừng (${error ?? 'không có code'}). Bấm lại link authorize để thử lại.`)
  }

  try {
    // auth_code sống 30 phút, dùng một lần — đổi ngay.
    const token = await exchangeAuthCode(code)
    const shops = await getAuthorizedShops(token.accessToken)

    if (shops.length === 0) {
      return html('Không thấy shop nào', 'Token lấy được nhưng tài khoản này chưa uỷ quyền shop nào cho app.')
    }

    const db = supabaseAdmin()
    const saved: string[] = []

    for (const shop of shops) {
      const { data: shopRow, error: shopErr } = await db
        .from('shops')
        .upsert(
          {
            name: shop.name,
            tts_shop_id: shop.id,
            tts_shop_cipher: shop.cipher,
            region: shop.region,
          },
          { onConflict: 'tts_shop_id' },
        )
        .select('id')
        .single()

      if (shopErr) throw new Error(`Lưu shop thất bại: ${shopErr.message}`)

      const { error: connErr } = await db.from('connections').upsert(
        {
          shop_id: shopRow.id,
          provider: 'tts_shop',
          external_account_id: token.openId,
          access_token_enc: encrypt(token.accessToken),
          refresh_token_enc: encrypt(token.refreshToken),
          access_expires_at: token.accessExpiresAt.toISOString(),
          refresh_expires_at: token.refreshExpiresAt.toISOString(),
          scope: token.grantedScopes.join(' '),
          status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'shop_id,provider' },
      )

      if (connErr) throw new Error(`Lưu kết nối thất bại: ${connErr.message}`)
      saved.push(shop.name)
    }

    return html(
      'Kết nối thành công',
      `Đã lưu ${saved.length} shop: ${saved.join(', ')}.<br><br>
       Quyền đã cấp: ${token.grantedScopes.join(', ') || '(không có)'}<br>
       Access token hết hạn: ${token.accessExpiresAt.toLocaleString('vi-VN')}<br><br>
       Từ giờ hệ thống tự gia hạn, không cần bấm gì nữa.`,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return html('Có lỗi', message)
  }
}

function html(title: string, body: string) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${title}</title>
     <style>
       body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:0 auto;
            padding:48px 20px;color:#17151A;background:#FBFAFA}
       h1{font-size:22px;margin:0 0 12px}
       p{color:#4A444C}
     </style>
     <h1>${title}</h1><p>${body}</p>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}
