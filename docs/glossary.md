# Glossary — Từ vựng miền FastCheck

> Hiểu sai một thuật ngữ ở đây = viết sai logic. Đọc mục này trước khi đặt tên biến/enum hoặc suy luận về hành vi.

## Trạng thái & kết quả

- **LIVE** — Target (link) còn sống, có tín hiệu chắc chắn (video render, nội dung hiển thị...).
- **DEAD** — Target chắc chắn đã gỡ/khoá: HTTP 404, redirect trang lỗi, text "content isn't available"/"no longer exists". *Chỉ dùng khi có tín hiệu chắc chắn của cái chết.*
- **INCONCLUSIVE** — Không xác định được: captcha, login wall, trang lạ, selector không khớp, chưa đăng nhập. **KHÔNG phải DEAD.** Đẩy lại queue check bằng profile khác. Không cache. Xem INV-1.
- **`url_status`** — Trạng thái của **target**: LIVE/DEAD/INCONCLUSIVE. Ghi vào `check_logs.url_status`.
- **`profile_health`** — Sức khoẻ của **profile** lúc check: OK / CHALLENGED / BLOCKED / THROTTLED. Là khái niệm TÁCH BIỆT với `url_status` (INV-3).

## Profile & pool

- **Profile** — Một "danh tính" để truy cập nền tảng: cookie + vân tay + proxy + nhãn tài khoản. Đơn vị được claim từ pool để chạy một job.
- **Pool** — Tập profile khả dụng, quản lý trong bảng `profiles`.
- **Claim** — Lấy một profile khỏi pool để dùng, atomic bằng `FOR UPDATE SKIP LOCKED` (INV-11).
- **Lease / `lease_expires_at`** — "Hạn thuê" profile. Worker giữ profile trong thời hạn lease; quá hạn (worker treo) cron tự trả profile về `AVAILABLE`. Chống kẹt `IN_USE` vĩnh viễn.
- **`health_score`** (0–100) — Điểm sức khoẻ profile, giảm khi gặp challenge. Dùng để ưu tiên chọn profile khoẻ (`ORDER BY health_score DESC`).
- **COOLDOWN / `cooldown_until`** — Cho profile nghỉ tạm khi bị nghi ngờ, thay vì giết ngay. Giữ tuổi thọ pool (yếu tố chi phí sống còn).
- **`consecutive_fails`** — Số fail liên tiếp; vượt ngưỡng → chuyển `DEAD`.
- **Trạng thái profile** — `AVAILABLE` (sẵn sàng claim), `IN_USE` (đang chạy job), `COOLDOWN` (nghỉ tạm), `DEAD` (hỏng, loại), `BLOCKED` (bị nền tảng chặn).
- **Warm-up** — Cho profile mới lướt/xem nội dung vài phút trước khi dùng để check; acc "mới tinh mà hành động như máy" bị nghi ngay.

## Vân tay & mạng

- **Vân tay (device fingerprint)** — Bộ đặc trưng thiết bị: User-Agent, độ phân giải, Canvas/WebGL/AudioContext hash, danh sách font, số nhân CPU, RAM ảo, timezone, ngôn ngữ. Phải nhất quán theo thời gian với một profile và duy nhất giữa các profile.
- **Antidetect browser (GemLogin)** — Browser tạo mỗi profile một context độc lập với vân tay cố định + proxy riêng, và mở một CDP endpoint.
- **Sticky proxy** — Một profile bind cố định một IP xuyên suốt vòng đời; không xoay giữa phiên (INV-7).
- **JA3 / TLS fingerprint** — Dấu vân tay ở tầng handshake TLS. Dùng browser thật thì JA3 tự nhiên giống người dùng thật — lý do dùng browser thay vì HTTP client.
- **Jitter** — Nghỉ ngẫu nhiên vài giây giữa các request cùng platform, để không bắn đều tăm tắp như script.
- **Stagger** — Giãn thời điểm mở nhiều browser (lệch nhau 200–500ms) thay vì mở đồng loạt, tránh nghẽn CPU lúc khởi động.

## Vòng đời & điều phối

- **`trace_id`** — UUID gắn với một job xuyên suốt API → queue → worker → kết quả, để truy vết một job qua cả hệ thống (INV-10... thực ra INV-... xem invariants; luôn mang theo trace_id).
- **`command_id`** — Id của một lệnh điều khiển station, để lệnh idempotent (INV-14).
- **`url_hash`** — `sha256(URL đã chuẩn hoá)`; key của cache Redis và dedupe (`UNIQUE` trên `check_jobs`). Xem INV-13.
- **Dedupe** — Chống tạo job trùng cho cùng một URL đang xử lý: `UNIQUE(url_hash) WHERE status IN ('PENDING','RUNNING')` + `ON CONFLICT DO NOTHING`.
- **Cache stampede** — 100 request cùng URL ập tới lúc cache vừa hết hạn. Chống bằng `SET lock:{url_hash} NX EX 10`: chỉ 1 request tạo job.
- **Backpressure** — Cơ chế để tải vượt công suất thì job xếp hàng trong queue chứ worker không sập. Thực thi bằng prefetch (`basic.qos`) đồng bộ với giới hạn process pool ở worker (INV-10).
- **DLQ (Dead Letter Queue)** — Nơi job đến sau khi vượt `max_retries`; kèm alert cho người vận hành. Xử lý *job lỗi lẻ*.
- **Circuit Breaker** — Khi tỷ lệ BLOCKED/lỗi của một platform vượt ngưỡng trong cửa sổ trượt → mở circuit: tạm ngừng nhận job platform đó, API trả `503` + `retry_after`. Bảo vệ pool khỏi bị "nướng sạch" khi nền tảng vừa đổi thuật toán. Xử lý *thiệt hại diện rộng* (khác DLQ).

## Station Management

- **Station** — Máy trạm chạy browser. Có `max_concurrency` (số browser tối đa theo RAM), `current_load`, `agent_version`, `last_ping_at`.
- **Client App / Worker** — Ứng dụng Python chạy trên station: nghe lệnh WS, inject cookie, mở/tắt GemLogin, điều khiển browser bằng DrissionPage, quản lý PID/RAM.
- **Orchestrator** — Server điều phối: registry station, cấp job theo slot, quản lý pool profile, auto-switch.
- **`max_concurrency`** — `≈ (RAM_khả_dụng − RAM_OS_và_app) / RAM_mỗi_browser`. Ví dụ máy 16GB, chừa 4GB, mỗi browser 500MB → ~24, đặt an toàn 18–20.
- **DRAINING** — Trạng thái station đang được gỡ: không nhận job mới, chờ job hiện tại xong.
- **Auto-switch** — Khi profile bị BLOCKED/timeout: cooldown/dead profile cũ, claim profile mới cùng platform, re-queue job `retry_count+1`.

## Kỹ thuật thực thi

- **CDP (Chrome DevTools Protocol)** — Giao thức điều khiển Chromium. GemLogin mở endpoint CDP; DrissionPage attach vào endpoint đó để "mượn" browser đã nguỵ trang.
- **attach CDP (DrissionPage)** — DrissionPage kết nối vào browser GemLogin có sẵn qua địa chỉ CDP thay vì tự mở Chromium, để thừa hưởng vân tay + JA3 của GemLogin.
- **Guard đăng nhập** — Bước xác minh đã login trước khi đọc target (INV-2).
- **Golden set** — Tập link đã biết chắc LIVE/DEAD cho từng platform/loại target; chạy hồi quy sau mỗi lần sửa detector để bắt selector vỡ trước khi nó phá KPI.
- **Silent failure ("hỏng âm thầm")** — Lỗi không phát ra tín hiệu: selector vỡ trả rỗng, cookie chết trả trang guest, proxy chết trả INCONCLUSIVE hàng loạt, tiến trình con sót gây rò RAM. Toàn bộ thiết kế xoay quanh việc *biến hỏng âm thầm thành hỏng có báo động*. Xem `docs/anti-patterns.md`.
