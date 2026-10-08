# Phase 2 — Profile kết nối, vault credentials, quyền host

Tier: **M** · Phụ thuộc: phase 1 · Trạng thái: chưa làm · Issue: #2

## Mục tiêu

Người dùng thêm được nhiều kết nối S3, credentials luôn được mã hoá khi lưu, mỗi endpoint chỉ được gọi sau khi người
dùng cấp quyền, và mọi module khác lấy S3 client từ **một** chỗ đã cấu hình đúng cho server không phải AWS.

## Yêu cầu

### Profile

- Trường: `name`, `endpoint` (URL), `region` (mặc định `us-east-1`; R2 dùng `auto`), `addressing` (`path` | `virtual`),
  `accessKeyId`, `secretAccessKey`, `sessionToken?`, `defaultBucket?`.
- Gợi ý mặc định theo endpoint: `*.amazonaws.com` ⟹ `virtual`; còn lại ⟹ `path`. Người dùng sửa được.
- Kiểm kết nối: thử `ListBuckets`; nếu `AccessDenied` và có `defaultBucket` thì thử `HeadBucket`. Khoá phạm vi hẹp
  thường không có quyền `ListBuckets` — đừng báo "kết nối hỏng" trong trường hợp đó.

### Vault

- Lần đầu: người dùng đặt passphrase. Dẫn khoá bằng **PBKDF2-SHA256, 600.000 vòng**, salt ngẫu nhiên 16 byte; mã hoá
  toàn bộ danh sách profile bằng **AES-GCM**, IV ngẫu nhiên 12 byte mỗi lần ghi.
- `chrome.storage.local` chỉ chứa `{salt, iv, ciphertext, kdfParams}`.
- Sau khi mở khoá: export khoá AES thành **raw bytes** (base64) và giữ trong `chrome.storage.session` — chỉ nằm trong RAM,
  mất khi khởi động lại trình duyệt, khi extension reload/cập nhật. Không lưu được `CryptoKey` non-extractable ở đây vì
  storage chỉ nhận giá trị JSON; giữ khoá chỉ trong bộ nhớ tab thì người dùng phải nhập lại passphrase mỗi lần đóng tab.
  Mỗi lượt dùng: đọc raw bytes ⟹ `importKey` non-extractable để mã hoá/giải mã. Khoá lại = xoá khỏi session storage.
 
- Tự khoá sau N phút không thao tác (mặc định 30, chỉnh được), và có nút "Khoá ngay".
- Quên passphrase ⟹ chỉ có cách xoá vault và nhập lại. Nói rõ điều này trên màn hình đặt passphrase.

### Quyền host

- Khi lưu profile: `chrome.permissions.request({ origins: [<origin của endpoint>/*] })` từ thao tác bấm của người dùng.
- Trước mỗi lượt dùng profile: `chrome.permissions.contains`; thiếu thì hiện nút cấp quyền, không gọi mạng.
- Xoá profile ⟹ `chrome.permissions.remove` origin đó nếu không profile nào khác dùng.

### S3 client factory

- Một hàm duy nhất `createS3Client(profile)` dùng `@aws-sdk/client-s3`:
  - `requestChecksumCalculation: 'WHEN_REQUIRED'`, `responseChecksumValidation: 'WHEN_REQUIRED'`;
  - `forcePathStyle: profile.addressing === 'path'`;
  - `endpoint`, `region`, credentials từ vault.
- Middleware cho `DeleteObjects` ở **mọi** endpoint: bỏ header `x-amz-checksum-*` của SDK và gửi `Content-MD5`.
  `WHEN_REQUIRED` không tắt được checksum của `DeleteObjects` (thao tác này được mô hình hoá là bắt buộc checksum), và
  MinIO/StorageGRID đã được ghi nhận từ chối CRC32 với lỗi thiếu `Content-MD5`. AWS chấp nhận `Content-MD5`, nên một đường
  chung cho mọi nhà cung cấp. Gắn middleware theo tên lệnh, có unit test khoá header cuối cùng — nâng SDK có thể đổi
  thứ tự/tên middleware.

## Tệp

| Tệp | Việc |
|---|---|
| `src/core/vault/{vault-crypto.ts,vault-store.ts,auto-lock.ts}` | mã hoá, lưu, tự khoá |
| `src/core/profiles/{profile.types.ts,profile-store.ts,host-permission.ts}` | profile + quyền host |
| `src/core/s3/s3-client-factory.ts` | điểm tạo client duy nhất |
| `src/core/s3/delete-objects-md5.middleware.ts` | đổi checksum CRC32 thành `Content-MD5` cho `DeleteObjects` |
| `src/features/connections/**` | màn hình danh sách/thêm/sửa/kiểm kết nối, màn hình mở khoá |
| `tests/unit/vault-crypto.test.ts`, `tests/unit/s3-client-factory.test.ts` | unit test |

## Kiểm

- Unit: mã hoá → giải mã đúng; sai passphrase báo lỗi rõ ràng, không lộ dữ liệu; mỗi lần ghi IV khác nhau.
- Unit: factory luôn đặt hai cờ checksum và `forcePathStyle` đúng theo profile.
- Unit: request `DeleteObjects` cuối cùng có `Content-MD5` đúng và **không** có header `x-amz-checksum-*`.
- Thủ công trên SeaweedFS: xoá lô 3 object thành công.
- Thủ công: đóng hẳn trình duyệt, mở lại ⟹ phải nhập passphrase; xem `chrome.storage.local` trong DevTools chỉ thấy bản mã.
- Thủ công: thêm profile SeaweedFS local ⟹ hộp thoại cấp quyền hiện đúng origin `http://localhost`; từ chối ⟹ không request nào đi ra.

## Rủi ro

- Passphrase yếu ⟹ vault vẫn bẻ được nếu máy bị lấy dữ liệu. Hiện cảnh báo độ mạnh, không chặn cứng.
- `chrome.storage.session` mặc định chỉ trang của extension đọc được (không lộ ra content script — extension này không
  có content script).
