---
name: worker-process-hygiene
description: Hướng dẫn quản lý tiến trình browser và tài nguyên ở máy trạm FastCheck — mở/đóng GemLogin, giới hạn concurrency với process pool, timeout cứng, kill tiến trình treo theo process group, reap zombie, chống rò RAM, và backpressure đồng bộ với RabbitMQ prefetch. BẮT BUỘC dùng skill này khi bạn viết/sửa code mở hoặc đóng browser, kill tiến trình, giới hạn số luồng song song, xử lý timeout job, giám sát RAM/PID, hoặc làm việc trong apps/worker/src/process hay apps/worker/src/concurrency. Kích hoạt kể cả khi yêu cầu chỉ nói "50 luồng không sập", "dọn browser treo", "máy trạm hết RAM". Lỗi ở đây gây rò RAM âm thầm và sập máy trạm.
---

# Skill — Worker Process Hygiene

Điều khiển browser là tác vụ **I/O-bound**, browser là tiến trình OS riêng biệt sinh nhiều tiến trình con. Quản lý sai gây rò RAM bò lên từ từ rồi sập máy — một silent failure kinh điển. Skill này gói các luật đúng về mặt hệ điều hành.

## Luật (không thoả hiệp)

1. **Process pool, KHÔNG thread điều khiển browser.** Browser đã là process OS riêng → dùng **process pool** (multiprocessing) giữ đúng N browser mở đồng thời: một job xong (đóng browser + giải phóng process) mới nạp job kế. Thread cách ly kém hơn process và không hợp khi mỗi browser là một process riêng (INV-6). (INV-10)
2. **N = `max_concurrency` = prefetch RabbitMQ.** Ba con số phải bằng nhau để backpressure nhất quán từ queue xuống browser. Prefetch cao hơn số browser chạy nổi → sập RAM. (INV-10)
3. **Timeout cứng ≤ 2 phút mỗi job.** Quá hạn → dọn.
4. **Kill theo process group.** Một browser sinh nhiều tiến trình con. Kill mỗi PID cha để sót con = rò RAM âm thầm. (INV-9)
5. **Reap zombie đúng cách.** `kill -9` **vô tác dụng** với zombie (đã chết, chờ cha reap). Cha phải `wait()`/reap con, hoặc chạy dưới init-reaper (`tini` / Docker `--init`).
6. **Đóng browser ngay sau job.** Giải phóng RAM; không giữ pool browser mở nếu không cần.
7. **Trả profile về pool sau khi dọn** (qua lease). Giải phóng slot.

## Máy trạm chạy HĐH nào? (đọc trước khi viết code kill)

GemLogin là ứng dụng desktop → **`apps/worker` gần như luôn chạy native trên Windows**, KHÔNG trong Docker. Chỉ `api`/`orchestrator` mới đóng Docker/Linux. Vì vậy code dọn tiến trình ở worker phải theo **Windows**, đừng bê nguyên `SIGKILL`/`tini` của Linux sang. Viết lớp `killProcessTree(pid)` tách theo `process.platform` để dễ test và không lẫn.

## Quy trình kill tiến trình treo (đúng OS)

**Nguyên tắc chung:** LUÔN kill **cả cây tiến trình con**, không chỉ PID cha. Một browser sinh nhiều tiến trình con; sót con = rò RAM âm thầm.

```
── WINDOWS (máy trạm GemLogin) ──
  Tiến trình treo:
    taskkill /PID <pid> /T /F        # /T = cả cây con, /F = force
  Hoặc bền hơn: gắn tiến trình con vào một Job Object khi spawn
    → đóng Job Object là toàn bộ con chết theo (không sót khi worker crash).
  KHÔNG có khái niệm zombie/reap kiểu Unix ở Windows.

── LINUX (nếu về sau chạy worker headless trên server) ──
  Tiến trình treo (hung):
    SIGTERM  → chờ ngắn (vài giây) → còn sống → SIGKILL
    Kill theo process group: kill -TERM -<pgid>, không chỉ PID cha.
  Tiến trình zombie (defunct):
    kill -9 vô dụng. Cha phải wait()/reap, hoặc chạy dưới tini/--init.
```

> Spawn browser cho phép kill cả cây: trên Windows dùng Job Object / `taskkill /PID <pid> /T /F`; liệt kê tiến trình con bằng **psutil** (`psutil.Process(pid).children(recursive=True)`) rồi terminate/kill. (Linux chỉ liên quan nếu về sau chạy headless: process group + SIGTERM→SIGKILL.)

## Chia RAM/CPU cho nhiều luồng (spec §3.2)

- Mỗi Chromium ~**300–600MB**. Đây là hằng số quyết định năng lực máy.
- `max_concurrency ≈ (RAM_khả_dụng − RAM_OS_và_app) / RAM_mỗi_browser`. Máy 16GB, chừa 4GB, 500MB/browser → ~24, đặt an toàn 18–20.
- Giảm tải mỗi browser: `route.abort()` cho ảnh/video/font không cần; tắt GPU nếu headless; `--disable-dev-shm-usage` trên Linux (tránh cạn `/dev/shm`).
- **Stagger** khi mở: lệch 200–500ms thay vì mở 20 browser cùng lúc (tránh nghẽn CPU lúc khởi động).
- Client App **giám sát PID + RAM thực tế**: browser vượt ngưỡng RAM hoặc quá timeout → kill (theo group) → giải phóng slot → trả profile.

## Giám sát & cảnh báo
- Theo dõi RAM tổng máy trạm; **alert khi vượt ngưỡng** — RAM bò lên từ từ là dấu hiệu kinh điển của rò tiến trình.
- Không đạt "50 concurrent" bằng cách nhồi 50 tab vào ít máy (vừa sập RAM vừa trùng vân tay), mà **phân bổ trên nhiều máy trạm** (INV-6).

## Sai lầm hay gặp (đừng lặp lại)
- Dùng thread (thay vì process) để chạy browser.
- `kill(pid)` chỉ PID cha (sót cây con).
- Bê `SIGKILL`/`tini` của Linux sang máy trạm Windows (sai HĐH — dùng `taskkill /T` hoặc Job Object).
- `kill -9` một zombie rồi tưởng đã dọn (chỉ đúng ngữ cảnh Linux; và kill -9 không dọn được zombie).
- Prefetch RabbitMQ đặt tuỳ tiện, không khớp pool size.
- Giữ browser mở "cho lần sau" làm rò RAM.

Xem thêm: `docs/invariants.md` (INV-9, INV-10), `docs/anti-patterns.md`, spec `§3.2`, `§8.3`, `§8.4`.
