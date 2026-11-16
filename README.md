# DeFi Farm

Baseline game nông trại 2D trên Avalanche, sử dụng **Solidity + Foundry** và **TypeScript + viem + Vite**.

Mỗi người chơi có 6 ô đất và 3 loại cây. Vòng chơi gồm nhận token test, nạp số dư, trồng cây, chờ cây lớn rồi thu hoạch hoặc nhổ cây để lấy lại tiền gốc.

- Giao diện tiếng Việt, hỗ trợ desktop và mobile.
- Chạy local bằng hai Anvil và messenger giả lập.
- Có contract, test và script triển khai cho Fuji + Game L1 qua Teleporter.
- Sử dụng `dUSD` demo, không có giá trị tiền. Thời gian mỗi vụ được rút ngắn còn 60/120/180 giây trong chế độ demo.

## Yêu cầu

- Node.js **22.12+**, npm và Git.
- Foundry: `forge`, `cast`, `anvil`.
- MetaMask hoặc Core extension để chơi bằng ví test.

Các lệnh bên dưới dùng **Windows Command Prompt (CMD)**.

## Cài Foundry trên Windows

1. Mở [Foundry v1.9.0](https://github.com/foundry-rs/foundry/releases/tag/v1.9.0).
2. Trong **Assets**, tải file `.zip` cho Windows x64, có tên chứa `win32_amd64`.
3. Giải nén vào thư mục bạn muốn giả sử `D:\project\L1\.tools\foundry`. Các file thực thi phải nằm trực tiếp tại:

   ```text
   D:\project\L1\.tools\foundry\forge.exe
   D:\project\L1\.tools\foundry\cast.exe
   D:\project\L1\.tools\foundry\anvil.exe
   ```
4. Đưa đường dẫn thư mục này vào system path trong `edit the system environment variables`
   ``` text
   D:\project\L1\.tools\foundry\
   ```
4. Kiểm tra phiên bản:

   ```bat
   cd /d "D:\project\L1"
   .tools\foundry\forge.exe --version
   .tools\foundry\cast.exe --version
   ```

## Cài Foundry trên MacOS hoặc Linux
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   ```

## Thiết lập và chạy baseline

Thay đường dẫn bên dưới nếu project nằm ở thư mục khác.

```bat
cd /d "D:\project\L1"
npm ci
npm run local
```

Mở **http://127.0.0.1:5173**. Lệnh `local` tự build contract, khởi động hai Anvil, triển khai contract, nạp quỹ thưởng test và chạy frontend cùng relayer giả lập. Lần đầu cần Internet để tải dependency và compiler Solidity.

Để chơi:

1. Import [tài khoản Anvil test](docs/local-development.md#kết-nối-ví-local) vào MetaMask hoặc Core.
2. Kết nối ví trên giao diện, nhận dUSD test và nạp 100 dUSD vào vault.
3. Chọn hạt giống, trồng ở một ô đất trống và chờ xác nhận.
4. Thu hoạch khi cây đủ hạn, sau đó rút số dư về ví. Nhổ cây sẽ hoàn gốc và bỏ thưởng.

Giữ terminal chạy trong lúc chơi. Nhấn `Ctrl+C` để dừng; lần khởi động tiếp theo tạo trạng thái local mới.

## Kiểm tra và build

```bat
npm run check
```

Lệnh này chạy test Foundry, đồng bộ ABI và build frontend vào `web/dist`. Xem [hướng dẫn test](docs/testing.md) để chạy integration, test deploy và test giao diện.

## Tài liệu chi tiết

- [Chơi và phát triển local](docs/local-development.md): ví test, RPC, cách chơi và reset.
- [Test, build và CI](docs/testing.md).
- [Kiến trúc và cơ chế game](docs/architecture.md).
- [Triển khai Fuji + Game L1 qua ICM](docs/deployment.md).
- [Xử lý lỗi thường gặp](docs/troubleshooting.md).
- [Thông tin cuộc thi và checklist nộp bài](docs/competition.md).
- [Nguồn tham khảo](docs/references.md).

Baseline đã được kiểm tra ở chế độ local. Triển khai Fuji + Game L1 và kiểm chứng ICM thật thực hiện theo tài liệu triển khai riêng.
