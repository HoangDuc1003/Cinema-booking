# Rule — Error handling & Observability

> Toàn hệ thống được thiết kế để **báo lỗi ra**, không để lỗi âm thầm. Code phải nối tiếp triết lý đó.

## Xử lý lỗi

- **`catch {}` trống là cấm.** Bắt lỗi thì phải: log kèm `trace_id`, quyết định kết quả có ý nghĩa, hoặc ném lại. Không nuốt.
- **Không bắt lỗi rồi trả DEAD** cho "an toàn". Lỗi không rõ nguồn gốc → `INCONCLUSIVE` (INV-1). DEAD chỉ khi có tín hiệu chắc chắn của cái chết.
- **Phân loại lỗi rõ ràng** ở tầng worker: lỗi profile (cookie hết hạn, bị challenge) ≠ lỗi target (link chết) ≠ lỗi hạ tầng (proxy chết, browser crash, timeout). Ba loại này dẫn tới ba hành động khác nhau (mark profile / ghi DEAD / re-queue).
- Timeout là một loại kết quả, không phải exception bị nuốt: job quá hạn → dọn tiến trình (INV-9) → re-queue.
- Retry có backoff qua `job.retry`, không retry tức thì (tránh dập liên tục vào profile/proxy đang lỗi). Vượt `max_retries` → DLQ + alert.

## Observability

- **Mọi log mang `trace_id`** để truy một job xuyên API → queue → worker → kết quả. Log vào ELK.
- **KHÔNG log cookie/credential/CDP endpoint** (INV-12). Nếu cần debug, log `cookie_key_id` hoặc profile id, không log giá trị.
- Ghi kết quả cuối vào `check_logs` với `url_status` và `profile_health` tách biệt + `block_reason` + `response_time_ms`.
- **Metric bắt buộc** (Prometheus): tỷ lệ LIVE/DEAD/**INCONCLUSIVE** theo platform, tỷ lệ BLOCKED, p95 latency check, RAM/CPU máy trạm, độ sâu queue, số profile theo trạng thái, `fail_count` theo proxy.
- **Alert bắt buộc**: INCONCLUSIVE/BLOCKED tăng đột biến (detector vỡ hoặc bị siết), một proxy fail bất thường, RAM máy trạm vượt ngưỡng (rò tiến trình), pool profile xuống thấp, job vào DLQ, circuit breaker mở.

## Vì sao khắt khe vậy
Một kết quả sai không kèm tín hiệu lỗi sẽ âm thầm ăn mòn KPI 98% và không ai biết cho tới khi khách hàng phàn nàn. Quy tắc ở đây tồn tại để mọi hỏng hóc đều phát ra tín hiệu ai đó nhìn thấy được. Xem `docs/anti-patterns.md`.
