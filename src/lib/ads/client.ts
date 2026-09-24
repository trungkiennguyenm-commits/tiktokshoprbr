import { supabaseAdmin } from '@/lib/supabase'
import { decrypt } from '@/lib/crypto'
import { ADS } from './config'

/** Token quảng cáo đã lưu. Token advertiser không hết hạn nên không refresh. */
export async function adsToken(): Promise<{ token: string; advertiserIds: string[] }> {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('connections')
    .select('access_token_enc, external_account_id')
    .eq('provider', 'tts_ads')
    .eq('status', 'active')
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error('Chưa uỷ quyền TikTok Ads. Mở lại link authorize trước.')
  }
  return {
    token: decrypt(data.access_token_enc),
    advertiserIds: (data.external_account_id ?? '').split(',').filter(Boolean),
  }
}

/** GET tới Marketing API. Tham số phức (mảng, object) phải JSON hoá rồi mới encode. */
export async function adsGet(
  path: string,
  token: string,
  params: Record<string, unknown>,
): Promise<{ code: number; message?: string; data?: Record<string, unknown> }> {
  const url = new URL(ADS.BASE + path)
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue
    url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  const res = await fetch(url.toString(), {
    headers: { 'Access-Token': token },
    cache: 'no-store',
  })
  return res.json()
}
