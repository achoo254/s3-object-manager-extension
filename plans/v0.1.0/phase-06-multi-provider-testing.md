# Phase 6 — Kiểm thử đa nhà cung cấp và đo performance

Tier: **M** · Phụ thuộc: phase 3, 4, 5 · Trạng thái: một phần · Issue: #6

## Mục tiêu

Chứng minh **cùng một bản build** chạy đúng trên ít nhất ba nhà cung cấp, và đo đủ các ngưỡng performance trong `plan.md`.
Chưa test trên nhà cung cấp nào thì README không ghi "hỗ trợ" nhà cung cấp đó.

## Yêu cầu

### E2E tự động (CI)

- Playwright mở Chromium với extension unpacked: `chromium.launchPersistentContext` với `channel: 'chromium'` (chạy được
  headless), cờ `--disable-extensions-except=<dir>` + `--load-extension=<dir>`; lấy extension ID từ URL của service worker
  (`context.serviceWorkers()` hoặc chờ sự kiện `serviceworker`). SeaweedFS chạy làm service container của GitHub Actions.
- Kịch bản: đặt passphrase → thêm profile → cấp quyền host → tạo bucket qua seed → upload 50 MB (multipart) → duyệt →
  đổi tên → presign rồi `fetch` link từ ngữ cảnh không có extension → download → xoá thư mục → khoá vault, mở lại.
- Giữ dung lượng nhỏ trong CI (≤ 100 MB); file lớn đo tay.

### Ma trận thủ công

| Nhà cung cấp | Nơi chạy | Ghi chú |
|---|---|---|
| SeaweedFS | docker local | đã có trong CI |
| MinIO | docker local, image cuối cùng chốt cứng, chỉ chạy tay | dự án đã archive nhưng nhiều hệ tự dựng vẫn chạy MinIO; không đưa vào CI |
| Ceph RGW | cụm thử nghiệm riêng, dùng IAM user phạm vi hẹp | **không** ghi endpoint hay khoá thử nghiệm vào repo |
| Backblaze B2 | gói miễn phí 10 GB, không cần thẻ thanh toán | kiểm **cả** path-style và virtual-hosted; khoá chỉ dùng để test, xoá sau |

Mỗi ô ghi đạt/không đạt cho: liệt kê, upload thường, multipart + tiếp tục, download, đổi tên, xoá lô (`DeleteObjects`
với `Content-MD5`), presign, khoá phạm vi hẹp không có `ListBuckets`.
Ô nào hỏng vì khác biệt nhà cung cấp ⟹ sửa trong `s3-client-factory.ts` hoặc `capabilities.ts`, không rẽ nhánh rải rác.

### Đo performance

Chạy các phép đo trong bảng Performance của `plan.md` trên SeaweedFS local và trên Ceph RGW; ghi kết quả (số liệu, máy, phiên
bản, lệnh) vào `docs/performance.md`. Lặp mỗi phép đo 3 lần, lấy trung vị.
Ngưỡng không đạt ⟹ nêu nguyên nhân khả dĩ và đề xuất, không âm thầm hạ ngưỡng.

## Tệp

| Tệp | Việc |
|---|---|
| `tests/e2e/extension.spec.ts`, `playwright.config.ts` | E2E |
| `.github/workflows/ci.yml` | thêm job e2e có service SeaweedFS |
| `docs/compatibility.md` (trong repo extension) | ma trận tương thích công khai |

## Kiểm

- Job e2e xanh trên CI.
- Ma trận đủ ba nhà cung cấp, mọi ô có kết quả.
- Báo cáo đo có đủ năm đại lượng.

## Kết quả (08/10/2026)

- E2E Playwright đủ kịch bản, đạt trên SeaweedFS 4.47; job `e2e` trong CI dùng `docker compose`.
- Ma trận: SeaweedFS và MinIO đạt mọi ô (docs/compatibility.md). MinIO không còn image công khai nên kiểm bằng binary chính thức bản cuối `RELEASE.2025-09-07T16-13-09Z` (đối chiếu sha256).
- Khoá phạm vi hẹp: cả hai server trả danh sách bucket đã lọc thay vì `AccessDenied` (MinIO kể cả khi policy cấm hẳn `ListAllMyBuckets`); nhánh dự phòng `HeadBucket` chỉ có unit test.
- Ceph RGW: không dùng khoá trong tệp môi trường thật và không dựng Ceph trên máy (quyết định 08/10/2026); chờ cụm thử nghiệm của chủ dự án.
- Backblaze B2: chờ chủ dự án tạo tài khoản miễn phí; từng bước và lệnh chạy có trong docs/compatibility.md.
- Sửa lỗi phát hiện khi rà ma trận: virtual-hosted với `localhost`/IP gửi tới `<bucket>.localhost`, ngoài quyền host đã xin; nay luôn dùng path-style cho các host này.
- Đo performance (docs/performance.md, `pnpm perf`): 4/5 đạt trên SeaweedFS; thông lượng 57% `aws s3 cp` trên SeaweedFS, 79% và 139% ở hai lượt trên MinIO — loopback quá nhiễu để kết luận; đã chọn đo lại qua mạng thật. Chưa đo trên Ceph RGW.

## Rủi ro

- Máy dev ít RAM: không chạy Playwright song song với build/test nặng khác; chạy e2e một worker.
