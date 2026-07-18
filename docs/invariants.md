# Invariants — Luật bất biến của FastCheck

> Đây là file quan trọng nhất trong repo với Claude. Mỗi mục là một luật KHÔNG được vi phạm, kèm lý do và cách vi phạm điển hình (để nhận diện và né). Nếu một thay đổi code vi phạm bất kỳ luật nào ở đây, đó là bug nghiêm trọng — kể cả khi unit test vẫn xanh và người dùng không nhận ra ngay.
>
> Nguyên tắc mẹ của mọi luật: **một lỗi được báo ra luôn tốt hơn một lỗi âm thầm.**

---

## INV-1 — INCONCLUSIVE không bao giờ được biến thành DEAD

**Luật:** Kết quả check có ba nhánh: `LIVE`, `DEAD`, `INCONCLUSIVE`. Khi không tìm thấy tín hiệu chắc chắn cho LIVE lẫn DEAD → kết quả là `INCONCLUSIVE`. Không được mặc định DEAD, không được "làm tròn" thành DEAD cho gọn.

**Vì sao:** Đây là nền tảng của KPI 98%. "Không thấy tín hiệu sống" ≠ "đã chết". Captcha, login wall, trang lạ, selector đổi... đều làm ta không thấy tín hiệu — nhưng link vẫn sống. Nếu mặc định DEAD, ta trả sai một cách âm thầm và tự phá KPI.

**Vi phạm điển hình cần né:**
- `if (foundLive) return LIVE; else return DEAD;` — thiếu nhánh INCONCLUSIVE.
- Coi `wait_for_selector` timeout là "không tồn tại → DEAD".
- Bắt exception rồi trả DEAD cho "an toàn".

`INCONCLUSIVE` → đẩy lại queue để check bằng profile khác, **không** ghi kết quả cuối.

---

## INV-2 — Guard xác minh đăng nhập là chốt chặn bắt buộc

**Luật:** Sau khi `context.addCookies(...)` và điều hướng tới URL đích, PHẢI xác minh phiên đã đăng nhập (selector avatar/menu đặc trưng) **trước khi** đọc bất cứ tín hiệu nào về target. Nếu chưa đăng nhập → đây là lỗi profile (cookie hết hạn/sai) → trả `INCONCLUSIVE` + đánh dấu profile. **Tuyệt đối không** đọc target rồi báo DEAD.

**Vì sao:** Cookie chết → nền tảng trả trang guest hoặc redirect login. Không có guard, automation tưởng "link chết" và ghi DEAD sai. Đây là nguồn sai số 98% nguy hiểm và khó phát hiện nhất, vì nó trông y hệt một kết quả bình thường.

**Vi phạm điển hình:** Bỏ qua bước verify để "chạy nhanh hơn"; đặt guard *sau* khi đã đọc target.

---

## INV-3 — Tách `url_status` khỏi `profile_health`

**Luật:** Mỗi lần check ghi hai chiều thông tin riêng biệt vào `check_logs`:
- `url_status` ∈ {LIVE, DEAD, INCONCLUSIVE} — trạng thái của **target**.
- `profile_health` ∈ {OK, CHALLENGED, BLOCKED, THROTTLED} — sức khoẻ của **profile** lúc check.

Không được gộp hai khái niệm này vào một trường, một enum, hay một biến.

**Vì sao:** Đây là điểm cốt tử phân biệt "link chết thật" với "profile mình bị chặn nên tưởng link chết". Gộp chúng lại là xoá mất khả năng chẩn đoán và trực tiếp phá độ chính xác.

---

## INV-4 — Queue chỉ vận chuyển, không lưu trạng thái

**Luật:** RabbitMQ là kênh truyền tải job, **không phải database**. Trạng thái vòng đời job (PENDING/RUNNING/DONE/FAILED/DEAD_LETTER) luôn nằm ở bảng `check_jobs`. Mất queue → nạp lại job PENDING từ `check_jobs`.

**Vì sao:** Nếu suy luận trạng thái từ "message còn trong queue hay không", một sự cố queue sẽ làm mất dấu vết job và không thể phục hồi. Tách kênh vận chuyển khỏi nguồn sự thật giúp hệ thống tự lành.

**Vi phạm điển hình:** Dùng độ dài queue làm số job đang chạy; coi "đã ack" là "đã xong" mà không cập nhật DB.

---

## INV-5 — Postgres là nguồn sự thật; Redis là trí nhớ ngắn hạn

**Luật:** Mọi trạng thái bền vững (job, profile, proxy, station, log) sống ở Postgres. Redis chỉ giữ cache kết quả, lock chống stampede, rate-limit, registry station realtime. Mất Redis → hệ thống **chậm lại**, không được **sai**.

**Vì sao:** Redis cấu hình `allkeys-lru` và có thể mất key bất cứ lúc nào. Nếu một quyết định đúng/sai phụ thuộc vào việc key Redis còn hay không, ta có bug ngẫu nhiên khó tái hiện.

---

## INV-6 — Một job = một profile = một vân tay = một proxy = một browser context

**Luật:** Mỗi job chạy trong một browser context/instance GemLogin độc lập, với một vân tay cố định và một proxy riêng. Cấm:
- Mở nhiều target trong **cùng một context** (chia sẻ cookie + vân tay → nền tảng thấy 1 thiết bị truy cập hàng loạt → ban chùm).
- **Clone profile** rồi chạy song song (bản sao cùng vân tay).
- Dùng lại một profile cho nhiều job cùng lúc.

"Đa luồng độc lập" = N browser độc lập, KHÔNG phải N tab trong 1 browser. (worker Python: mỗi browser = 1 process riêng qua process pool — ADR-0006).

**Vì sao:** Trùng vân tay là nguyên nhân số 1 gây ban hàng loạt.

---

## INV-7 — Vân tay & proxy phải nhất quán và khớp geo

**Luật:**
- Một profile giữ **cùng một vân tay** qua các lần dùng (đổi vân tay liên tục = tín hiệu bot).
- Một profile bind **một residential/mobile IP sticky** xuyên suốt vòng đời. **Không xoay IP giữa một phiên** (đổi IP khi đang đăng nhập = tín hiệu chiếm tài khoản → challenge/ban).
- timezone/locale/ngôn ngữ của browser phải **khớp vùng IP** của proxy.

Rotating proxy chỉ dùng ở tầng "cấp IP mới cho profile mới", không dùng trong một phiên check.

---

## INV-8 — Selector giòn là cấm; luôn vote đa tín hiệu

**Luật:** Không dựa vào một selector hardcode duy nhất để kết luận. Kết quả LIVE/DEAD phải là kết quả **vote từ nhiều tín hiệu**: HTTP status + DOM element + URL cuối cùng. Ưu tiên selector bền (role/aria/testid), luôn có fallback.

**Vì sao:** Selector hardcode là nguồn hỏng âm thầm số 1 — nền tảng đổi class thì selector trả rỗng mà không báo lỗi, và (nếu vi phạm cả INV-1) bị hiểu nhầm thành DEAD. Golden set (`pnpm test:golden`) tồn tại để bắt selector vỡ *trước khi* nó phá KPI.

**Lưu ý soft-404:** Nhiều nền tảng trả HTTP 200 nhưng nội dung là "không tồn tại" → phải kiểm tra cả nội dung, không chỉ status code.

---

## INV-9 — Dọn tiến trình đúng cấp OS

**Luật:**
- Mỗi job có **timeout cứng** (≤ 2 phút). Quá hạn → dọn.
- Luôn **kill cả cây tiến trình con**, không chỉ PID cha (một browser sinh nhiều tiến trình con).
- **Trên Linux** (server API/Orchestrator trong Docker): `SIGTERM` → chờ ngắn → `SIGKILL` theo **process group**; zombie thì `kill -9` vô tác dụng, phải `wait()`/reap hoặc chạy dưới init-reaper (`tini` / Docker `--init`).
- **Trên Windows** (máy trạm chạy GemLogin — xem lưu ý bên dưới): kill cây bằng `taskkill /PID <pid> /T /F`, hoặc gắn tiến trình con vào một **Job Object** để đóng job là con chết theo. Khái niệm zombie/reap của Unix không áp dụng. Worker là Python: theo dõi cây tiến trình + RAM bằng **psutil**.
- Sau khi dọn: giải phóng slot + trả profile về pool qua lease.

**Vì sao:** Kill mỗi PID cha để sót con là nguồn rò RAM âm thầm — RAM bò lên từ từ rồi máy trạm sập. Đây là lỗi hệ điều hành rất hay bị hiểu sai, và cách dọn **khác nhau giữa Linux và Windows** nên đừng bê nguyên `SIGKILL`/`tini` sang máy trạm Windows. Xem skill `worker-process-hygiene`.

> **Lưu ý quan trọng về máy trạm:** GemLogin là ứng dụng desktop (thường chạy Windows), nên `apps/worker` gần như luôn chạy **native trên Windows**, KHÔNG trong Docker. Chỉ tầng server (`api`, `orchestrator`) mới đóng gói Docker/Linux. Mọi hướng dẫn `tini`/process-group Linux chỉ áp dụng cho server.

---

## INV-10 — Backpressure phải nhất quán từ queue xuống browser

**Luật:** Số process browser đồng thời ở worker = `max_concurrency` của máy = **đồng bộ với prefetch (`basic.qos`)** của RabbitMQ. Dùng manual ack: chỉ ack khi job hoàn tất. Worker Python thực thi bằng **process pool** (1 browser = 1 process); pool size = max_concurrency = prefetch.

**Vì sao:** Nếu prefetch cao hơn số browser máy chạy nổi, worker nhận job vượt khả năng → sập RAM. Backpressure nhất quán là nền tảng của KPI "50 concurrent không crash": tải vượt công suất thì job **xếp hàng trong queue**, hệ thống giảm tốc chứ không sập.

**Không dùng thread để điều khiển browser** (browser đã là tiến trình OS riêng; process pool cách ly tốt hơn thread và khớp INV-6). Thiết kế Node cũ dùng `p-limit`; nay là Python + process pool — xem ADR-0006.

---

## INV-11 — Claim profile phải atomic

**Luật:** Lấy profile từ pool bằng `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, kèm set `lease_expires_at`. Không đọc-rồi-ghi trong hai câu lệnh riêng.

**Vì sao:** `SKIP LOCKED` cho 50 worker lấy profile song song không dẫm chân nhau. Lease chống kẹt `IN_USE` khi worker treo (cron dọn trả profile quá hạn về `AVAILABLE`). Câu SQL chuẩn xem `docs/data-model.md` §claim.

---

## INV-12 — Cookie & credential là dữ liệu tối mật

**Luật:**
- Cookie lưu **mã hoá AES-GCM** (`cookie_ciphertext` + `cookie_key_id` hỗ trợ xoay khoá). Không lưu mật khẩu thô. Toàn bộ mã hoá đi qua một module duy nhất `packages/crypto` (không tự viết lại AES rải rác).
- **Không bao giờ log** cookie/credential ra ELK hay console.
- **CDP forwarding — hoà giải yêu cầu Excel với an toàn:** File Excel *yêu cầu* Client "forward CDP/websocket điều khiển trình duyệt", nên forwarding là **được phép và bắt buộc có**. Điều cấm là forward **CDP thô, không xác thực, ra internet công cộng** (ai bắt được cũng điều khiển browser của bạn). Cách đúng: bọc kênh CDP trong **WSS + token**, ưu tiên giữ trong **mạng nội bộ / qua tunnel**, và **mặc định chạy script login local** rồi trả kết quả — chỉ forward CDP khi thực sự cần server/automation truy cập trực tiếp. Tức là: forward CÓ, nhưng luôn có lớp xác thực + kênh mã hoá, không bao giờ để trần.

---

## INV-13 — Chuẩn hoá URL trước khi hash

**Luật:** Trước khi tính `url_hash = sha256(url)`, phải normalize: bỏ tracking param (`utm_*`, `fbclid`…), lowercase host, gỡ fragment, chuẩn hoá path. `url_hash` là key của cache và dedupe.

**Vì sao:** Không normalize → cùng một video ra hai hash → cache miss giả + chạy dư + có thể phá `UNIQUE(url_hash)` dedupe.

---

## INV-14 — Lệnh điều khiển station phải idempotent

**Luật:** Mọi lệnh WS (mở/tắt browser, CRUD profile, RUN) mang `command_id`. Station lưu các `command_id` đã xử lý; nhận lại lệnh trùng thì bỏ qua.

**Vì sao:** Mạng chập chờn gửi lại lệnh "mở browser" 2 lần chỉ được mở 1 browser.

---

## INV-15 — Station chết thì thu hồi job

**Luật:** Station ping ~10s/lần. Quá ngưỡng không ping → đánh `OFFLINE`, **thu hồi mọi job đang cấp** cho station đó và re-queue. Station tự reconnect (exponential backoff) rồi đăng ký lại.

**Muốn thu hồi được thì phải biết job nào đang ở station nào.** Khi dispatch một job (status `RUNNING`), ghi `assigned_station_id`, `assigned_profile_id`, `dispatched_at` vào `check_jobs` (nguồn sự thật, nhất quán với INV-4). Station chết → tìm mọi `check_jobs` `RUNNING` gắn station đó → re-queue + trả profile về pool. Đừng chỉ dựa vào registry in-memory của Orchestrator: nếu Orchestrator restart, registry mất, nhưng `check_jobs` vẫn cho biết job nào đang treo ở đâu.

---

## Khi invariant có vẻ cản trở

Các luật này đánh đổi tốc độ/độ gọn lấy độ tin cậy — đó là chủ ý. Nếu một yêu cầu tính năng có vẻ buộc phải phá một invariant, **đừng lặng lẽ phá**. Nêu mâu thuẫn ra, đề xuất phương án giữ được invariant, để con người quyết. Ghi lại quyết định thành một ADR mới trong `docs/adr/` nếu nó thay đổi luật.
