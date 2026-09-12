import { supabaseAdmin } from '@/lib/supabase'
import { decrypt, encrypt } from '@/lib/crypto'
import { refreshToken } from './auth'

export type ShopContext = {
  shopId: string
  shopName: string
  ttsShopId: string
  shopCipher: string
  accessToken: string
}

/**
 * Lấy shop kèm access token còn sống.
 * Nếu token sắp hết hạn trong 1 giờ tới thì tự gia hạn và lưu lại ngay,
 * nên mọi hàm sync chỉ cần gọi hàm này rồi dùng, không phải lo token.
 */
export async function getShopContext(shopId?: string): Promise<ShopContext> {
  const db = supabaseAdmin()

  let query = db
    .from('shops')
    .select(
      'id, name, tts_shop_id, tts_shop_cipher, connections!inner(id, provider, status, access_token_enc, refresh_token_enc, access_expires_at)',
    )
    .eq('connections.provider', 'tts_shop')
    .eq('connections.status', 'active')
    .limit(1)

  if (shopId) query = query.eq('id', shopId)

  const { data, error } = await query.single()
  if (error || !data) {
    throw new Error(
      'Chưa có shop nào được kết nối. Bấm link authorize trong Partner Center trước.',
    )
  }

  const conn = Array.isArray(data.connections) ? data.connections[0] : data.connections
  if (!conn) throw new Error('Shop chưa có kết nối tts_shop đang hoạt động')

  let accessToken = decrypt(conn.access_token_enc)

  const expiresAt = conn.access_expires_at ? new Date(conn.access_expires_at).getTime() : 0
  const oneHour = 60 * 60 * 1000

  if (expiresAt - Date.now() < oneHour) {
    if (!conn.refresh_token_enc) throw new Error('Token sắp hết hạn mà không có refresh token')

    // Lưu ý: refresh xoay vòng CẢ HAI token, phải ghi đè cả hai.
    const fresh = await refreshToken(decrypt(conn.refresh_token_enc))
    accessToken = fresh.accessToken

    await db
      .from('connections')
      .update({
        access_token_enc: encrypt(fresh.accessToken),
        refresh_token_enc: encrypt(fresh.refreshToken),
        access_expires_at: fresh.accessExpiresAt.toISOString(),
        refresh_expires_at: fresh.refreshExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conn.id)
  }

  if (!data.tts_shop_cipher) {
    throw new Error('Shop chưa có shop_cipher — authorize lại để lấy')
  }

  return {
    shopId: data.id,
    shopName: data.name,
    ttsShopId: data.tts_shop_id,
    shopCipher: data.tts_shop_cipher,
    accessToken,
  }
}
