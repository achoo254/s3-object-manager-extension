# Phase 4 — Upload multipart tiếp tục được

Tier: **M** · Phụ thuộc: phase 2 · Song song được với phase 3 · Trạng thái: chưa làm · Issue: #4

## Mục tiêu

Upload file nhiều GB ổn định qua mọi endpoint (kể cả endpoint đứng sau proxy/CDN), RAM không tăng theo cỡ file, và
tiếp tục được sau khi mất mạng, đóng tab hoặc khởi động lại trình duyệt.

## Yêu cầu

- Chọn file bằng hộp chọn hoặc kéo thả (file và thư mục, giữ đường dẫn tương đối làm key).
- File ≤ 16 MiB: `PutObject` một lượt. Lớn hơn: multipart.
- Cỡ part: mặc định 8 MiB; tăng để số part ≤ 10.000; **trần 64 MiB** (giữ dưới trần body của proxy/CDN phổ biến và
  dưới 100 giây mỗi request ở đường truyền chậm). File vượt 10.000 × 64 MiB (~625 GiB) ⟹ từ chối, nói rõ lý do.
- Đọc từng part bằng `file.slice()` ngay trước khi gửi — không đọc cả file vào RAM.
- Mặc định 4 part song song, chỉnh được 1–8. Part lỗi thử lại 3 lần, chờ tăng dần.
- Trạng thái lưu ở IndexedDB, khoá theo `profileId + bucket + key + vân tay file (tên, cỡ, lastModified)`:
  `uploadId`, cỡ part, danh sách `{PartNumber, ETag}` đã xong.
- Tiếp tục: người dùng chọn lại **đúng file** (trình duyệt không cho đọc lại file khi chưa có thao tác của người dùng);
  khớp vân tay ⟹ gọi `ListParts` để đối chiếu với server, chỉ gửi part còn thiếu.
- Huỷ ⟹ `AbortMultipartUpload` + xoá trạng thái. Có màn hình liệt kê upload dở trên server (`ListMultipartUploads`)
  để dọn — các upload dở vẫn tính dung lượng ở nhiều nhà cung cấp.
- Hàng đợi upload hiển thị tiến độ từng file, tốc độ, thời gian còn lại; chạy trong tab manager (không chạy trong service
  worker — service worker bị dừng khi rỗi).
- Cảnh báo khi đóng tab lúc đang upload (`beforeunload`).

## Tệp

| Tệp | Việc |
|---|---|
| `src/core/upload/{part-planner.ts,multipart-uploader.ts,upload-state-store.ts,retry.ts}` | lõi upload |
| `src/features/upload/{UploadQueue.vue,DropZone.vue,PendingUploads.vue}` | giao diện |
| `tests/unit/part-planner.test.ts`, `tests/unit/multipart-uploader.test.ts` | unit test |

## Kiểm

- Unit `part-planner`: 1 GiB ⟹ 128 part × 8 MiB; 200 GiB ⟹ cỡ part tăng để ≤ 10.000 part và ≤ 64 MiB; 700 GiB ⟹ từ chối.
- Unit `multipart-uploader` (S3 giả): part 3 lỗi hai lần rồi thành công ⟹ hoàn tất; trạng thái sau mỗi part được lưu.
- Trên SeaweedFS: upload 2 GB, tắt mạng ở ~40%, bật lại, chọn lại file ⟹ chỉ gửi phần còn thiếu, ETag cuối khớp.
- Trên SeaweedFS: upload 5 GB, đỉnh RAM tab ≤ 4 × 8 MiB + 50 MB.
- Thông lượng ≥ 80% `aws s3 cp` (đo ở phase 6).

## Rủi ro

- Một số nhà cung cấp tính ETag multipart khác nhau ⟹ chỉ dùng ETag trả về từ chính server, không tự tính để so.
- Người dùng chọn file khác cùng tên cùng cỡ ⟹ vân tay còn có `lastModified`; vẫn trùng thì `ListParts` vẫn cho tiếp tục
  sai nội dung. Chấp nhận rủi ro này ở MVP, ghi trong README.
