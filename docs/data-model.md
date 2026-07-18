# Data Model — PostgreSQL

> Nguồn sự thật của hệ thống. Khi cần schema chính xác để viết migration/repository, dùng file này + `packages/db`. Đừng suy đoán tên cột.

## Enum dùng chung (đặt ở `packages/shared`)

- `Platform`: `TIKTOK | FACEBOOK | TWITTER | YOUTUBE`
- `UrlStatus`: `LIVE | DEAD | INCONCLUSIVE`
- `ProfileHealth`: `OK | CHALLENGED | BLOCKED | THROTTLED`
- `ProfileStatus`: `AVAILABLE | IN_USE | COOLDOWN | DEAD | BLOCKED`
- `JobStatus`: `PENDING | RUNNING | DONE | FAILED | DEAD_LETTER`
- `StationStatus`: `ONLINE | OFFLINE | DRAINING`
- `ProxyType`: `RESIDENTIAL | MOBILE | DATACENTER`
- `ProxyStatus`: `ACTIVE | BANNED | COOLDOWN`

`UrlStatus` và `ProfileHealth` là hai enum TÁCH BIỆT (INV-3). Không hợp nhất.

## `stations` — máy trạm
```
id              UUID PK
name            VARCHAR(100)
mac_address     VARCHAR(255)
ip_address      INET
status          StationStatus         -- DRAINING = đang gỡ, không nhận job mới
max_concurrency INT                   -- số browser tối đa (theo RAM)
current_load    INT                   -- job đang chạy
agent_version   VARCHAR(50)
last_ping_at    TIMESTAMPTZ
```

## `proxies` — tách riêng khỏi profile
```
id            UUID PK
proxy_url_enc BYTEA                    -- credential mã hoá
type          ProxyType
region        VARCHAR(50)              -- khớp timezone/locale khi mở browser
status        ProxyStatus
fail_count    INT
```

## `profiles` — pool tài khoản/cookie
```
id                  UUID PK
platform            Platform
account_label       VARCHAR(100)       -- nhãn nội bộ; KHÔNG lưu mật khẩu thô
cookie_ciphertext   BYTEA              -- cookie mã hoá AES-GCM
cookie_key_id       VARCHAR(50)        -- id khoá (hỗ trợ xoay khoá)
proxy_id            UUID FK -> proxies
assigned_station_id UUID FK -> stations
status              ProfileStatus
health_score        SMALLINT           -- 0-100, giảm khi gặp challenge
lease_expires_at    TIMESTAMPTZ        -- hạn "thuê"; quá hạn tự trả về pool
cooldown_until      TIMESTAMPTZ        -- nghỉ tạm khi bị nghi ngờ
consecutive_fails   SMALLINT           -- vượt ngưỡng -> DEAD
last_used_at        TIMESTAMPTZ
```
Index claim: `(platform, status, cooldown_until) WHERE status = 'AVAILABLE'`.

## `check_jobs` — nguồn sự thật vòng đời job
```
id                  UUID PK
trace_id            UUID
target_url          TEXT
url_hash            VARCHAR(64)         -- sha256(URL đã chuẩn hoá); key cache + dedupe
platform            Platform
status              JobStatus
retry_count         SMALLINT
result              UrlStatus NULL
assigned_station_id UUID NULL FK -> stations   -- set khi RUNNING; để thu hồi khi station chết (INV-15)
assigned_profile_id UUID NULL FK -> profiles   -- profile đang chạy job này
dispatched_at       TIMESTAMPTZ NULL           -- lúc cấp job xuống station
created_at          TIMESTAMPTZ
finished_at         TIMESTAMPTZ
```
Chống job trùng: `UNIQUE(url_hash) WHERE status IN ('PENDING','RUNNING')`.
Reaper job treo: index `(status, assigned_station_id)` để tìm nhanh job `RUNNING` của một station vừa chết. Khi station `OFFLINE`, re-queue mọi `RUNNING` gắn station đó và clear ba cột dispatch (INV-15).

## `check_logs` — lịch sử (append-only, partition theo tháng)
```
id                BIGINT identity
trace_id          UUID
job_id            UUID FK -> check_jobs
profile_id        UUID FK -> profiles
target_url        TEXT
url_status        UrlStatus            -- kết quả TARGET
profile_health    ProfileHealth        -- sức khoẻ PROFILE lúc check
block_reason      TEXT NULL
response_time_ms  INT
checked_at        TIMESTAMPTZ
```
`PARTITION BY RANGE (checked_at)`; index `(profile_id, checked_at)`, `(trace_id)`.

> **`url_status` tách khỏi `profile_health` là điểm cốt tử** (INV-3): phân biệt "link chết thật" với "profile mình bị chặn nên tưởng link chết".

## Claim profile atomic (INV-11)
```sql
UPDATE profiles
SET status = 'IN_USE',
    lease_expires_at = now() + interval '5 minutes',
    assigned_station_id = :station_id
WHERE id = (
  SELECT id FROM profiles
  WHERE platform = :platform
    AND status = 'AVAILABLE'
    AND (cooldown_until IS NULL OR cooldown_until < now())
  ORDER BY health_score DESC, last_used_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```
`SKIP LOCKED` → 50 worker lấy song song không dẫm chân nhau. `lease_expires_at` → cron dọn mỗi phút trả profile `IN_USE` quá hạn về `AVAILABLE`.

## Công cụ truy cập DB (khuyến nghị)
- Dùng **Kysely** (query builder type-safe) hoặc **Drizzle** + trình migration (**node-pg-migrate** hoặc migrator sẵn của Kysely/Drizzle). Cả hai cho viết raw SQL dễ dàng — cần thiết cho câu claim `FOR UPDATE SKIP LOCKED`.
- **Tránh Prisma cho tầng này:** Prisma không hỗ trợ `SKIP LOCKED` trực tiếp (phải `$queryRaw`, mất type-safety đúng chỗ cần nhất), và connection model của nó hay xung đột với PgBouncer ở transaction mode. INV-11 là trái tim của hệ thống — đừng để ORM cản.
- SQL chỉ sống ở `packages/db/repositories`. App gọi repository, không rải SQL khắp nơi.

## Vận hành DB (spec §6.4)
- **Cron dọn lease** mỗi phút: `UPDATE profiles SET status='AVAILABLE' WHERE status='IN_USE' AND lease_expires_at < now()`.
- **Partition `check_logs` theo tháng**: query lịch sử nhanh; xoá dữ liệu cũ bằng drop partition (rẻ).
- **PgBouncer**: giới hạn số kết nối tới Postgres khi nhiều worker/instance.
