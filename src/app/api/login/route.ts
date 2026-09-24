import { NextResponse } from 'next/server'
import { AUTH_COOKIE, AUTH_MAX_AGE, tokenOf } from '@/lib/auth'

export const runtime = 'nodejs'

/** Nhận mật khẩu từ form đăng nhập, đúng thì phát cookie rồi trả về trang
 *  người dùng định vào. 303 để trình duyệt chuyển từ POST sang GET. */
export async function POST(req: Request) {
  const form = await req.formData()
  const sent = String(form.get('password') ?? '')
  const raw = String(form.get('next') ?? '/dashboard')
  // Chỉ nhận đường dẫn nội bộ, tránh bị lợi dụng để chuyển hướng ra ngoài.
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard'

  const real = process.env.DASHBOARD_PASSWORD
  if (!real || sent !== real) {
    const back = new URL(`/login?e=1&next=${encodeURIComponent(next)}`, req.url)
    return NextResponse.redirect(back, 303)
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303)
  res.cookies.set(AUTH_COOKIE, await tokenOf(real), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: AUTH_MAX_AGE,
  })
  return res
}
