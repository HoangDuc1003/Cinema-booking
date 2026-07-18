# CLAUDE.md — FastCheck Automation

> File này được Claude Code tự động nạp ở mỗi phiên. Giữ nó ngắn, chính xác, và trỏ tới tài liệu chi tiết thay vì nhồi hết vào đây. Khi sửa kiến trúc hoặc quy ước, cập nhật cả file này.

## 1. Dự án là gì (đọc trong 30 giây)

FastCheck là dịch vụ kiểm tra trạng thái **LIVE / DEAD / INCONCLUSIVE** của link social (TikTok, Facebook, X, YouTube) ở quy mô lớn. Nó auto-login bằng cookie/info, auto-switch profile khi bị chặn, chạy nhiều profile song song trên nhiều máy trạm, điều phối qua Station Management.

Ba con số KPI định hình mọi quyết định kỹ thuật:
- Độ chính xác phân loại LIVE/DEAD **≥ 98%**.
- API trả **< 500ms** khi cache hit; check thật **< 3 phút**/mục tiêu.
- Chịu tải **≥ 50 request đồng thời** không crash.

**Triết lý bao trùm toàn dự án:** *một lỗi được báo ra luôn tốt hơn một lỗi âm thầm.* Hệ thống thà trả `INCONCLUSIVE` hoặc từ chối, còn hơn trả sai mà không ai biết. Nếu bạn (Claude) phải chọn giữa "đoán cho xong" và "báo không chắc chắn", luôn chọn báo không chắc chắn.

## 2. Cấu trúc & công nghệ

Monorepo (pnpm workspaces + Turborepo). Chi tiết đầy đủ: `docs/project-structure.md`.

| Thành phần | Vị trí | Stack | Vai trò |
|---|---|---|---|
| FastCheck API | `apps/api` | Node.js + **Fastify** | Nhận `POST /check`, validate, normalize, cache, dedupe, đẩy job |
| Orchestrator | `apps/orchestrator` | **NestJS** + WS Gateway | Điều phối job, quản lý pool profile, auto-switch, registry station |
| Worker (Client App) | `apps/worker` | **Python 3.12** WS client + DrissionPage | Chạy trên máy trạm: inject cookie, mở GemLogin, điều khiển browser bằng DrissionPage, quản lý PID |
| Dashboard | `apps/dashboard` | React | Theo dõi station, job, tỷ lệ LIVE/DEAD/INCONCLUSIVE |
| Shared types/enums | `packages/shared` | TS | Enum, URL normalizer, trace utils dùng chung |
| Contracts | `packages/contracts` | TS + **zod** | DTO API, payload queue, giao thức WS — nguồn sự thật về "hình dạng dữ liệu giữa các service" |
| DB layer | `packages/db` | SQL migrations + repo | Schema, migration, repository Postgres |

Hạ tầng: **PostgreSQL** (nguồn sự thật), **Redis/ioredis** (cache + lock + rate-limit + registry), **RabbitMQ/amqplib** (hàng đợi job), **GemLogin** (antidetect browser), **DrissionPage** (Python, attach CDP endpoint GemLogin), ELK + Prometheus/Grafana (observability).

## 3. Trước khi viết code — ĐỌC những file này

Đừng suy diễn kiến trúc từ tên file. Bối cảnh nằm ở đây:

- **`docs/invariants.md`** — Các luật bất biến KHÔNG được vi phạm. Đọc trước tiên. Đây là file quan trọng nhất trong repo.
- `docs/glossary.md` — Từ vựng miền. `INCONCLUSIVE` ≠ `DEAD`, `url_status` ≠ `profile_health`, "lease", "sticky proxy"... Hiểu sai nghĩa = viết sai logic.
- `docs/architecture.md` — Tổng thể 3 vùng, luồng dữ liệu, vì sao chọn từng công nghệ.
- `docs/tech-stack.md` — Công cụ cụ thể (Kysely, pino, Vitest, zod…) + lý do. Đọc khi phân vân "dùng thư viện nào".
- `docs/data-model.md` — Schema Postgres, enum, index, câu claim profile atomic.
- `docs/job-lifecycle.md` — Vòng đời một job từ `POST /check` tới kết quả, truy theo `trace_id`.
- `docs/station-management-design.md` — Thiết kế chi tiết Hạng mục 2 (Station Management), ánh xạ từng dòng yêu cầu Excel. Đọc khi làm orchestrator/worker/registry/lệnh WS.
- `docs/roadmap.md` — Lộ trình theo giai đoạn, ánh xạ trọng số chấm điểm. Đọc để biết "làm gì trước".
- `docs/anti-patterns.md` — Danh mục "hỏng âm thầm" và cách né. Đọc khi làm detector, proxy, hoặc dọn tiến trình.
- `docs/adr/` — Vì sao browser thay reverse API; queue chỉ vận chuyển; INCONCLUSIVE hạng nhất; gộp framework; Kysely thay Prisma; DrissionPage(Python) thay Playwright.

Quy ước code & bảo mật:
- `.claude/rules/coding-conventions.md`
- `.claude/rules/error-handling-and-observability.md`
- `.claude/rules/security.md`

Mỗi app có `CLAUDE.md` riêng (`apps/*/CLAUDE.md`) tự nạp khi bạn làm trong thư mục đó.

## 4. Skills sẵn có (dùng đúng lúc)

- **platform-detector** — khi thêm/sửa logic phân loại LIVE/DEAD/INCONCLUSIVE cho bất kỳ nền tảng nào.
- **profile-lifecycle** — khi động tới trạng thái profile, claim/lease, cooldown, health_score, auto-switch.
- **worker-process-hygiene** — khi mở/đóng browser, kill tiến trình treo, giới hạn concurrency, chống rò RAM.

## 5. Mệnh lệnh cốt lõi (bản rút gọn của invariants.md)

1. **INCONCLUSIVE không phải DEAD.** Không khớp cả tín hiệu LIVE lẫn DEAD → trả `INCONCLUSIVE`, không bao giờ mặc định DEAD.
2. **Guard đăng nhập là bắt buộc.** Sau khi inject cookie + load trang, PHẢI xác minh đã đăng nhập *trước khi* kết luận gì về target. Chưa đăng nhập = lỗi profile = `INCONCLUSIVE`, không phải DEAD.
3. **Tách `url_status` khỏi `profile_health`.** "Link chết" và "profile mình bị chặn" là hai chuyện khác nhau. Không gộp.
4. **Queue chỉ vận chuyển, không lưu trạng thái.** Nguồn sự thật vòng đời job là bảng `check_jobs`.
5. **Postgres là nguồn sự thật; Redis chỉ là trí nhớ ngắn hạn.** Mất Redis → hệ thống chậm lại, không được sai.
6. **1 job = 1 profile = 1 vân tay = 1 proxy = 1 browser context.** Không mở nhiều target trong một context. Không clone profile chạy song song.
7. **Không hardcode selector giòn.** Selector là nguồn hỏng âm thầm số 1. Ưu tiên role/aria/testid, luôn có fallback, vote đa tín hiệu.
8. **Kill theo process group, reap zombie.** Kill mỗi PID cha để sót con = rò RAM âm thầm.
9. **Không log cookie/credential.** Cookie mã hoá at-rest (AES-GCM) qua `packages/crypto`. CDP được phép forward (yêu cầu Excel) nhưng phải qua WSS+token, không để trần ra internet.
10. **Mọi thao tác mang theo `trace_id`** xuyên suốt API → queue → worker → kết quả.

> **Lưu ý runtime:** `api` + `orchestrator` chạy Linux/Docker; `worker` chạy **native trên Windows** cùng GemLogin (không Docker). Cách dọn tiến trình khác nhau theo HĐH — xem INV-9.

Vi phạm bất kỳ điều nào ở trên là bug nghiêm trọng, kể cả khi test vẫn xanh. Nếu một yêu cầu của người dùng có vẻ mâu thuẫn với các luật này, **dừng lại và hỏi** thay vì lặng lẽ làm theo.

## 6. Lệnh hay dùng

```bash
pnpm install                 # cài toàn workspace
pnpm dev                     # chạy tất cả app ở chế độ dev (turbo)
pnpm --filter api dev        # chạy riêng một app
docker compose up -d         # Postgres + Redis + RabbitMQ + ELK cho local
pnpm db:migrate              # chạy migration
pnpm test                    # unit test toàn repo
pnpm test:golden             # golden set cho detector (BẮT BUỘC chạy sau khi sửa detector)
pnpm lint && pnpm typecheck  # phải sạch trước khi mở PR
pnpm loadtest                # k6/Locust — xác nhận "50 concurrent" bằng số đo, không bằng cảm tính
```

## 7. Quy tắc làm việc với Claude trên repo này

- Khi được yêu cầu mơ hồ ("làm cái detector đi"), đọc skill tương ứng + `docs/invariants.md` trước, rồi mới code. Đừng đoán schema — mở `packages/contracts` và `packages/db`.
- Ưu tiên sửa đúng chỗ hơn là viết lại. Trước khi tạo file/service mới, kiểm tra đã có sẵn chưa.
- Không tự "cải tiến" bằng cách phá invariant (ví dụ: gộp url_status với profile_health cho "gọn"). Nếu thấy invariant cản trở, nêu ra để bàn.
- Sau khi sửa detector: chạy `pnpm test:golden`. Sau khi sửa concurrency/process: nghĩ tới rò RAM và zombie.
- Không đưa `trace_id`, `command_id`, cookie ra khỏi phạm vi cần thiết.
