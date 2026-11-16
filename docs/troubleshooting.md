# Xử lý lỗi thường gặp

[← Về README](../README.md)

| Lỗi | Cách xử lý |
| --- | --- |
| `forge` không tìm thấy | Làm theo [cài Foundry trên Windows](../README.md#cài-foundry-trên-windows), rồi chạy qua `npm run forge -- ...` sau khi đã `npm ci` |
| Không tải được compiler/dependency | Kiểm tra Internet/proxy/firewall, chạy lại bước cài; lần đầu cần mạng |
| `npm.ps1 cannot be loaded` | Mở CMD hoặc dùng `npm.cmd` trong PowerShell |
| Port 8545/9545/5173 occupied | Dừng phiên local/test cũ bằng Ctrl+C; không tắt nhầm dịch vụ của dự án khác |
| Trang báo chưa có config | `npm run local`, hoặc điền `.env` và chạy `npm run config:testnet` |
| Ví sai mạng/RPC, nonce cũ sau reset | Sửa network RPC về 127.0.0.1 đúng cổng; xóa nonce/activity của account test sau khi reset chain |
| Ví thiếu gas | Account Anvil số 1 cho local; Fuji cần test AVAX và Game L1 cần GAME riêng |
| Faucet báo cooldown | Chờ 1 giờ hoặc dùng địa chỉ test khác; dUSD faucet không cấp AVAX/GAME |
| Nạp tiền không đủ allowance | Cho phép đúng token và vault ở đúng mạng; UI tự approve trước deposit |
| Trồng xong ô trở lại trống | Vault có thể thiếu credits/quỹ thưởng. Xem `RequestProcessed.result` và số dư trên chuỗi vault |
| Thu hoạch bị từ chối | Thời gian xác định bằng block timestamp của vault; chờ đến hạn rồi thử lại |
| Pending mãi ở local | Terminal `npm run local` phải còn chạy và cả hai RPC phải hoạt động |
| Pending mãi ở testnet | Kiểm tra relayer hai chiều, zero-fee policy, gas, messenger version, Warp ID và peer; xem phần dưới |
| Build đang trỏ localhost | Chạy lại `config:testnet` trước build public; `local`/integration test ghi đè config được sinh |
| Smoke test SKIP | Chưa bật `RUN_FUJI_SMOKE=true`; đây là mặc định có chủ ý |

`T.Result` trong event `RequestProcessed`: `0=Ok`, `1=InsufficientCredits`, `2=InsufficientRewards`, `3=Occupied`, `4=NoPosition`, `5=NotMature`.

**Khôi phục ICM:** kiểm tra `SendCrossChainMessage`, `MessageExecuted` hoặc `MessageExecutionFailed` trên messenger nguồn/đích. Nếu execution thất bại, dùng cơ chế `retryMessageExecution` chính thức với đúng message payload từ event; xem [interface Teleporter](https://github.com/ava-labs/icm-contracts/blob/main/contracts/teleporter/ITeleporterMessenger.sol). Nếu chưa delivery, xử lý relayer/retry gửi theo tài liệu. Request đã xử lý không được gửi thành một request mới để tính tiền lần nữa. Không xóa pending bằng tay rồi tiếp tục trồng: ACK cũ có thể vẫn đến. Baseline chưa có màn hình recovery hoặc timeout/cancel xuyên chuỗi.
