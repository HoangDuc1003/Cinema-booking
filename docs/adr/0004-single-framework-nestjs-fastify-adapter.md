# ADR 0004 — Cân nhắc gộp về một framework: NestJS dùng Fastify adapter

- **Trạng thái:** Đề xuất (Proposed — cần chốt với mentor)

## Bối cảnh
Spec gốc tách: API dùng Fastify (mỏng, nhanh), Orchestrator dùng NestJS (có cấu trúc, WS Gateway). Với một dev làm trong ~2 tháng, chạy **hai framework Node** làm đôi bề mặt cấu hình/học tập (2 kiểu bootstrap, 2 kiểu middleware, 2 kiểu test).

## Lựa chọn đã cân nhắc
1. **Giữ nguyên**: Fastify cho API + NestJS cho Orchestrator. Đúng spec, tối ưu độ mỏng của API.
2. **Gộp về NestJS + `@nestjs/platform-fastify`** cho cả API lẫn Orchestrator. NestJS chạy trên nhân Fastify → vẫn hưởng tốc độ Fastify, nhưng một mô hình module/DI/test duy nhất.

## Khuyến nghị
Nghiêng về **(2)** cho bối cảnh solo/thử việc: giảm tải nhận thức, dùng lại guard/interceptor/pipe/DI, một cách viết test. API vẫn `<500ms` cache hit vì nhân là Fastify. `packages/contracts` (zod) giữ nguyên giá trị ở cả hai lựa chọn.

Đổi lại: NestJS nặng hơn Fastify trần một chút về khởi động và boilerplate. Với API cực mỏng thuần route, đây là chi phí nhỏ.

## Quyết định
Nếu mentor/đề bài **không bắt buộc** Fastify trần cho API → chọn (2). Nếu có ràng buộc → giữ (1); `packages/contracts` đảm bảo hai app vẫn khớp type. Dù chọn gì, **không chạy framework thứ ba**.

## Hệ quả
- Chọn (2): `apps/api` là một Nest app tối giản (vài controller), khởi động bằng Fastify adapter.
- `docs/tech-stack.md` và `apps/api/CLAUDE.md` ghi Fastify "(hoặc NestJS+Fastify adapter)" cho tới khi chốt.
