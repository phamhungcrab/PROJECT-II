# Kịch bản demo / defense đề xuất

## 1. Mục tiêu tài liệu

Tài liệu này hướng dẫn một người trình bày sử dụng sản phẩm theo một trình tự hợp lý, giúp reviewer nhìn ra:

- hệ thống có lớp điều khiển
- hệ thống có lớp bằng chứng và xác minh
- hệ thống có khả năng đánh giá, cảnh báo và truy vết
- hệ thống có định hướng phát triển theo hướng model-driven

## 2. Chuẩn bị trước khi demo

### 2.1. Kiểm tra hạ tầng

- OpenDaylight Vanadium / Karaf đang chạy
- Mininet + Open vSwitch đã khởi tạo
- backend FastAPI đang chạy
- frontend Vite đang chạy

### 2.2. Kiểm tra nhanh trạng thái nền

Trước khi vào phòng demo, nên xác nhận:

- Dashboard mở được
- Policy Center tải được policy inventory
- Flows hiển thị được OVS live flows
- Alert Center không báo lỗi controller connectivity
- Metrics Center và Operations Timeline có dữ liệu nền

### 2.3. Nếu có sai lệch

- dùng **Recover Baseline**
- refresh lại Dashboard và Policy Center
- verify lại policy baseline nếu cần

## 3. Trình tự demo khuyến nghị

Trình tự này phù hợp cho defense vì đi từ tổng quan sang minh chứng, rồi sang đánh giá và truy vết.

1. Dashboard
2. Policy Center
3. Demo Assistant hoặc thao tác policy trực tiếp
4. Flows
5. Alert Center
6. Metrics Center
7. Operations Timeline
8. Model Viewer
9. Presenter Overlay / Defense Mode nếu cần nhấn mạnh câu chuyện

## 4. Bước 1: mở Dashboard

### Nên bấm gì

- Mở trang `Dashboard`
- Chỉ vào:
  - Controller status
  - Policy Compliance Summary
  - Drift Watch
  - Alert Summary
  - Active Policy Inventory
  - Live Enforcement Evidence

### Nên nói gì

> Đây là màn hình điều hành tổng thể của sản phẩm SDN Management. Hệ thống không chỉ xem trạng thái controller mà còn tổng hợp policy, compliance, drift, alert và bằng chứng thực thi trên switch.

### Nên chứng minh điều gì

- controller đang reachable
- policy inventory có tồn tại
- hệ thống có lớp evidence và drift, không chỉ có topology

## 5. Bước 2: vào Policy Center

### Nên bấm gì

- Mở `Policy Center`
- Chọn một policy seeded như:
  - Baseline Forwarding
  - Block Ping h1-h2
  - Block HTTP h1-h2
  - Isolate h1

### Nên nói gì

> Mỗi policy trong hệ thống được biểu diễn như một policy object có desired state, live state, compliance, evidence và lịch sử verification. Đây là trung tâm điều khiển cốt lõi của sản phẩm.

### Nên chứng minh điều gì

- hệ thống có policy inventory
- mỗi policy có trạng thái riêng
- có preview/apply/verify/rollback
- có evidence workspace và report/comparison surfaces

## 6. Bước 3: trình diễn Baseline

### Nên bấm gì

- Trong Policy Center hoặc Demo Assistant, chọn `Baseline`
- Nếu cần, dùng `Apply` hoặc `Recover Baseline`
- Sau đó `Verify`

### Nên nói gì

> Baseline là trạng thái forwarding nền để đảm bảo môi trường demo bắt đầu từ một mốc an toàn và có thể phục hồi sau các kịch bản can thiệp.

### Nên chứng minh điều gì

- baseline là đường lui kỹ thuật
- verify xác nhận trạng thái nền đã được tái lập

### Hành động phục hồi

- `Recover Baseline`

## 7. Bước 4: trình diễn Ping Block Demo

### Nên bấm gì

- Chọn `Block Ping h1-h2`
- `Apply`
- `Verify`
- Chuyển sang `Flows`

### Nên nói gì

> Ở đây hệ thống áp ý định chặn ICMP hai chiều giữa h1 và h2, sau đó đối chiếu evidence từ OVS để xác minh rằng chính sách thực sự đã được thực thi.

### Nên chỉ vào đâu

- desired/live/compliance trong Policy Center
- evidence workspace
- OVS live flow dump trong Flows

### Nên chứng minh điều gì

- policy đã chuyển sang trạng thái enforced
- verify thành công
- flow evidence hỗ trợ kết luận

### Hành động phục hồi

- rollback policy
- hoặc Recover Baseline

## 8. Bước 5: trình diễn HTTP Block Demo

### Nên bấm gì

- Chọn `Block HTTP h1-h2`
- `Apply`
- `Verify`
- Mở `Flows`

### Nên nói gì

> Đây là kịch bản chặn TCP/80 hai chiều. Điểm quan trọng không chỉ là thao tác apply, mà là việc hệ thống lưu policy event, sinh evidence và cho phép kiểm chứng bằng live flow state.

### Nên chứng minh điều gì

- policy event được ghi nhận
- verification history có thêm bản ghi
- evidence vẫn bám theo policy object

### Hành động phục hồi

- rollback
- hoặc Recover Baseline

## 9. Bước 6: trình diễn Host Isolation Demo

### Nên bấm gì

- Chọn `Isolate h1`
- `Apply`
- `Verify`

### Nên nói gì

> Kịch bản này chứng minh hệ thống có thể áp một can thiệp mạnh hơn trên mặt phẳng dữ liệu, đồng thời vẫn giữ cấu trúc quản trị nhất quán: policy object, evidence, verification, compliance và recovery.

### Nên chứng minh điều gì

- mức độ can thiệp khác nhau vẫn đi qua cùng một vòng lặp quản trị

### Hành động phục hồi

- rollback
- hoặc Recover Baseline

## 10. Bước 7: mở Alert Center

### Nên bấm gì

- Mở `Alert Center`

### Nên nói gì

> Sau các thao tác điều khiển, hệ thống không dừng lại ở trạng thái enforcement mà còn nâng tín hiệu drift, evidence gap và readiness thành các cảnh báo vận hành rõ ràng.

### Nên chứng minh điều gì

- hệ thống có fault/attention layer
- recent policy events liên kết được với góc nhìn alert

## 11. Bước 8: mở Metrics Center

### Nên bấm gì

- Mở `Metrics Center`

### Nên nói gì

> Đây là phần chứng minh hệ thống có khả năng đánh giá định lượng. Không chỉ điều khiển policy, sản phẩm còn tính được compliance ratio, drift rate, evidence coverage và mức sẵn sàng của môi trường.

### Nên chứng minh điều gì

- có tổng số policy
- có verification count
- có compliance rate
- có drift / fault metrics
- có readiness snapshot

## 12. Bước 9: mở Operations Timeline / Audit Replay

### Nên bấm gì

- Mở `Operations Timeline`
- Chuyển giữa các view:
  - latest first
  - grouped by policy
  - grouped by category

### Nên nói gì

> Điểm mạnh của sản phẩm là có thể kể lại chuỗi vận hành theo thời gian: policy nào đã apply, lúc nào verify, evidence nào được ghi nhận, khi nào có drift hoặc recovery.

### Nên chứng minh điều gì

- hệ thống có operational story
- event, evidence và verification liên kết được với nhau

## 13. Bước 10: mở Model Viewer

### Nên bấm gì

- Mở `Model Viewer`
- Chọn node
- So sánh `Config View` và `Operational View`
- Mở `Raw JSON Inspector` nếu reviewer muốn xem thêm

### Nên nói gì

> Đây là bước mở rộng câu chuyện từ policy/flows sang quản trị dựa trên mô hình. Tuy nhiên cần nhấn mạnh trung thực rằng hiện tại đây là YANG-lite viewer ở chế độ read-only, phản chiếu một phần trạng thái controller/device, chưa phải full NETCONF management.

### Nên chứng minh điều gì

- sản phẩm đã có hướng đi model-driven
- có phân tách config-like và operational-like view
- vẫn giữ thái độ trung thực về mức độ hoàn thiện

## 14. Sử dụng Defense Mode và Presenter Overlay

### Khi nào nên dùng

- Khi cần giảm thao tác giữa nhiều trang
- Khi cần cue nói ngắn gọn
- Khi muốn mở nhanh Metrics Center, Timeline, Alert Center, Policy Center

### Nên nói gì

> Lớp presenter không phải workflow engine mới, mà là lớp hỗ trợ trình bày để câu chuyện kỹ thuật được mạch lạc và ít thao tác hơn.

## 15. Cách xử lý nếu reviewer hỏi về Policy Template Builder

Nên trả lời rõ:

- hệ thống đã có hướng template-aware policy object
- builder chỉ mở khi backend deployment expose đúng capability
- nếu backend hiện tại không hỗ trợ template endpoints thì giao diện sẽ hiển thị unavailable state
- sản phẩm không giả lập live template execution khi backend chưa hỗ trợ

## 16. Cách kết thúc phần demo

### Nên tổng kết như sau

> Sản phẩm không chỉ điều khiển một vài flow rule, mà đã tạo ra một vòng lặp quản trị SDN tương đối hoàn chỉnh: có ý định chính sách, có thực thi, có bằng chứng, có xác minh, có đánh giá sai lệch, có cảnh báo, có đo lường và có truy vết phục vụ defense.

### Trạng thái cuối cùng nên đưa về

- Recover Baseline
- Refresh Dashboard
- Mở lại Policy Center hoặc Dashboard để xác nhận môi trường về trạng thái nền
