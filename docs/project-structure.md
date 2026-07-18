# Project Structure — Cấu trúc source đề xuất

> Monorepo pnpm + Turborepo. Mục tiêu: ranh giới rõ giữa các service, chia sẻ type/contract an toàn, dễ chạy local, dễ mở rộng ngang. Ranh giới thư mục phản chiếu ranh giới ba vùng kiến trúc.

## Cây thư mục

```
fastcheck/
├── CLAUDE.md                       # Context gốc cho Claude Code (tự nạp)
├── README.md
├── package.json                    # workspace root
├── pnpm-workspace.yaml
├── turbo.json                      # pipeline build/test/lint
├── docker-compose.yml              # Postgres + Redis + RabbitMQ + ELK cho local dev
├── .env.example
├── .github/workflows/ci.yml        # lint + typecheck + test + golden set
│
├── docs/                           # tài liệu tham chiếu (Claude đọc khi cần)
│   ├── architecture.md
│   ├── data-model.md
│   ├── job-lifecycle.md
│   ├── invariants.md               # ★ luật bất biến — đọc trước tiên
│   ├── glossary.md
│   ├── anti-patterns.md
│   ├── project-structure.md        # file này
│   └── adr/                        # architecture decision records
│
├── .claude/
│   ├── rules/                      # quy ước — @import vào CLAUDE.md khi cần
│   │   ├── coding-conventions.md
│   │   ├── error-handling-and-observability.md
│   │   └── security.md
│   └── skills/                     # skills invokable
│       ├── platform-detector/SKILL.md
│       ├── profile-lifecycle/SKILL.md
│       └── worker-process-hygiene/SKILL.md
│
├── packages/                       # code dùng chung, không tự chạy
│   ├── shared/                     # enum, hằng số, URL normalizer, trace utils, logger (pino)
│   │   └── src/{enums,url,trace,logger}.ts
│   ├── contracts/                  # ★ nguồn sự thật về "hình dạng dữ liệu giữa service"
│   │   └── src/{api.dto,queue.payload,ws.protocol}.ts   # zod schema + type suy ra
│   ├── config/                     # ★ schema env validate bằng zod (fail-fast khi thiếu biến)
│   │   └── src/env.ts
│   ├── crypto/                     # ★ AES-256-GCM cookie enc/dec + xoay khoá — MỘT nơi duy nhất
│   │   └── src/cookie-cipher.ts
│   └── db/                         # schema, migration, repository (Kysely/Drizzle + node-pg-migrate)
│       ├── migrations/
│       └── src/repositories/{profile,job,log,station,proxy}.repo.ts
│
└── apps/                           # service tự chạy được
    ├── api/                        # FastCheck API (Fastify) — vùng tiếp nhận
    │   ├── CLAUDE.md
    │   └── src/{routes,plugins,services}/
    │       └── services/{normalize,cache,dedupe,ratelimit,circuit-breaker}.ts
    ├── orchestrator/               # NestJS + WS Gateway — vùng điều phối
    │   ├── CLAUDE.md
    │   └── src/
    │       ├── consumer/           # RabbitMQ consumer
    │       ├── dispatch/           # cấp job theo slot
    │       ├── profile-pool/       # claim, lease, auto-switch, health
    │       ├── station-registry/   # registry + heartbeat
    │       └── ws/                 # WS gateway (RUN, CRUD profile, mở/tắt browser)
    ├── worker/                     # Client App — Python 3.12 + DrissionPage (uv), native Windows, KHÔNG là pnpm package
    │   ├── CLAUDE.md
    │   ├── pyproject.toml          # uv/deps: drissionpage, pydantic, websockets, psutil, pytest
    │   ├── package.json            # wrapper mỏng: dev/build/typecheck/test gọi `uv run ...` để Turbo/pnpm dev điều phối
    │   └── src/fastcheck_worker/
    │       ├── ws_client/          # kết nối, đăng ký, heartbeat, reconnect, idempotency (command_id)
    │       ├── browser/            # DrissionPage adapter (real|fake), cookie inject, attach CDP GemLogin
    │       ├── detectors/          # ★ mỗi platform 1 detector
    │       │   ├── base/           # interface + vote engine + guard đăng nhập
    │       │   ├── tiktok/  facebook/  twitter/  youtube/
    │       ├── login/              # login(page, credential) -> LoginResult per platform (client-side)
    │       ├── concurrency/        # process pool, stagger
    │       └── process/            # PID/RAM monitor (psutil), kill cây tiến trình (taskkill /T /F)
    └── dashboard/                  # React — theo dõi station/job/tỷ lệ (điểm cộng)
        └── CLAUDE.md
```

> **Lưu ý runtime khác nhau:** `api` + `orchestrator` chạy Linux/Docker (server). `worker` chạy **native trên Windows** cùng GemLogin (desktop app) — KHÔNG Docker — và là **Python 3.12 + DrissionPage** (không phải Node). `dashboard` là web tĩnh build ra bất kỳ host nào. Điều này ảnh hưởng cách dọn tiến trình (INV-9) và cách đóng gói.

## Nguyên tắc ranh giới

- **`packages/contracts` là hợp đồng giữa các service.** API, Orchestrator, Worker đều import type từ đây. Đổi payload queue / giao thức WS / DTO API → sửa ở contracts trước, TypeScript sẽ báo mọi nơi bị ảnh hưởng. Đây là cách chống "sai lệch schema âm thầm" giữa các service.
- **`packages/shared` chứa logic thuần** (normalize URL, enum, trace) không phụ thuộc hạ tầng. Detector và API dùng chung normalizer để `url_hash` nhất quán.
- **`packages/db` là nơi duy nhất chạm SQL.** App không viết SQL rời rạc; gọi repository. Câu claim profile atomic (INV-11) sống ở `profile.repo.ts`.
- **Detector per platform, không copy-paste.** Interface chung ở `detectors/base` (bao gồm guard đăng nhập + vote engine dùng chung); mỗi platform một implementation. Login cũng vậy: interface `login(page, credential) -> LoginResult`, mỗi platform một bản (spec §4.4).
- **Kịch bản login lưu phía client** (theo yêu cầu đề bài): nằm trong `apps/worker/src/login`, không ở server.
- **`packages/crypto` là nơi DUY NHẤT mã hoá cookie** (AES-256-GCM). Worker mã hoá cookie mới sau phiên thành công; Orchestrator giải mã để gửi xuống. Một module → dễ audit, dễ xoay khoá (INV-12).
- **Ranh giới TS ↔ Python (ADR-0006):** worker là Python, KHÔNG import `packages/*` (TS). Contract đi qua WS JSON; worker mirror bằng **pydantic**. Cookie do orchestrator giải mã (`packages/crypto`) rồi gửi xuống qua WSS — worker không đụng AES.
- **`packages/config` validate env bằng zod, fail-fast.** Thiếu `DATABASE_URL`/`REDIS_URL`/khoá mã hoá thì app chết ngay lúc khởi động với thông báo rõ, không chạy nửa vời rồi lỗi âm thầm lúc runtime.

## Vì sao monorepo

- Type/contract chia sẻ an toàn qua workspace, không publish package.
- Một lệnh `pnpm dev` chạy cả hệ; Turborepo cache build/test.
- CI chạy golden set cho detector như một job riêng — bắt selector vỡ trước khi merge.

## Nested CLAUDE.md

Mỗi app có `CLAUDE.md` riêng, Claude Code tự nạp khi bạn làm việc trong thư mục đó. File gốc giữ bức tranh lớn; file con giữ chi tiết cục bộ (ràng buộc, gotcha của service đó). Tránh lặp lại — file con trỏ về `docs/` cho phần chung.
