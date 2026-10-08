# Phase 1 — Khung repo, build, CI, SeaweedFS local

Tier: **S** · Phụ thuộc: — · Trạng thái: xong mã; còn cấu hình GitHub · Issue: #1

## Mục tiêu

Repo GitHub cá nhân có khung extension MV3 build được cho Chrome và Edge, CI chạy lint + typecheck + unit test, và một
SeaweedFS chạy bằng docker để phát triển, không cần kết nối tới nhà cung cấp thật.

## Yêu cầu

- WXT + Vue 3 + TypeScript strict + Vuetify 3 + vue-i18n (khung `vi` mặc định, `en` phụ — chuỗi đầy đủ ở phase 5).
- Giao diện: **Vuetify 3 theo Material Design 3**, cộng một lớp token riêng (`src/styles/design-tokens.ts`: bảng màu
  sáng/tối, khoảng cách, cỡ chữ, bo góc) nạp vào theme Vuetify — mọi màu trong component đi qua token, không mã hex rời.
  Không dùng design system hay nhận diện của thương hiệu khác; bảng màu là của riêng extension. Icon: Material Design Icons (giấy phép mở) nạp theo tập con.
- vue-i18n **dịch sẵn lúc build**: `@intlify/unplugin-vue-i18n` + bản runtime-only. MV3 cấm `unsafe-eval`, nên bản đầy đủ
  (biên dịch message lúc chạy) sẽ vỡ CSP.
- Chốt cứng phiên bản mọi dependency (không `^`), commit lockfile. Dùng bản phát hành ≥2 tuần tuổi.
- Manifest tối thiểu:
  - `permissions`: `storage`, `downloads`.
  - `optional_host_permissions`: `["https://*/*", "http://localhost/*", "http://127.0.0.1/*"]` (http chỉ cho server S3 local).
  - Không `host_permissions` cố định, không `tabs`, không `<all_urls>` lúc cài.
  - Bấm icon mở `manager.html` trong tab mới (service worker gọi `chrome.tabs.create` — không cần quyền `tabs`).
- `docker-compose.yml` chạy **SeaweedFS** một container (`weed server -s3`, image chốt cứng theo tag, có tệp cấu hình
  khoá S3 cho môi trường test) + script tạo bucket và dữ liệu mẫu. Không dùng MinIO làm server chính: bản cộng đồng đã
  ngừng phát hành image và bị archive.
- GitHub Actions: `lint`, `typecheck`, `test` (Vitest) trên push/PR; build zip Chrome + Edge làm artifact.
- Dependabot bật, chỉ tạo PR (không tự merge).
- **Cổng chặn từ cấm** (repo chỉ nói về chính extension — xem đầu `plan.md`):
  - Danh sách từ cấm là **regex lưu trong GitHub Actions secret** `FORBIDDEN_TERMS_REGEX`, KHÔNG ghi vào repo (ghi vào là
    tự vi phạm). Job CI chạy `git grep -I -i -E "$FORBIDDEN_TERMS_REGEX"` trên toàn bộ tệp đã track **và**
    `git log --format=%B` của các commit trong lượt push/PR; khớp ⟹ đỏ. GitHub tự che giá trị secret trong log.
  - Máy local: hook `pre-commit` + `commit-msg` đặt trong `.git/hooks/` (không track), đọc cùng regex từ biến môi trường
    `FORBIDDEN_TERMS_REGEX` — chặn trước khi commit chứ không chỉ khi CI đã đỏ.
  - Secret chưa đặt **hoặc rỗng** ⟹ job **đỏ** với thông báo thiếu cấu hình, không lặng lẽ cho qua (regex rỗng khớp mọi
    dòng, nên phải kiểm độ dài trước khi grep). Giá trị secret không đọc lại được qua API.

## Tệp (repo mới `<repo>/`)

| Tệp | Việc |
|---|---|
| `wxt.config.ts` | manifest, entrypoints |
| `src/entrypoints/background.ts` | mở tab manager khi bấm icon |
| `src/entrypoints/manager/{index.html,main.ts,App.vue}` | khung ứng dụng |
| `src/i18n/{index.ts,vi.json,en.json}` | khung i18n |
| `src/styles/design-tokens.ts`, `src/plugins/vuetify.ts` | token riêng + theme Vuetify sáng/tối |
| `docker-compose.yml`, `docker/seaweedfs-s3.json`, `scripts/seed-local-s3.sh` | SeaweedFS local + khoá test |
| `.github/workflows/ci.yml`, `.github/dependabot.yml` | CI |
| `README.md`, `LICENSE` | mô tả, giấy phép MIT |
| `.gitignore`, `.env.example` | chặn `.env*` thật; ví dụ chỉ có tên biến, không có giá trị |

## Các bước

1. Tạo repo **công khai** trên GitHub cá nhân, giấy phép MIT; bật secret scanning + push protection của GitHub.
2. Scaffold WXT template Vue, bật TypeScript strict, ESLint + Prettier.
3. Viết manifest như trên; background mở `manager.html`.
4. Dựng SeaweedFS + seed script; chạy thử `aws s3 ls --endpoint-url` để chắc cổng S3 và khoá test hoạt động.
5. CI + Dependabot.

## Kiểm

- `pnpm build` ra hai bản `chrome-mv3` và `edge-mv3`; nạp unpacked vào Chrome và Edge, bấm icon mở được tab manager.
- `chrome://extensions` hiện quyền lúc cài **chỉ** gồm lưu trữ và tải xuống.
- Mở tab manager của bản build (không phải dev server), Console không có lỗi CSP nào; một chuỗi `t()` hiển thị đúng.
- Đổi theme sáng/tối thấy màu lấy từ token riêng; không còn mã màu hex rời trong component.
- CI xanh trên commit đầu.
- Chứng thực dương cho cổng từ cấm: tạm thêm một tệp chứa một từ trong danh sách trên nhánh thử ⟹ CI phải **đỏ** và
  hook local phải chặn commit; xoá tệp ⟹ xanh. Thử thêm một cụm **có dấu cách** (tên bảng màu viết rời) và một commit
  message chứa từ cấm — cả hai phải đỏ. Không merge nhánh thử.

## Kết quả (08/10/2026)

- Build `chrome-mv3` + `edge-mv3`, zip chỉ xin `storage` + `downloads`; e2e mở tab manager không lỗi CSP.
- Seed viết bằng Node + SDK (`scripts/seed-local-s3.mjs`) thay cho `.sh`: không cần cài AWS CLI, dùng lại được để tạo 100.000 object.
- GitHub Actions không cho truyền tham số lệnh cho service container, nên SeaweedFS chạy bằng `docker compose up -d` trong job (cùng cấu hình với máy dev).
- `-volume.max=100`: mỗi bucket SeaweedFS là một collection; mặc định hết chỗ sau vài bucket thử.
- Cổng từ cấm: `scripts/check-forbidden-terms.sh` (CI chỉ in số lần khớp), hook qua `scripts/install-git-hooks.sh`; đã tự kiểm trên repo nháp (thiếu/rỗng ⟹ lỗi, cụm có dấu cách, tên tệp, commit message).
- CI xanh trên GitHub (08/10/2026). Cổng từ cấm in vị trí `tệp:dòng` của chỗ khớp (không in nội dung) và bỏ qua mã băm integrity của lockfile (base64 ngẫu nhiên từng khớp nhầm 3 dòng).
- Còn lại: bật secret scanning + push protection, cài hook trên máy, chứng thực dương trên nhánh thử.

## Rủi ro

- WXT đổi API giữa các bản lớn ⟹ chốt cứng phiên bản, đọc tài liệu đúng bản đã chốt.
