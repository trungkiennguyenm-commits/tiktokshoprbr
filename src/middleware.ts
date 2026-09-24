import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_COOKIE, tokenOf } from '@/lib/auth'

/**
 * Chặn mọi trang trừ khi trình duyệt có cookie đúng.
 *
 * KHÔNG chặn /api/cron: cron của Vercel gọi thẳng vào đó với CRON_SECRET
 * riêng, chặn ở tầng này là đồng bộ hằng ngày gãy mà không báo gì.
 */
export async function middleware(req: NextRequest) {
  const pw = process.env.DASHBOARD_PASSWORD
  // Chưa đặt biến môi trường thì mở như cũ — để một lần deploy thiếu biến
  // không khoá luôn cả chính mình ra ngoài.
  if (!pw) return NextResponse.next()

  const got = req.cookies.get(AUTH_COOKIE)?.value
  if (got && got === (await tokenOf(pw))) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`
  return NextResponse.redirect(url)
}

export const config = {
  /* /api/tiktok-ads là nơi TikTok trả trình duyệt về sau khi uỷ quyền. Chặn nó
     bằng mật khẩu thì auth_code mất khi bị đẩy sang /login — mà auth_code chỉ
     sống vài phút. Nó vô hại khi để mở: không có auth_code hợp lệ của đúng app
     thì gọi vào chỉ nhận lỗi. */
  matcher: ['/((?!login|api/login|api/cron|api/tiktok-ads|_next/static|_next/image|favicon.ico).*)'],
}
