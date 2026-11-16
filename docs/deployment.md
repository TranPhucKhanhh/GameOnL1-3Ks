# Triển khai Fuji + Game L1 qua ICM

[← Về README](../README.md)

**Không deploy MockTeleporter trên testnet rồi gọi đó là ICM.** Mock cho phép bất kỳ ai giả mạo thông điệp và có thể làm mất số dư demo. Public deployment phải dùng Teleporter chính thức và có relayer chuyển cả request lẫn ACK.

Các bước dưới cần ví test của đội và một Game L1 do đội vận hành hoặc tạo qua dịch vụ chính thức. Repo không tự tạo hạ tầng cloud, không có faucet AVAX riêng và chưa sử dụng khóa ký của bạn. Mọi khoản nạp trong hướng dẫn đều là dUSD test; gas dùng native token test ở từng mạng.

## 1. Chuẩn bị Game L1 và Teleporter

1. Tạo **Subnet-EVM Game L1 trên Fuji** qua [Create L1](https://build.avax.network/console/create-l1). Chọn EVM chain ID riêng, ví dụ **202611**, native token GAME. Không nhầm chain ID với Avalanche blockchain ID.
2. Hoàn thành quy trình tạo subnet/chain, node và validator theo wizard; giữ node hoạt động. Dùng [Testnet Nodes](https://build.avax.network/console/testnet-infra/nodes) nếu phù hợp hoặc node của đội. Ghi lại RPC HTTP, EVM chain ID và địa chỉ explorer. Tạo chain chưa có validator hoạt động thì chưa có RPC dùng được.
3. Bật Warp/ICM cho L1 theo cấu hình Subnet-EVM của wizard. Dùng [ICM Setup](https://build.avax.network/console/icm/messenger) cài messenger phù hợp trên Game L1; Fuji C-Chain phải có cùng phiên bản tương thích. Không dùng `forge create` để tự triển khai messenger chính thức.
4. Theo [ICM contracts overview](https://build.avax.network/docs/cross-chain/icm-contracts/overview), Teleporter v1 có địa chỉ `0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf`. **Kiểm tra deployment/version hiện tại trên cả hai chain** trước khi dùng giá trị mẫu; có bytecode chưa đủ chứng minh đúng messenger.
5. Dùng [ICM Relayer cho Fuji](https://build.avax.network/console/testnet-infra/icm-relayer) cấu hình route **Game L1 ↔ Fuji C-Chain**. Hoặc chạy relayer theo [tài liệu ICM](https://build.avax.network/docs/cross-chain/avalanche-warp-messaging/run-relayer).
6. Baseline gửi message với `feeInfo.amount = 0` và `requiredGasLimit = 700000`. Cần relayer của đội/managed relayer **chấp nhận zero-fee message**, được cấp gas ở cả hai chuỗi và theo dõi cả chiều ACK. Nếu dịch vụ chỉ relay khi có fee, phải đổi fee policy trong endpoint, thêm phần nạp/approve fee token và kiểm thử lại; không chỉ bỏ qua bước relayer.

Wizard/provider có thể yêu cầu tài khoản hoặc tài nguyên hạ tầng; repo không giả định luôn có node miễn phí. Trên Windows, ưu tiên Console. Nếu muốn dựng **Avalanche network thật trên máy** bằng CLI, xem [hướng dẫn Avalanche CLI với ICM](https://build.avax.network/docs/cross-chain/icm-contracts/icm-contracts-on-local-network), dùng môi trường Linux/WSL phù hợp. Hướng dẫn CLI cũ và Platform CLI hiện tại có thể khác lệnh; không nhầm hai Anvil của baseline với một Avalanche L1 thật.

## 2. Chuẩn bị cấu hình và ví deployer

```bat
copy .env.example .env
notepad .env
```

Điền các giá trị công khai đã biết: `GAME_RPC_URL`, `GAME_CHAIN_ID`, `GAME_GAS_SYMBOL`, messenger mỗi chuỗi và `DEPLOYER`. Không điền khóa riêng vào `.env`. Để `DEMO_MODE=true` cho demo nhanh; `false` dùng 7/30/90 ngày. Các placeholder contract được điền sau deploy.

Nạp gas cho **ví test riêng**: test AVAX trên Fuji từ [faucet BTC](https://team1vn.xyz/faucet.html) hoặc [faucet Avalanche](https://build.avax.network/console/primary-network/faucet), và GAME test trên Game L1 từ genesis allocation/faucet của đội. Nhận dUSD không tự cấp gas.

Import khóa ví test vào keystore mã hóa của Foundry bằng prompt:

```bat
npm run cast -- wallet import farm-deployer --interactive
```

Foundry hỏi khóa và mật khẩu ở terminal. Không đặt khóa vào lệnh, file frontend, `.env`, Git hoặc ảnh chụp. `farm-deployer` là tên keystore tự chọn. Dùng cùng địa chỉ này làm `DEPLOYER` và signer các lệnh gắn peer.

Nạp `.env` vào phiên CMD để `%BIEN%` trong các lệnh tiếp theo hoạt động:

```bat
call scripts\env.cmd
npm run cast -- chain-id --rpc-url "%FUJI_RPC_URL%"
npm run cast -- chain-id --rpc-url "%GAME_RPC_URL%"
```

Kết quả phải là 43113 và EVM chain ID Game L1 đã chọn. `env.cmd` chỉ đọc file cấu hình công khai, bỏ dòng comment; không dùng để xử lý file chứa secret. Chạy lại sau mỗi lần sửa `.env`.

Đọc **blockchain ID bytes32** từ Warp precompile trên từng mạng:

```bat
npm run cast -- call 0x0200000000000000000000000000000000000005 "getBlockchainID()(bytes32)" --rpc-url "%GAME_RPC_URL%"
npm run cast -- call 0x0200000000000000000000000000000000000005 "getBlockchainID()(bytes32)" --rpc-url "%FUJI_RPC_URL%"
```

Chép hai kết quả vào `GAME_BLOCKCHAIN_ID` và `VAULT_BLOCKCHAIN_ID` trong `.env`, rồi chạy `call scripts\env.cmd` lại. Giá trị phải là `0x` + 64 ký tự hex, **không** phải số 202611/43113 và **không** phải chuỗi CB58 từ P-Chain. Nếu precompile không trả được ID trên Game L1, sửa cấu hình Warp/node trước khi triển khai game.

## 3. Deploy smart contract bằng Forge

```bat
npm run build:contracts
npm run forge -- script script/Deploy.s.sol:DeployVault --rpc-url "%FUJI_RPC_URL%" --account farm-deployer --sender "%DEPLOYER%" --broadcast -vvvv
npm run forge -- script script/Deploy.s.sol:DeployFarm --rpc-url "%GAME_RPC_URL%" --account farm-deployer --sender "%DEPLOYER%" --broadcast -vvvv
```

Nhập mật khẩu keystore khi được hỏi. Script đầu tạo DemoUSD và TierVault trên Fuji; script sau tạo Farm trên Game L1. Ghi địa chỉ trả về `token`, `vault`, `farm` vào `TOKEN_ADDRESS`, `VAULT_ADDRESS`, `FARM_ADDRESS` trong `.env`, rồi nạp lại:

```bat
notepad .env
call scripts\env.cmd
```

Transaction receipt được Foundry lưu dưới `broadcast/` để đối chiếu. Script vault chặn chain khác 43113; script farm kiểm tra `GAME_CHAIN_ID` và chặn Ethereum/Avalanche mainnet. Đây là deployment test, không phải cấu hình production.

Gắn peer **mỗi bên đúng một lần**, sau khi kiểm tra kỹ ba địa chỉ và blockchain ID:

```bat
npm run cast -- send "%FARM_ADDRESS%" "setPeer(address)" "%VAULT_ADDRESS%" --rpc-url "%GAME_RPC_URL%" --account farm-deployer
npm run cast -- send "%VAULT_ADDRESS%" "setPeer(address)" "%FARM_ADDRESS%" --rpc-url "%FUJI_RPC_URL%" --account farm-deployer
```

Peer không sửa được sau khi gắn. Gắn nhầm phải triển khai contract mới; không nạp tiền vào deployment nối sai.

## 4. Nạp quỹ thưởng test và sinh config frontend

Ví deployer đã có 1.000.000 dUSD test. Approve và nạp **10.000 dUSD**, tức `10000000000` đơn vị 6 decimals:

```bat
npm run cast -- send "%TOKEN_ADDRESS%" "approve(address,uint256)" "%VAULT_ADDRESS%" 10000000000 --rpc-url "%FUJI_RPC_URL%" --account farm-deployer
npm run cast -- send "%VAULT_ADDRESS%" "fundRewards(uint256)" 10000000000 --rpc-url "%FUJI_RPC_URL%" --account farm-deployer
npm run cast -- call "%VAULT_ADDRESS%" "availableRewards()(uint256)" --rpc-url "%FUJI_RPC_URL%"
npm run abi
npm run config:testnet
npm run dev
```

`config:testnet` đọc `.env`, kiểm tra EVM chain ID, Warp ID thật, bytecode, messenger, peer hai chiều và token dUSD trước khi ghi `web/public/config.json`. File này **được trình duyệt tải công khai**; chỉ sử dụng RPC URL có thể công bố. Không dùng URL chứa API key bí mật hoặc thông tin đăng nhập.

Đây là bước kiểm tra cấu hình, không xác nhận relayer hoạt động. Mở URL Vite in ra, kết nối ví Fuji của người chơi, nhận dUSD, nạp 100, trồng rau và hoàn thành một vụ như [hướng dẫn local](local-development.md). Người chơi cần gas ở cả hai mạng. Trên Fuji giữ thời gian thực 60 giây nếu `DEMO_MODE=true`; **không** gọi `evm_increaseTime` lên testnet công khai.

## 5. Smoke test trên deployment từ xa

Sau khi điền đủ `.env`:

```bat
call scripts\env.cmd
set "RUN_FUJI_SMOKE=true"
npm run forge -- test --match-contract FujiSmokeTest -vv
set RUN_FUJI_SMOKE=
```

Smoke test tạo hai RPC fork, đọc contract đã deploy, kiểm tra chain ID, Warp ID, peer, messenger và token. **Fork không broadcast giao dịch và không tự chạy ICM.** Muốn chứng minh ICM thật, phải có giao dịch công khai và ACK ở cả hai mạng.

Bằng chứng nên lưu vào hồ sơ nộp:

- Game L1 RPC, EVM chain ID, Avalanche blockchain ID, explorer và phiên bản Teleporter.
- Địa chỉ Farm trên L1, TierVault/DemoUSD trên Fuji, transaction deploy và gắn peer.
- Transaction trồng trên L1 → xử lý vault trên Fuji → ACK quay về L1, đối chiếu `requestId`.
- Transaction thu hoạch → vault ghi credits → ACK → withdraw; số dư cuối đúng 1.001 dUSD cho ví bắt đầu từ 1.000 và trồng 100 loại rau.
- Log smoke test và video cho thấy cả hai mạng, trạng thái pending thật, không chỉ màn hình game.

Muốn build frontend để host sau khi đã kiểm tra testnet:

```bat
npm run config:testnet
npm run build
```

Host thư mục `web/dist` bằng static hosting có HTTPS; các RPC public phải cho phép CORS từ domain đó. Repo chưa publish site hoặc triển khai hạ tầng thay đội.
