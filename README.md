# Kho Mây

Extension Chrome/Edge (Manifest V3) để duyệt, tải lên, tải xuống, xoá, đổi tên và chia sẻ object trên
dịch vụ lưu trữ tương thích S3 — chỉ cần endpoint và cặp khoá truy cập. Giao diện tiếng Việt là chính,
kèm tiếng Anh. Mã nguồn mở, giấy phép MIT.

_English summary below._

## Tính năng

- Nhiều kết nối; path-style hoặc virtual-hosted; khoá chỉ có quyền trên một bucket vẫn dùng được
  (khai báo bucket mặc định).
- Duyệt thư mục hàng trăm nghìn object (danh sách ảo hoá, 1.000 key mỗi request, lọc theo tiền tố).
- Upload multipart song song (mặc định 4 part × 8 MiB, trần 64 MiB/part), tạm dừng/tiếp tục, tiếp tục
  được sau khi đóng tab hoặc khởi động lại trình duyệt; kéo thả cả thư mục.
- Download qua trình tải của trình duyệt (file lớn không nằm trong RAM của tab).
- Xoá theo lô, đổi tên/di chuyển, sao chép (kể cả > 5 GiB), tạo thư mục, xem thuộc tính.
- Link chia sẻ có thời hạn: 1 giờ, 1 ngày, 7 ngày.
- Lỗi S3 thường gặp hiện bằng câu tiếng Việt nói rõ cần làm gì.

Nhà cung cấp đã kiểm: xem [docs/compatibility.md](docs/compatibility.md). Nhà cung cấp chưa có trong
ma trận thì chưa được coi là "hỗ trợ". Số đo hiệu năng: [docs/performance.md](docs/performance.md).

## Bảo mật và quyền riêng tư

- Dành cho người dùng phổ thông: lưu kết nối xong là dùng được ngay, **không cần mật khẩu**. Kết
  nối nằm trong bộ nhớ cục bộ của trình duyệt trên máy này, được mã hoá bằng một khoá ngẫu nhiên đặt
  cùng chỗ. Việc mã hoá này chỉ để dữ liệu thô không đọc được bằng mắt; ai dùng được máy hoặc hồ sơ
  trình duyệt này đều có thể lấy được khoá truy cập.
- Extension gọi thẳng tới endpoint S3, không qua máy chủ trung gian; không telemetry, không tài
  khoản. Lúc cài chỉ xin quyền `storage` và `downloads`; quyền truy cập từng endpoint được xin khi bạn
  thêm kết nối, và không request nào được gửi trước khi bạn đồng ý.
- **Nên dùng khoá phạm vi hẹp** (chỉ những bucket cần quản lý), không dùng khoá quản trị toàn tài
  khoản.
- Chính sách quyền riêng tư: [docs/privacy.md](docs/privacy.md).

## Giới hạn đã biết

- Chỉ nhận endpoint `https://`; `http://` chỉ dùng được với server trên máy (`localhost`,
  `127.0.0.1`).
- Tiếp tục upload dựa trên tên, cỡ và thời gian sửa của file. Nếu bạn chọn một file khác trùng cả ba
  thông tin đó, upload sẽ ghép phần cũ với nội dung mới — hãy huỷ upload dở trước khi tải một file
  khác lên cùng key.
- Đổi tên/di chuyển thư mục làm từng object (sao chép rồi xoá), không nguyên tử; bị ngắt giữa chừng
  thì extension liệt kê phần còn lại để chạy tiếp.
- Firefox, IAM/policy, versioning, lifecycle, đồng bộ thư mục: ngoài phạm vi.

## Phát triển

Yêu cầu: Node 24, pnpm 11, Docker (cho server S3 cục bộ).

```bash
pnpm install
docker compose up -d          # SeaweedFS, cổng 8333, khoá thử trong docker/seaweedfs-s3.json
pnpm seed:local               # bucket sample-bucket với vài object mẫu (--bulk N để tạo N object)
pnpm dev                      # Chrome có nạp extension, tự tải lại
```

| Lệnh                                                                  | Việc                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm build`                                                          | build `.output/chrome-mv3` và `.output/edge-mv3`                          |
| `pnpm zip`                                                            | đóng gói zip Chrome + Edge                                                |
| `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm check:i18n` | kiểm mã và khoá dịch                                                      |
| `pnpm test`                                                           | unit test                                                                 |
| `S3_TEST_ENDPOINT=http://localhost:8333 pnpm test:integration`        | kiểm với server S3 thật                                                   |
| `pnpm build:e2e && pnpm test:e2e`                                     | Playwright chạy extension thật (bản e2e cấp sẵn quyền `http://localhost`) |
| `pnpm build:e2e && pnpm perf`                                         | đo hiệu năng (không chạy trong CI)                                        |
| `pnpm build:e2e && pnpm screenshots`                                  | ảnh chụp cho trang store                                                  |

Cấu trúc: `src/core` (lưu kết nối, profile, S3 client và thao tác, upload) không phụ thuộc giao diện;
`src/features` là giao diện Vue + Vuetify; mọi màu đi qua `src/styles/design-tokens.ts`; chuỗi giao
diện nằm ở `src/i18n/{vi,en}.json`.

### Cổng chặn từ cấm

Repo chỉ nói về chính extension. Danh sách từ cấm là một regex giữ **ngoài repo**:

- CI: secret `FORBIDDEN_TERMS_REGEX` của repository. Thiếu hoặc rỗng ⟹ job `forbidden terms` đỏ.
- Máy local: đặt biến môi trường `FORBIDDEN_TERMS_REGEX`, rồi chạy `scripts/install-git-hooks.sh`
  để cài hook `pre-commit` và `commit-msg`.

### Cập nhật bản thử (pre-release)

Bản trên GitHub Releases có ID extension cố định (`mdmjpiiemaagpcohlklceiamoehafmgj`). Để cập nhật mà
giữ các kết nối đã lưu: giải nén bản mới **đè vào đúng thư mục cũ**, rồi bấm **Reload** trên thẻ
extension. Đừng bấm Remove: gỡ extension sẽ xoá các kết nối. Bản cài từ store tự cập nhật và giữ dữ
liệu.

### Phát hành

Push tag `vX.Y.Z` (khớp `version` trong `package.json`) ⟹ workflow `Release` build và đính zip Chrome

- Edge vào GitHub Release. Nộp lên store làm tay; nội dung nộp ở
  [docs/store-listing.md](docs/store-listing.md).

## English summary

A Manifest V3 extension for Chrome and Edge that manages objects on any S3-compatible endpoint with
just an endpoint and an access key pair. Connections are saved on your machine and work right away
with no password; credentials are only ever sent to the endpoint you configured; there is no backend, no telemetry and no
account. Features: virtualised browsing of very large folders, resumable parallel multipart uploads,
downloads through the browser's download manager, batch delete, rename/move/copy, presigned share
links, and plain-language error messages in Vietnamese and English. See
[docs/compatibility.md](docs/compatibility.md) for tested providers and
[docs/privacy.md](docs/privacy.md) for the privacy policy.

## Giấy phép

[MIT](LICENSE)
