# Changelog

## 0.1.0 — chưa phát hành

Bản đầu tiên.

- Kết nối tới mọi endpoint tương thích S3 bằng endpoint + access key; path-style hoặc virtual-hosted.
- Vault: credentials mã hoá bằng passphrase (PBKDF2-SHA256 600.000 vòng, AES-GCM), tự khoá sau
  thời gian không thao tác, nút "Khoá ngay".
- Quyền truy cập trang xin theo từng endpoint lúc chạy; không xin quyền host khi cài.
- Duyệt bucket/thư mục với danh sách ảo hoá, tải thêm khi cuộn, lọc theo tiền tố tên.
- Xoá (theo lô 1.000 key), đổi tên/di chuyển, sao chép (kể cả object > 5 GiB), tạo thư mục, xem
  thuộc tính.
- Download qua trình tải của trình duyệt; link chia sẻ 1 giờ / 1 ngày / 7 ngày.
- Upload multipart song song, tạm dừng/tiếp tục, tiếp tục được sau khi đóng trình duyệt; màn hình dọn
  upload dở trên server.
- Giao diện tiếng Việt và tiếng Anh; lỗi S3 thường gặp dịch thành việc cần làm.
- Giao diện sáng/tối theo bảng màu riêng.
