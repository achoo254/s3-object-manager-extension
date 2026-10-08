---
title: Chính sách quyền riêng tư / Privacy policy
---

# Chính sách quyền riêng tư

Cập nhật: 08/10/2026 · Áp dụng cho extension trình duyệt "S3 Object Manager" (tên tạm).

- **Credentials chỉ nằm trên máy bạn.** Endpoint, access key và secret key bạn nhập được mã hoá bằng
  passphrase của bạn (PBKDF2-SHA256 600.000 vòng, AES-GCM) và lưu trong bộ nhớ cục bộ của trình
  duyệt. Khoá giải mã chỉ nằm trong bộ nhớ tạm của phiên trình duyệt và mất khi bạn khoá, khi
  extension tự khoá, hoặc khi trình duyệt khởi động lại.
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

Last updated: 8 October 2026 · Applies to the "S3 Object Manager" browser extension (working title).

- **Your credentials stay on your machine.** The endpoints, access keys and secret keys you enter are
  encrypted with your passphrase (PBKDF2-SHA256, 600,000 iterations, AES-GCM) and kept in the
  browser's local storage. The decryption key only lives in the browser session's memory and is gone
  when you lock, when the extension locks itself, or when the browser restarts.
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
