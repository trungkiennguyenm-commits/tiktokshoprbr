import { NextResponse } from 'next/server'
import { refreshToken } from '@/lib/tts/auth'
import { encrypt, decrypt } from '@/lib/crypto'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Gia hạn mọi token sắp hết hạn trong 24h tới.
 * Access token sống 7 ngày nên chạy mỗi ngày một lần là thừa an toàn —
 * hợp cả với giới hạn cron của gói Vercel Hobby.
 *
 * Chạy lại nhiều lần liên tiếp không hỏng gì.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 401 })
  }

  const db = supabaseAdmin()
  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: connections, error } = await db
    .from('connections')
    .select('id, shop_id, provider, refresh_token_enc, access_expires_at')
    .eq('status', 'active')
    .eq('provider', 'tts_shop')
    .lt('access_expires_at', cutoff)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Array<{ shop_id: string; ok: boolean; detail: string }> = []

  for (const conn of connections ?? []) {
    try {
      if (!conn.refresh_token_enc) throw new Error('Không có refresh token đã lưu')

      const fresh = await refreshToken(decrypt(conn.refresh_token_enc))

      // Lưu ý: refresh xoay vòng CẢ HAI token, phải ghi đè cả hai.
      const { error: upErr } = await db
        .from('connections')
        .update({
          access_token_enc: encrypt(fresh.accessToken),
          refresh_token_enc: encrypt(fresh.refreshToken),
          access_expires_at: fresh.accessExpiresAt.toISOString(),
          refresh_expires_at: fresh.refreshExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conn.id)

      if (upErr) throw new Error(upErr.message)

      results.push({
        shop_id: conn.shop_id,
        ok: true,
        detail: `Gia hạn tới ${fresh.accessExpiresAt.toISOString()}`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      await db
        .from('connections')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', conn.id)

      results.push({ shop_id: conn.shop_id, ok: false, detail: message })
    }
  }

  return NextResponse.json({
    checked: connections?.length ?? 0,
    results,
  })
}
