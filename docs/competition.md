# Cuộc thi và checklist nộp bài

[← Về README](../README.md)

Thông tin được đối chiếu ngày **16/11/2026, giờ Việt Nam**.

Nguồn ưu tiên là [website Team1 Vietnam](https://team1vn.xyz/), [FAQ](https://team1vn.xyz/#faq) và [dữ liệu đề tài/quy tắc chính thức](https://team1vn.xyz/topics.json). Nên kiểm tra lại trước khi nộp vì BTC có thể cập nhật.

| Nội dung | Thông tin trên website BTC lúc đối chiếu |
| --- | --- |
| Đối tượng | Sinh viên đại học tại Việt Nam; miễn phí |
| Đội | Một người hoặc tối đa **3 thành viên** |
| Thời gian chương trình | 02–30/11/2026 |
| Hạn nộp trên team1vn.xyz | **23:59 ngày 21/11/2026, UTC+7** |
| Nộp bài | Đăng nhập → trang profile/dashboard → **Submit Project**. Lưu draft chưa được tính là nộp; phải nhấn Submit |
| Số bài | Tối đa 5 dự án/đội; mỗi dự án có bộ tài liệu riêng |
| Vòng cuối | Top 10 pitching, demo và Q&A trực tiếp ngày 30/11/2026, 09:00–11:30, Greenwich Vietnam, 20 Cộng Hòa, TP.HCM |

**Lưu ý lịch không đồng nhất:** [Avalanche Builder Hub](https://docs.avax.network/events/596c0b2d-63aa-4cf0-a0ad-a7e34ddbfdc0) còn hiển thị các mốc nộp khác. Baseline dùng hạn sớm hơn trên website BTC: **21/11**. Kiểm tra dashboard và [nhóm Builders](https://t.me/Team1VNbuilders) để xác nhận lịch mới nhất; không dựa vào lịch cũ để nộp muộn.

Hồ sơ cần có:

- GitHub repository public; nếu private, mời GitHub user **`tuantqse90`** làm collaborator.
- Link pitch slides trên Canva hoặc Google Slides.
- Video demo **2–3 phút** và tài liệu hỗ trợ nếu có.
- Mọi link phải mở được cho giám khảo. Theo FAQ, tài liệu/repo không truy cập được có thể khiến đội bị loại.

### Cách chấm điểm

| Tiêu chí | Điểm | Baseline hỗ trợ gì |
| --- | ---: | --- |
| Technical Implementation | 25 | State machine bất đồng bộ, kế toán tiền gốc/thưởng, test và CI |
| Avalanche Integration | 25 | Tách Game L1/vault, ABI Teleporter, script Foundry; cần demo ICM thật để chứng minh |
| Creativity & Innovation | 15 | Đội cần phát triển thêm góc sản phẩm riêng từ baseline |
| Impact & Use Case | 15 | Học kỳ hạn và quyền rút gốc bằng hình ảnh mùa vụ |
| Presentation & Pitching | 10 | Kịch bản demo và câu hỏi pitch trong checklist bên dưới |
| UI/UX & Demo | 10 | 6 ô đất, 3 loại cây, tiến độ, trạng thái chờ messenger, desktop/mobile |

Đây là rubric BTC công bố lúc đọc; không phải cam kết số điểm cho repo.

### Hiểu đúng yêu cầu track game

Quy tắc chung cho phép chạy trên Fuji, L1 riêng hoặc C-Chain. Tuy nhiên, **hai đề tài game gợi ý số 10 và 11 đều ghi own L1 + ICM là Required**. Đề tài 11 yêu cầu game trên L1, vault 3 kỳ hạn trên C-Chain, luồng trồng/thu hoạch qua ICM, frontend 2D và chế độ rút ngắn thời gian được công bố khi demo. Đề tài chỉ là gợi ý; nếu đội tự chọn ý tưởng khác, xác nhận phạm vi với BTC.

Baseline này chọn hướng **đề tài 11**, không chỉ đưa một game single-chain lên Fuji. Những phần còn phải hoàn thành trước khi tuyên bố đạt MVP đề tài được liệt kê trong checklist bên dưới.

### Quy tắc ảnh hưởng trực tiếp đến thiết kế

- Kết quả và thưởng phải xác định từ hành vi/thời gian: không loot box, xổ số, random reward hay cá cược.
- Demo dùng token test; không nhận tiền thật từ người dùng hoặc bán token ra công chúng.
- Chỉ đưa trạng thái game, số dư và thông điệp lên chain; không đưa thông tin cá nhân lên chain.
- Phải công bố ngay đầu pitch nếu có mô phỏng thời gian/yield.
- Nếu mô phỏng yield, giải thích nguồn tài trợ thực tế; không trình bày mint token mới là lợi suất bền vững.
- Pitch có phần giới hạn pháp lý theo thể lệ BTC. Dự án này là mô phỏng giáo dục, không cung cấp dịch vụ tài chính.
- Trả lời được: **Vì sao on-chain? Vì sao Avalanche? Tiền/thưởng đến từ đâu?**

## Checklist để biến baseline thành bài nộp

- [ ] Đăng ký đội, kiểm tra đủ điều kiện và hạn nộp trên dashboard BTC.
- [ ] Đặt tên, chọn người dùng mục tiêu và thêm điểm khác biệt riêng; baseline tự nó chưa thể hiện đầy đủ sáng tạo của đội.
- [ ] Có **Game L1 thật**, node/validator hoạt động, native gas test và explorer.
- [ ] Dùng Teleporter thật với relayer hai chiều; lưu bằng chứng request và ACK cho trồng/thu hoạch.
- [ ] Công bố mô phỏng thời gian, token và thưởng ngay đầu video/pitch.
- [ ] Chốt cách đáp ứng vault USDC theo đề tài: bản hiện tại dùng **dUSD thay USDC**, cần ghi rõ với BTC; muốn dùng USDC test phải thay token/flow faucet và kiểm thử lại, không đổi nhãn UI để giả định tương đương.
- [ ] Nếu có quỹ sponsor thực tế, đặt quyền tài trợ/vận hành sau multisig theo quy tắc BTC. Baseline hiện không có Safe/multisig và chỉ xử lý tiền test.
- [ ] Test bằng một ví người chơi mới, trên ít nhất desktop và mobile, kiểm tra gas và thao tác đổi mạng.
- [ ] Public repo hoặc mời `tuantqse90`; mở quyền xem slides/video, kiểm tra bằng cửa sổ chưa đăng nhập.
- [ ] Ghi rõ code/dependency/asset đã sử dụng. Pixel SVG trong repo tự vẽ; không cần tải asset pack bên ngoài. Nếu thay bằng pack, giữ đúng giấy phép và credit.
- [ ] Nộp trước **23:59 21/11/2026 UTC+7** theo website lúc đối chiếu và nhấn Submit, không chỉ Save Draft.

### Kịch bản video 2–3 phút

| Thời gian | Nội dung |
| --- | --- |
| 0:00–0:20 | Vấn đề: sinh viên khó hiểu kỳ hạn/yield. Công bố dUSD, thưởng và thời gian mô phỏng; nói rõ local hay ICM thật |
| 0:20–0:45 | Nối ví, giải thích số dư ví/credits, nạp 100 dUSD |
| 0:45–1:15 | Trồng rau trên Game L1; chỉ request, xử lý ở Fuji và ACK; UI đổi pending → growing |
| 1:15–1:45 | Thử nhổ một ô khác để chứng minh hoàn gốc; quay lại cây đủ hạn |
| 1:45–2:15 | Thu hoạch, credits = 101, rút về ví; mở transaction trên explorer |
| 2:15–2:45 | Kiến trúc hai chuỗi, test, nguồn quỹ thưởng, hướng phát triển và giới hạn |

Gợi ý trả lời pitch: **On-chain** để xác minh tiền gốc, kỳ hạn và thưởng thay vì tin backend; **Avalanche** để tách game state trên L1 khỏi số dư trên C-Chain và truyền yêu cầu qua ICM; **nguồn thưởng** là ngân sách sponsor nạp trước, demo không tạo thu nhập thực. Chưa tích hợp lending thì không trình bày như đang có doanh thu/lợi suất lending.
