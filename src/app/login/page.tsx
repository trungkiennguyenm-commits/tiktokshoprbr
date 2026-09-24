export const dynamic = 'force-dynamic'

/** Trang nhập mật khẩu. Form HTML thuần, POST thẳng sang /api/login — không
 *  cần JavaScript, nên mở trên điện thoại hay mạng chậm đều vào được. */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; next?: string }>
}) {
  const sp = await searchParams
  const sai = sp.e === '1'
  const next = sp.next ?? '/dashboard'

  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center',
      background: '#17151A', color: '#FBFAFA', padding: 24,
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    }}>
      <form method="post" action="/api/login" style={{ width: '100%', maxWidth: 360 }}>
        <input type="hidden" name="next" value={next} />
        <div style={{ fontSize: 12, letterSpacing: '.12em', color: '#7C737D', textTransform: 'uppercase' }}>
          Roborock Official VN
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 600, margin: '10px 0 6px' }}>
          Business performance
        </h1>
        <p style={{ color: '#9A929B', fontSize: 14, margin: '0 0 22px' }}>
          Internal dashboard. Enter the team password to continue.
        </p>
        <input
          name="password" type="password" autoFocus required
          placeholder="Password" aria-label="Password"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '12px 14px',
            borderRadius: 10, border: `1px solid ${sai ? '#C1121F' : '#3A353C'}`,
            background: '#221F26', color: '#FBFAFA', fontSize: 15, outline: 'none',
          }}
        />
        {sai && (
          <div style={{ color: '#E4606D', fontSize: 13, marginTop: 10 }}>
            Wrong password. Try again.
          </div>
        )}
        <button
          type="submit"
          style={{
            width: '100%', marginTop: 14, padding: '12px 14px', borderRadius: 10,
            border: 'none', background: '#2563A8', color: '#fff',
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Enter
        </button>
        <p style={{ color: '#6E6670', fontSize: 12, marginTop: 18 }}>
          Stays signed in on this browser for 30 days.
        </p>
      </form>
    </div>
  )
}
