# Tương thích nhà cung cấp

Extension chỉ ghi "hỗ trợ" một nhà cung cấp sau khi **cùng một bản build** đã chạy đạt trên đó. Ô
chưa kiểm là "chưa kiểm", không phải "không chạy".

## Ma trận (MVP v0.1.0)

| Thao tác                                  | SeaweedFS 4.47 | MinIO RELEASE.2025-09-07 ² | Ceph RGW  | Backblaze B2 (path) | Backblaze B2 (virtual) |
| ----------------------------------------- | -------------- | -------------------------- | --------- | ------------------- | ---------------------- |
| Liệt kê bucket / thư mục                  | Đạt            | Đạt                        | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Upload thường (`PutObject`)               | Đạt            | Đạt                        | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Multipart + tiếp tục sau khi ngắt         | Đạt            | Đạt                        | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Download (presigned + trình duyệt tải)    | Đạt            | Đạt                        | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Đổi tên / di chuyển (object và thư mục)   | Đạt            | Đạt                        | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Xoá lô `DeleteObjects` với `Content-MD5`  | Đạt            | Đạt                        | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Presign link chia sẻ                      | Đạt            | Đạt                        | chưa kiểm | chưa kiểm           | chưa kiểm              |
| Khoá phạm vi hẹp (không có `ListBuckets`) | Đạt ¹          | Đạt ¹                      | chưa kiểm | chưa kiểm           | chưa kiểm              |

Bằng chứng (08/10/2026, máy cục bộ, cả hai server chạy binary trên cùng máy):

- `tests/integration/s3-provider.test.ts`: 10/10 đạt trên mỗi server, với khoá quản trị và với khoá
  chỉ có quyền trên một bucket. Trên MinIO còn chạy thêm với một khoá bị cấm hẳn
  `s3:ListAllMyBuckets`.
- `tests/e2e/extension.spec.ts` (Playwright, extension thật trong Chromium) đạt trên cả hai: đặt
  thêm kết nối ⟶ upload 50 MB multipart ⟶ duyệt ⟶ đổi tên ⟶ presign rồi tải link từ ngoài extension ⟶
  download qua trình tải của trình duyệt ⟶ xoá thư mục ⟶ tải lại trang, kết nối vẫn còn.

¹ Cả hai server trả danh sách bucket **đã lọc** cho khoá phạm vi hẹp thay vì `AccessDenied` (MinIO
lọc kể cả khi policy cấm hẳn `s3:ListAllMyBuckets`), nên kết nối hoạt động bình thường. Nhánh dự
phòng (`ListBuckets` bị từ chối ⟶ `HeadBucket` bucket mặc định) chỉ được kiểm bằng unit test
(`tests/unit/test-connection.test.ts`); cần xác nhận trên nhà cung cấp trả `AccessDenied` thật.

² Dự án MinIO bản cộng đồng đã archive. Bản cuối có binary là `RELEASE.2025-09-07T16-13-09Z`
(`RELEASE.2025-10-15` chỉ còn mã nguồn); Docker Hub và Quay không còn cho kéo image công khai, nên
kiểm bằng binary chính thức (đối chiếu sha256) thay cho image Docker.

## Khác biệt nhà cung cấp đã gặp

| Nhà cung cấp              | Khác biệt                                                                                                                                                  | Cách xử lý                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SeaweedFS                 | Lưu thư mục thật: sau khi xoá hoặc chuyển hết object, thư mục rỗng vẫn hiện trong `CommonPrefixes`. Xoá key thư mục **không** xoá đệ quy object bên trong. | Sau khi xoá/chuyển thư mục, xoá thêm key của từng thư mục từ sâu ra nông (`removeFolderEntries` trong `src/core/s3/operations/delete-objects.ts`). Trên server S3 chuẩn các lệnh này không có tác dụng gì. |
| SeaweedFS                 | Mỗi bucket là một "collection" có volume riêng; `-volume.max=0` mặc định nhanh chóng hết chỗ khi tạo nhiều bucket thử nghiệm.                              | `docker-compose.yml` đặt `-volume.max=100`. Chỉ ảnh hưởng server thử nghiệm.                                                                                                                               |
| Mọi server không phải AWS | SDK gửi checksum CRC32 cho `DeleteObjects` kể cả khi `WHEN_REQUIRED`; nhiều server đòi `Content-MD5`.                                                      | Middleware trong `s3-client-factory.ts` luôn đổi sang `Content-MD5` cho mọi endpoint.                                                                                                                      |
| `localhost`, địa chỉ IP   | Không có tên miền con `<bucket>.<host>`, nên virtual-hosted không dùng được.                                                                               | `effectiveAddressing` (`src/core/profiles/addressing.ts`) luôn dùng path-style cho các host này; form kết nối khoá lựa chọn virtual-hosted.                                                                |

## Kiểm một nhà cung cấp

Chạy bộ kiểm tích hợp với khoá **chỉ dùng để thử** (không commit endpoint hay khoá, không dùng khoá
của môi trường thật):

```bash
S3_TEST_ENDPOINT=https://s3.example.com \
S3_TEST_ACCESS_KEY_ID=... S3_TEST_SECRET_ACCESS_KEY=... \
S3_TEST_REGION=us-east-1 S3_TEST_ADDRESSING=path \
S3_TEST_BUCKET=bucket-co-san \
pnpm test:integration
```

- `S3_TEST_BUCKET` bỏ trống thì bộ kiểm tự tạo rồi xoá một bucket tạm (khoá cần quyền tạo bucket).
- Với khoá phạm vi hẹp, đặt `S3_TEST_BUCKET` là bucket khoá được phép dùng.
- Chạy lại với `S3_TEST_ADDRESSING=virtual` nếu nhà cung cấp hỗ trợ virtual-hosted.

Kịch bản giao diện (e2e) với cùng nhà cung cấp:

```bash
E2E_EXTRA_HOSTS='https://<host>/*' pnpm build:e2e   # dùng '*.<host>' cho virtual-hosted
E2E_S3_ENDPOINT=https://<endpoint> E2E_S3_ACCESS_KEY_ID=... E2E_S3_SECRET_ACCESS_KEY=... pnpm test:e2e
```

Kịch bản e2e tạo một bucket tạm, nên khoá cần quyền tạo/xoá bucket.

### MinIO cục bộ

```bash
# Binary chính thức bản cuối (macOS Apple Silicon; đổi darwin-arm64 theo máy), kiểm sha256 trước khi chạy
gh release download RELEASE.2025-09-07T16-13-09Z -R minio/minio \
  -p 'minio.darwin-arm64.RELEASE.2025-09-07T16-13-09Z*'
shasum -a 256 -c <(sed 's/ .*/  minio.darwin-arm64.RELEASE.2025-09-07T16-13-09Z/' \
  minio.darwin-arm64.RELEASE.2025-09-07T16-13-09Z.sha256sum)
MINIO_ROOT_USER=localminiotest MINIO_ROOT_PASSWORD=localminiotest-not-a-real-secret \
  ./minio.darwin-arm64.RELEASE.2025-09-07T16-13-09Z server ./minio-data --address 127.0.0.1:9000
```

Rồi chạy các lệnh trên với `S3_TEST_ENDPOINT=http://localhost:9000` và đúng cặp khoá đó.

### Backblaze B2 (chủ dự án làm)

1. Tạo tài khoản B2 miễn phí (10 GB, không cần thẻ) trên trang Backblaze.
2. Tạo một bucket riêng để thử, ví dụ `s3om-compat-test`.
3. Tạo **Application Key** chỉ cho bucket đó, quyền đọc + ghi; ghi lại `keyID`, `applicationKey`
   và endpoint S3 hiển thị cạnh bucket (dạng `https://s3.<region>.backblazeb2.com`; region là phần
   `<region>`).
4. Chạy bộ kiểm tích hợp hai lần, `S3_TEST_ADDRESSING=path` rồi `virtual`, với
   `S3_TEST_BUCKET=s3om-compat-test`.
5. Chạy e2e với `E2E_EXTRA_HOSTS='https://*.backblazeb2.com/*'` (khoá cần quyền tạo bucket, hoặc bỏ
   qua e2e nếu khoá chỉ có quyền trên một bucket).
6. Ghi kết quả vào bảng trên, rồi xoá Application Key.

### Ceph RGW (chủ dự án làm)

Dùng cụm thử nghiệm riêng với IAM user phạm vi hẹp, theo đúng các bước trên. Không dùng khoá của môi
trường thật và không ghi endpoint hay khoá vào repo.

Ô nào hỏng vì khác biệt nhà cung cấp thì sửa trong `src/core/s3/s3-client-factory.ts` hoặc
`src/core/s3/capabilities.ts` (hoặc thao tác chung trong `src/core/s3/operations`), không rẽ nhánh
theo nhà cung cấp rải rác trong giao diện.
