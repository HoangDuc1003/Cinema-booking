---
name: platform-detector
description: Hướng dẫn viết và sửa detector phân loại trạng thái LIVE/DEAD/INCONCLUSIVE của link cho TikTok, Facebook, X/Twitter, YouTube trong dự án FastCheck. BẮT BUỘC dùng skill này bất cứ khi nào bạn thêm mới, sửa, hoặc debug logic phân loại trạng thái target, thêm platform mới, thay đổi selector, xử lý guard đăng nhập, hoặc động tới file trong apps/worker/src/fastcheck_worker/detectors — kể cả khi yêu cầu chỉ nói mơ hồ như "làm detector", "check link sống chết", "fix cái phân loại". Đây là phần chiếm 40% điểm dự án và trực tiếp quyết định KPI chính xác 98%.
---

# Skill — Platform Detector

Detector quyết định độ chính xác 98% của cả hệ thống. Sai một detector = sai KPI. Skill này gói lại các luật đọc kết quả để bạn không rơi vào bẫy "hỏng âm thầm".

## Luật vàng (không thoả hiệp)

1. **Ba nhánh, luôn có INCONCLUSIVE.** Kết quả ∈ {LIVE, DEAD, INCONCLUSIVE}. Không khớp chắc chắn cả LIVE lẫn DEAD → `INCONCLUSIVE`. **Không bao giờ** `else return DEAD`. (INV-1)
2. **Guard đăng nhập trước tiên.** Sau inject cookie + load, xác minh đã đăng nhập (selector avatar/menu) TRƯỚC khi đọc gì về target. Chưa đăng nhập → lỗi profile → `INCONCLUSIVE` + mark profile, KHÔNG đọc target rồi báo DEAD. (INV-2)
3. **Vote đa tín hiệu.** Kết luận = tổng hợp `HTTP status` + `DOM element` + `URL cuối cùng`. Không dựa một selector. (INV-8)
4. **Selector bền + fallback.** Ưu tiên role/aria/testid. Selector class hardcode là nguồn hỏng âm thầm số 1.
5. **Soft-404.** HTTP 200 vẫn có thể là "không tồn tại" — kiểm tra cả nội dung, không chỉ status.
6. **Chống race.** chờ selector hiển thị (DrissionPage `page.wait.ele_displayed`) cụ thể với timeout hợp lý (tổng < 3 phút). Trang chưa render xong mà đọc DOM → false DEAD.
7. **Tách `url_status` và `profile_health`.** Detector trả cả hai, riêng biệt. (INV-3)

## Quy trình khi thêm/sửa detector

1. Đọc `docs/invariants.md` (INV-1,2,3,8) và `docs/anti-patterns.md` (ba silent failure lớn).
2. Detector kế thừa interface chung ở `apps/worker/src/fastcheck_worker/detectors/base` — dùng lại guard đăng nhập + vote engine, **không copy-paste** logic giữa các platform.
3. Xác định các loại target của platform (post/profile/group/page/video/channel) — mỗi loại một bộ tín hiệu.
4. Với mỗi loại, khai báo tín hiệu LIVE, tín hiệu DEAD, tín hiệu BLOCKED/CHALLENGE (bảng khởi đầu bên dưới).
5. Trả kết quả qua vote engine, không `if/else` trực tiếp ra kết luận.
6. **Chạy `pnpm test:golden`** — bắt buộc. Thêm case mới vào golden set nếu sửa hành vi.

## Bảng tín hiệu khởi đầu (spec §8.5 — PHẢI health-check định kỳ, nền tảng đổi liên tục)

| Nền tảng | LIVE | DEAD | BLOCKED / CHALLENGE |
|---|---|---|---|
| TikTok | video player render, nội dung hiển thị | HTTP 404, "video currently unavailable" | Cloudflare turnstile, captcha, redirect login |
| Facebook | tên profile/page, nội dung post | "content isn't available", "page not found" | checkpoint, yêu cầu xác minh SĐT |
| X (Twitter) | tweet/nội dung render | "this post doesn't exist / was deleted" | login wall, captcha |
| YouTube | player + tiêu đề video | "video unavailable", "channel terminated" | trang consent/verify bất thường |

> Bảng này là điểm khởi đầu, không phải chân lý. Nền tảng đổi cơ chế bất cứ lúc nào → detector sẽ vỡ. Đó là lý do golden set + alert khi INCONCLUSIVE/BLOCKED tăng đột biến tồn tại.

## Mẫu logic đúng (giả mã)

```python
def detect(page, target) -> DetectResult:
    # 1. GUARD trước — INV-2
    if not verify_logged_in(page):
        return DetectResult(url_status='INCONCLUSIVE', profile_health='CHALLENGED')
    # 2. thu tín hiệu (DrissionPage: gói tin cho HTTP status, DOM cho element)
    signals = Signals(
        http=page.response.status,       # status gói tin (DrissionPage listen/packet)
        final_url=page.url,
        dom=collect_dom_signals(page),   # selector bền + fallback (page.ele)
    )
    # 3. phát hiện block/challenge TRƯỚC khi kết luận target
    if is_blocked(signals):
        return DetectResult(url_status='INCONCLUSIVE', profile_health='BLOCKED')
    # 4. VOTE — INV-1, INV-8
    vote = vote_engine(signals)  # 'LIVE' | 'DEAD' | 'INCONCLUSIVE'
    return DetectResult(url_status=vote, profile_health='OK')
    # KHÔNG có nhánh 'else DEAD' ẩn ở đâu cả.
```

## Sai lầm hay gặp (đừng lặp lại)
- Coi chờ selector hiển thị (DrissionPage `page.wait.ele_displayed`) timeout là DEAD → phải là INCONCLUSIVE.
- Bỏ guard để "chạy nhanh".
- Một selector duy nhất quyết định tất cả.
- Cache INCONCLUSIVE (cấm).
- Bắt exception rồi trả DEAD.

Xem thêm: `docs/anti-patterns.md`, spec `§4.5`, `§8.5`.
