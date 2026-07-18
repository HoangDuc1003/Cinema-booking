# Rule — Security

> Cookie/credential là tài sản nhạy cảm nhất của hệ thống. CDP là "chìa khoá điều khiển browser". Xử lý cả hai với kỷ luật cao nhất.

## Cookie & credential
- Cookie lưu **mã hoá AES-GCM** qua **một module duy nhất `packages/crypto`** (dùng chung giữa worker khi lưu cookie mới và orchestrator khi giải mã để gửi). Không tự viết lại AES ở nhiều nơi — dễ sai và khó xoay khoá. (`cookie_ciphertext` + `cookie_key_id`). Không lưu mật khẩu thô — chỉ nhãn nội bộ (`account_label`).
- Hỗ trợ **xoay khoá**: `cookie_key_id` cho phép giải mã cookie cũ bằng khoá cũ sau khi đổi khoá mới. Đừng hardcode một khoá duy nhất.
- **Không log** cookie/credential ở bất kỳ đâu (console, ELK, error message). Redact trước khi log payload.
- Cookie inject phải đủ trường (`domain`, `path`, `expires`, `httpOnly`, `secure`, `sameSite`) — sai `domain`/`path` → browser bỏ qua trong im lặng (INV-2, `docs/anti-patterns.md`).
- Sau phiên thành công, **lưu lại cookie mới đã mã hoá** để refresh session (spec §4.4).

## CDP & WebSocket
- File Excel yêu cầu Client **forward CDP/websocket** → forwarding là bắt buộc có. Điều cấm là để **CDP thô, không xác thực, ra internet công cộng** — ai bắt được cũng điều khiển được browser của bạn (INV-12).
- Cách đúng: bọc CDP trong **WSS + token xác thực**, ưu tiên giữ trong **mạng nội bộ / qua tunnel**; **mặc định chạy script login local** rồi trả kết quả, chỉ forward CDP khi thật cần server truy cập trực tiếp.
- WS station ↔ orchestrator: WSS + token. Lệnh idempotent + `command_id` (INV-14).

## Bí mật & cấu hình
- Không commit `.env`, khoá, token, cookie. Dùng biến môi trường / secret manager.
- `proxy_url_enc` mã hoá credential proxy.
- Rate-limit theo client ở API để chống một client spam.

## Pháp lý & phạm vi (spec §7)
Tự động hoá + bypass anti-bot có thể vi phạm ToS nền tảng và quy định truy cập dữ liệu. Giới hạn đúng mục đích được duyệt: **kiểm tra trạng thái link**. Không mở rộng sang thu thập dữ liệu người dùng. Nếu một yêu cầu tính năng vượt phạm vi này, nêu ra để bàn với quản lý/pháp chế thay vì tự triển khai.
