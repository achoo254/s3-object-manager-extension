# Changelog

## Chưa phát hành

- Sửa: khoá chỉ được chia sẻ một bucket qua bucket policy (Ceph, AWS) báo "thấy 0 bucket" và rơi vào
  danh sách trống. Nay "Thử kết nối" kiểm bucket mặc định và extension mở thẳng bucket đó; bucket
  mặc định gõ sai cũng bị báo lỗi ngay khi thử kết nối.
- Kiểm thử: thêm e2e cho kết nối, duyệt, upload (tạm dừng, huỷ, tiếp tục sau khi tải lại trang, cả
  thư mục), sao chép/di chuyển, xoá nhiều mục, thuộc tính, link chia sẻ, cài đặt, và kiểm thử bảo mật
  động; xem [docs/security.md](docs/security.md).
- CI: ghim GitHub Actions theo commit SHA; pnpm từ chối phiên bản phát hành chưa đủ 7 ngày.

## 0.1.1 — 09/10/2026

- Rút gọn mô tả trong manifest cho vừa giới hạn 132 ký tự của Chrome Web Store.

## 0.1.0 — 09/10/2026

Bản đầu tiên.

- Kết nối tới mọi endpoint tương thích S3 bằng endpoint + access key; path-style hoặc virtual-hosted.
- Lưu kết nối xong dùng được ngay, không cần mật khẩu (dành cho người dùng phổ thông); kết nối nằm
  trong bộ nhớ cục bộ của trình duyệt.
- Bản thử trên GitHub có ID extension cố định: cập nhật bằng cách giải nén đè và bấm Reload, không mất
  kết nối.
- Quyền truy cập trang xin theo từng endpoint lúc chạy; không xin quyền host khi cài.
- Duyệt bucket/thư mục với danh sách ảo hoá, tải thêm khi cuộn, lọc theo tiền tố tên.
- Xoá (theo lô 1.000 key), đổi tên/di chuyển, sao chép (kể cả object > 5 GiB), tạo thư mục, xem
  thuộc tính.
- Download qua trình tải của trình duyệt; link chia sẻ 1 giờ / 1 ngày / 7 ngày.
- Upload multipart song song, tạm dừng/tiếp tục, tiếp tục được sau khi đóng trình duyệt; màn hình dọn
  upload dở trên server.
- Giao diện tiếng Việt và tiếng Anh; lỗi S3 thường gặp dịch thành việc cần làm.
- Giao diện sáng/tối theo bảng màu riêng.
