# Kiến trúc và cơ chế DeFi Farm

[← Về README](../README.md)

## Cơ chế game

Mỗi địa chỉ ví có 6 ô đất. Người chơi nhận `dUSD`, cho phép vault dùng đúng lượng cần nạp, nạp số dư trên chuỗi vault rồi trồng trên Game L1. Vault nhận thông điệp, kiểm tra tiền và quỹ thưởng, giữ khoản gốc rồi xác nhận về game. Cây chỉ chuyển sang đang lớn sau xác nhận.

| Cây | Demo | Kỳ hạn thường | Thưởng cố định mỗi vụ |
| --- | ---: | ---: | ---: |
| Cà rốt | 60 giây | 7 ngày | 1% gốc |
| Lúa | 120 giây | 30 ngày | 3% gốc |
| Táo | 180 giây | 90 ngày | 8% gốc |

**Các tỷ lệ là tham số mô phỏng theo kỳ, không phải APY và không phải cam kết đầu tư.** `demoMode` được cố định lúc triển khai vault, không có nút admin đổi đồng hồ của contract. Đổi mode phải triển khai vault mới.

- **Thu hoạch khi đủ hạn:** gốc + thưởng chuyển vào `credits` của chính người chơi trên vault; sau đó nhấn Rút để chuyển token về ví.
- **Nhổ cây:** hoàn 100% gốc vào `credits`, bỏ toàn bộ thưởng; quỹ thưởng được giải phóng. Nhổ cây sau hạn cũng bỏ thưởng, nên muốn nhận thưởng hãy chọn Thu hoạch.
- **Thiếu số dư hoặc quỹ thưởng:** vault gửi kết quả từ chối, ô đất được giải phóng sau xác nhận. Không tự tạo token để bù.
- **Thu hoạch sớm:** vault từ chối, ô trở lại đang lớn và có thể thử lại.
- **ICM chậm:** ô giữ trạng thái pending. Không tự giả định thành công khi mới có transaction trên Game L1.

`dUSD` là ERC-20 **demo**, decimals = 6, **không phải Circle USDC**, không có giá trị tiền. Faucet cấp 1.000 dUSD/địa chỉ/giờ. Khi triển khai token, ví deployer nhận 1.000.000 dUSD test để nạp quỹ. UI hiện chỉ dành cho token này.

## Kiến trúc và nguồn tiền

```mermaid
sequenceDiagram
    actor Player as Ví người chơi
    participant Farm as Farm · Game L1
    participant ICM as Teleporter / messenger
    participant Vault as TierVault · C-Chain
    Player->>Vault: approve + deposit dUSD (tạo credits)
    Player->>Farm: plant(slot, tier, amount)
    Farm->>ICM: Request, ô chuyển PlantPending
    ICM->>Vault: Xác thực nguồn và xử lý yêu cầu
    Vault->>Vault: credits → principal; dự trữ thưởng
    Vault->>ICM: Reply (thành công hoặc lý do từ chối)
    ICM->>Farm: ACK, chuyển Growing hoặc Empty
    Player->>Farm: harvest hoặc uproot
    Farm->>ICM: Request
    ICM->>Vault: Đóng vị thế, ghi credits cho player
    Vault->>ICM: Reply
    ICM->>Farm: Đóng ô đất sau ACK
    Player->>Vault: withdraw credits về ví
```

ICM truyền **thông điệp**, không bridge dUSD qua lại. Người dùng nạp trước ở C-Chain; yêu cầu từ Game L1 chỉ tiêu thụ credits của đúng người gửi. Đây là lựa chọn đơn giản hóa baseline: trồng cần bước nạp trước thay vì một thao tác xuyên hai chuỗi.

`fundRewards` nạp token có sẵn vào quỹ sponsor. Khi trồng, vault dự trữ đủ thưởng ngay. Ví dụ 100 dUSD loại rau cần 1 dUSD dự trữ. Không đủ thưởng thì từ chối trồng. Khi thu hoạch, token thưởng đến từ phần đã nạp này, không đến từ tiền gốc người khác.

Quan hệ kế toán, khi không có ai gửi token trực tiếp ngoài API vault:

```text
token.balanceOf(vault)
  = totalCredits + totalPrincipal + availableRewards + reservedRewards
```

Gửi token thẳng vào địa chỉ vault không tạo credits; dùng `deposit` hoặc `fundRewards`. Token gửi nhầm không có hàm admin cứu hộ trong baseline.

Các điểm bảo vệ đã có: xác thực messenger + blockchain ID nguồn + peer contract; peer chỉ gắn một lần; chống xử lý lại request; ACK phải khớp request đang chờ; chặn trồng/thu hoạch lặp khi pending; deposit/withdraw/receive có chặn tái nhập. Configurator chỉ gắn peer một lần, không được rút tiền người chơi hoặc sửa kỳ hạn. Giới hạn mỗi lần trồng: 1–1.000 dUSD.

## Cấu trúc và chỗ mở rộng

```text
src/Farm.sol                    Game L1: 6 ô, request, pending và ACK
src/TierVault.sol               C-Chain: credits, vị thế, quỹ thưởng, hoàn gốc
src/CrossChainEndpoint.sol       ABI Teleporter, xác thực, gắn peer một lần
src/FarmTypes.sol                Kiểu request/reply và trạng thái chung
src/DemoUSD.sol                  ERC-20 demo và faucet test
src/mocks/MockTeleporter.sol     Chỉ dùng local/test, không có bảo mật Warp
script/Deploy.s.sol              Forge scripts cho Fuji và Game L1
test/Farm.t.sol                  Unit/fuzz và kế toán
test/FujiSmoke.t.sol             Kiểm tra deployment trên RPC fork, opt-in
test/browser/farm.spec.mjs       Test trình duyệt và ví local giả lập
scripts/local*.mjs               Hai Anvil, deploy local, relay, cleanup
scripts/config-testnet.mjs       Kiểm tra cấu hình public rồi xuất cho UI
web/src/main.ts                 Frontend viem + TypeScript
web/src/style.css               Giao diện responsive, pixel SVG tự vẽ
web/src/generated/              ABI sinh từ Foundry, sync sau khi sửa contract
.github/workflows/ci.yml         Unit, integration, build và browser CI
```

Đổi loại cây/thưởng/kỳ hạn: sửa `tierConfig` trong TierVault, cập nhật mô tả UI, viết test cho quy tắc mới và đồng bộ ABI nếu signature thay đổi. Tăng số ô: sửa cả Farm, kiểm tra slot ở vault và frontend. Không chỉ đổi giao diện mà giữ quy tắc contract cũ.

## Giới hạn hiện tại

Giới hạn cần biết trước khi mở rộng: chưa audit; mock ERC-20 không hỗ trợ fee-on-transfer/rebase; chưa có emergency exit nếu L1/relayer ngừng vĩnh viễn; các vị thế đang mở cần thông điệp đúng để đóng; chỉ credits chưa khóa rút trực tiếp được ở vault. Chưa có messenger upgrade, nhắc việc, anti-sybil, embedded wallet, indexer, quản trị multisig hoặc lending adapter. Quỹ thưởng hiện chỉ là sponsor-funded test budget, không phải Aave/Benqi và không tạo lợi suất thực.
