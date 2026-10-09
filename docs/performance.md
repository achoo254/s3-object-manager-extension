# Performance

Số đo cho bảng Performance của MVP v0.1.0 (ngưỡng đặt trong `plans/v0.1.0/plan.md`). Mọi ngưỡng là
**giả định**; chưa có số của người dùng thật.

## Môi trường đo (08/10/2026)

| Mục         | Giá trị                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Máy         | Mac mini, Apple M4, 10 nhân, 16 GB RAM, macOS 26.6.2                                                      |
| Trình duyệt | Chromium 153.0.8010.12 (Playwright 1.63.0, headless), bản build `pnpm build:e2e`                          |
| Server S3   | SeaweedFS 4.47 chạy trực tiếp trên cùng máy (binary, không qua Docker), cấu hình như `docker-compose.yml` |
| So sánh     | `aws s3 cp` — aws-cli 1.46.1 / botocore 1.43.62, cấu hình mặc định (part 8 MiB, 10 luồng)                 |
| Lệnh        | `pnpm build:e2e && PERF_AWS_CLI=<đường dẫn aws> pnpm perf` (`tests/tools/measure-performance.spec.ts`)    |

Kết quả thô nằm ở `test-results/perf.jsonl` sau mỗi lần chạy. Mỗi phép đo upload lặp 3 lần, lấy trung vị.

## Kết quả

| Đại lượng                        | Ngưỡng                                                  | Đo được                                                                                                                                                                                      | Kết quả                                                   |
| -------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Liệt kê thư mục 100.000 object   | Trang đầu (1.000 key) sau 1 round-trip; cuộn không giật | Trang đầu sau **1** request `ListObjectsV2`, hiện sau 127 ms. Cuộn 2.000 khung hình (~33 s, ~60 khung/giây) qua danh sách ảo hoá: **0** long task (> 50 ms); trong lúc cuộn tải thêm 6 trang | **Đạt**                                                   |
| Xoá thư mục 10.000 object        | ≤ 10 request `DeleteObjects`                            | **10** `DeleteObjects` (1.000 key/request) + 1 `DeleteObject` cho chính mục thư mục rỗng; 1,8 s                                                                                              | **Đạt**                                                   |
| Thông lượng upload file 2 GB     | ≥ 80% `aws s3 cp`                                       | Extension 324 MiB/s (5,3 / 6,3 / 7,8 s), `aws s3 cp` 571 MiB/s (3,5 / 3,6 / 3,6 s) ⟹ **57%**                                                                                                 | Thấp hơn trên loopback (qua mạng thật: **đạt**, xem dưới) |
| — cùng phép đo, 8 part song song | (tham khảo)                                             | Extension 350 MiB/s, `aws s3 cp` 582 MiB/s ⟹ 60%                                                                                                                                             | —                                                         |
| RAM tab khi upload file 5 GB     | tăng ≤ 4 × 8 MiB + 50 MB = 82 MiB                       | Renderer của extension: nền 229 MiB, đỉnh **+0 MiB** (25 mẫu, 12,9 s, ~398 MiB/s)                                                                                                            | **Đạt**                                                   |
| RAM tab khi download file 5 GB   | không tăng theo cỡ file                                 | Renderer của extension: nền 160 MiB, đỉnh **+5 MiB** (89 mẫu, 44,9 s)                                                                                                                        | **Đạt**                                                   |

### Cách đo RAM

Lấy RSS (`ps`) của tiến trình renderer có cờ `--extension-process` thuộc chính phiên trình duyệt của
phép đo, lấy mẫu mỗi 0,5 s; "tăng" = đỉnh trừ mức nền ngay trước thao tác. Đây là cách xấp xỉ cột
"Memory footprint" của Chrome Task Manager; tiến trình network service (nơi trình duyệt đệm dữ liệu
gửi đi) không tính vào RAM của tab. File upload là file thưa (sparse) để tạo nhanh.

### Thông lượng trên MinIO (tham khảo, cùng máy)

MinIO `RELEASE.2025-09-07T16-13-09Z` (binary, một ổ đĩa), cùng phép đo 2 GB, 4 part song song:

| Lượt | Extension (s)    | `aws s3 cp` (s)   | Trung vị extension / aws | Tỉ lệ |
| ---- | ---------------- | ----------------- | ------------------------ | ----- |
| 1    | 3,3 / 10,6 / 2,8 | 2,6 / 2,0 / 10,0  | 617 / 783 MiB/s          | 79%   |
| 2    | 7,8 / 6,8 / 8,8  | 10,9 / 13,0 / 9,4 | 261 / 188 MiB/s          | 139%  |

Trên loopback, cả hai công cụ dao động hơn gấp ba lần giữa các lượt (đĩa, cache hệ điều hành, việc nền
của server), nên tỉ lệ 57% đo trên SeaweedFS không đủ chắc để kết luận extension chậm hơn.

## Kết quả qua mạng thật: Ceph RGW (09/10/2026)

Cụm Ceph Squid 19.2.3 (3 node, lab) truy cập từ cùng máy đo qua VPN (băng thông thực tế ~9,5 MiB/s);
cùng bản build, cùng lệnh `pnpm perf`, khoá của một user RGW tạm thời.

| Đại lượng                      | Ngưỡng                                      | Đo được                                                                              | Kết quả |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------ | ------- |
| Liệt kê thư mục 100.000 object | Trang đầu sau 1 round-trip; cuộn không giật | Trang đầu sau **1** request, hiện sau 441 ms; cuộn 2.000 khung hình, **0** long task | **Đạt** |
| Xoá thư mục 10.000 object      | ≤ 10 request `DeleteObjects`                | **10** `DeleteObjects` + 1 `DeleteObject` mục thư mục; 11,9 s                        | **Đạt** |
| Thông lượng upload file 2 GB   | ≥ 80% `aws s3 cp`                           | Extension 216,4 / 216,4 / 215,1 s, `aws s3 cp` 226,4 / 225,8 / 225,0 s ⟹ **104%**    | **Đạt** |
| RAM tab khi upload file 5 GB   | tăng ≤ 82 MiB                               | **+25 MiB** (542 s)                                                                  | **Đạt** |
| RAM tab khi download file 5 GB | không tăng theo cỡ file                     | **+4 MiB** (547 s)                                                                   | **Đạt** |

Qua mạng thật, cả hai công cụ đều bị giới hạn bởi băng thông, và extension nhanh ngang hoặc hơn
`aws s3 cp`. Kết luận cho ngưỡng thông lượng: **đạt**; các con số trên loopback bên dưới chỉ phản ánh
chi phí cố định mỗi request của trình duyệt khi băng thông không giới hạn.

## Thông lượng trên loopback: phân tích

Quyết định 08/10/2026: giữ mặc định 4 × 8 MiB, đo lại qua mạng thật rồi mới quyết — đã đo ngày
09/10 (mục trên), ngưỡng đạt nên giữ nguyên mặc định. Những gì số đo cho thấy:

- Tăng từ 4 lên 8 part song song chỉ nhích từ 324 lên 350 MiB/s, nên số luồng **không** phải nút
  thắt chính.
- Mỗi part đi qua đường ống `fetch` của trình duyệt (Blob ⟶ tiến trình network service qua IPC), tốn
  hơn hẳn việc Python ghi thẳng socket. Đo trên loopback (cùng máy, không giới hạn băng thông) làm
  chi phí cố định mỗi request lộ rõ nhất.
- 324 MiB/s ≈ 2,7 Gbit/s: vẫn vượt xa băng thông mạng thật của phần lớn người dùng (≤ 1 Gbit/s ≈
  119 MiB/s), nơi cả hai công cụ đều bị giới hạn bởi mạng.

Các hướng đã cân nhắc:

1. Đo lại trên Ceph RGW qua mạng thật như phase 6 yêu cầu; nếu ở đó đạt ≥ 80% thì ghi ngưỡng loopback
   là giới hạn của trình duyệt.
2. Thử part mặc định 16 MiB (giảm một nửa số request) — đổi quyết định "mặc định 8 MiB" của plan và
   tăng trần RAM lên 4 × 16 MiB + 50 MB.
3. Đổi định nghĩa ngưỡng sang "≥ 80% của `aws s3 cp` trên endpoint qua mạng".

## Đo lại trên endpoint khác

Lệnh (khoá chỉ dùng để thử, không commit):

```bash
E2E_EXTRA_HOSTS='https://<host>/*' pnpm build:e2e
PERF_S3_ENDPOINT=https://<endpoint> PERF_S3_REGION=<region> \
PERF_S3_ACCESS_KEY_ID=... PERF_S3_SECRET_ACCESS_KEY=... PERF_AWS_CLI=<đường dẫn aws> pnpm perf
```

Khoá cần quyền tạo/xoá bucket (mỗi lượt đo dùng một bucket tạm). `E2E_EXTRA_HOSTS` cấp sẵn quyền truy
cập endpoint cho bản build e2e (Playwright không bấm được hộp thoại xin quyền); bản phát hành không bị
ảnh hưởng.
