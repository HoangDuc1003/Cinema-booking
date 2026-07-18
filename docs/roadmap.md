# Roadmap — Lộ trình phát triển (2 tháng thử việc)

> Phạm vi yêu cầu rất lớn cho một người trong ~2 tháng. File này chia thành giai đoạn theo **giá trị/rủi ro**, ánh xạ vào trọng số chấm điểm (Hạng mục 1 = 40%, Hạng mục 2 = 40%, Chất lượng code = 5%, Chủ động = 5%). Nguyên tắc: **chứng minh sớm những tuyên bố rủi ro nhất** (chính xác 98%, backpressure), đừng để dồn cuối.

## Vì sao thứ tự này
Hai thứ dễ "trông như xong nhưng thực ra sai" là **độ chính xác** (do hỏng âm thầm) và **chịu tải** (do backpressure). Làm chúng trước, trên phạm vi nhỏ (1 platform, 1 worker), để lộ vấn đề khi còn rẻ. Station Management và multi-profile mở rộng sau trên nền đã chắc.

## Phase 0 — Khung xương (tuần 1)
- Monorepo pnpm+Turbo; `packages/{shared,contracts,config,crypto,db}` rỗng có type.
- docker-compose: Postgres + Redis + RabbitMQ. `packages/config` validate env.
- Migration đầu: `check_jobs`, `profiles`, `stations`, `proxies`, `check_logs`.
- `apps/worker` (worker Python + DrissionPage) kết nối WS tới `apps/orchestrator`, đăng ký + heartbeat (chưa chạy browser).
- **Xong khi:** `pnpm dev` lên cả hệ, worker hiện trong registry, migration chạy được.

## Phase 1 — Một đường sống end-to-end + kỷ luật chính xác (tuần 2–3) ★ rủi ro cao nhất
- `POST /check` → normalize+hash → Redis cache/dedupe → RabbitMQ → Orchestrator → 1 worker.
- **Một platform trước** (chọn cái ổn định nhất để làm mẫu, ví dụ login bằng cookie).
- Detector đầy đủ ba nhánh **LIVE/DEAD/INCONCLUSIVE** + **guard đăng nhập** + vote đa tín hiệu (skill `platform-detector`).
- **Golden set + `pnpm test:golden`** ngay từ đây — đây là cách duy nhất chứng minh "98%" không phải cảm tính.
- 1 profile, 1 proxy sticky, 1 station. Trả kết quả qua `GET /check/{trace_id}`.
- **Xong khi:** một link thật cho ra LIVE/DEAD/INCONCLUSIVE đúng; golden set xanh; cookie chết → INCONCLUSIVE chứ không DEAD.
- *Ánh xạ điểm:* lõi Hạng mục 1 + nền của KPI chính xác.

## Phase 2 — Đủ 4 platform + login (tuần 3–4)
- Detector cho cả TikTok, Facebook, X, YouTube (mỗi platform 1 implementation kế thừa base, không copy-paste).
- Login bằng cookie cho cả 4; login bằng **info cho TikTok & X** khi cookie chết (gõ mô phỏng người, xử lý captcha/OTP).
- Refresh cookie sau phiên thành công (mã hoá qua `packages/crypto`).
- Mở rộng golden set cho từng platform/loại target.
- **Xong khi:** 4 platform phân loại đúng trên golden set; TT/X login được bằng cả info lẫn cookie.

## Phase 3 — Pool & multi-profile & auto-switch (tuần 4–5)
- Claim profile atomic `FOR UPDATE SKIP LOCKED` + lease + cron dọn (INV-11).
- health_score, cooldown, consecutive_fails; rate-limit token bucket Redis theo platform+profile.
- **Auto-switch** khi BLOCKED/timeout: cooldown/dead → claim mới → re-queue `retry+1` → DLQ khi vượt max (skill `profile-lifecycle`).
- Nhiều profile song song trên 1 station (process pool = max_concurrency).
- **Xong khi:** kéo phích 1 profile giữa chừng → job tự chuyển profile khác và hoàn tất; không switch vô hạn khi pool cạn.
- *Ánh xạ điểm:* hoàn thiện Hạng mục 1 (auto-switch + multi-profile).

## Phase 4 — Station Management đầy đủ + chịu tải (tuần 5–7) ★ Hạng mục 2
- Client App: CRUD profile GemLogin (API local), mở/tắt browser, forward CDP an toàn (WSS+token, mặc định chạy local — INV-12), chạy kịch bản login (lưu phía client).
- Đồng bộ danh sách profile station → server; registry + phát hiện station chết + thu hồi job (INV-15, dùng cột dispatch trên `check_jobs`).
- Lệnh idempotent + `command_id` (INV-14); auto-reconnect.
- Process hygiene: timeout cứng, kill cây tiến trình theo HĐH, giám sát RAM/PID (skill `worker-process-hygiene`).
- **Load test k6/Locust 50–100 concurrent**, đo p95, tỷ lệ lỗi, RAM/CPU. Chỉnh prefetch=pool size=max_concurrency.
- **Xong khi:** ≥50 check thật song song không crash (có số đo, không cảm tính); station rớt mạng tự phục hồi.

## Phase 5 — Hoàn thiện & điểm cộng (tuần 7–8)
- Dashboard React: trạng thái/load station, tiến trình theo `trace_id`, tỷ lệ LIVE/DEAD/INCONCLUSIVE, sức khoẻ pool, cảnh báo block (realtime WS/SSE).
- Circuit breaker theo platform (spec §8.6).
- API docs (Swagger sinh từ zod), README chạy được.
- Observability: pino → prom-client → Grafana (theo `docs/tech-stack.md`).
- **Xong khi:** demo được toàn luồng + dashboard; tài liệu API đầy đủ.
- *Ánh xạ điểm:* Dashboard (điểm cộng) + Chất lượng code + Chủ động.

## Kỷ luật xuyên suốt (Hạng mục 3 & 4 = 10%)
- Mỗi PR: lint/typecheck sạch, mô tả rõ + cách test; đụng detector thì chạy golden set.
- Daily update tiến độ; block quá 2 tiếng thì hỏi.
- Ghi ADR khi ra quyết định kiến trúc; thêm anti-pattern mới khi phát hiện hỏng âm thầm.

## Nếu thiếu thời gian — cắt gì trước
Giữ: đường end-to-end 1–2 platform **đúng chuẩn chính xác** + auto-switch + chịu tải có đo + Station Management cơ bản. Cắt/rút gọn: dashboard đẹp, đủ 4 platform login-by-info, observability full. Một hệ **đúng và trung thực** trên phạm vi hẹp giá trị hơn một hệ rộng mà sai âm thầm — đúng tinh thần "một lỗi báo ra tốt hơn một lỗi âm thầm".
