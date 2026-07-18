# Anti-patterns — Danh mục "hỏng âm thầm" và cách né

> Đọc khi làm detector, cookie injection, proxy, hoặc dọn tiến trình. Mỗi mục là một cách hệ thống *trông như đang chạy bình thường* trong khi trả sai. Đây là kẻ thù số 1 của KPI 98%. Nguyên tắc mẹ: **biến hỏng âm thầm thành hỏng có báo động.**

## Bảng đối chiếu nhanh

| Anti-pattern (SAI) | Biểu hiện âm thầm | Cách đúng |
|---|---|---|
| `else return DEAD` khi không thấy tín hiệu LIVE | Link sống bị ghi DEAD, không ai biết | Trả `INCONCLUSIVE` (INV-1) |
| Bỏ guard đăng nhập | Cookie chết → trang guest → tưởng link chết | Verify login trước khi đọc target (INV-2) |
| Một selector hardcode | Nền tảng đổi class → selector rỗng → sai lặng lẽ | Vote đa tín hiệu + selector bền + golden set (INV-8) |
| Chỉ check HTTP status | Soft-404 (HTTP 200 + "không tồn tại") bị bỏ sót | Kiểm tra cả nội dung |
| Đọc DOM trước khi render xong | False DEAD do race | `wait_for_selector` cụ thể, timeout hợp lý (<3′) |
| Cache kết quả INCONCLUSIVE | Lỗi tạm được "đóng băng" thành kết quả | Không cache INCONCLUSIVE |
| Xoay IP giữa phiên | Tín hiệu chiếm tài khoản → challenge/ban | Sticky proxy per profile (INV-7) |
| Kill mỗi PID cha | Tiến trình con sót → rò RAM bò lên → máy sập | Kill process group; reap zombie (INV-9) |
| Prefetch > số browser chạy nổi | Worker nhận quá tải → sập RAM | Prefetch = pool size = max_concurrency (INV-10) |
| Đọc-rồi-ghi để claim profile | Hai worker claim cùng profile | `FOR UPDATE SKIP LOCKED` atomic (INV-11) |
| Suy trạng thái job từ queue | Sự cố queue → mất dấu job | Trạng thái ở `check_jobs` (INV-4) |
| Cookie thiếu domain/path | Browser bỏ qua cookie trong im lặng → chưa login | Cookie đủ trường; guard bắt được (INV-2) |
| Không normalize URL trước hash | Cache miss giả, chạy dư | Normalize rồi mới hash (INV-13) |
| Log cookie để debug | Rò tài sản nhạy cảm nhất | Không bao giờ log credential (INV-12) |

## Ba "silent failure" nguy hiểm nhất, giải thích kỹ

### 1. Cookie chết → DEAD sai (spec §8.2)
Cookie hết hạn/sai `domain`/`path` → browser bỏ qua cookie *trong im lặng*, mở ra trạng thái chưa đăng nhập. Nền tảng trả trang guest hoặc redirect login. Không có guard, detector đọc trang guest và kết luận "link chết". Kết quả sai này trông y hệt một DEAD thật.
→ **Guard đăng nhập (INV-2) là chốt chặn quan trọng nhất của detector.**

### 2. Selector vỡ → DEAD hàng loạt (spec §8.5)
Nền tảng đổi tên class. Selector hardcode trả rỗng. Nếu code làm `if (!found) return DEAD`, toàn bộ link bắt đầu bị ghi DEAD mà hệ thống vẫn "chạy bình thường", không có lỗi nào ném ra.
→ **Golden set chạy định kỳ** bắt việc này *trước khi* nó phá KPI. Không có golden set thì "98%" chỉ là cảm tính.

### 3. Proxy chết → INCONCLUSIVE âm thầm kéo tụt cả nhóm (spec §8.1)
Một proxy chết biểu hiện là "mọi check qua nó đều thành INCONCLUSIVE", âm thầm kéo tụt cả nhóm profile gắn với nó.
→ Theo dõi `fail_count`/tỷ lệ fail **theo từng proxy** và **cảnh báo khi một proxy fail bất thường**, thay vì để nó lặng lẽ làm hỏng kết quả.

## Kỷ luật đọc kết quả detector (quan trọng hơn bản thân selector)

1. "Không tìm thấy tín hiệu nào" **≠** DEAD → `INCONCLUSIVE`.
2. Vote đa tín hiệu: HTTP status + DOM element + URL cuối. Không dựa 1 selector.
3. Bảng tín hiệu (spec §8.5) là **điểm khởi đầu**, phải health-check định kỳ vì nền tảng đổi liên tục.
4. Ưu tiên selector bền (role/aria/testid), có fallback.
5. Alert khi tỷ lệ INCONCLUSIVE/BLOCKED tăng đột biến — đó là dấu hiệu detector vỡ hoặc bị siết.

## Quyết định đã cân nhắc: Reverse API — CHƯA dùng làm đường chính (spec §8.7)
Nhanh và nhẹ RAM, nhưng các app lớn ký request chống bot (`X-Bogus`/`msToken`…) đổi liên tục; khi chữ ký vỡ, hệ thống **hỏng trong im lặng và không có DOM để fallback** — mâu thuẫn trực tiếp với triết lý chống hỏng âm thầm. Giữ browser (GemLogin + DrissionPage) làm đường chính. Reverse API chỉ *thử nghiệm* làm đường nhanh phụ, và **luôn có browser làm fallback**. Xem `docs/adr/0001`.
