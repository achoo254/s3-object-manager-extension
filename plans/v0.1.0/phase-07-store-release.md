# Phase 7 — Phát hành Chrome Web Store và Edge Add-ons

Tier: **S** · Phụ thuộc: phase 6 · Trạng thái: đã chuẩn bị, chờ chủ dự án · Issue: #7

## Mục tiêu

Bản đầu tiên được duyệt trên cả hai store dưới tài khoản cá nhân, có trang chính sách quyền riêng tư công khai, và quy
trình đóng gói lặp lại được từ tag git.

## Yêu cầu

- **Tài khoản:** Google (Chrome Web Store, phí đăng ký một lần 5 USD) và Microsoft Partner Center (Edge Add-ons, miễn phí),
  cả hai **bật 2FA**.
- **Trang chính sách quyền riêng tư** (GitHub Pages hoặc trang tĩnh khác), song ngữ, nêu rõ:
  credentials chỉ lưu trên máy người dùng, mã hoá bằng passphrase; extension chỉ gửi request tới endpoint người dùng nhập;
  không thu thập, không gửi telemetry, không bán dữ liệu.
- **Khai báo dữ liệu trên store:** "Thông tin xác thực" — lưu cục bộ, không truyền cho bên thứ ba. Giải thích từng quyền:
  `storage` (lưu profile đã mã hoá), `downloads` (tải object), quyền host tuỳ chọn (gọi endpoint S3 người dùng chọn).
- **Trang giới thiệu:** tên, mô tả, ảnh chụp màn hình bằng tiếng Việt và tiếng Anh; icon và ảnh dùng bảng màu riêng của
  extension. **Không** dùng tên, logo hay nhận diện của thương hiệu khác; được phép ghi "tương thích với dịch vụ lưu trữ chuẩn S3" và liệt kê nhà cung cấp đã có trong ma trận phase 6.
- **Đóng gói:** push tag `vX.Y.Z` ⟹ GitHub Actions build, đính zip Chrome + Edge vào GitHub Release. Upload lên store
  làm tay (không lưu token store trong CI ở MVP).
- `CHANGELOG.md` trong repo extension.

## Các bước

1. Chốt tên extension (không chứa thương hiệu của bên khác), kiểm trùng tên trên hai store.
2. Viết và đăng trang privacy.
3. Chụp ảnh màn hình (1280×800) hai ngôn ngữ, dữ liệu mẫu từ SeaweedFS (không lộ endpoint thật).
4. Tag `v0.1.0`, lấy zip từ Release, nộp hai store.
5. Xử lý phản hồi review nếu có.

## Kiểm

- Hai store trạng thái "Đã xuất bản" (hoặc "Đang chờ duyệt" kèm mã nộp — ghi lại nếu review chưa xong khi kết thúc phase).
- Cài từ store trên một máy sạch, chạy lại kịch bản e2e bằng tay với SeaweedFS.
- Link privacy mở được không cần đăng nhập.

## Kết quả (08/10/2026)

- Có sẵn: workflow `release.yml` (tag ⟹ zip Chrome + Edge lên GitHub Release), `CHANGELOG.md`, trang privacy song ngữ `docs/privacy.md`, nội dung nộp store `docs/store-listing.md`, 12 ảnh 1280×800 trong `docs/store/screenshots` (tạo lại bằng `pnpm screenshots`).
- Còn lại (cần chủ dự án): chốt tên, bật GitHub Pages, tài khoản store + 2FA, tag `v0.1.0`, nộp, xử lý review.

## Rủi ro

- Store từ chối vì quyền host: đã dùng `optional_host_permissions` + xin theo origin; nếu vẫn bị hỏi, nêu lý do trong
  ô giải thích quyền.
- Review lâu (thường vài ngày) — không chặn các việc khác.

## Cập nhật 09/10/2026

- Tên: **Kho Mây**. Trang privacy: https://achoo254.github.io/s3-object-manager-extension/privacy (GitHub Pages từ `docs/`).
- Ảnh store chụp lại với tên mới; secret scanning + push protection đã bật.
- Còn lại (cần chủ dự án): tài khoản Chrome Web Store + Edge Partner Center (2FA), tag `v0.1.0`, nộp, xử lý review.

