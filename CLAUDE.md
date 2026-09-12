# TTS Metrics — hướng dẫn cho Claude Code

App phân tích hiệu quả TikTok Shop nội bộ của Roborock Vietnam.
Kéo dữ liệu từ TikTok Shop Open API + TikTok Business API, lưu Supabase, cảnh báo qua Lark.

## Stack
- Next.js 15 App Router + TypeScript + Tailwind
- Supabase (Postgres) — project ref `bhuegjddjrxcqtqargnn`, region ap-southeast-1
- Vercel (host + cron), region function `sin1`
- npm (KHÔNG phải pnpm — máy dev là Windows, pnpm bị chặn bởi execution policy)

## Biến môi trường
Đặt trên Vercel, không bao giờ commit:
`TTS_APP_KEY`, `TTS_APP_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY` (64 ký tự hex), `CRON_SECRET`

## Luật bất di bất dịch khi gọi TikTok Shop API

1. **Luôn gửi header `content-type: application/json`** cùng với `x-tts-access-token`.
   Thiếu nó, TikTok trả về `105005 "chưa được cấp scope"` — một thông báo sai hoàn toàn
   so với nguyên nhân thật. Đã mất một buổi vì chuyện này.

2. **Chữ ký (sign)**: lấy query params bỏ `sign` và `access_token`, sắp xếp key theo
   alphabet, nối `{key}{value}`, ghép path vào trước, ghép body vào sau (trừ khi
   content-type là multipart/form-data), bọc hai đầu bằng app_secret, HMAC-SHA256 với
   key là app_secret, mã hex. Access token KHÔNG nằm trong chữ ký (từ version 202309).

3. **`grant_type` là `authorized_code`**, không phải `authorization_code` như OAuth chuẩn.

4. **Reset app_secret tạo cửa sổ ~24h hai khoá song song.** Dịch vụ token nhận khoá mới
   ngay, nhưng cổng API vẫn kiểm chữ ký bằng khoá cũ cho tới khi khoá cũ bị thu hồi.
   Triệu chứng: `token/get` trả code 0 nhưng mọi lệnh có ký đều `106001`. Đừng reset
   app_secret nếu không thật sự cần.

5. **Scope đóng cứng vào token.** Thêm scope phải: bật trong Manage API → Publish changes
   → authorize lại → dùng access token mới. Token cũ không bao giờ có thêm quyền.

6. **`auth_code` sống 30 phút, dùng một lần.** Refresh token thì xoay vòng cả hai token —
   access token cũ chết ngay lập tức.

7. **`shop_cipher` bắt buộc** cho hầu hết endpoint dữ liệu. Lấy từ
   `/authorization/202309/shops`, lưu trong bảng `shops`.

## Luật về số liệu (quan trọng không kém phần kỹ thuật)
- **Không bao giờ cộng live view với product impression.** Hai loại sự kiện khác nhau.
- "Reach" là số người duy nhất. Views và impressions là số lượt. Không gọi lượt là reach.
- **CIR = spend ÷ GMV phiên**, KHÔNG phải spend ÷ GMV mà ads quy thuộc. Đây là định nghĩa
  của team, phải ghi rõ trong UI.
- LGM / PGM / C-Ads là ba lớp riêng, tổng riêng. C-Ads = Consideration Ads.
- Watch GPM / Show GPM từ file export nhiều dòng bằng 0 — tính lại và ghi rõ "số tính lại".
- Cancel rate tính từ bảng `orders`, không bịa từ `attributed orders`.

## Quy ước code
- Số phiên bản endpoint (202309, 202508...) chỉ khai báo trong `src/lib/tts/config.ts`,
  không rải trong code.
- Mọi bảng dữ liệu mang `shop_id`. RLS bật sẵn; code server dùng service role key.
- Token lưu trong bảng `connections` ở dạng đã mã hoá AES-256-GCM, không bao giờ lưu thô.
- Sync phải idempotent: chạy lại cùng dữ liệu không được nhân đôi bản ghi.
- Hàm serverless có trần thời gian: vòng lặp phân trang phải dừng ở ~50 giây, lưu cursor,
  để lần cron sau chạy tiếp.

## Người dùng
Kiên — TikTok Shop Lead, làm marketing chứ không phải lập trình viên. Giải thích ngắn,
mỗi lần một việc, nói rõ kết quả đúng trông như thế nào.
