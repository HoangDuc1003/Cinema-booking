# Tech Stack — Lựa chọn công cụ cụ thể

> Spec gốc nêu công nghệ ở mức tầng (Fastify, NestJS, Redis…). File này chốt công cụ cụ thể + lý do, để Claude không chọn tuỳ tiện mỗi lần. Khi phân vân "dùng thư viện nào", đọc đây trước.

## Nền tảng chung
| Việc | Chọn | Lý do |
|---|---|---|
| Ngôn ngữ | TypeScript (strict) cho server; **Python 3.12** cho worker | An toàn kiểu + chia sẻ type qua `packages/contracts`; worker là Python vì DrissionPage — ngoại lệ có chủ đích (ADR-0006) |
| Monorepo | pnpm workspaces + Turborepo | Cache build/test, chia sẻ package không cần publish |
| Runtime | Node.js LTS (api/orchestrator) · Python 3.12 (worker) | Server khớp amqplib/ioredis; worker khớp DrissionPage (ADR-0006) |
| Validate dữ liệu | **zod** | DTO API + payload queue + env, suy ra type tự động |
| Validate env | zod trong `packages/config` | Fail-fast khi thiếu biến, không lỗi âm thầm lúc runtime |
| Logger | **pino** | Structured JSON, nhanh, gắn `trace_id`, feed vào ELK/Loki |
| Test | **Vitest** | Nhanh, hợp monorepo TS; golden set là bộ test riêng |
| Lint/format | ESLint + Prettier | Bám mục 3 biên bản chấm điểm |

## API (`apps/api`)
| Việc | Chọn | Ghi chú |
|---|---|---|
| HTTP framework | Fastify (hoặc NestJS+Fastify adapter — xem ADR-0004) | Trả `<500ms` cache hit |
| API docs | `@fastify/swagger` + sinh từ zod (`fastify-type-provider-zod`) | Thoả yêu cầu "API có tài liệu đầy đủ" mà không viết tay OpenAPI |
| Rate-limit | Lua script trên Redis (atomic) | Tránh race giữa nhiều instance |

## Orchestrator (`apps/orchestrator`)
| Việc | Chọn | Ghi chú |
|---|---|---|
| Framework | NestJS | Cấu trúc module rõ, DI, WS Gateway sẵn |
| WebSocket | `@nestjs/websockets` (ws) | Kênh điều khiển station |
| Queue client | **amqplib** | Manual ack, prefetch, DLQ |

## Worker (`apps/worker`) — Python (ADR-0006)
| Việc | Chọn | Ghi chú |
|---|---|---|
| Ngôn ngữ | **Python 3.12** | Bắt buộc vì DrissionPage là thư viện Python |
| Quản lý deps | **uv** | Nhanh, khoá phiên bản; chạy bằng `uv run` |
| Automation | **DrissionPage** (attach CDP endpoint GemLogin) | Thay vai trò Playwright `connectOverCDP`; gộp HTTP (s-mode) + DOM (d-mode) tiện vote đa tín hiệu |
| Antidetect | GemLogin (API local) | GIỮ NGUYÊN: CRUD profile, mở/tắt, lấy CDP endpoint |
| Concurrency | **process pool** (1 browser = 1 process) | pool size = max_concurrency = prefetch (INV-10); KHÔNG dùng thread điều khiển browser |
| WS client | **websockets** (Python) + reconnect backoff | Đăng ký, heartbeat, idempotent command |
| Validate dữ liệu | **pydantic** (mirror `packages/contracts`) | Ranh giới TS↔Python là WS JSON; zod là nguồn sự thật |
| Kill tiến trình | Windows `taskkill /T /F` hoặc Job Object; theo dõi bằng **psutil** | Theo `platform` (INV-9) |
| Test/golden | **pytest** | `pnpm test:golden` ủy quyền xuống `uv run pytest` |

## Data & hạ tầng
| Việc | Chọn | Lý do |
|---|---|---|
| DB | PostgreSQL | Nguồn sự thật; `FOR UPDATE SKIP LOCKED` |
| Truy cập DB | **Kysely** (hoặc Drizzle) | Type-safe + raw SQL dễ; **tránh Prisma** (SKIP LOCKED + PgBouncer khó) — xem ADR-0005 |
| Migration | node-pg-migrate (hoặc migrator của Kysely) | Versioned, có down |
| Connection pool | **PgBouncer** (transaction mode) | Giới hạn kết nối khi nhiều worker/instance |
| Cache/Lock/Registry | Redis + **ioredis** | Cache kết quả, lock stampede, rate-limit, registry station |
| Queue | RabbitMQ + amqplib | job.pending / job.retry (TTL+DLX) / job.dlq |
| Mã hoá cookie | `node:crypto` AES-256-GCM trong `packages/crypto` | Một module, hỗ trợ `cookie_key_id` xoay khoá |
| Local dev | docker-compose (Postgres+Redis+RabbitMQ) | Worker chạy ngoài Docker trên Windows |

## Observability — làm theo giai đoạn (đừng dựng ELK ngày đầu)
Spec đích đến là ELK + Prometheus/Grafana. Nhưng cho giai đoạn thử việc, **phân kỳ** để không tốn thời gian hạ tầng:
1. **Ngày đầu:** pino log JSON có `trace_id` ra stdout/file. Đủ để truy vết.
2. **Khi cần metric:** `prom-client` phơi `/metrics` → một Prometheus + Grafana.
3. **Khi cần tra log tập trung:** Loki (nhẹ hơn ELK) hoặc ELK nếu hạ tầng đã có.

Metric bắt buộc từ sớm: tỷ lệ LIVE/DEAD/**INCONCLUSIVE** theo platform, tỷ lệ BLOCKED, p95 latency, RAM/CPU worker, độ sâu queue, `fail_count` theo proxy. Alert: INCONCLUSIVE/BLOCKED tăng đột biến, proxy fail bất thường, RAM worker vượt ngưỡng, pool thấp, DLQ có job, circuit breaker mở.

## Nguyên tắc chọn thư viện mới
Ưu tiên thư viện có trong bảng này. Cần thứ chưa có → chọn cái nhẹ, ít phụ thuộc, còn được bảo trì; nêu lý do trong PR. Không thêm framework thứ hai cho cùng một việc.
