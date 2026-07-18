# ADR 0001 — Dùng browser automation (GemLogin + browser thật) làm đường chính, không dùng Reverse API

- **Trạng thái:** Đã quyết định (Accepted)
- **Bối cảnh:** Cần kiểm tra trạng thái link ở quy mô lớn, chính xác ≥98%, chống anti-bot.

## Quyết định
Giữ browser thật (GemLogin + DrissionPage attach CDP — công cụ automation cụ thể xem ADR-0006) làm đường chính. Reverse API chỉ *thử nghiệm* làm đường nhanh phụ cho platform nào bóc tách ổn định, và **luôn có browser làm fallback**.

## Lý do
Reverse API nhanh (vài chục ms), nhẹ RAM. Nhưng các app lớn ký request chống bot (`X-Bogus`/`X-Gnarly`/`msToken`…) và đổi liên tục. Khi chữ ký vỡ, hệ thống **hỏng trong im lặng và không có DOM để fallback** — mâu thuẫn trực tiếp với triết lý chống hỏng âm thầm. Chi phí bảo trì cao, rủi ro ToS cao hơn.

Browser thật cho JA3/TLS giống người dùng thật (INV-7), có DOM để vote đa tín hiệu và fallback khi selector vỡ. Đổi độ trễ/RAM lấy độ tin cậy là đánh đổi đúng ở giai đoạn này.

## Hệ quả
- Tốn RAM (300–600MB/browser) → cần nhiều máy trạm, process hygiene chặt (skill `worker-process-hygiene`).
- Đây là lý do INV-6, INV-8 tồn tại.

> Công cụ automation cụ thể (DrissionPage/Python thay Playwright/Node) được chốt ở ADR-0006; ADR này chỉ khẳng định 'browser thật > reverse API'.

Nguồn: spec §8.7.
