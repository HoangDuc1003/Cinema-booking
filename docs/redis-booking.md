# Redis and booking concurrency

## Mục tiêu và source of truth

MongoDB là source of truth cho booking. Unique index `SeatReservation(show, seat)` bảo đảm chỉ có một reservation hoạt động cho mỗi ghế của một suất chiếu. Redis giảm tải read, cung cấp seat-hold TTL, giảm tranh chấp bằng distributed lock và chống xử lý đồng thời cùng một Stripe event; hệ thống vẫn dựa vào MongoDB invariant nếu Redis tạm mất.

MongoDB phải chạy dưới dạng replica set (MongoDB Atlas đáp ứng yêu cầu này) vì create, payment và cancel sử dụng transaction.
Booking creation và payment callback chờ `Booking.init()` cùng `SeatReservation.init()` hoàn tất. Movie/read APIs chỉ phụ thuộc kết nối MongoDB, nên lỗi migration booking index không làm toàn bộ catalog trả 503.

## Redis keys

Prefix mặc định là `nitrocine:v1`; có thể đổi phần `nitrocine` bằng `REDIS_KEY_PREFIX`.

| Key pattern | Nội dung | TTL mặc định |
|---|---|---:|
| `{prefix}:cache:movies:all` | danh sách movie có show/virtual | 300 giây |
| `{prefix}:cache:movies:now-playing` | TMDB now-playing | 300 giây |
| `{prefix}:cache:movie:{movieId}` | movie detail | 1.800 giây |
| `{prefix}:cache:cinemas:all` | danh sách hall/cinema | 600 giây |
| `{prefix}:cache:showtimes:{movieId}` | movie + showtimes bảy ngày | 120 giây |
| `{prefix}:cache:seat-map:{showId}` | mảng ghế paid/đang hold | 5 giây |
| `{prefix}:hold:show:{showId}:seat:{seat}` | booking ID đang giữ ghế | 1.800 giây |
| `{prefix}:lock:booking:{showId}` | random lock token | 10.000 ms |
| `{prefix}:lock:stripe-event:{eventId}` | random processing token | 30.000 ms |
| `{prefix}:idempotency:stripe:{eventId}` | marker `processed` | 604.800 giây |

Lock được release bằng compare-and-delete Lua script; một request không thể xóa lock/hold do request khác tạo.

## Luồng booking

1. Server normalize seat ID, loại duplicate, giới hạn tám ghế và tính lại giá từ `showPrice` + seat class.
2. Virtual/mock show được resolve thành Show thật.
3. Redis show-lock được acquire với thời gian chờ ngắn. Redis down thì flow tiếp tục vì DB unique index vẫn bảo vệ inventory.
4. Mongo transaction xóa hold hết hạn liên quan, tạo Booking pending và insert từng SeatReservation.
5. Chỉ một request insert được `(show, seat)`; duplicate key trả HTTP 409.
6. Sau commit, Redis seat-hold được ghi với TTL và seat-map/showtime cache bị invalidate.
7. Stripe callback verify signature, dùng event idempotency, confirm reservation, materialize `Show.occupiedSeats`, đánh dấu Booking paid và invalidate cache.
8. Cancel chỉ áp dụng cho booking chưa paid, xóa reservation trong transaction rồi xóa Redis hold/cache.

## Cache invalidation

| Mutation | Keys bị xóa |
|---|---|
| Add/import show/movie | movie list, now-playing, cinema list, movie/showtime liên quan |
| Create booking | seat-map theo actual ID/alias và showtime của movie |
| Payment success | seat-map và showtime của movie |
| Cancel booking | seat-map và showtime của movie |

Cache service dùng `SCAN` cho pattern invalidation, không dùng `KEYS`.

## Cấu hình và health

Copy `server/.env.example` thành `server/.env`, sau đó điền `MONGODB_URI`, `REDIS_URL` và các provider keys. Không commit `.env`; `.gitignore` đã chặn mọi file `.env` thật.

```powershell
cd server
npm install
npm run server
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Health trả `ok` khi MongoDB và Redis sẵn sàng, `degraded` khi MongoDB sẵn sàng nhưng Redis unavailable/disabled, và HTTP 503 khi MongoDB unavailable. Health không trả connection string.

## Kiểm thử

```powershell
cd server
npm test
```

Unit test luôn chạy. Integration unique-index test chỉ chạy trên database dùng một lần:

```powershell
$env:ALLOW_INTEGRATION_TESTS='true'
$env:TEST_MONGODB_URI='mongodb://127.0.0.1:27017/nitrocine_test?replicaSet=rs0'
npm test
```

Để bắn nhiều request đồng thời vào một test API/show (script này tạo dữ liệu thật), đặt các biến `CONCURRENCY_BASE_URL`, `CONCURRENCY_SHOW_ID`, `CONCURRENCY_AUTH_TOKEN`, tùy chọn `CONCURRENCY_SEAT`/`CONCURRENCY_ATTEMPTS`, rồi xác nhận rõ:

```powershell
$env:CONCURRENCY_TEST_CONFIRM='I_UNDERSTAND'
npm run test:concurrency
```

Kỳ vọng đúng một response có `bookingId`; các request còn lại trả 409.

## Deploy index

Mongoose sẽ tạo critical unique index từ schema khi auto-index được bật. Với production tắt auto-index, tạo thủ công:

```javascript
db.seatreservations.createIndex({ show: 1, seat: 1 }, { unique: true })
```

Không tạo index trước khi dọn duplicate seat reservation hiện hữu; MongoDB sẽ từ chối build index thay vì tự chọn bản ghi để xóa. Show catalog chỉ dùng compound index không unique để tương thích dữ liệu cũ.
