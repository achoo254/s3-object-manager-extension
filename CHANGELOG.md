# Changelog

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
