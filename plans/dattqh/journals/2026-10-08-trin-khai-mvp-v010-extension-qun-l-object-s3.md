---
title: Triển khai MVP v0.1.0 extension quản lý object S3
date: 2026-10-08
summary: "Phase 1–5 xong mã, phase 6 một phần trên SeaweedFS, phase 7 đã chuẩn bị; review tìm và sửa 1 Critical, 2 High"
---

# Triển khai MVP v0.1.0 extension quản lý object S3

## What happened

- Dựng extension MV3 (WXT 0.21 + Vue 3.5 + Vuetify 3.13 MD3 + vue-i18n precompile + AWS SDK v3), toàn bộ dependency chốt cứng bản ≥ 2 tuần tuổi.
- Lõi: vault PBKDF2→AES-GCM với khoá raw trong `chrome.storage.session`; S3 client factory (`WHEN_REQUIRED` + middleware đổi CRC32 sang `Content-MD5` cho `DeleteObjects`); upload multipart tiếp tục được qua IndexedDB + `ListParts`; bảng dịch lỗi S3.
- Kiểm: 102 unit, 10 tích hợp với SeaweedFS 4.47 thật, 1 e2e Playwright đủ kịch bản; đo performance bằng `pnpm perf`.

## Khó khăn và nguyên nhân gốc

- SeaweedFS giữ thư mục thật: xoá hết object, thư mục rỗng vẫn nằm trong `CommonPrefixes`; xoá key thư mục cha khi con còn thì không có tác dụng; không xoá đệ quy. Sửa: sau khi xoá/chuyển, xoá key thư mục theo độ sâu, sâu trước.
- SeaweedFS hết volume sau vài bucket thử (mỗi bucket là một collection) ⟹ `-volume.max=100`.
- `v-virtual-scroll` tự xử lý `scroll`, listener `@scroll` trong template không chạy ⟹ không tải trang 2. Sửa bằng listener gốc qua ref.
- Dialog mount bằng `v-if` khi `open` đã `true` ⟹ `watch(open)` không chạy, link chia sẻ không sinh. Sửa: `immediate: true`.
- Checkbox của Vuetify mang `grid-area`, làm lệch lưới cột bảng.
- Review: dialog xoá có thể xác nhận bằng danh sách key của lần mở trước (Critical); chuyển thư mục lên thư mục cha ghi đè nguồn chưa xử lý; màn upload dở cho huỷ upload đang chạy. Đã sửa, có test.

## Decision

- Khoá vault (tay hoặc tự động) tạm dừng mọi upload; hàng đợi không giữ S3 client.
- Bản e2e (`--mode e2e`) cấp sẵn `http://localhost` vì Playwright không bấm được hộp thoại quyền; bản phát hành không có.
- Không hạ ngưỡng thông lượng: 57% `aws s3 cp` trên loopback, ghi nguyên nhân và đề xuất ở docs/performance.md.

## Next steps

- Đặt secret `FORBIDDEN_TERMS_REGEX`, bật secret scanning, cài hook local.
- Kiểm MinIO, Ceph RGW, Backblaze B2 bằng `pnpm test:integration`; đo lại thông lượng qua mạng thật.
- Chốt tên, bật GitHub Pages cho trang privacy, nộp store.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
