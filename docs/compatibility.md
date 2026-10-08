# Tương thích nhà cung cấp

Extension chỉ ghi "hỗ trợ" một nhà cung cấp sau khi **cùng một bản build** đã chạy đạt trên đó. Ô
chưa kiểm để trống là "chưa kiểm", không phải "không chạy".

## Ma trận (MVP v0.1.0)

| Thao tác                                  | SeaweedFS 4.47 | MinIO (image cuối) | Ceph RGW  | Backblaze B2 (path) | Backblaze B2 (virtual) |
| ----------------------------------------- | -------------- | ------------------ | --------- | ------------------- | ---------------------- |
| Liệt kê bucket / thư mục                  | Đạt            | chưa kiểm          | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Upload thường (`PutObject`)               | Đạt            | chưa kiểm          | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Multipart + tiếp tục sau khi ngắt         | Đạt            | chưa kiểm          | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Download (presigned + trình duyệt tải)    | Đạt            | chưa kiểm          | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Đổi tên / di chuyển (object và thư mục)   | Đạt            | chưa kiểm          | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Xoá lô `DeleteObjects` với `Content-MD5`  | Đạt            | chưa kiểm          | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Presign link chia sẻ                      | Đạt            | chưa kiểm          | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Khoá phạm vi hẹp (không có `ListBuckets`) | Đạt ¹          | chưa kiểm          | chưa kiểm | chưa kiểm           | chưa kiểm              |

Bằng chứng SeaweedFS (08/10/2026, máy cục bộ):

- `tests/integration/s3-provider.test.ts`: 10/10 đạt, chạy với khoá quản trị và với một khoá chỉ có
  quyền `Read/Write/List` trên một bucket.
- `tests/e2e/extension.spec.ts` (Playwright, extension thật trong Chromium): đặt passphrase ⟶ thêm
  kết nối ⟶ upload 50 MB multipart ⟶ duyệt ⟶ đổi tên ⟶ presign rồi tải link từ ngoài extension ⟶
  download qua trình tải của trình duyệt ⟶ xoá thư mục ⟶ khoá rồi mở lại vault: đạt.

¹ Với khoá chỉ có quyền trên một bucket, SeaweedFS trả về danh sách bucket đã lọc thay vì
`AccessDenied`. Nhánh dự phòng (`ListBuckets` bị từ chối ⟶ `HeadBucket` bucket mặc định) được kiểm
bằng unit test (`tests/unit/test-connection.test.ts`), cần xác nhận lại trên nhà cung cấp trả
`AccessDenied` thật.

## Khác biệt nhà cung cấp đã gặp

| Nhà cung cấp              | Khác biệt                                                                                                                                                  | Cách xử lý                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SeaweedFS                 | Lưu thư mục thật: sau khi xoá hoặc chuyển hết object, thư mục rỗng vẫn hiện trong `CommonPrefixes`. Xoá key thư mục **không** xoá đệ quy object bên trong. | Sau khi xoá/chuyển thư mục, xoá thêm key của từng thư mục từ sâu ra nông (`removeFolderEntries` trong `src/core/s3/operations/delete-objects.ts`). Trên server S3 chuẩn các lệnh này không có tác dụng gì. |
| SeaweedFS                 | Mỗi bucket là một "collection" có volume riêng; `-volume.max=0` mặc định nhanh chóng hết chỗ khi tạo nhiều bucket thử nghiệm.                              | `docker-compose.yml` đặt `-volume.max=100`. Chỉ ảnh hưởng server thử nghiệm.                                                                                                                               |
| Mọi server không phải AWS | SDK gửi checksum CRC32 cho `DeleteObjects` kể cả khi `WHEN_REQUIRED`; nhiều server đòi `Content-MD5`.                                                      | Middleware trong `s3-client-factory.ts` luôn đổi sang `Content-MD5` cho mọi endpoint.                                                                                                                      |

## Kiểm một nhà cung cấp mới

Chạy bộ kiểm tích hợp với khoá **chỉ dùng để thử** (không commit endpoint hay khoá):

```bash
S3_TEST_ENDPOINT=https://s3.example.com \
S3_TEST_ACCESS_KEY_ID=... S3_TEST_SECRET_ACCESS_KEY=... \
S3_TEST_REGION=us-east-1 S3_TEST_ADDRESSING=path \
S3_TEST_BUCKET=bucket-co-san \
pnpm test:integration
```

- `S3_TEST_BUCKET` bỏ trống thì bộ kiểm tự tạo rồi xoá một bucket tạm (khoá cần quyền tạo bucket).
- Với khoá phạm vi hẹp, đặt `S3_TEST_BUCKET` là bucket khoá được phép dùng.
- Kiểm cả `S3_TEST_ADDRESSING=virtual` với nhà cung cấp hỗ trợ virtual-hosted.
- Phần giao diện (download qua trình duyệt, tiếp tục upload sau khi đóng tab) kiểm tay theo kịch bản
  e2e ở trên.

Ô nào hỏng vì khác biệt nhà cung cấp thì sửa trong `src/core/s3/s3-client-factory.ts` hoặc
`src/core/s3/capabilities.ts` (hoặc thao tác chung trong `src/core/s3/operations`), không rẽ nhánh
theo nhà cung cấp rải rác trong giao diện.
