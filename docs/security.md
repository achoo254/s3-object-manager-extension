# Kiểm thử bảo mật

Extension không có máy chủ riêng: nó là trang trong trình duyệt gọi thẳng API S3 của endpoint người
dùng nhập. Thứ cần bảo vệ là cặp khoá truy cập lưu trên máy, và trang quản lý (không được để trang web
hay tên object độc hại chạy mã trong đó). Các cổng dưới đây kiểm đúng những điểm đó.

## SAST (phân tích tĩnh)

| Công cụ                                                                              | Chạy ở đâu                                     | Kiểm gì                                                                            |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| CodeQL, bộ luật `security-extended`                                                  | GitHub code scanning (default setup), mỗi push | JS/TS và workflow GitHub Actions                                                   |
| ESLint `--max-warnings=0`, `vue-tsc --noEmit`                                        | CI                                             | Lỗi kiểu, mẫu nguy hiểm; mã không có `v-html`, `innerHTML`, `eval`, `new Function` |
| Cổng từ cấm (`scripts/check-forbidden-terms.sh`)                                     | CI + hook git                                  | Tên nội bộ không lọt vào repo công khai                                            |
| GitHub secret scanning + push protection                                             | GitHub                                         | Khoá, token trong commit                                                           |
| Dependabot (alert + PR, chờ 14 ngày)                                                 | GitHub                                         | Lỗ hổng thư viện                                                                   |
| Semgrep `p/javascript p/typescript p/xss p/owasp-top-ten p/secrets p/github-actions` | Chạy tay                                       | Như trên, thêm luật chuỗi cung ứng                                                 |
| gitleaks (toàn bộ lịch sử git)                                                       | Chạy tay                                       | Bí mật trong mọi commit                                                            |
| `pnpm audit`                                                                         | Chạy tay                                       | Lỗ hổng thư viện                                                                   |

Chuỗi cung ứng: mọi action trong `.github/workflows` ghim theo commit SHA (Dependabot cập nhật cả SHA
lẫn chú thích phiên bản); `pnpm-workspace.yaml` đặt `minimumReleaseAge` 7 ngày, `.npmrc` đặt
`min-release-age` cho npm/npx.

Chạy tay:

```bash
semgrep scan --metrics=off --config p/javascript --config p/typescript --config p/xss \
  --config p/owasp-top-ten --config p/secrets --config p/github-actions \
  --exclude node_modules --exclude .output --exclude plans .
gitleaks git . --redact
pnpm audit
```

## DAST (kiểm thử động)

`tests/e2e/security.spec.ts` chạy extension thật trong Chromium cùng bộ e2e (`pnpm test:e2e`):

- Tên object, thư mục và kết nối chứa HTML/JS (`<img onerror>`, `<svg onload>`, biểu thức template
  Vue) hiện đúng dạng chữ ở danh sách, breadcrumb và mọi hộp thoại; không đoạn mã nào chạy, không lỗi
  CSP.
- Thông báo lỗi từ server chứa HTML hiện dạng chữ.
- Khoá không nằm dạng rõ trong `chrome.storage`; secret không xuất hiện trong URL, header, body của
  bất kỳ request nào, cũng không trong console; extension chỉ gọi tới endpoint đã cấu hình.
- Tên tệp tải về bỏ ký tự hệ điều hành cấm (đường dẫn thì có unit test `tests/unit/download.test.ts`;
  các server đã kiểm đều từ chối key chứa `..`).
- Manifest chỉ xin `storage`, `downloads`; không `web_accessible_resources`,
  `externally_connectable`, content script hay CSP nới lỏng; trang web không nhúng (iframe) hay đọc
  được trang của extension.

Endpoint không an toàn (`http://` ngoài máy, `javascript:`, URL có user:pass) bị chặn trước khi gửi
request: `tests/e2e/features.spec.ts`.

## Kết quả lần chạy 12/10/2026

- E2E 28/28 đạt trên SeaweedFS 4.47, MinIO RELEASE.2025-09-07 và Ceph RGW 19.2.3 (qua mạng);
  integration 10/10 trên cả ba; unit 100/100.
- Semgrep 0 phát hiện (94 tệp); gitleaks 0 trong lịch sử git (43 commit).
- `pnpm audit`: 0 lỗ hổng ở dependency chạy trong extension. Còn 1 mức cao ở `braces` 3.0.3 (DoS do
  pattern lồng sâu), chỉ là dependency lúc build (`@intlify/unplugin-vue-i18n` ⟶ `fast-glob`), chưa có
  bản vá; pattern đưa vào đều do repo tự viết nên không khai thác được từ ngoài.
- Lần chạy này tìm ra một lỗi chức năng (khoá được chia sẻ bucket qua bucket policy); đã sửa, xem
  `CHANGELOG.md`.
