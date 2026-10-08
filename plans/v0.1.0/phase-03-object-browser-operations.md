# Phase 3 — Duyệt và thao tác object, download, chia sẻ link

Tier: **M** · Phụ thuộc: phase 2 · Song song được với phase 4 · Trạng thái: chưa làm · Issue: #3

## Mục tiêu

Duyệt bucket/thư mục ở quy mô hàng trăm nghìn object mà không giật; xoá, đổi tên, sao chép, tạo thư mục; download file
lớn không chiếm RAM; tạo link chia sẻ có thời hạn trong một cú bấm.

## Yêu cầu

### Duyệt

- `ListObjectsV2` với `Delimiter: '/'`, `MaxKeys: 1000`, phân trang bằng `ContinuationToken` — **tải thêm khi cuộn**,
  không tải hết trước.
- Danh sách ảo hoá (`v-virtual-scroll`). Breadcrumb theo prefix; lọc theo tiền tố tên (gửi lên server bằng `Prefix`,
  không lọc phía client trên danh sách chưa tải hết).
- Cột: tên, cỡ, ngày sửa, storage class nếu có. Chọn nhiều.

### Thao tác

| Thao tác | Cách làm | Ghi chú |
|---|---|---|
| Xoá | `DeleteObjects` theo lô 1.000 key | Xoá thư mục = liệt kê prefix (không delimiter) + xoá theo lô, có tiến độ và nút huỷ |
| Đổi tên / di chuyển | `CopyObject` rồi `DeleteObject` | Object > 5 GiB: `UploadPartCopy` theo part. Thư mục: từng object, có tiến độ, **cảnh báo không nguyên tử** |
| Sao chép | `CopyObject` (hoặc `UploadPartCopy` khi > 5 GiB) | |
| Tạo thư mục | `PutObject` key `prefix/` rỗng | |
| Xem thuộc tính | `HeadObject` | content-type, ETag, metadata |
| Download | presigned `GetObject` (15 phút) + `chrome.downloads.download` | Trình duyệt tự tải, không đọc file vào RAM |
| Chia sẻ link | `@aws-sdk/s3-request-presigner`, thời hạn 1 giờ / 1 ngày / 7 ngày (trần SigV4 là 7 ngày) | Nút sao chép; ghi rõ link hết hạn lúc nào; ghi rõ ai có link là tải được |

- Mọi thao tác phá huỷ (xoá, ghi đè khi đổi tên) có hộp xác nhận nêu **số object** sẽ bị tác động.
- Tính năng nào nhà cung cấp trả `NotImplemented` thì ẩn trong phiên làm việc đó, không báo lỗi lặp lại.

## Tệp

| Tệp | Việc |
|---|---|
| `src/features/browser/{BucketList.vue,ObjectTable.vue,Breadcrumbs.vue}` | giao diện duyệt |
| `src/features/browser/use-object-listing.ts` | phân trang + tải thêm |
| `src/core/s3/operations/{delete-objects.ts,copy-object.ts,presign.ts,download.ts}` | thao tác |
| `src/core/s3/capabilities.ts` | ghi nhận `NotImplemented` theo profile |
| `tests/unit/delete-objects.test.ts`, `tests/unit/copy-object.test.ts` | chia lô, chọn copy thường / multipart |

## Kiểm

- Unit: 2.500 key ⟹ đúng 3 lô `DeleteObjects`; object 6 GiB ⟹ đi nhánh `UploadPartCopy`.
- Trên SeaweedFS: tạo 100.000 object trong một prefix bằng script, mở thư mục ⟹ trang đầu hiện sau 1 request, cuộn mượt.
- Download file 5 GB ⟹ RAM tab không tăng theo cỡ file (Chrome Task Manager).
- Link chia sẻ mở được trong cửa sổ ẩn danh (không có extension).

## Rủi ro

- Đổi tên thư mục lớn bị ngắt giữa chừng ⟹ object nằm ở cả hai chỗ. Hiện danh sách object còn lại để người dùng chạy tiếp
  hoặc dọn; không tự xoá phía nguồn khi chưa copy xong.
