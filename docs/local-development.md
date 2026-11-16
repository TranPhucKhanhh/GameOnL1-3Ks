# Chơi và phát triển trên máy

[← Về README](../README.md)

```bat
cd /d "D:\project\L1"
npm run local
```

Một lệnh sẽ build bằng Forge, đồng bộ ABI, mở hai Anvil, triển khai contract từ artifact Foundry, gắn peer, nạp 10.000 dUSD thưởng, chạy relayer giả lập và mở Vite. Giữ terminal này chạy.

| Thành phần | Giá trị local |
| --- | --- |
| Frontend | http://127.0.0.1:5173 |
| Game RPC | http://127.0.0.1:8545 |
| Game EVM chain ID | 31337, symbol GAME |
| Vault RPC | http://127.0.0.1:9545 |
| Vault EVM chain ID | 31338, symbol AVAX |
| Địa chỉ contract và blockchain ID giả lập | `.local/config.json` |
| Cấu hình frontend tự sinh | `web/public/config.json` |

### Kết nối ví local

Trong profile trình duyệt dùng để thử nghiệm, import **tài khoản Anvil công khai số 1**:

```text
Address:     0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Private key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

**Khóa trên là khóa test ai cũng biết. Không nạp tài sản thật, không dùng trên Fuji/mainnet, không dùng làm ví deployer công khai.** Anvil cấp sẵn gas cho địa chỉ này ở cả hai chuỗi. Nếu ví đã lưu chain ID 31337 với RPC khác, sửa RPC về địa chỉ trong bảng. Bật hiển thị test network trong ví nếu cần.

### Đăng nhập và kết nối bằng Core extension

Nên dùng một profile trình duyệt riêng cho local. Nếu Core chưa có ví, hoàn thành bước thiết lập ví trong extension trước, rồi import tài khoản Anvil bên trên; app không yêu cầu đăng nhập Core bằng email hoặc nhập seed phrase.

1. Mở và mở khóa Core extension. Nhấn tên tài khoản đang hoạt động ở phía trên.
2. Trong **My Wallets**, nhấn dấu **+**, chọn **Import a private key**. Dán **private key Anvil test ở mục trên** trực tiếp vào Core, rồi nhấn **Import**. Có thể đặt tên `Anvil Local` để dễ phân biệt. Các bước import tham khảo [hướng dẫn chính thức của Core](https://support.core.app/en/articles/6821877-core-extension-how-can-i-import-an-account).
3. Chọn tài khoản vừa import và kiểm tra địa chỉ EVM phải đúng `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`. Tên **Account 1** trong Core không đảm bảo đó là tài khoản Anvil số 1; tạo account mới bằng dấu **+** cũng không thay thế việc import khóa test.
4. Giữ `npm run local` chạy. Mở http://127.0.0.1:5173, nhấn **Kết nối ví** và cấp quyền cho tài khoản `Anvil Local`. Trên app phải hiện **`● 0x7099…79C8`**.
5. Khi nhấn nhận dUSD, nạp hoặc rút tiền, chấp nhận **Approve** để chuyển sang **Farm Vault (Anvil)**, chain ID `31338`, RPC `http://127.0.0.1:9545`.
6. Khi trồng, thu hoạch hoặc nhổ cây, chấp nhận chuyển sang **Farm Game (Anvil)**, chain ID `31337`, RPC `http://127.0.0.1:8545`.

Yêu cầu **switch network** là bước đổi mạng bình thường, không phải thông báo giao dịch thất bại. Cùng một địa chỉ ví dùng được trên cả hai mạng, nhưng số dư gas của mỗi mạng độc lập; AVAX trên Fuji không trả phí cho Anvil. Tài khoản test đúng địa chỉ đã được Anvil cấp gas trên cả hai mạng khi khởi động.

Nếu trước đó đã kết nối bằng ví thật, ngắt quyền của site local trong phần quản lý kết nối của Core, chọn `Anvil Local`, tải lại trang rồi kết nối lại. Chỉ nhập khóa Anvil công khai vào Core; không dán seed phrase hoặc khóa ví thật vào website, terminal hay file project. Nếu nhiều extension ví cùng hoạt động, chỉ bật Core cho site này để tránh kết nối nhầm provider.

### Chơi một vòng hoàn chỉnh

1. Mở http://127.0.0.1:5173 và nhấn **Kết nối ví**.
2. Chọn tài khoản local đúng địa chỉ `0x7099…79C8`. Chấp nhận thêm/chuyển mạng khi UI yêu cầu.
3. Nhấn **Nhận 1.000 dUSD test**, xác nhận trên chuỗi vault.
4. Giữ số lượng 100, nhấn **Nạp 100 dUSD vào vault**. Xác nhận hai giao dịch: approve đúng 100, rồi deposit 100.
5. Chọn Vườn rau, nhấn **Trồng hạt giống** ở một ô đất. Ví chuyển sang Game L1. Chờ ô từ Đang gửi ICM sang Đang lớn.
6. Đợi khoảng 60 giây kể từ lúc vault xử lý trồng. Nhấn **Thu hoạch**, chờ ACK. Số dư có thể rút trở thành 101 dUSD.
7. Nhấn **Rút toàn bộ số dư có thể rút** trên chuỗi vault. Ví có 1.001 dUSD; game ghi nhận 1 mùa vụ.
8. Có thể thử trồng rồi **Nhổ cây**: chỉ gốc được hoàn, không có thưởng.

Không cần import dUSD vào danh sách token của ví để chơi; UI đọc trực tiếp contract. Nếu muốn xem trong ví, lấy địa chỉ `token` ở `.local/config.json`, decimals 6.

**Dừng/reset:** nhấn `Ctrl+C` tại terminal đang chạy. Lần chạy `npm run local` sau tạo chain và trạng thái mới, ghi đè config frontend local. Các config là file sinh tự động, không commit. Khi reset Anvil, nếu ví báo nonce cũ, dùng chức năng xóa dữ liệu hoạt động/nonce của **account test** trong ví. Không chạy đồng thời `local`, `test:e2e` hoặc `test:ui` vì chúng dùng cùng cổng và tự tạo chain.
