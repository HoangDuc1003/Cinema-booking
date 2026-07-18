# ADR 0003 — INCONCLUSIVE là kết quả hạng nhất, tách url_status khỏi profile_health

- **Trạng thái:** Đã quyết định (Accepted)

## Quyết định
1. Kết quả check có ba nhánh bình đẳng: LIVE, DEAD, **INCONCLUSIVE**. Không mặc định DEAD khi thiếu tín hiệu. (INV-1)
2. Ghi riêng `url_status` (trạng thái target) và `profile_health` (sức khoẻ profile lúc check) — hai trường, hai enum tách biệt. (INV-3)

## Lý do
KPI cốt lõi là chính xác ≥98%. Nguồn sai lớn nhất và khó thấy nhất là nhầm "profile mình bị chặn / cookie chết" thành "link chết". Nếu chỉ có LIVE/DEAD và gộp hai chiều thông tin, hệ thống trả DEAD sai một cách âm thầm.

Tách INCONCLUSIVE cho phép đẩy job check lại bằng profile khác thay vì ghi kết quả sai. Tách url_status/profile_health cho phép chẩn đoán và cảnh báo (INCONCLUSIVE/BLOCKED tăng đột biến → detector vỡ hoặc bị siết).

## Hệ quả
- Detector bắt buộc có nhánh INCONCLUSIVE + guard đăng nhập (INV-2), skill `platform-detector`.
- Không cache INCONCLUSIVE.
- `check_logs` có cả hai cột; đây là "điểm cốt tử" của thiết kế.

Nguồn: spec §2.5, §4.5, §8.2, §8.5.
