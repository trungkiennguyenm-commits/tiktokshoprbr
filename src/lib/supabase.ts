import { createClient } from '@supabase/supabase-js'

/**
 * Client dùng ở phía server, đi bằng service role key nên bỏ qua RLS.
 * TUYỆT ĐỐI không import file này vào bất kỳ component nào chạy ở trình duyệt.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error('Thiếu biến môi trường NEXT_PUBLIC_SUPABASE_URL')
  if (!serviceKey) throw new Error('Thiếu biến môi trường SUPABASE_SERVICE_ROLE_KEY')

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
