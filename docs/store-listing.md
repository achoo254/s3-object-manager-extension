# Nội dung nộp store (Chrome Web Store, Edge Add-ons)

Bản nháp để dán khi nộp tay. Tên extension **chưa chốt** (câu hỏi mở của plan); "S3 Object Manager"
là tên tạm, nằm ở `public/_locales/{vi,en}/messages.json` và `src/i18n/{vi,en}.json` (`app.title`).
Không dùng tên, logo hay nhận diện của thương hiệu khác.

## Mô tả ngắn

- vi: Duyệt, tải lên, tải xuống và chia sẻ object trên mọi dịch vụ lưu trữ tương thích S3. Kết nối lưu
  trên máy, không telemetry.
- en: Browse, upload, download and share objects on any S3-compatible storage. Connections stay
  on your machine, no telemetry.

## Mô tả dài (vi)

Quản lý object trên dịch vụ lưu trữ tương thích S3 ngay trong trình duyệt, không cần cài phần mềm.

- Giao diện tiếng Việt; lỗi S3 được dịch thành câu nói rõ chuyện gì xảy ra và cần làm gì.
- Duyệt bucket và thư mục hàng trăm nghìn object, lọc theo tên.
- Tải lên file lớn theo từng phần, tạm dừng và tiếp tục được, kể cả sau khi đóng trình duyệt.
- Tải xuống qua trình tải của trình duyệt; đổi tên, sao chép, xoá, tạo thư mục.
- Tạo link chia sẻ có thời hạn (1 giờ, 1 ngày, 7 ngày).
- Lưu kết nối xong là dùng ngay, không cần mật khẩu; kết nối chỉ nằm trên máy của bạn.
- Extension chỉ kết nối tới endpoint bạn nhập, sau khi bạn cho phép. Không telemetry, không tài
  khoản, mã nguồn mở MIT.

Tương thích với dịch vụ lưu trữ chuẩn S3. Đã kiểm: xem `docs/compatibility.md` (chỉ liệt kê nhà cung
cấp đã có trong ma trận).

## Long description (en)

Manage objects on S3-compatible storage right in your browser, nothing to install.

- Vietnamese and English interface; S3 errors explained as what happened and what to do.
- Browse buckets and folders with hundreds of thousands of objects, filter by name.
- Upload large files in parts; pause and resume, even after closing the browser.
- Download through the browser's download manager; rename, copy, delete, create folders.
- Time-limited share links (1 hour, 1 day, 7 days).
- Save a connection and use it right away, no password; connections stay on your machine.
- Connects only to the endpoints you enter, after you allow it. No telemetry, no account, MIT open
  source.

Compatible with S3-standard storage services. Tested providers: see `docs/compatibility.md`.

## Khai báo dữ liệu (Privacy practices)

- Loại dữ liệu: **Thông tin xác thực** (credentials của endpoint S3). Lưu cục bộ trên máy, **không**
  truyền cho bên thứ ba, không dùng cho mục đích nào ngoài chức năng chính.
- Không thu thập: thông tin cá nhân, lịch sử duyệt web, vị trí, nội dung trang web.
- Chính sách quyền riêng tư: `docs/privacy.md` (đăng qua GitHub Pages).
- Không dùng mã tải từ xa (remote code).

## Giải thích từng quyền

| Quyền                                                                           | Lý do                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                                                       | Lưu danh sách kết nối đã mã hoá và cài đặt của người dùng.                                                                                                       |
| `downloads`                                                                     | Giao object cho trình tải của trình duyệt để tải file lớn mà không giữ trong bộ nhớ.                                                                             |
| Quyền host tuỳ chọn (`https://*/*`, `http://localhost/*`, `http://127.0.0.1/*`) | Gọi API S3 của endpoint người dùng chọn. Không cấp lúc cài; xin theo từng origin khi người dùng thêm kết nối. `http` chỉ dành cho server S3 trên máy người dùng. |

## Ảnh chụp màn hình (1280×800)

`docs/store/screenshots/{vi,en}-{2..6}-*.png`, tạo lại bằng `pnpm build:e2e && pnpm screenshots`
(dữ liệu mẫu trên SeaweedFS local, không có endpoint thật). Chụp lại sau khi chốt tên extension.
