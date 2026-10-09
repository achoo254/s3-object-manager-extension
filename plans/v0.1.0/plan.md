---
title: "Extension trình duyệt quản lý object trên mọi endpoint tương thích S3"
description: "Extension Chrome/Edge (MV3) duyệt, upload, download, xoá, đổi tên và chia sẻ object trên bất kỳ endpoint S3 nào chỉ với endpoint + credentials, giao diện tiếng Việt là chính."
status: in-progress
priority: P2
effort: M
branch: main
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-10-08
---

# MVP v0.1.0 — extension quản lý object S3

Trạng thái: đang làm (mã phase 1–5 xong, phase 6 một phần, phase 7 chờ tài khoản store) · Tạo 08/10/2026 · Tier tổng: **M** (~7 module)

Danh sách việc: milestone `v0.1.0`, issue theo dõi **#8**, mỗi phase một issue (#1–#7).

> ⛔ **Repo này chỉ nói về chính extension.** Không nhắc tên tổ chức/sản phẩm bên ngoài dự án ở bất kỳ đâu: mã, chú thích,
> tên tệp/biến, commit message, tên nhánh, README/docs, dữ liệu test, cấu hình CI, issue, PR, release note, trang store.
> Không commit endpoint hay khoá của cụm thử nghiệm. Cổng CI chặn từ cấm đọc danh sách từ secret `FORBIDDEN_TERMS_REGEX`
> (phase 1) — **không** ghi danh sách đó vào repo.

## Bối cảnh

- Các tool S3 phổ biến (AWS CLI, rclone, s3cmd, Cyberduck, WinSCP, S3 Browser) đều phải cài, vài cái chỉ chạy Windows, và
  không cái nào có giao diện tiếng Việt.
- Nhiều endpoint S3 không cấu hình CORS đủ cho trình duyệt (thiếu `Expose-Headers: ETag` ⟹ một trang web không đọc được
  `ETag`, upload multipart hỏng). Trang extension có host permission **không bị CORS chặn** ⟹ dạng extension dùng được với
  mọi nhà cung cấp mà không cần sửa cấu hình bucket.
- Extension **gọi thẳng** endpoint S3 từ trình duyệt, **không** có backend hay proxy: credentials không rời máy người dùng,
  không tốn hạ tầng, dữ liệu không đi hai chặng.
- Phát hành bằng tài khoản store cá nhân (Chrome Web Store + Edge Add-ons). Repo công khai, giấy phép MIT. Trang chính
  sách quyền riêng tư đặt trên GitHub Pages của repo.

## Lý do tồn tại (khảo sát Chrome Web Store 08/10/2026)

Extension có sẵn đã làm được phần lớn MVP. Dự án chỉ đáng làm vì **hai lý do đứng một mình được**: người dùng Việt, và
người cần **kiểm được** credentials của mình đi đâu. Nếu không cần hai điều này thì dùng extension có sẵn là đủ.

Đối thủ chính (thông tin từ trang store lúc khảo sát):

- **Stream Vessel** — "S3 Browser & Cloud Storage AI Manager": hai khung kéo thả giữa bucket/nhà cung cấp, tìm kiếm cả
  bucket, sửa file text, presign, giới hạn kết nối theo bucket/prefix, Google Drive, MCP; quyền host xin theo từng kết nối.
  Giao diện tiếng Anh; dùng Google Analytics và đăng nhập Google/GitHub; trang store không nêu mã nguồn mở hay mã hoá
  credentials. 202 người dùng, bản 1.8.0 (21/09/2026).
- **Fileon – S3 Browser**: endpoint tuỳ chỉnh, path/virtual-hosted, presign, file >5 GB, ACL. Chưa xác định được tình trạng
  bảo trì (trang store không tải được nội dung khi khảo sát).
- Cũ hoặc không liên quan: `chrome-s3` (chỉ AWS), "My S3 Browser" (gỡ khỏi store 2022), "S3 Bucket Tool" / "S3BucketList"
  (dò URL bucket, không quản lý).

| Lý do (mạnh → yếu) | Extension này | Stream Vessel | Fileon |
|---|---|---|---|
| Giao diện tiếng Việt, lỗi S3 dịch thành việc cần làm | Có (phase 5) | Chỉ tiếng Anh | Chưa rõ |
| Mã nguồn mở MIT | Có | Không nêu | Không nêu |
| Không telemetry, không tài khoản, không đăng nhập | Có | Có analytics + đăng nhập | Chưa rõ |
| Lưu kết nối cục bộ, dùng ngay không cần mật khẩu (đổi 09/10/2026, xem nhật ký quyết định) | Có | Có đăng nhập | Chưa rõ |
| Ma trận tương thích công khai, có Ceph RGW | Có (phase 6) | Không nêu nhà cung cấp cụ thể | Có liệt kê Ceph |
| Upload multipart tiếp tục được sau khi đóng trình duyệt | Có (phase 4) | Ghi "retry" | Ghi ">5 GB" |

**Không** dùng làm điểm khác biệt (extension có sẵn đã làm): không cần cài, nhiều nhà cung cấp/endpoint tuỳ chỉnh, presigned
link, quyền host theo từng endpoint, upload file lớn. Hai khung kéo thả, tìm kiếm cả bucket, giới hạn theo prefix: ngoài
MVP — nếu muốn cạnh tranh tính năng sau MVP thì làm plan riêng.

## Contract

- **Outcome:** extension Chrome/Edge quản lý object trên mọi endpoint tương thích S3, chỉ cần endpoint + credentials,
  giao diện tiếng Việt là chính (kèm tiếng Anh).
- **Constraints:** MV3; quyền host xin theo từng endpoint lúc chạy; credentials lưu cục bộ (không passphrase — quyết định 09/10/2026), chỉ gửi tới chính
  endpoint S3; không telemetry; không mã tải từ xa; SDK tắt checksum mặc định; giao diện Vuetify 3 (Material Design 3) với
  token riêng, không dùng design system hay nhận diện của thương hiệu khác.
- **Non-goals:** IAM/policy/quota; đồng bộ thư mục; lifecycle/versioning/object lock; Firefox; tự động publish lên store.
- **Acceptance criteria:**
  1. Cùng một bản build chạy trọn duyệt, upload multipart >1 GB (tiếp tục được sau khi bị dừng), download, xoá, đổi tên và
     presign trên **SeaweedFS, Ceph RGW, Backblaze B2 và MinIO (image cuối cùng)** — ghi vào ma trận tương thích.
  2. Mọi lỗi S3 thường gặp (bảng ở phase 5) hiện câu tiếng Việt nêu việc cần làm.
  3. ~~Đóng trình duyệt rồi mở lại: credentials không đọc được nếu không nhập passphrase.~~ Thay bằng (09/10/2026):
     kết nối dùng được ngay sau khi lưu, và còn nguyên sau khi cập nhật bản thử (cùng ID extension).
  4. Mỗi endpoint chỉ được cấp quyền host sau khi người dùng đồng ý.
  5. Có trang chính sách quyền riêng tư công khai; bản zip được Chrome Web Store và Edge Add-ons nhận.
  6. Performance đạt ngưỡng ở mục dưới, số đo ghi ở `docs/performance.md`.

## Performance (chốt trước khi code)

Mọi ngưỡng là **giả định, cần xác nhận** — chưa có người dùng thật để lấy số.

| Đại lượng | Khối lượng giả định | Ngưỡng | Cách đo |
|---|---|---|---|
| Liệt kê thư mục lớn | 100.000 object trong một prefix | Trang đầu (1.000 key) sau **1 round-trip**; cuộn không giật (danh sách ảo hoá) | Đếm request trong DevTools Network; dữ liệu tạo bằng script trên SeaweedFS |
| Thông lượng upload | file 2 GB, cùng máy, cùng endpoint | ≥ **80%** thông lượng của `aws s3 cp` | So thời gian, lặp 3 lần, lấy trung vị |
| Bộ nhớ khi upload | file 5 GB | RAM tab tăng ≤ **số luồng × cỡ part + 50 MB** (mặc định 4 × 8 MiB) | Chrome Task Manager, ghi đỉnh |
| Xoá thư mục | 10.000 object | ≤ **10 request** `DeleteObjects` (1.000 key/request) | Đếm request |
| Download file lớn | file 5 GB | RAM tab không tăng theo cỡ file (trình duyệt tự tải qua presigned URL) | Chrome Task Manager |

## Kiến trúc

```
Bấm icon extension ──► mở tab manager.html (KHÔNG dùng popup: popup đóng khi mất focus, upload dài sẽ chết)
   │
   ├─ kết nối (AES-GCM, khoá ngẫu nhiên lưu cùng máy) ──► chrome.storage.local
   │        └─ khoá đã mở (raw bytes) ──► chrome.storage.session (chỉ trong RAM, mất khi khởi động lại trình duyệt)
   ├─ s3-client factory (@aws-sdk/client-s3, checksum WHEN_REQUIRED, forcePathStyle theo profile)
   │        └─ fetch thẳng tới endpoint (host permission ⟹ không CORS)
   ├─ upload engine (multipart, song song, trạng thái ở IndexedDB)
   └─ download = presigned URL + chrome.downloads (trình duyệt tự tải, không giữ file trong RAM)
```

Stack: **WXT + Vue 3 + TypeScript + Vuetify 3 (Material Design 3, token riêng) + vue-i18n (dịch sẵn lúc build) + Vitest +
Playwright**. Phiên bản chốt cứng lúc scaffold, chọn bản phát hành ≥2 tuần tuổi.

## Phase

| # | Phần | Tier | Phụ thuộc | Tệp | Issue |
|---|---|---|---|---|---|
| 1 | Khung repo, build, CI, SeaweedFS local | S | — | [phase-01](phase-01-repo-scaffold-ci.md) | #1 |
| 2 | Profile kết nối + vault credentials + quyền host | M | 1 | [phase-02](phase-02-connection-profiles-vault.md) | #2 |
| 3 | Duyệt và thao tác object, download, chia sẻ link | M | 2 | [phase-03](phase-03-object-browser-operations.md) | #3 |
| 4 | Upload multipart tiếp tục được | M | 2 | [phase-04](phase-04-resumable-multipart-upload.md) | #4 |
| 5 | Tiếng Việt hoàn chỉnh + dịch lỗi S3 | S | 3, 4 | [phase-05](phase-05-vietnamese-ui-error-mapping.md) | #5 |
| 6 | Kiểm thử đa nhà cung cấp, đo performance | M | 3, 4, 5 | [phase-06](phase-06-multi-provider-testing.md) | #6 |
| 7 | Phát hành Chrome Web Store + Edge Add-ons | S | 6 | [phase-07](phase-07-store-release.md) | #7 |

Phase 3 và 4 làm song song được (tệp tách biệt: `src/features/browser/**` vs `src/features/upload/**`).

## Tiến độ (09/10/2026)

| # | Trạng thái | Còn lại |
|---|---|---|
| 1 | Xong | Cài hook trên máy (`scripts/install-git-hooks.sh`, cần biến `FORBIDDEN_TERMS_REGEX`) và đặt secret đó cho Dependabot. Cổng từ cấm đã tự chứng thực trên CI (bắt đúng một dòng vi phạm thật trong plan); secret scanning + push protection đã bật |
| 2 | Xong (đổi hướng 09/10: bỏ passphrase) | — Hộp thoại cấp quyền thật đã dùng trên Edge với endpoint lab |
| 3 | Xong | — |
| 4 | Xong | Kiểm tay tắt mạng giữa chừng trong trình duyệt thật (logic tiếp tục đã có test tích hợp trên 3 server) |
| 5 | Xong | — |
| 6 | Gần xong | SeaweedFS, MinIO, Ceph RGW (path-style) đạt mọi ô; Backblaze B2 chờ tài khoản của chủ dự án; số đo qua mạng thật trên Ceph ở docs/performance.md |
| 7 | Chuẩn bị xong | Tên **Kho Mây**; trang privacy trên GitHub Pages; còn tài khoản store + 2FA, tag `v0.1.0`, nộp hai store |

## Rủi ro chính

| Rủi ro | Xử lý |
|---|---|
| Lộ credentials (có thể là khoá root AWS) | Không còn passphrase (09/10/2026): README, form và trang privacy nói rõ ai dùng được máy là lấy được khoá; khuyên khoá phạm vi hẹp; không telemetry |
| Tài khoản store/dependency bị chiếm ⟹ bản cập nhật độc hại | 2FA tài khoản store; ít dependency, khoá phiên bản, lockfile; Dependabot chỉ tạo PR |
| Server không phải AWS từ chối checksum CRC32 / đòi `Content-MD5` cho `DeleteObjects` | `WHEN_REQUIRED` cho mọi thao tác; riêng `DeleteObjects` **luôn** bỏ CRC32 và gửi `Content-MD5` (phase 2) |
| Khoá phạm vi hẹp không có quyền `ListBuckets` | Profile cho khai bucket mặc định; kiểm kết nối bằng `HeadBucket` khi `ListBuckets` bị `AccessDenied` |
| Proxy/CDN trước endpoint giới hạn cỡ body và thời gian mỗi request | Part mặc định 8 MiB, tối đa 64 MiB, không PUT đơn >64 MiB |
| Store từ chối vì quyền host rộng hoặc thiếu chính sách quyền riêng tư | `optional_host_permissions`, xin theo từng origin; trang privacy trên GitHub Pages |

## Câu hỏi còn mở

- ~~Tên extension trên store~~ — chốt **Kho Mây** (09/10/2026): dễ hiểu với người dùng phổ thông, không chứa nhãn hiệu bên khác.

## Nhật ký quyết định

### Kiểm chứng khẳng định kỹ thuật (08/10/2026)

| Khẳng định | Kết quả | Nguồn |
|---|---|---|
| `chrome.storage.session` chỉ trong RAM, xoá khi khởi động lại, không lộ ra content script | Đúng (10 MB, xoá cả khi reload/cập nhật extension) | developer.chrome.com/docs/extensions/reference/api/storage |
| Giữ `CryptoKey` non-extractable trong `chrome.storage.session` | **Sai** — storage chỉ nhận giá trị JSON ⟹ giữ raw bytes | như trên |
| Chỉ thêm `Content-MD5` cho `DeleteObjects` khi ma trận cho thấy cần | **Sai** — `DeleteObjects` bắt buộc checksum nên SDK vẫn gửi CRC32 dù `WHEN_REQUIRED`; nhiều server tương thích S3 đã được ghi nhận từ chối | gitlab.com/gitlab-org/container-registry/-/issues/2309; kb.netapp.com (StorageGRID multi-object delete) |
| `http://localhost/*` khớp server S3 local ở cổng bất kỳ | Đúng — "Match patterns match all ports unless an explicit port is specified" | developer.chrome.com/docs/extensions/develop/concepts/match-patterns |
| Playwright nạp extension unpacked, chạy headless | Đúng — `launchPersistentContext` + `channel: 'chromium'` | playwright.dev/docs/chrome-extensions |
| WXT build Edge ra `edge-mv3`, zip riêng | Đúng — `wxt build -b edge`, `wxt zip -b edge` | wxt.dev/guide/multiple-browsers |
| vue-i18n chạy được dưới CSP của MV3 | Phải dịch sẵn lúc build — bản đầy đủ biên dịch message lúc chạy, vỡ CSP | vue-i18n.intlify.dev/guide/advanced/optimization |

### Quyết định

| Câu hỏi | Chọn | Lý do |
|---|---|---|
| ~~Giữ khoá vault đã mở ở đâu~~ (bỏ 09/10/2026) | Raw bytes trong `chrome.storage.session`, `importKey` non-extractable mỗi lượt dùng | Lỡ đóng tab không phải nhập lại passphrase; vẫn mất khi khởi động lại trình duyệt, có tự khoá |
| Checksum của `DeleteObjects` | Luôn bỏ CRC32, gửi `Content-MD5`, mọi endpoint | AWS cũng nhận `Content-MD5` ⟹ một đường cho mọi nhà cung cấp |
| vue-i18n dưới CSP | `@intlify/unplugin-vue-i18n` + bản runtime-only | Không cần `unsafe-eval` |
| Server S3 local + CI | SeaweedFS | MinIO bản cộng đồng đã ngừng phát hành image (~10/2025) và bị archive; SeaweedFS còn duy trì, chạy một container |
| Ma trận tương thích | SeaweedFS, Ceph RGW, Backblaze B2, MinIO (image cuối, chạy tay) | B2 miễn phí 10 GB không cần thẻ, kiểm được cả hai kiểu địa chỉ; MinIO vẫn còn nhiều hệ tự dựng |
| Nền giao diện | Vuetify 3 Material Design 3 + token riêng | Đủ bảng dữ liệu, danh sách ảo hoá, dialog, form; giấy phép MIT |
| Backend/proxy | Không | Credentials ở lại máy người dùng; extension không bị CORS chặn |
| Passphrase cho credentials (09/10/2026, chủ dự án quyết) | **Bỏ**: lưu xong dùng ngay | Người dùng mục tiêu là người phổ thông, ít kỹ thuật. Không có bí mật của người dùng thì mã hoá chỉ để che mắt; ghi rõ trong privacy |
| Giữ kết nối khi cập nhật bản thử (09/10/2026) | ID extension cố định cho bản pre-release (khoá manifest chỉ thêm khi `PRERELEASE_BUILD=1`); vault passphrase cũ bị bỏ | Store tự cấp ID nên bản store không mang khoá |
