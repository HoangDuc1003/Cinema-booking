# Station Management — Thiết kế chi tiết (Hạng mục 2, Excel §mục 2)

> Tài liệu này lấp khoảng trống: mô tả chi tiết cách hiện thực Hạng mục 2 (40% điểm) và **ánh xạ từng dòng yêu cầu Excel** sang thiết kế + tiêu chí nghiệm thu. Đọc kèm `apps/orchestrator/CLAUDE.md`, `apps/worker/CLAUDE.md`, `docs/invariants.md` (INV-9, INV-12, INV-14, INV-15), và spec §4.7–§4.9. Ánh xạ code sang Phase 4 của `docs/roadmap.md`.

## 0. Station Management là gì trong hệ thống

Là **lớp điều khiển đội máy trạm**: Server (Orchestrator) biết có những máy nào đang online, mỗi máy có profile gì, và gửi lệnh xuống máy để mở/tắt browser, CRUD profile GemLogin, chạy kịch bản đăng nhập. Client App (Worker) là tác nhân chạy trên từng máy trạm, nhận lệnh và thực thi tại chỗ.

Ranh giới trách nhiệm:
- **Server** = *ra lệnh & theo dõi*. Không tự chạy browser. Giữ trạng thái đội máy + pool profile ở Postgres/Redis.
- **Client** = *thực thi tại máy*. Điều khiển GemLogin + DrissionPage cục bộ, giữ kịch bản login phía mình, báo trạng thái/tiến trình về Server.

## 1. Kết nối & đăng ký (WebSocket realtime)

**Giao thức:** WebSocket (WSS + token) giữa Client và Server. Một kết nối bền, hai chiều: Server → Client gửi lệnh; Client → Server gửi đăng ký, heartbeat, kết quả, tiến trình.

**Vòng đời kết nối:**
1. Client khởi động → mở WS tới Server kèm token xác thực.
2. Gửi `register`: `{ station_id, name, mac_address, ip_address, agent_version, max_concurrency }`. **Đăng ký thành công = "mở station management"** cho máy đó (đúng yêu cầu Excel). Server ghi/cập nhật bảng `stations`, đặt `status = ONLINE`.
3. Client gửi `heartbeat` ~10s/lần; Server cập nhật `last_ping_at`, `current_load`.
4. Mất kết nối → Client **tự reconnect** (exponential backoff) rồi `register` lại. Server quá ngưỡng không nhận heartbeat → `status = OFFLINE` + thu hồi job (mục 6).

**Message envelope chung** (khai ở `packages/contracts`, zod): mọi message mang `type`, `trace_id` (nếu gắn job), và lệnh Server→Client mang thêm `command_id` để idempotent (INV-14).

## 2. Registry máy trạm phía Server

Server duy trì **registry** = ai đang online, tải bao nhiêu, phiên bản agent nào. Nguồn bền vững ở bảng `stations` (Postgres); bản realtime nhanh ở Redis. Dùng để: (a) cấp job cho máy còn slot (`current_load < max_concurrency`), (b) hiển thị dashboard, (c) phát hiện máy chết.

> Vì sao cả Postgres lẫn Redis: Redis cho tra cứu realtime nhanh; Postgres là nguồn sự thật để nếu Server restart mất registry RAM vẫn khôi phục được (INV-5).

## 3. Đồng bộ danh sách profile GemLogin (Station → Server)

Client hỏi API local của GemLogin để lấy danh sách profile trên máy, rồi đẩy lên Server (lúc đăng ký + định kỳ + sau mỗi lệnh CRUD). Server đối chiếu và cập nhật bảng `profiles` (gắn `assigned_station_id`). Nhờ vậy Server biết **profile nào nằm ở máy nào** để cấp job đúng chỗ.

Xử lý xung đột: profile định danh bằng id GemLogin + `station_id`. Profile có trên Server nhưng không còn trên máy → đánh dấu để rà (có thể máy đã xoá). Last-write-wins theo mốc đồng bộ.

## 4. Giao thức lệnh điều khiển (Server → Client)

Tất cả lệnh **idempotent + mang `command_id`** (INV-14): Client lưu các `command_id` đã xử lý, nhận trùng thì bỏ qua và trả lại kết quả cũ (mạng chập chờn gửi lại "mở browser" 2 lần chỉ mở 1). Mỗi lệnh có `ack` (đã nhận) và `result` (đã xong/không xong + lý do).

Các lệnh:

| Lệnh | Payload chính | Client làm gì | Kết quả trả về |
|---|---|---|---|
| `profile.create` | thông tin profile (vân tay, proxy, cookie đã mã hoá) | Gọi API GemLogin tạo profile | id profile mới + đồng bộ lại danh sách |
| `profile.update` | profile_id + thay đổi | Gọi API GemLogin sửa | ok/lỗi |
| `profile.delete` | profile_id | Gọi API GemLogin xoá | ok/lỗi + đồng bộ lại |
| `browser.open` | profile_id | Import+inject cookie → mở GemLogin → lấy CDP endpoint | trạng thái + (tuỳ chọn) kênh CDP đã forward |
| `browser.close` | profile_id / pid | Đóng browser, kill cây tiến trình (INV-9) | ok |
| `script.run` | job/`trace_id`, url, platform, cookie | Chạy kịch bản login + detector, stream tiến trình | url_status + profile_health |

Toàn bộ payload/kết quả khai ở `packages/contracts`.

## 5. Mở browser + forward CDP/WebSocket

**Thứ tự bắt buộc khi mở** (đây là yêu cầu tối thiểu của Excel — cookie phải nạp *trước* khi mở/chạy script):
1. Import + **inject cookie đã giải mã** (`context.addCookies`) — **trước** khi điều hướng (INV-2).
2. Mở browser qua GemLogin (vân tay + proxy sticky riêng của profile).
3. Lấy **CDP endpoint** GemLogin phơi ra; DrissionPage attach vào CDP endpoint.
4. Nếu cần Server/automation điều khiển trực tiếp → **forward kênh CDP/WebSocket** về Server.

**Forward CDP an toàn (INV-12) — hoà giải yêu cầu Excel với bảo mật:** Excel *yêu cầu* forward CDP/websocket, nên tính năng này bắt buộc có. Điều cấm là để CDP **thô, không xác thực, ra internet công cộng**. Cách đúng: bọc kênh forward trong **WSS + token**, ưu tiên giữ trong **mạng nội bộ / qua tunnel**; **mặc định chạy kịch bản login local** rồi trả kết quả, chỉ forward CDP trực tiếp khi thật sự cần. Tức là: forward CÓ, nhưng luôn có lớp xác thực + mã hoá.

## 6. Phát hiện máy chết & thu hồi job (INV-15)

Server quá ngưỡng không nhận heartbeat của một station → `status = OFFLINE`. Tìm mọi `check_jobs` đang `RUNNING` có `assigned_station_id` = máy đó (ba cột dispatch trên `check_jobs`) → **re-queue** + trả profile về pool + clear cột dispatch. Không chỉ dựa registry RAM: nếu Server restart mất registry, `check_jobs` vẫn cho biết job nào treo ở đâu.

## 7. Module kịch bản đăng nhập (phía Client)

**Kịch bản login lưu phía Client** (đúng yêu cầu Excel), trong `apps/worker/src/login`. Interface chung `login(context, credential) -> LoginResult`, mỗi platform (Facebook, YouTube, TikTok, X) một hiện thực. Server chỉ **gọi** ("station, chạy script login platform X cho job này"); Client tự chạy tại máy và stream tiến trình về. Login-by-cookie cho cả 4; login-by-info cho TikTok & X khi cookie chết (gõ mô phỏng người, xử lý captcha/OTP). Sau phiên thành công, cookie mới được mã hoá (`packages/crypto`) và đồng bộ lên Server.

## 8. Dashboard (điểm cộng, Excel "tốt hơn nếu có")

Server phơi dữ liệu realtime qua WS/SSE cho một dashboard React:
- Danh sách station + `status`/`current_load`/`max_concurrency`/`agent_version`/`last_ping_at`.
- Danh sách profile trên từng station + trạng thái pool (AVAILABLE/IN_USE/COOLDOWN/DEAD/BLOCKED), `health_score`.
- **Stream tiến trình job đang chạy** theo `trace_id` (đang ở bước nào: mở browser → login → detect).
- Tỷ lệ LIVE/DEAD/**INCONCLUSIVE** (hiển thị đủ 3, không gộp — INV-1/INV-3), cảnh báo khi block tăng.
Không hiển thị/trả cookie/credential (INV-12).

## 9. Ánh xạ yêu cầu Excel → thiết kế → nghiệm thu

| Yêu cầu Excel (mục 2) | Thiết kế ở đây | Tiêu chí nghiệm thu |
|---|---|---|
| Client App realtime (WS) nhận lệnh | §1 | Client mở WS, nhận được lệnh Server đẩy xuống |
| Server quản lý danh sách + trạng thái station | §2 | Server liệt kê đúng station đang ONLINE; máy tắt → OFFLINE |
| Đồng bộ & quản lý profile GemLogin từ Station về Server | §3 | Danh sách profile trên máy khớp bảng `profiles` sau đồng bộ |
| Client nhận & thực thi thêm/sửa/xoá profile GemLogin | §4 (`profile.*`) | Gửi lệnh create/update/delete → profile trên GemLogin đổi tương ứng |
| Client nhận mở/tắt browser + forward CDP/WS | §4, §5 | `browser.open` mở đúng profile; kênh CDP forward được (WSS+token) |
| Module chạy kịch bản login (FB, YT, TT, X) | §7 | Server gọi → Client chạy script → đạt trạng thái đã đăng nhập |
| Đăng ký với server = mở station management | §1 (register) | Sau `register`, máy xuất hiện & điều khiển được |
| **Tối thiểu:** import + inject cookie trước khi mở & chạy | §5 bước 1 | Cookie được addCookies trước điều hướng; guard login pass |
| Server: quản lý station nào đang connect | §2 | Đúng như trên |
| Server: quản lý profile trên station | §3 | Đúng như trên |
| Server: gửi lệnh điều khiển browser | §4 | Lệnh open/close tới đúng máy, idempotent |
| Server: gọi station chạy script login | §7 | Đúng như trên |
| Lệnh idempotent (chống trùng) | §4 + INV-14 | Gửi cùng `command_id` 2 lần → 1 tác dụng |
| **Tốt hơn:** Dashboard theo dõi + stream tiến trình | §8 | Dashboard cập nhật realtime, stream bước đang chạy |

## 10. Luồng chính (tóm tắt tuần tự)

```
Đăng ký:      Client --WS register--> Server --ghi stations, ONLINE--> (dashboard thấy máy)
Đồng bộ:      Client --danh sách profile GemLogin--> Server --cập nhật profiles-->
CRUD profile: Server --profile.create/update/delete (command_id)--> Client --gọi API GemLogin--> ack+result
Mở & check:   Server --browser.open + script.run (trace_id, cookie)--> Client
              Client: inject cookie -> mở GemLogin -> DrissionPage attach CDP -> (forward CDP WSS+token)
                      -> chạy login script (client-side) -> guard -> detector vote
              Client --stream tiến trình + result (url_status, profile_health)--> Server --ghi check_logs-->
Máy chết:     Server không nhận heartbeat -> OFFLINE -> re-queue mọi RUNNING của máy (cột dispatch) -> trả profile
```

## Liên kết
`apps/orchestrator/CLAUDE.md`, `apps/worker/CLAUDE.md`, `docs/data-model.md` (stations, profiles, cột dispatch), `docs/invariants.md` (INV-9/12/14/15), `.claude/skills/worker-process-hygiene`, `docs/roadmap.md` (Phase 4).
