# ADR 0002 — RabbitMQ chỉ là kênh vận chuyển, không phải nguồn trạng thái

- **Trạng thái:** Đã quyết định (Accepted)

## Quyết định
Trạng thái vòng đời job luôn nằm ở bảng `check_jobs` (Postgres). RabbitMQ chỉ truyền tải. Mất queue → nạp lại job PENDING từ `check_jobs`. (INV-4)

## Lý do
Nếu suy trạng thái từ "message còn trong queue hay không", một sự cố queue làm mất dấu vết job và không thể phục hồi. Tách kênh vận chuyển khỏi nguồn sự thật giúp hệ thống tự lành và truy vết được bằng `trace_id`.

## Hệ quả
- Consumer dùng **manual ack**: chỉ ack khi job hoàn tất và DB đã cập nhật. Worker chết giữa chừng → RabbitMQ requeue, không mất job.
- Không dùng độ dài queue làm "số job đang chạy" — con số đó ở `check_jobs`/registry.
- Redis cũng chỉ là trí nhớ ngắn hạn, không nguồn sự thật (INV-5).

Nguồn: spec §1, §6.2.
