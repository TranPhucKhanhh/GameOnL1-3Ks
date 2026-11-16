# Test, build và CI

[← Về README](../README.md)

### Unit và fuzz bằng Foundry

```bat
npm run test:contracts
npm run forge -- test --match-contract FarmTest -vvvv
npm run forge -- test --match-test testFuzzConservationAndReward --fuzz-runs 1000
```

`Farm.t.sol` có 25 test: gốc/thưởng, đủ hạn, rút sớm, thiếu credits, thiếu quỹ, xác thực nguồn, replay, ACK cũ, ACK lỗi rollback, nhiều ô đến lệch thứ tự, tái sử dụng ô và 256 lượt fuzz mặc định. Không dùng RPC từ xa cho nhóm này.

`FujiSmoke.t.sol` mặc định **SKIP**, vì chưa có deployment public. Không tính test bị skip là kiểm thử Fuji thành công.

### Integration trên hai tiến trình Anvil

```bat
npm run test:e2e
```

Tự khởi tạo, triển khai, relay request/ACK qua hai RPC thật trên máy, thử thu hoạch sớm, tăng thời gian local, thu hoạch đúng hạn, nhổ cây, rút tiền và kiểm tra kế toán rồi dừng node. Không cần extension ví. Đây vẫn là **mock transport**, không có validator/Warp proof.

Để kiểm tra chính các Forge script dùng trong hướng dẫn deploy, trên hai Anvil tạm thời:

```bat
npm run test:deploy
```

Test khởi động hai node Anvil tạm thời với chain ID 202611/43113, broadcast `DeployFarm`/`DeployVault` bằng tài khoản local unlocked và kiểm tra tham số constructor. Không kết nối hay ký lên Fuji thật. Dừng `npm run local` trước khi chạy.

### UI tự động với Chromium

```bat
npx playwright install chromium
npm run test:ui
```

Playwright tự chạy local stack, kiểm tra desktop 1440px/mobile 390px, thao tác một vòng chơi bằng EIP-1193 test provider nối Anvil, và kiểm tra không có lỗi JavaScript. Provider này **chỉ nằm trong file test**, không được đưa vào app. Ảnh chụp ở `test-results/farm-desktop.png` và `test-results/farm-mobile.png`.

### Build

```bat
npm run build:contracts
npm run abi
npm run build
```

Output frontend ở `web/dist`. Chạy `npm run preview` để xem build; dùng địa chỉ mà Vite in ra. Chạy `npm run local` để có chain/relayer trong terminal khác nếu config đang trỏ local; nếu dùng config testnet thì không cần local stack. Trước khi build bản testnet, sinh lại `config:testnet` để tránh nhúng RPC localhost vào bản phát hành.

```bat
npm run check
```

`check` chạy unit test, sync ABI và build. Workflow `.github/workflows/ci.yml` còn chạy integration, deployment scripts và Playwright trên Ubuntu. Workflow chưa được chạy trên GitHub trong phiên tạo baseline này.

Kết quả kiểm tra khi tạo baseline, trên Windows/Node 24/Foundry 1.7.1:

| Kiểm tra | Kết quả |
| --- | --- |
| Unit/fuzz Foundry | 25 đạt; test fuzz chạy 256 lượt |
| Hai Anvil và mock relay | Đạt vòng trồng → thu hoạch/nhổ → rút tiền và kiểm tra kế toán |
| Forge DeployVault/DeployFarm | Broadcast và tham số constructor đạt trên Anvil tạm thời |
| Playwright | Đạt vòng chơi qua UI, desktop/mobile; không có lỗi JavaScript |
| TypeScript + Vite build | Đạt |
| Smoke test public Fuji/Game L1 | Chưa chạy; mặc định SKIP vì chưa có deployment public |
