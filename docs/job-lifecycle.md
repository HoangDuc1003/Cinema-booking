# Job Lifecycle — Vòng đời một job (theo `trace_id`)

> Khi cần hiểu "cái gì gọi cái gì" hoặc debug một job, theo trình tự này. Mọi bước ghi log kèm `trace_id`.

## Luồng chính

1. **Client** `POST /check {url}` → **API** normalize URL (bỏ tracking param, lowercase host, gỡ fragment) → tính `url_hash = sha256(url_chuẩn_hoá)` (INV-13). Sinh `trace_id`.
2. **Tra cache Redis** `fastcheck:result:{url_hash}`:
   - **Hit** → trả kết quả ngay (`< 500ms`).
   - **Miss** → lấy lock `SET lock:{url_hash} NX EX 10` (chống stampede). Upsert `check_jobs` `ON CONFLICT (url_hash) DO NOTHING` (dedupe). Push RabbitMQ `job.pending`. Trả `202` + `trace_id`.
3. **Orchestrator** consume job → **claim profile khoẻ** (`FOR UPDATE SKIP LOCKED`, INV-11) cùng platform → chọn station còn slot (`current_load < max_concurrency`) → gửi WS `RUN {url, cookie}` (kèm `command_id`, INV-14).
4. **Worker (Client App)**: inject cookie (`context.addCookies` **trước** khi điều hướng) → mở GemLogin (vân tay + proxy sticky riêng) → DrissionPage attach CDP → **guard: xác minh đã đăng nhập** (INV-2) → thao tác DOM.
5. **Detector** thu nhiều tín hiệu (HTTP status + DOM + URL cuối) → **vote** → `LIVE` / `DEAD` / `INCONCLUSIVE` (INV-1, INV-8). Đồng thời xác định `profile_health`.
6. **Kết quả về Orchestrator**:
   - Ghi `check_logs` (`url_status` + `profile_health` riêng, INV-3).
   - Cập nhật `check_jobs.status` + `result`.
   - Set cache Redis (TTL LIVE ngắn hơn DEAD; **không cache INCONCLUSIVE**).
   - Trả profile về pool (`AVAILABLE`) hoặc `COOLDOWN` nếu nghi ngờ; cập nhật `health_score`.
   - `ack` message RabbitMQ (chỉ ack khi hoàn tất — manual ack, INV-4/INV-10).
7. **Nhánh lỗi**: `INCONCLUSIVE` / `BLOCKED` / timeout → **auto-switch**: cooldown/dead profile cũ → claim profile mới → re-queue job `retry_count+1` qua `job.retry` (backoff). Vượt `max_retries` → `job.dlq` + alert; `check_jobs.status = DEAD_LETTER`.

## Các "van an toàn" cắt ngang luồng

- **Lease timeout** — worker treo → `lease_expires_at` hết hạn → cron trả profile về pool. Job không kẹt vĩnh viễn.
- **Job timeout cứng** (≤ 2 phút) — worker kill browser treo theo process group, giải phóng slot (INV-9).
- **Station chết** — quá ngưỡng không ping → `OFFLINE` → thu hồi + re-queue job đang cấp (INV-15).
- **Circuit breaker** — tỷ lệ BLOCKED của một platform vượt ngưỡng → mở circuit, API trả `503` + `retry_after`, bảo vệ pool.

## Endpoint theo dõi

- `GET /check/{trace_id}` — poll trạng thái/kết quả.
- Tuỳ chọn webhook/SSE khi có kết quả.

## Sơ đồ rút gọn

```
POST /check ─► normalize+hash ─► Redis?
   hit ────────────────────────────────► trả <500ms
   miss ─► lock ─► check_jobs (dedupe) ─► RabbitMQ ─► trả trace_id
                                              │
                     Orchestrator ◄───────────┘
                        │ claim profile (SKIP LOCKED)
                        │ chọn station còn slot
                        ▼ WS RUN {url, cookie, command_id}
                     Worker: cookie ─► GemLogin ─► DrissionPage
                        │ GUARD: đã đăng nhập? ──no──► INCONCLUSIVE + mark profile
                        │ yes
                        ▼ detector vote (status+DOM+url)
                     LIVE / DEAD / INCONCLUSIVE  + profile_health
                        │
                        ├─ ghi check_logs, cập nhật check_jobs, set cache
                        └─ INCONCLUSIVE/BLOCKED ─► auto-switch ─► re-queue (retry+1)
                                                        └─ vượt max ─► DLQ + alert
```
