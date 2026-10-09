---
title: Chính sách quyền riêng tư / Privacy policy
---

# Chính sách quyền riêng tư

Cập nhật: 09/10/2026 · Áp dụng cho extension trình duyệt "Kho Mây".

- **Credentials chỉ nằm trên máy bạn.** Endpoint, access key và secret key bạn nhập được lưu trong bộ
  nhớ cục bộ của trình duyệt, mã hoá bằng một khoá ngẫu nhiên cũng nằm trên máy. Không cần mật khẩu,
  nên ai dùng được máy hoặc hồ sơ trình duyệt này đều có thể lấy được các khoá đó; hãy dùng khoá chỉ có
  quyền trên những bucket cần thiết.
- **Extension chỉ gửi yêu cầu tới endpoint S3 bạn nhập**, và chỉ sau khi bạn cho phép truy cập địa
  chỉ đó. Không có máy chủ trung gian; dữ liệu đi thẳng giữa trình duyệt và endpoint của bạn.
- **Không thu thập dữ liệu.** Không telemetry, không analytics, không tài khoản, không đăng nhập,
  không quảng cáo. Không bán hay chia sẻ dữ liệu với bất kỳ ai.
- **Link chia sẻ** do bạn tạo là URL ký sẵn có thời hạn; bất kỳ ai có link đều tải được object cho
  đến khi link hết hạn.
- **Quyền extension:** `storage` (lưu kết nối đã mã hoá và cài đặt), `downloads` (giao file cho trình
  tải của trình duyệt), quyền truy cập trang theo từng endpoint (chỉ xin khi bạn thêm kết nối).
- Mã nguồn mở theo giấy phép MIT; bạn có thể tự kiểm mọi điều trên.

Gỡ extension sẽ xoá toàn bộ dữ liệu nó lưu trên máy.

---

# Privacy policy

Last updated: 9 October 2026 · Applies to the "Kho Mây" browser extension.

- **Your credentials stay on your machine.** The endpoints, access keys and secret keys you enter are
  kept in the browser's local storage, encrypted with a random key that is also stored on the
  machine. There is no password, so anyone who can use this machine or browser profile can get those
  keys; prefer keys limited to the buckets you need.
- **The extension only sends requests to the S3 endpoints you enter**, and only after you allow access
  to that address. There is no intermediate server; data flows directly between your browser and your
  endpoint.
- **No data collection.** No telemetry, no analytics, no accounts, no sign-in, no ads. Nothing is sold
  or shared with anyone.
- **Share links** you create are time-limited presigned URLs; anyone holding a link can download the
  object until it expires.
- **Extension permissions:** `storage` (encrypted connections and settings), `downloads` (hands files
  to the browser's download manager), and site access per endpoint (requested only when you add a
  connection).
- The source code is open under the MIT licence, so every statement above can be verified.

Removing the extension deletes all data it stored on your machine.
