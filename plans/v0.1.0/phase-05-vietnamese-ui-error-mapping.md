# Phase 5 — Tiếng Việt hoàn chỉnh và dịch lỗi S3

Tier: **S** · Phụ thuộc: phase 3, 4 · Trạng thái: chưa làm · Issue: #5

## Mục tiêu

Đây là điểm khác biệt chính của extension. Toàn bộ giao diện có tiếng Việt, và mỗi lỗi S3 thường
gặp hiện một câu tiếng Việt cho người dùng biết **chuyện gì xảy ra và cần làm gì**, thay vì mã lỗi trần.

## Yêu cầu

- Mặc định theo ngôn ngữ trình duyệt (`vi*` ⟹ tiếng Việt, còn lại ⟹ tiếng Anh); đổi được trong cài đặt.
- Không còn chuỗi cứng trong template; có script kiểm hai tệp `vi.json` và `en.json` đủ cùng bộ khoá (chạy trong CI).
- Tên extension và mô tả trong manifest dùng `_locales/{vi,en}/messages.json` (store hiển thị theo ngôn ngữ người xem).
- Bảng dịch lỗi — một hàm duy nhất `describeS3Error(error) → { title, action }`, rơi về câu chung kèm mã lỗi gốc khi gặp
  mã chưa có trong bảng:

| Mã / tình huống | Câu tiếng Việt (ý chính) |
|---|---|
| `SignatureDoesNotMatch` | Secret key sai, hoặc đồng hồ máy lệch quá 15 phút |
| `InvalidAccessKeyId` | Access key không tồn tại hoặc đã bị xoá |
| `AccessDenied` | Khoá này không có quyền làm thao tác này trên bucket/object này |
| `NoSuchBucket` / `NoSuchKey` | Bucket / object không còn tồn tại |
| `BucketAlreadyExists` / `BucketAlreadyOwnedByYou` | Tên bucket đã có người dùng |
| `RequestTimeTooSkewed` | Đồng hồ máy lệch quá xa giờ server, cần chỉnh giờ hệ thống |
| `QuotaExceeded` / `EntityTooLarge` | Vượt hạn mức dung lượng / object quá lớn |
| `SlowDown` / `503` | Server đang giới hạn tốc độ, tự thử lại sau |
| `UserSuspended` | Tài khoản lưu trữ đang bị tạm khoá, liên hệ nhà cung cấp |
| `NotImplemented` | Nhà cung cấp này không hỗ trợ tính năng này |
| Lỗi mạng / `TypeError: Failed to fetch` | Không tới được endpoint: kiểm tra địa chỉ, mạng, hoặc chưa cấp quyền truy cập trang |
| HTTP 403 kèm thân HTML (proxy chặn) | Một proxy/tường lửa trước endpoint đã chặn yêu cầu, không phải lỗi khoá |

## Tệp

| Tệp | Việc |
|---|---|
| `src/i18n/{vi.json,en.json}` | đầy đủ chuỗi |
| `public/_locales/{vi,en}/messages.json` | tên + mô tả manifest |
| `src/core/s3/describe-s3-error.ts` | bảng dịch lỗi |
| `scripts/check-i18n-keys.mjs` | kiểm khoá hai ngôn ngữ (CI) |
| `tests/unit/describe-s3-error.test.ts` | unit test |

## Kiểm

- Unit: mỗi dòng của bảng ra đúng khoá dịch; mã lạ ⟹ câu chung có kèm mã gốc.
- CI: `check-i18n-keys` đỏ khi xoá một khoá ở một bên.
- Thủ công: đổi trình duyệt sang tiếng Việt, đi hết các màn hình, không còn chuỗi tiếng Anh sót.
