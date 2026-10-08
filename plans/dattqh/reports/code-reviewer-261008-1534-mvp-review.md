# Code review — MVP v0.1.0 (mã chưa commit)

Ngày: 08/10/2026 · Người review: code-reviewer · Phạm vi: `src/**`, đối chiếu `plans/v0.1.0/plan.md` + phase 2–5.
Chỉ đọc mã, không chạy test/build (máy dùng chung đang có job nặng). Lint/typecheck/unit/integration/e2e đã được báo là pass.

## Tóm tắt

- Files: toàn bộ `src/core/**`, `src/features/**`, `src/entrypoints/**`, `wxt.config.ts` (~6.000 LOC).
- Đánh giá chung: lõi (vault, factory, middleware MD5, planner, uploader) gọn và đúng hướng plan. Lỗi nặng nằm ở **lớp UI điều phối
  thao tác phá huỷ** (dialog xoá, dialog chuyển/sao chép thư mục, màn upload dở) và **trạng thái dùng chung giữa vault ↔ hàng đợi upload**.
- 1 Critical, 2 High, 8 Medium, một số Low.

## Critical

### C1. DeleteDialog xoá nhầm danh sách key của lần trước (stale `keys`)
`src/features/browser/DeleteDialog.vue:25-51`, `:131-139`

`count()` reset `step/error/result/found` nhưng **không reset `keys`**; `keys` chỉ được gán khi đếm thành công (dòng 45). Khi đếm lỗi hoặc
người dùng bấm "Dừng", `step = 'confirm'`, và nút `delete-confirm` hiện theo điều kiện `step === 'confirm' && keys.length > 0` — không xét `error`.
`ErrorAlert` còn ẩn `AbortError`, nên màn hình chỉ còn mỗi nút đỏ "Xoá N object".

Kịch bản: mở xoá thư mục A → đếm xong 5.000 object → bấm Huỷ (đổi ý). Chọn thư mục B (lớn) → mở xoá → đếm lâu → bấm "Dừng" →
dialog hiện nút "Xoá 5.000 object" → bấm → **xoá toàn bộ A, thứ người dùng đã chủ động huỷ**. Cùng hậu quả khi đếm B lỗi (AccessDenied, mạng).
`DeleteDialog` luôn mounted trong `ObjectBrowser` nên `keys` sống qua nhiều lần mở.

Sửa:
```ts
async function count() {
  keys.value = [];
  ...
}
```
và đổi điều kiện nút thành `step === 'confirm' && !error && keys.length > 0`. Thêm unit/component test: count bị abort ⟹ không có nút xoá.

## High

### H1. Chuyển/sao chép thư mục lên thư mục tổ tiên ghi đè key nguồn chưa xử lý ⟹ mất dữ liệu (cả chế độ copy)
`src/features/browser/TransferDialog.vue:44-50`, `src/core/s3/operations/copy-object.ts:193-206`

`targetProblem` chỉ chặn target nằm **bên trong** nguồn (`value.startsWith(entry.key)`), không chặn target là **tổ tiên** của nguồn.
Đổi tên/di chuyển `a/b/` → `a/` (thao tác "đưa lên một cấp" rất tự nhiên) khi tồn tại `a/b/b/x` và `a/b/x`:
liệt kê theo thứ tự byte ⟹ `a/b/b/x` xử lý trước, target = `a/b/x` ⟹ **ghi đè chính key nguồn `a/b/x` chưa được chuyển**; tới lượt `a/b/x` thì
chép nội dung đã bị ghi đè sang `a/x`. Nội dung gốc của `a/b/x` mất hẳn. Chế độ `copy` cũng phá huỷ nguồn như vậy — trái với kỳ vọng
"sao chép không động vào nguồn". Hộp xác nhận chỉ báo "N object sẽ bị ghi đè" mà không nói đó là object nguồn.

Sửa (một trong hai, nên làm cả hai):
- UI: chặn khi `props.entry.key.startsWith(value)` (target là tổ tiên) giống `transfer.problem.inside`.
- Lõi `transferPrefix`: trước khi chạy, tính tập target key; nếu giao với tập source key chưa xử lý thì từ chối (`throw`) — bảo vệ mọi caller.

### H2. Màn "Upload dở" cho phép huỷ chính upload đang chạy trong tab
`src/features/upload/PendingUploads.vue:31-35`, `:41-49`

`local` loại bỏ state của job đang `running`, rồi `orphans` dùng `known = local.map(uploadId)`. Hệ quả: uploadId của upload **đang chạy**
không có trong `known` ⟹ xuất hiện trong danh sách "upload dở trên server không rõ nguồn" kèm nút "Bỏ". Bấm ⟹ `AbortMultipartUpload` trên
upload đang chạy ⟹ part còn lại lỗi 404 (không retry) ⟹ job `error`; `abortUpload` còn xoá luôn state IndexedDB theo uploadId.
Upload nhiều GB mất trắng, và chính nhãn "không rõ nguồn" dẫn người dùng tới thao tác này.

Sửa: tính `known` từ **toàn bộ** `store.list()` (mọi profile) cộng uploadId của job đang chạy; chỉ dùng bộ lọc `running` cho danh sách `local`.

## Medium

### M1. `cancel()` đua với job đang chạy ⟹ upload mồ côi trên server + state ma trong IndexedDB; lỗi không được xử lý
`src/features/upload/use-upload-queue.ts:147-159`

`cancel` gọi `abort()` rồi đọc ngay `store.get(id)` mà không chờ `runJob` kết thúc. Nếu huỷ trong lúc `CreateMultipartUpload` đang bay hoặc
giữa lúc Create trả về và `store.put(state)` chưa commit: `saved` = `undefined` ⟹ không gọi `AbortMultipartUpload`; sau đó state vẫn được ghi
⟹ upload dở tồn tại trên server (vẫn tính dung lượng) và hiện là "có thể tiếp tục" trong PendingUploads dù người dùng đã huỷ.
Ngoài ra `cancel` là `async` gọi thẳng từ `@click`; lỗi của `abortUpload` (mạng, AccessDenied) thành unhandled rejection, UI im lặng.

Sửa: lưu promise của mỗi `runJob` (`running.set(job.id, promise)`), trong `cancel` → `abort()` → `await running.get(id)?.catch(() => {})`
→ mới `store.get` + `abortUpload`; bọc try/catch, gán `job.error` khi abort thất bại.

### M2. Không chống trùng job cho cùng một upload state
`src/features/upload/use-upload-queue.ts:117-134`, `src/features/upload/PendingUploads.vue:68-84`

`enqueue` không kiểm tra `uploadStateId`. Thả cùng file hai lần, hoặc job đang `paused` mà người dùng lại "Chọn lại file" ở PendingUploads
(chỉ job `running` bị lọc khỏi danh sách) ⟹ hai job cùng `uploadId`: cả hai `ListParts`, cùng gửi các part còn thiếu (tốn gấp đôi băng thông),
job thứ hai `CompleteMultipartUpload` nhận `NoSuchUpload` ⟹ báo lỗi cho một upload thực ra đã xong.

Sửa: trong `enqueue`, nếu đã có job chưa kết thúc cùng `profileId+bucket+key+fingerprint` thì `resume` job đó thay vì tạo mới (có thể thay
`file` bằng File mới chọn).

### M3. Khoá vault không chạm tới hàng đợi upload; S3Client (có credentials) sống mãi trong bộ nhớ
`src/features/upload/use-upload-queue.ts:38`, `:130`, `:160-162`; `src/features/connections/use-vault.ts:38-44`, `:117-126`

`forgetSecrets()` xoá cache client của vault nhưng `clients` của hàng đợi giữ `S3Client` theo từng job và **không bao giờ được dọn**
(kể cả `clearFinished`). Sau "Khoá ngay": job `queued` vẫn tiếp tục được `schedule()` khởi chạy và gửi request ký bằng credentials đã "khoá";
sau khi mở lại, job `paused` resume bằng client cũ — kể cả khi profile đã bị sửa secret hoặc bị xoá. Mâu thuẫn với lời hứa "khoá = credentials
không dùng được" và rủi ro "lộ credentials" trong plan.

Sửa: khi khoá (thủ công/tự động), `pause` mọi job `queued` (và quyết định rõ: giữ `running` chạy tiếp hay pause — auto-lock đã hoãn khi
busy, nên manual lock nên pause hết hoặc hiện cảnh báo); xoá `clients` của job kết thúc; khi resume lấy client mới qua
`useVault().clientFor(profile)` thay vì client đã chụp lúc enqueue.

### M4. Auto-lock không biết tới thao tác xoá/chuyển dài ⟹ mất báo cáo "object còn lại"
`src/entrypoints/manager/App.vue:78-82`, `src/core/vault/auto-lock.ts:44-54`

`isBusy` chỉ xét hàng đợi upload. Di chuyển thư mục vài chục GB hoặc xoá hàng trăm nghìn object có thể chạy > 30 phút không có thao tác
chuột/phím ⟹ auto-lock ⟹ `ProfileView` bị unmount cùng `TransferDialog`/`DeleteDialog`. Hàm async vẫn chạy ngầm (closure giữ client, không có
abort khi unmount) nhưng kết quả và danh sách `remaining` — yêu cầu ở phase 3 ("hiện danh sách object còn lại để chạy tiếp hoặc dọn") — biến mất.

Sửa: một bộ đếm "busy" dùng chung (vd. `useBusyOperations()`), Transfer/Delete đăng ký khi `running`; `isBusy` = upload || operations.
Thêm `onBeforeUnmount(() => controller?.abort())` cho hai dialog.

### M5. Xoá trống ô "Tự khoá" ⟹ vault khoá trong ≤15 giây
`src/features/settings/use-settings.ts:15-18`, `src/features/settings/SettingsDialog.vue:36-39`

`update` gán thẳng `changes` vào state (chỉ bản lưu xuống storage mới qua `sanitizeSettings`). Người dùng xoá ô để gõ số mới ⟹
`Number('') = 0` ⟹ `settings.autoLockMinutes = 0` ⟹ `isIdleExpired(last, 0, now)` luôn đúng ⟹ lượt `check` kế tiếp khoá vault ngay khi
đang ở trong hộp cài đặt.

Sửa: `Object.assign(state, sanitizeSettings({ ...state, ...changes }))`, và chỉ commit giá trị auto-lock khi blur/hợp lệ.

### M6. Auto-lock ép trạng thái `locked` cả khi không có vault
`src/core/vault/auto-lock.ts:44-54`, `src/features/connections/use-vault.ts:123-126`

`check()` không kiểm tra vault còn tồn tại/đang mở; `markLocked()` gán cứng `status = 'locked'`. Sau "Quên passphrase → xoá vault", nếu
màn tạo vault để yên quá N phút (hoặc `vaultLastActivity` cũ còn trong session), UI chuyển sang màn **mở khoá** cho một vault không tồn tại;
reload lại thì `check()` chạy ngay và lặp lại. Mở khoá báo lỗi "No vault to unlock" dạng lỗi chung.

Sửa: trong `check()` chỉ khoá khi `await isUnlocked()`; `markLocked` gọi `refresh()` thay vì gán cứng trạng thái.

### M7. Quyền host: thu hồi nhầm, và request ném lỗi ngoài try
`src/core/profiles/host-permission.ts:9-15`, `:31-38`; `src/features/connections/ConnectionForm.vue:102-107`, `:120-124`

1. `releaseHostPermission` so khớp chuỗi pattern. Profile A `virtual` (`https://*.s3.example.com/*`) và profile B `path` cùng host
   (`https://s3.example.com/*` — lúc lưu B, Chrome trả `true` vì wildcard đã bao, không cấp pattern riêng). Xoá A ⟹ pattern khác B ⟹
   `permissions.remove` wildcard ⟹ **B mất quyền**. Sửa: không remove nếu còn profile có hostname bằng hoặc là subdomain của host bị xoá,
   hoặc sau khi remove kiểm `contains` cho các profile còn lại và request lại khi cần (cần user gesture — nên tránh remove từ đầu).
2. `virtual` + `http://localhost`/`127.0.0.1` sinh `http://*.localhost/*` (không có trong `optional_host_permissions`); `virtual` + IP
   sinh `https://*.10.0.0.5/*` (pattern không hợp lệ). `permissions.request` ném lỗi, mà lệnh `await` nằm **trước** `try` trong `test()`/`save()`
   ⟹ unhandled rejection, nút bấm không phản hồi, profile không được lưu. Sửa: validate trong `normalizeEndpoint`/form (virtual cần hostname DNS,
   không cho với localhost/IP) và bọc request trong try.
3. Sửa endpoint của profile không thu hồi origin cũ; "Quên passphrase → xoá vault" không thu hồi origin nào (yêu cầu phase 2: xoá profile ⟹
   remove origin). Có thể dùng `permissions.getAll()` để dọn khi reset.

### M8. Xoá/di chuyển thư mục: một `DeleteObject` tuần tự cho **mỗi** thư mục con
`src/core/s3/operations/delete-objects.ts:106-119`, gọi từ `deleteFolders` (`:99-102`) và `transferPrefix` (`copy-object.ts:207-209`)

`folderEntriesToRemove` sinh mọi thư mục con xuất hiện trong danh sách key, rồi xoá từng cái bằng request riêng, tuần tự. Thư mục 10.000 object
trải trên 2.000 thư mục con ⟹ thêm 2.000 request nối tiếp sau 10 lô `DeleteObjects`. Trái tinh thần ngưỡng performance "≤10 request" và kéo dài
thao tác. Sửa: gửi các key thư mục qua `deleteKeys` theo lô, nhóm theo độ sâu (mỗi lô một độ sâu, sâu trước) để vẫn giữ thứ tự con-trước-cha cho
server dạng thư mục.

## Low

- **L1** `use-vault.ts:46-61` — `refresh()` không có generation: một lần refresh bắt đầu trước khi khoá có thể giải mã xong **sau** lần refresh do
  `storage.onChanged` kích hoạt và đặt lại `status = 'unlocked'` + profiles. Mỗi `writeVault` của chính tab cũng kích hoạt refresh trùng.
  `void refresh()` nuốt lỗi (`VaultLockedError`) thành unhandled rejection. Sửa: biến đếm generation, bỏ kết quả cũ.
- **L2** `multipart-uploader.ts:288-308` — `listServerUploads` lặp vô hạn nếu server trả `IsTruncated: true` mà thiếu `NextKeyMarker`
  (đã có guard tương tự ở `listUploadedParts`). Thêm guard.
- **L3** `retry.ts:12-29` + `s3-client-factory.ts` — SDK mặc định `maxAttempts: 3` lồng trong `withRetry` 3 lần ⟹ tới 16 lần gửi lại một part 64 MiB;
  `TypeError` (kể cả lỗi lập trình) được coi là retryable. Cân nhắc `maxAttempts: 1` cho client dùng trong upload, hoặc bỏ lớp retry riêng.
- **L4** `multipart-uploader.ts:204-219` — retry `CompleteMultipartUpload` sau khi response đầu bị mất (server đã ghép xong) ⟹ `NoSuchUpload`
  ⟹ báo lỗi cho upload thành công, state không bị xoá. Khi gặp `NoSuchUpload` ở bước Complete, `HeadObject` kiểm lại trước khi báo lỗi.
- **L5** `multipart-uploader.ts:103` — `saved.partSize !== partSize` thì tạo upload mới và ghi đè state, không abort upload cũ ⟹ part mồ côi trên server.
- **L6** `ShareDialog.vue:33-48`, `:67` — đổi thời hạn nhanh có thể làm hai lần `generate` về lệch thứ tự (link không khớp thời hạn đang chọn).
  Với profile có `sessionToken`, link hết hạn cùng token chứ không theo `expiresAt` hiển thị — nên ghi chú trong UI.
- **L7** `download.ts:6-11` — tên kết thúc bằng `.` hoặc khoảng trắng bị `chrome.downloads` từ chối ("Invalid filename"); chỉ xử lý dấu chấm đầu.
- **L8** `use-object-listing.ts:109-113` — `filterTimer` không được huỷ khi unmount; có thể bắn `ListObjectsV2` sau khi vault đã khoá.
- **L9** `profile-store.ts:44-65` — read-modify-write vault không khoá giữa các tab ⟹ hai tab thêm profile cùng lúc mất một bản ghi.
- **L10** `TransferDialog.vue:39-43` — đổi tên object sang key kết thúc bằng `/` biến object thành "folder marker" bị ẩn khỏi danh sách.
- **L11** `capabilities.ts:8-9` — `uploadPartCopy`, `createBucket` khai báo nhưng không dùng; copy >5 GiB trả `NotImplemented` sẽ ẩn luôn cả
  rename/copy thường do cùng gắn `copyObject`.
- **L12** `docker-compose.yml` — `'8333:8333'` bind mọi interface với khoá test công khai; nên `127.0.0.1:8333:8333`.

## Edge case từ bước scout

- Multi-tab: IndexedDB state dùng chung, hàng đợi thì riêng từng tab ⟹ tab B thấy upload đang chạy ở tab A như "upload dở" và có thể huỷ nó.
- Lock/unlock xen kẽ với thao tác dài (M3, M4, L1).
- Thư mục lồng tên trùng (`x/x/...`) là điều kiện kích hoạt H1.
- `http://` endpoint ngoài localhost bị từ chối (`profile-store.ts:23-25`) — xem câu hỏi mở.

## Đã kiểm, không thấy lỗi

- Không có `v-html`/`innerHTML`; key, metadata, mã lỗi server đều đi qua text interpolation. `escapeHtml` của unplugin chỉ áp khi message có
  thẻ HTML (đã đối chiếu mã `bundle-utils`), nên chuỗi tiếng Anh có `'` hiển thị đúng.
- Vault: PBKDF2 600k, salt 16 B, IV 12 B mới mỗi lần ghi, `storage.local` chỉ chứa envelope; khoá raw ở `storage.session` (mặc định chỉ trusted
  contexts, không có content script).
- Upload đọc part bằng `Blob.slice` ngay trong slot semaphore; body Blob ⟹ SigV4 dùng `UNSIGNED-PAYLOAD`, không đọc file vào RAM.
- Bản build e2e mới có `host_permissions`; `pnpm zip`/release không dùng mode `e2e`.

## Hành động đề xuất (theo thứ tự)

1. C1 — reset `keys` + ẩn nút khi có lỗi (một dòng, chặn mất dữ liệu).
2. H1 — chặn target tổ tiên ở UI và kiểm giao tập key trong `transferPrefix`.
3. H2 — tính `known` từ toàn bộ store.
4. M1/M2/M3 — sắp lại vòng đời job: promise mỗi job, dedupe theo state id, client lấy lại từ vault khi resume, xử lý khi khoá.
5. M5/M6 — sanitize settings trong state; auto-lock chỉ khoá khi đang mở.
6. M7, M4, M8, rồi các mục Low.

## Metrics

- Type coverage / test coverage / lint: không chạy lại trong review này (theo yêu cầu); dựa trên báo cáo đã pass.
- Không có test nào phủ C1, H1, H2, M1, M2 — nên thêm test cho từng mục khi sửa.

## Câu hỏi mở

- Endpoint `http://` trong LAN (MinIO/Ceph tự dựng, `http://192.168.x.x:9000`) đang bị chặn có chủ đích (manifest chỉ khai `http://localhost`,
  `http://127.0.0.1`). Plan nói "mọi endpoint"; cần chốt có hỗ trợ `http://*/*` (store có thể soi kỹ hơn) hay ghi rõ giới hạn trong README.
- "Khoá ngay" khi đang upload: tạm dừng upload hay để chạy tiếp? Hành vi hiện tại (chạy tiếp, job queued vẫn khởi động) chưa được nêu trong plan.
- SeaweedFS xử lý `DeleteObject` trên key thư mục còn con như thế nào (đệ quy hay giữ lại)? Comment trong `delete-objects.ts` khẳng định "giữ lại";
  nếu sai, mọi đường dẫn tới `removeFolderEntries` với key cũ (như C1) nguy hiểm hơn nhiều. Nên có integration test khoá hành vi này.
