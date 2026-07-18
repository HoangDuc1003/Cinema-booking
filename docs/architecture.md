# Architecture — Tổng thể FastCheck

> Nguồn gốc: `FastCheck_Design_Spec.md`. File này là bản dùng cho Claude khi cần định vị nhanh. Chi tiết vận hành từng công nghệ nằm ở §6 của spec gốc.

## Ba vùng

Hệ thống chia làm ba vùng với ranh giới trách nhiệm rõ ràng:

1. **Vùng tiếp nhận (stateless, mở rộng ngang)** — `FastCheck API` (Fastify). Nhận request, validate, normalize, tra cache, dedupe, đẩy job. Vì stateless nên nhân bản nhiều instance sau load balancer thoải mái.
2. **Vùng điều phối & dữ liệu (nguồn sự thật)** — `Orchestrator` (NestJS), `PostgreSQL`, `Redis`, `RabbitMQ`. Quyết định job chạy ở đâu, quản lý pool profile, giữ trạng thái bền vững.
3. **Vùng thực thi (máy trạm)** — `Worker/Client App` + `GemLogin` + `DrissionPage`. Chạy browser thật, thao tác DOM, phân loại kết quả.

```
Client
  │  POST /check
  ▼
FastCheck API (Fastify, stateless)───▶ Redis (cache, lock, rate-limit)
  │  push job
  ▼
RabbitMQ (job.pending / job.retry / job.dlq)
  │  consume
  ▼
Orchestrator (NestJS + WS Gateway)──▶ PostgreSQL (nguồn sự thật)
  │  WS: RUN {url, cookie}          └▶ Observability (ELK + Prom/Grafana)
  ▼
Worker node (Client App)  ── 1 profile · 1 vân tay · 1 proxy ──┐
  Python worker → GemLogin (antidetect) → DrissionPage (attach CDP)
  ▼
Target platforms: TikTok · Facebook · X · YouTube (anti-bot)
```

## Vì sao mỗi công nghệ

| Tầng | Công nghệ | Vấn đề nó giải quyết |
|---|---|---|
| API | Fastify | Trả `<500ms` khi cache hit; API mỏng, async nên chịu burst tốt |
| Cache/Lock | Redis (ioredis) | Không check lại URL vừa check; chống stampede; rate-limit theo platform/profile |
| Queue | RabbitMQ (amqplib) | Tách đồng bộ, hấp thụ tải đỉnh, retry backoff, DLQ, không mất job |
| Orchestrator | NestJS + WS | Cân tải, chống cấp quá năng lực máy, auto-switch khi block |
| Data store | PostgreSQL | Nguồn sự thật vòng đời job & pool; claim profile atomic |
| Observability | ELK + Prom/Grafana | Truy vết 1 job xuyên hệ thống; phát hiện detector vỡ sớm |
| Client App | Python WS client (websockets) | Chạy script sát browser (nhanh, ổn định); chống treo |
| Antidetect | GemLogin | Mỗi profile 1 vân tay + 1 proxy → chống ban hàng loạt |
| Automation | DrissionPage (attach CDP endpoint GemLogin, Python) | Điều khiển DOM, vote LIVE/DEAD/INCONCLUSIVE, chính xác ≥98% |

## Bốn nguyên tắc kiến trúc

1. **API stateless** → nhân bản nhiều instance sau load balancer.
2. **RabbitMQ chỉ là kênh vận chuyển**, không phải DB. Trạng thái vòng đời job ở bảng `check_jobs` (INV-4).
3. **Server gửi lệnh cấp cao** (`RUN script X với cookie Y`) cho máy trạm; máy trạm chạy DrissionPage *local*. Không điều khiển DOM qua CDP xuyên internet (INV-12).
4. **Mọi thao tác mang `trace_id`** từ đầu tới cuối.

## Hai con số "50 concurrent" khác nhau

Phải tách bạch (spec §3.3):
- **50 concurrent ở API** — dễ. API async (nhận → đẩy queue → trả `202` + `trace_id`), một instance Fastify thừa sức nghìn req/s.
- **50 check thật song song** — khó, tốn tài nguyên = 50 browser đang chạy. Đảm bảo bằng: tổng `max_concurrency` các station ONLINE ≥ 50; backpressure qua queue; Orchestrator chỉ cấp job cho station còn slot; mở rộng ngang bằng thêm máy trạm; **load test bắt buộc** (k6/Locust) — con số chỉ đáng tin khi đã đo.

## Chống điểm chết đơn (SPOF)

Orchestrator tách state (registry station, pool) xuống Redis/PostgreSQL để chạy đa instance; station tự reconnect. Không để bất kỳ thành phần nào là điểm chết cứng — mất Redis thì chậm chứ không sai (INV-5).

## Ba vấn đề cốt lõi (đọc spec §3 khi động tới)

1. **Bypass mà không bị ban** — bốn lớp tín hiệu: vân tay, mạng/proxy, hành vi giống người, nhịp độ/cooldown. Không có bypass "vĩnh viễn"; mục tiêu là *giảm tỷ lệ ban* và *phát hiện nhanh khi bị siết*.
2. **Chia RAM/CPU & chống trùng vân tay** — N browser độc lập chứ không N tab; đóng browser sau job; stagger khi mở (INV-6, INV-9).
3. **Chịu tải ≥50 đồng thời** — như trên.

## Liên kết

- Data model chi tiết: `docs/data-model.md`
- Vòng đời job: `docs/job-lifecycle.md`
- Luật bất biến: `docs/invariants.md`
- Bẫy hỏng âm thầm: `docs/anti-patterns.md`
- Quyết định kiến trúc: `docs/adr/`
