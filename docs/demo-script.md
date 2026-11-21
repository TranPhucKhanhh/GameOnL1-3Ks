# Kịch bản quay demo 3 phút: Lantern Sea

[← README](../README.md)

Kịch bản cho video demo Team1 Vietnam UniHack "Build on Avalanche". Mọi con số bên dưới khớp với contract đang chạy (chế độ demo).

- **Link chơi:** https://tranphuckhanhh.github.io/GameOnL1-3Ks/
- **Chain game:** Dispatch, L1 thử nghiệm công khai của Ava Labs trên Fuji (chain ID 779672)
- **Chain tiền:** Avalanche Fuji C-Chain (chain ID 43113), USDC thử nghiệm của Circle
- **Kết nối hai chain:** Avalanche ICM (Teleporter `0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf`)

---

## 1. Thông điệp chính (nói được trong 1 câu)

> **Lantern Sea là game hải tặc co-op: mỗi người một đảo, cùng nhau khám phá vùng biển sinh từ hash trên Avalanche, gặp nhau ngoài đời để chia sẻ bản đồ, và cùng đánh boss với tiền thưởng USDC được giữ bởi contract qua ICM.**

Ba điểm giám khảo cần nhớ:
1. **Co-op và lan truyền:** nhiều tính năng *bắt buộc* phải có người thứ hai (đảo coop, Parley quét QR, raid dẫn đầu hai người).
2. **Avalanche thật sự:** game chạy trên một L1, tiền nằm trên C-Chain, hai bên nói chuyện qua ICM.
3. **Công bằng, đúng luật:** không ngẫu nhiên, không gacha, coin và đá quý không đổi ra tiền.

---

## 2. Luật chơi chính xác (để nói đúng khi quay)

| Cơ chế | Chi tiết chính xác |
|---|---|
| **Lantern (năng lượng)** | Tối đa **3**. Chế độ demo hồi **1 lantern/phút**; bản thật 3 lantern/8 giờ. |
| **Đường biển** | Mỗi đảo có **1–4 đường**. Thấy giá (⚓1, ⚓2 hoặc ⚓4–5 cho đường coop) nhưng **không thấy đích** cho tới khi đi. Đường chỉ xuất phát từ **đảo đang neo thuyền** (contract kiểm tra). |
| **Thưởng coin** | Chỉ khi **tìm ra đảo chưa ai nhận**: ⚓1 = 10–20 coin, ⚓2 = 25–40 coin, đảo coop = 60–100 coin + 1 đá quý cho **mỗi** người. Vị trí trong khoảng phụ thuộc **chuỗi ngày chơi** (đường thường) hoặc **tốc độ giải đố** (coop). Đảo đã có người nhận: 0 coin. |
| **Đi lại** | Tới đảo **đã biết** bằng **Sail to / Sail there · miễn phí** (không tốn lantern). Lantern chỉ dùng để khám phá. |
| **Va chạm** | Bản đồ chỉ 16×16 = 256 ô, nên đảo và nhà của người chơi khác **cố ý trùng nhau**: dễ gặp nhau. |
| **Lên đảo và cột note** | **Go ashore** trên đảo đang neo thuyền. Cột note đầu tiên luôn ở **giữa đảo** (biển báo "?"), các cột sau đặt trên ô đất trống. Giá **25 coin**/cột, tối đa 140 byte, **1 cột/người/đảo**, lưu vĩnh viễn trên chain. Viết được trên **mọi đảo mình đã tới**, kể cả đảo người khác tìm ra. |
| **Đảo coop** | Đường ⚓4–5 lớn hơn 3 lantern của một người, nên **hai người góp lantern**. Khi người thứ hai tham gia, **mỗi người** nhận một câu đố trượt 4×4 riêng; **cả hai** phải giải trong **60 giây**. Contract tự chạy lại nước đi để kiểm tra, không tin client. |
| **Parley (tổ đội 10 phút)** | Một người bấm **Show my code** (QR có hạn 2 phút), người kia **quét**. Mỗi cặp **1 lần/ngày** (ngày demo = 5 phút). Trong **10 phút**: bản đồ chia sẻ; **Visit** đảo của bạn **miễn phí** để lên đảo và đọc note (chỉ đọc, không tính là mình tìm ra); hoặc **Jump** hẳn sang với ⚓1 (tính là đảo của mình). Hết giờ, thuyền đang tham quan **tự về đảo nhà**, không cần giao dịch. |
| **Thuyền** | 2 chỉ số: **sát thương** (+5/cấp, giá 40×cấp) và **hệ số nhân** (+0.10/cấp, giá 60×cấp), tối đa cấp 20. **5 ô phụ tùng** (thân, buồm, pháo, tượng mũi, cờ), 15 món, giá 50–800 coin. Sức mạnh = sát thương × hệ số × các hệ số nhân của phụ tùng. |
| **Boss raid** | Mỗi **10 phút** một boss (bản thật 1 ngày), máu 1500 / 2500 / 4000 / 6000 theo vòng. **Hai người dẫn đầu** (một người đề xuất, người kia chấp nhận). Mỗi đòn tấn công tốn **1 lantern**; đội dẫn đầu đánh bằng **sức mạnh hai thuyền cộng lại**. Hai người dẫn đầu cũng được **Visit** đảo của nhau khi raid còn mở. |
| **Tiền thưởng raid (quest)** | Hai người dẫn đầu **ký quỹ USDC thử nghiệm của Circle** trên **Fuji C-Chain**, tối đa **100 USDC/raid**. Boss chết: người hỗ trợ (tối đa 20) chia tiền **theo tỉ lệ sát thương**, phần còn lại hoàn cho người ký quỹ. Boss sống: **hoàn toàn bộ**. Nếu tin nhắn kết thúc không tới, người ký quỹ tự rút lại sau **10 phút** gia hạn. Hai người dẫn đầu nhận coin thưởng boss. |
| **Đá quý** | Chỉ có từ đảo coop đầu tiên. Bán lại cho cảng lấy **coin** (50 / 80 / 120 / 200), **không bao giờ đổi ra tiền**. |
| **Treasure cabinet** | Số đảo tìm được, số chuyến, chuỗi ngày, coin, đá quý. Có **link chỉ đọc** để chia sẻ. |

---

## 3. Kịch bản chi tiết theo giây

Hai thiết bị:
- **A** là máy tính, quay màn hình, ví Core.
- **B** là điện thoại, mở link **trong trình duyệt của ví** Core/MetaMask.

### 0:00–0:15: Mở đầu
- **Màn hình (A):** bản đồ biển, thuyền lắc lư cạnh đảo nhà, 3 lantern sáng trên thanh trên cùng.
- **Lời thoại:**
  > "Đây là **Lantern Sea**, game hải tặc co-op chạy hoàn toàn trên Avalanche. Mỗi thuyền trưởng có một đảo nhà, và cùng bạn bè khám phá một vùng biển mà chưa ai vẽ bản đồ."

### 0:15–0:35: Lantern và đường biển
- **Màn hình (A):** panel đảo nhà, danh sách **Sea lanes** với ⚓1/⚓2 và "Unknown waters".
- **Lời thoại:**
  > "Mỗi người có **3 lantern**; bản demo hồi 1 lantern mỗi phút. Mỗi đảo có 1 đến 4 đường biển: mình thấy **giá** nhưng không biết **nó dẫn tới đâu**. Cả thế giới được sinh từ hash trên contract: **không ngẫu nhiên, không gacha**. Phần thưởng chỉ phụ thuộc giá đường đi và chuỗi ngày chơi."

### 0:35–0:55: Khám phá đảo mới
- **Màn hình (A):** bấm **Set sail ⚓1**, ví hỏi ký, thuyền chạy (camera đi theo), đảo hiện ra, chữ "+xx coins!".
- **Lời thoại:**
  > "Mình dùng 1 lantern để ra khơi. Đây là một giao dịch trên **L1 Dispatch**. Tìm ra đảo chưa ai nhận thì được 10 đến 20 coin; đảo đã có người nhận thì không được gì, nên ai đi trước sẽ có lợi."

### 0:55–1:15: Lên đảo, cắm cột note
- **Màn hình (A):** bấm **Go ashore**, chạm biển báo "?" ở giữa đảo, gõ note, bấm **Build note pole**. Coin giảm 25.
- **Lời thoại:**
  > "Lên đảo, mình cắm cột note đầu tiên ở giữa đảo, giá 25 coin. Note nằm **vĩnh viễn trên chain**; ai tới đảo này sau cũng đọc được. Mình cũng để lại note trên đảo của người khác được, miễn là mình đã đặt chân tới."

### 1:15–1:25: Về đảo cũ miễn phí
- **Màn hình (A):** **Back to sea**, chạm đảo nhà, bấm **Sail to …**, thuyền chạy về.
- **Lời thoại:**
  > "Đi lại giữa các đảo đã biết thì **miễn phí**; lantern chỉ dùng cho vùng biển mới, và đường mới chỉ mở từ nơi thuyền đang neo."

### 1:25–1:50: Parley, quét QR, tham quan đảo bạn
- **Màn hình:**
  1. A: tab **Crew** → **Show my code** (QR hiện ra).
  2. B (điện thoại): **Crew** → **Scan a code** → quét QR trên màn hình A → hiện **Active Parleys**.
  3. B: chạm đảo nhà của A trên bản đồ → **Visit · free while you're connected** → **Go ashore** → đọc note của A.
- **Lời thoại:**
  > "Đây là tính năng giúp game lan truyền: **Parley**. Hai người gặp nhau ngoài đời và quét mã QR của nhau. Trong 10 phút, bản đồ được chia sẻ: mình **tham quan miễn phí** đảo của bạn và đọc note, hoặc nhảy hẳn sang với 1 lantern. Hết 10 phút, thuyền tự về nhà."
- *(Chèn đoạn quay sẵn 10–15 giây về đảo coop, xem mục 5)*
  > "Có những đường biển cần 4 đến 5 lantern, nhiều hơn một người có, nên phải **góp lantern với bạn**, rồi **cả hai** cùng giải câu đố trượt trong 60 giây. Đội đầu tiên tới nơi được mỗi người một viên đá quý."

### 1:50–2:30: Boss raid và tiền thưởng USDC qua ICM
- **Màn hình:**
  1. A: tab **Raid**, dán địa chỉ của B → **Propose to lead**.
  2. B: **Accept and open the raid**.
  3. A: nhập 10 vào ô bounty → **Escrow on C-Chain**, ký 2 lần (approve rồi fund). USDC phải có sẵn trong ví A từ trước (mục 4.2).
  4. Chờ dòng "bounty 10 USDC" hiện bên game (đi qua ICM, khoảng vài chục giây).
  5. B (hoặc người thứ ba): **Sail & attack**, máu boss giảm.
- **Lời thoại:**
  > "Mỗi 10 phút có một boss. Hai người lập **đội dẫn đầu**, và đội đánh bằng sức mạnh hai thuyền cộng lại. Nếu sợ không đủ sức, đội **ký quỹ USDC trên Fuji C-Chain** để treo thưởng cho người hỗ trợ. Contract trên L1 game và contract ký quỹ trên C-Chain nói chuyện với nhau qua **Avalanche ICM**. Boss chết thì người hỗ trợ nhận thưởng theo tỉ lệ sát thương; boss sống thì tiền hoàn lại. Game không bao giờ tự trả tiền: chỉ chuyển đúng số tiền đội dẫn đầu đã bỏ vào."

### 2:30–2:45: Nâng cấp thuyền
- **Màn hình (A):** tab **Ship**: bấm **+5 damage** hoặc lắp **Jolly Flag**, chỉ số sức mạnh tăng.
- **Lời thoại:**
  > "Coin dùng để nâng cấp thuyền: hai chỉ số, sát thương và hệ số nhân, cùng 5 ô phụ tùng như thân, buồm, pháo, tượng mũi và cờ. Coin và đá quý là điểm trong game, **không mua được và không đổi ra tiền**."

### 2:45–3:00: Cabinet và kết thúc
- **Màn hình (A):** tab **Cabinet**: số đảo, chuỗi ngày, đá quý → bấm **Copy cabinet link**.
- **Lời thoại:**
  > "Cuối cùng là **Treasure cabinet** để khoe bộ sưu tập: chia sẻ bằng một đường link chỉ đọc. Đó là **Lantern Sea**: khám phá cùng nhau, trên Avalanche. Cảm ơn ban giám khảo!"

---

## 4. Chuẩn bị trước khi quay (checklist)

### 4.1. Kiểm tra relayer ICM (bắt buộc làm trước)
Đây là phần **chưa được xác nhận trên mạng thật**. Làm thử một vòng raid ít nhất **1 lần**:
1. Hai ví cùng **Claim my island**.
2. A **Propose to lead** với B, B **Accept**.
3. A ký quỹ 1 USDC. Trong vòng khoảng 1 phút, tab Raid phải hiện **"bounty 1 USDC"**.
4. Nếu sau 3 phút vẫn không hiện: **báo lại**, đừng quay cảnh raid.

### 4.2. Ví và tiền thử nghiệm
| Ví | Cần có | Lấy ở đâu |
|---|---|---|
| A (máy tính) | ~0.1 DIS trên Dispatch | Builder Console → Faucet → thẻ Dispatch → **Drip** |
| A | ~0.05 AVAX trên Fuji C-Chain | Builder Console → Faucet (thẻ C-Chain) hoặc chuyển từ ví khác |
| A | ≥ 10 USDC thử nghiệm | faucet.circle.com → chọn **Avalanche Fuji**, dán địa chỉ ví A. (Nút **Get 100 test USDC** chỉ có ở bản chạy local, không có trên link live.) |
| B (điện thoại) | ~0.1 DIS trên Dispatch | Gửi từ ví A (Core → Dispatch → Send) |

### 4.3. Trạng thái game trước khi quay
- [ ] Ví A có **≥ 25 coin** để cắm note. Bản live **không có nút debug coin**, nên hãy khám phá trước 2–3 đảo.
- [ ] Ví A có **đủ 3 lantern** ngay trước lúc quay (mỗi lantern hồi sau 1 phút).
- [ ] Đảo nhà của A có ít nhất một đường **⚓1 tới vùng biển chưa biết**.
- [ ] Đảo nhà của A có **sẵn 1 note** để B đọc khi Visit.
- [ ] A và B **chưa Parley với nhau trong 5 phút gần nhất** (mỗi cặp 1 lần/ngày demo = 5 phút).
- [ ] **Boss vừa xuất hiện**, còn trên 5 phút, khi bắt đầu cảnh raid (boss đổi mỗi 10 phút).

### 4.4. Thiết bị
- [ ] Điện thoại mở link **trong trình duyệt của ví Core/MetaMask** (không dùng Chrome/Safari thường), và đã **cho phép camera**.
- [ ] Máy tính để zoom trình duyệt 100–125%, tắt thông báo, đóng tab thừa.
- [ ] Quay màn hình điện thoại bằng tính năng ghi màn hình, rồi ghép vào video.

---

## 5. Đoạn quay riêng: đảo coop và câu đố

Không làm trực tiếp trong 3 phút vì cần nhiều điều kiện. Quay riêng 10–15 giây rồi chèn vào:
1. Tìm ví có **đường coop (⚓4–5) từ đảo nhà**: panel có nút **Plan crew voyage**.
2. A: **Plan crew voyage** → dán địa chỉ B → chọn số lantern mình góp → **Send invitation**.
3. B: tab **Crew** → **Join** → câu đố 4×4 hiện ra cho **cả hai**.
4. Cả hai giải trong **60 giây**. Giải càng nhanh, coin càng gần 100. Xuất hiện "Landed" và đá quý.

Mẹo: luyện câu đố trước vài lần; nút **Reset** đưa bàn về trạng thái ban đầu.

---

## 6. Phương án dự phòng

| Sự cố | Cách xử lý khi quay |
|---|---|
| Bounty không hiện bên game (ICM chậm) | Nói: "Tin nhắn đang đi qua ICM, thường mất vài chục giây", rồi chuyển sang cảnh Ship, quay lại sau. Có thể chèn đoạn quay sẵn. |
| Ví báo hết gas | Faucet → Dispatch → **Drip**, hoặc gửi DIS từ ví khác. |
| Hết lantern | Chờ 1 phút (demo hồi 1/phút) hoặc dùng ví thứ hai. |
| QR không quét được | Crew → **Paste a code**: copy chuỗi mã dưới QR ("Copy as text") và dán. |
| Raid hết giờ trước khi đánh | Chờ boss mới (mỗi 10 phút), làm lại propose/accept. |

---

## 7. Câu hỏi giám khảo có thể hỏi

**"Sao không dùng L1 riêng?"**
> "Bước chuyển subnet thành L1 trên Builder Console bị lỗi phía console (thiếu khoảng 0.24 AVAX ở một khóa do console tự tạo và không lưu). Chúng em đã báo lỗi và triển khai trên **Dispatch**, L1 thử nghiệm công khai của Ava Labs, với **cùng kiến trúc**: game trên L1, tiền trên C-Chain, kết nối qua ICM. Khi có L1 riêng, chỉ cần đổi cấu hình và chạy lại script deploy."

**"Có phải play-to-earn không?"**
> "Không. Coin và đá quý không mua được và không đổi ra tiền. Tiền USDC duy nhất là tiền thưởng do chính người chơi ký quỹ cho nhau, có hoàn tiền nếu boss sống, và chỉ dùng USDC thử nghiệm."

**"Có yếu tố ngẫu nhiên hay gacha không?"**
> "Không. Bản đồ, đường biển, boss và câu đố đều sinh từ hash xác định. Phần thưởng chỉ phụ thuộc giá đường đi, chuỗi ngày chơi và tốc độ giải đố."

**"Làm sao chống gian lận câu đố?"**
> "Client gửi danh sách nước đi; contract tự chạy lại trên bàn đã xáo trộn và chỉ chấp nhận nếu bàn về đúng trạng thái đã giải, trong 60 giây."

**"Parley chống giả mạo thế nào?"**
> "Mã QR là chữ ký EIP-191 của người hiện mã, chỉ có hiệu lực 2 phút, gắn với chain ID và địa chỉ contract; mỗi cặp chỉ được Parley 1 lần mỗi ngày."

---

## 8. Địa chỉ contract (bản đang chạy)

| Contract | Chain | Địa chỉ |
|---|---|---|
| LanternSea | Dispatch | `0x7C6BB244b2F10e2d1059D7303e854E145c41AeEd` |
| CoopSail | Dispatch | `0xa68E677Ca6DfAfb4d5bc86221aF365Eccbdb2f29` |
| Shipyard | Dispatch | `0xb42Ba84cbAe30B4C8DfD1d699dB82D518f2C631E` |
| BossRaid | Dispatch | `0xC2638e489b8F3487145ae30780504713aFB7ff67` |
| RaidEscrow | Fuji C-Chain | `0x12CcBac9ff98E667Fb4FE19e1c650802EEEF50cC` |

Explorer: Dispatch tại https://subnets-test.avax.network/dispatch, Fuji tại https://subnets-test.avax.network/c-chain. Sau khi quay, nên lưu link giao dịch của một vòng raid đầy đủ (accept → fund → settle → claim) để nộp kèm bài.
