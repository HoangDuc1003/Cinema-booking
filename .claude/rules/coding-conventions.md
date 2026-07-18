# Rule — Coding conventions

> Mục 3 của biên bản đánh giá tính điểm trực tiếp phần này: "không có lỗi lint khi submit PR", "reviewer không phải nhắc convention quá 2 lần cùng một vấn đề", "PR mô tả rõ thay đổi và cách test". Tuân thủ để tiết kiệm vòng review.

## Ngôn ngữ & công cụ
- TypeScript strict mode toàn repo (`strict: true`, không `any` trừ khi có `// eslint-disable` kèm lý do).
- ESLint + Prettier. **Tự chạy `pnpm lint && pnpm typecheck` và sửa sạch TRƯỚC khi mở PR.**
- Node LTS. ESM modules.

## Đặt tên
- Biến/hàm: `camelCase`. Type/class/interface/enum: `PascalCase`. Hằng số môi trường: `UPPER_SNAKE`.
- File: `kebab-case.ts`. Test: `*.spec.ts` (unit), `*.golden.ts` (golden set detector).
- Enum giá trị: `UPPER_SNAKE` khớp DB (`AVAILABLE`, `INCONCLUSIVE`), lấy từ `packages/shared` — **không** định nghĩa lại enum rời rạc trong từng app.
- Đặt tên theo miền, dùng đúng từ vựng `docs/glossary.md`. Không đặt biến `dead` cho thứ thực ra là `inconclusive`. Không gộp `urlStatus` và `profileHealth` vào một biến `status` (INV-3).

## Cấu trúc
- Một file một trách nhiệm. Service = class/hàm thuần, tách khỏi I/O nơi có thể (dễ test).
- SQL chỉ ở `packages/db/repositories`. HTTP DTO / queue payload / WS message chỉ khai báo ở `packages/contracts` (zod), app import lại.
- Không biến global chia sẻ giữa các luồng worker; không dùng chung storage state (INV-6).

## Comment
- Comment tại chỗ logic không hiển nhiên, **giải thích "vì sao" chứ không "cái gì"**. Ví dụ tốt: `// INCONCLUSIVE, không DEAD: guard login fail nghĩa là cookie chết, không phải link chết`.
- Mỗi chỗ đụng tới một invariant, chú thích số hiệu (`// INV-2`) để reviewer và Claude truy được.

## Async & lỗi
- Không nuốt lỗi thầm lặng (`catch {}` trống là cấm — xem `error-handling-and-observability.md`).
- (Worker Python) Không dùng thread để điều khiển browser; dùng process pool (INV-10, ADR-0006).
- (Node services) Dùng `p-limit` cho giới hạn concurrency I/O-bound; (worker Python) dùng process pool = max_concurrency = prefetch.

## PR
- PR description: mô tả thay đổi + cách test (lệnh chạy, kết quả mong đợi). Nếu đụng detector: nêu golden set đã chạy và kết quả.
- Không commit secret, cookie, `.env`. Kiểm tra `git diff` trước khi commit.
- Commit message: `type(scope): mô tả` (`feat(detector): thêm vote engine cho youtube`).

## Python (apps/worker — ADR-0006)
- Python 3.12, deps bằng **uv**. Format **black**, lint **ruff**, type hint đầy đủ + **mypy** (tương đương "TS strict").
- File & hàm: `snake_case`; class: `PascalCase`; hằng: `UPPER_SNAKE`. Module theo miền (`detectors/`, `login/`, `browser/`).
- **Không `except:` trần / không nuốt lỗi** (tương đương lệnh cấm `catch {}` rỗng ở TS): bắt lỗi phải log kèm `trace_id`, phân loại (profile/target/hạ tầng), hoặc ném lại.
- Contract WS mirror bằng **pydantic**, khớp `packages/contracts` (zod là nguồn sự thật). Đổi contract → sửa zod trước, cập nhật pydantic.
- Concurrency: **process pool** (1 browser = 1 process), không thread điều khiển browser (INV-6/INV-10).
- Không log cookie/credential (INV-12). Worker không tự giải mã cookie (orchestrator lo — ADR-0006).
