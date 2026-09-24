/** Khoá dashboard bằng MỘT mật khẩu chung cho cả team.
 *
 *  Cookie không chứa mật khẩu, chỉ chứa hash của nó. Ai mở devtools xem
 *  cookie cũng không đọc ngược ra mật khẩu để chia cho người ngoài; và khi
 *  bạn đổi DASHBOARD_PASSWORD thì mọi cookie cũ hết hiệu lực ngay, không
 *  cần làm gì thêm.
 *
 *  Dùng Web Crypto (globalThis.crypto) vì middleware chạy trên edge runtime,
 *  ở đó không có module 'crypto' của Node.
 */
export const AUTH_COOKIE = 'rbr_auth'

/** Cookie sống 30 ngày — đủ để không phải nhập lại mỗi sáng. */
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30

export async function tokenOf(password: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`rbr::${password}`),
  )
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
