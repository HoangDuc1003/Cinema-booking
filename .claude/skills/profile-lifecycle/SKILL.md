---
name: profile-lifecycle
description: Hướng dẫn quản lý vòng đời profile trong FastCheck — claim atomic, lease/timeout, cooldown, health_score, auto-switch khi bị block, và sticky proxy. BẮT BUỘC dùng skill này khi bạn động tới trạng thái profile (AVAILABLE/IN_USE/COOLDOWN/DEAD/BLOCKED), viết query lấy profile từ pool, xử lý block/dead và chuyển profile dự phòng, quản lý proxy, hoặc làm việc trong apps/orchestrator/src/profile-pool. Kích hoạt kể cả khi yêu cầu chỉ nói "switch profile khi bị chặn", "lấy account từ pool", "quản lý cookie/proxy". Sai vòng đời profile gây kẹt pool, cháy tài nguyên, hoặc ban hàng loạt.
---

# Skill — Profile Lifecycle

Pool profile là tài sản đắt và hao mòn (acc + residential/mobile proxy). Quản lý sai làm cạn pool, kẹt job, hoặc bị ban chùm. Skill này gói các luật giữ pool sống lâu và an toàn.

## Máy trạng thái profile

```
AVAILABLE ──claim──► IN_USE ──xong OK──► AVAILABLE
    ▲                   │
    │ lease hết hạn     ├─ nghi ngờ/challenge ──► COOLDOWN ──hết cooldown──► AVAILABLE
    │ (cron dọn)        ├─ consecutive_fails vượt ngưỡng ──► DEAD (loại)
    └───────────────────┴─ nền tảng chặn ──► BLOCKED ──► COOLDOWN hoặc DEAD
```

## Luật (không thoả hiệp)

1. **Claim atomic.** Lấy profile bằng một câu `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, set `lease_expires_at` ngay trong đó. KHÔNG đọc-rồi-ghi hai bước. (INV-11) Câu chuẩn ở `docs/data-model.md` §claim và `packages/db/.../profile.repo.ts`.
2. **Lease chống kẹt.** Worker treo → không kịp trả profile → `lease_expires_at` hết hạn → cron mỗi phút trả `IN_USE` quá hạn về `AVAILABLE`. Luôn set lease khi claim.
3. **Cooldown thay vì giết ngay.** Gặp challenge → `COOLDOWN` + giảm `health_score`, KHÔNG chuyển `DEAD` liền. Chỉ `DEAD` khi `consecutive_fails` vượt ngưỡng. Giữ tuổi thọ pool là yếu tố chi phí sống còn.
4. **Ưu tiên profile khoẻ.** Claim `ORDER BY health_score DESC, last_used_at ASC` — chọn khoẻ nhất, nghỉ lâu nhất; xoay vòng cả pool để không profile nào bị dùng dồn dập.
5. **Sticky proxy.** Một profile bind một IP cố định xuyên vòng đời. KHÔNG xoay IP giữa phiên (INV-7). Nghi proxy lỗi → xoay proxy ở tầng cấp IP mới, không giữa phiên đang chạy.
6. **Một profile một job tại một thời điểm** (INV-6). Không dùng lại profile cho nhiều job song song, không clone.

## Auto-switch (spec §4.6)

Khi worker báo `profile_health = BLOCKED` hoặc timeout:
1. Orchestrator: `COOLDOWN` nếu nghi ngờ, `DEAD` nếu `consecutive_fails` vượt ngưỡng. Nghi proxy → cũng xoay proxy.
2. Claim profile mới **cùng platform** (câu atomic ở luật 1).
3. Re-queue job với `retry_count + 1` qua `job.retry` (backoff).
4. Vượt `max_retries` → DLQ + alert.

**Bẫy phải chặn:** switch vô hạn khi pool cạn → cháy tài nguyên. BẮT BUỘC có `max_retries` + **cảnh báo khi pool xuống thấp**. Đừng để vòng lặp switch chạy mãi.

## Health & cooldown gợi ý
- `health_score` giảm mỗi challenge; tăng dần khi các phiên thành công liên tiếp.
- Rate-limit theo platform + theo profile (token bucket Redis, `rl:{platform}:{profile}`) để không dùng dồn dập.
- Profile mới nên **warm-up** trước khi dùng để check (spec §3.1d).

## Circuit breaker liên quan (spec §8.6)
Khi tỷ lệ BLOCKED của một platform vượt ngưỡng trong cửa sổ trượt → mở circuit cho platform đó (API trả `503` + `retry_after`), bảo vệ pool khỏi bị "nướng sạch" khi nền tảng vừa đổi thuật toán. Khác DLQ (xử lý job lẻ); circuit breaker chặn thiệt hại diện rộng.

Xem thêm: `docs/data-model.md`, `docs/glossary.md` (mục profile & pool), spec `§2.6`, `§4.6`, `§8.1`, `§8.6`.
