# ADR 0005 — Truy cập DB bằng Kysely/Drizzle, không dùng Prisma cho tầng lõi

- **Trạng thái:** Đã quyết định (Accepted)

## Bối cảnh
Trái tim tính đúng đắn của hệ thống là câu claim profile atomic `FOR UPDATE SKIP LOCKED` (INV-11), chạy song song bởi tới 50 worker, đằng sau PgBouncer.

## Quyết định
Dùng **Kysely** (hoặc Drizzle) làm lớp truy cập DB, kèm trình migration versioned (node-pg-migrate hoặc migrator của Kysely). Toàn bộ SQL sống ở `packages/db/repositories`.

## Vì sao không Prisma
- **`SKIP LOCKED`**: Prisma không hỗ trợ trực tiếp; phải `$queryRaw` — mất type-safety đúng chỗ nhạy cảm nhất, và dễ viết sai.
- **PgBouncer transaction mode**: Prisma dựa vào prepared statements/connection quản lý riêng, hay xung đột với PgBouncer ở transaction pooling (giải pháp workaround làm phức tạp thêm).
- Kysely/Drizzle cho **type-safe + raw SQL liền mạch**: viết `FOR UPDATE SKIP LOCKED` tự nhiên mà vẫn có kiểu.

## Hệ quả
- Repository viết SQL tường minh — dễ đọc, dễ tối ưu index, khớp đúng câu trong `docs/data-model.md`.
- Migration có `up`/`down`, review được trong PR.
- Nếu sau này cần ORM cho phần CRUD đơn giản (dashboard), có thể thêm cục bộ, nhưng tầng job/profile giữ raw-SQL-first.
