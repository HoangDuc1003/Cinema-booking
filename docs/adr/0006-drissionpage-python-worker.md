# ADR 0006 — Worker dùng DrissionPage (Python) thay Playwright (Node); GemLogin giữ nguyên

- **Trạng thái:** Đã quyết định (Accepted) — thay cho lựa chọn Playwright ở ADR-0001/spec gốc.
- **Bối cảnh:** Cần điều khiển browser thật để phân loại LIVE/DEAD/INCONCLUSIVE (ADR-0001). Ban đầu chọn Playwright (Node, `connectOverCDP`). Quyết định đổi công cụ automation sang **DrissionPage** — một thư viện Python.

## Quyết định

1. **`apps/worker` viết bằng Python 3.12** (quản lý deps bằng **uv**), dùng **DrissionPage** để điều khiển browser.
2. **GemLogin GIỮ NGUYÊN.** DrissionPage **attach vào CDP endpoint mà GemLogin phơi ra** — thay đúng vai trò `connectOverCDP` của Playwright, không hơn. Vân tay cố định + proxy sticky per profile do GemLogin lo như cũ → **INV-6, INV-7 không đổi**.
3. **`apps/api` (Fastify) + `apps/orchestrator` (NestJS) + `packages/*` GIỮ TypeScript.** DrissionPage chỉ dính tới lớp điều khiển browser; không có lý do đổi tầng server.
4. **Ranh giới TS ↔ Python là giao thức WS JSON.** `packages/contracts` (zod) là **nguồn sự thật** về shape dữ liệu; worker Python **mirror** các message đó bằng **pydantic**. Khi đổi contract: sửa zod trước, cập nhật pydantic theo.
5. **Concurrency worker = process pool.** 1 job = 1 browser = **1 process OS riêng** (khớp INV-6). Kích thước pool = `max_concurrency` = prefetch RabbitMQ (backpressure INV-10). **Không dùng thread để điều khiển browser** (browser đã là process riêng; thread chỉ thêm rắc rối và không cách ly bằng process).
6. **Dọn tiến trình (INV-9) giữ nguyên tinh thần, đổi công cụ:** Windows `taskkill /PID <pid> /T /F` (hoặc Job Object khi spawn); theo dõi cây tiến trình + RAM bằng **psutil**. Khái niệm zombie/reap của Unix không áp dụng trên máy trạm Windows.

## Vì sao

- **Chỉ đổi công cụ, không đổi triết lý.** ADR-0001 (browser thật > reverse API) vẫn đúng nguyên; chỉ tên công cụ automation đổi từ Playwright sang DrissionPage.
- DrissionPage gộp sẵn **chế độ HTTP (s-mode)** và **chế độ điều khiển DOM (d-mode)** trong một API → thuận cho **vote đa tín hiệu** (INV-8: HTTP status + DOM element + URL cuối).
- DrissionPage kết nối vào một Chromium **có sẵn** qua địa chỉ CDP (`ChromiumOptions().set_address('127.0.0.1:<port>')`) → **thừa hưởng vân tay + JA3 của GemLogin** y hệt cách Playwright `connectOverCDP` làm.

## Hệ quả

- **Worker không phải pnpm workspace member** (không có `package.json` thật). Để `pnpm dev` vẫn chạy cả 3 app, worker tham gia Turbo qua một **wrapper mỏng** gọi `uv run` (chi tiết ở `apps/worker/CLAUDE.md`).
- **Worker KHÔNG cần `packages/crypto`.** Cookie được **orchestrator (TS)** giải mã qua `packages/crypto` rồi gửi xuống worker trong lệnh `RUN {url, cookie}` **qua kênh WSS + token** (job-lifecycle bước 3). Worker chỉ inject cookie đã ở dạng rõ trên kênh đã mã hoá. Điều này củng cố INV-12: **một nơi mã hoá duy nhất vẫn là `packages/crypto`**, Python không đụng AES.
- **Golden set detector** chạy bằng **pytest** ở worker; `pnpm test:golden` ủy quyền xuống `uv run pytest`.
- **Diễn giải lại các invariant mang tính Node:** INV-10 (`p-limit` → process pool; "không Worker Threads" → "không dùng thread điều khiển browser"), INV-9 (thêm `taskkill /T /F` + psutil), INV-6 (1 browser = 1 process). Đã cập nhật trong `docs/invariants.md`.
- Skill `worker-process-hygiene` và `platform-detector` viết lại theo Python/DrissionPage.

## Không đổi (để tránh hiểu lầm "đổi hết")

INCONCLUSIVE ≠ DEAD, guard đăng nhập, tách url_status/profile_health, queue chỉ vận chuyển, Postgres nguồn sự thật, claim atomic, cookie mã hoá + không log, chuẩn hoá URL, lệnh idempotent, thu hồi job khi station chết — **toàn bộ 15 invariant vẫn nguyên giá trị**, chỉ INV-6/9/10 đổi *cách diễn đạt kỹ thuật* cho Python.
