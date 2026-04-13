# Định hướng phát triển và phạm vi chưa hiện thực

## 1. Mục tiêu tài liệu

Tài liệu này tách rõ ba lớp nội dung:

- **A. Hướng phát triển gần, an toàn và sát sản phẩm hiện tại**
- **B. Hướng nghiên cứu hoặc mở rộng sâu hơn**
- **C. Những nội dung chưa hiện thực và không nên trình bày như năng lực hiện tại**

Việc tách lớp này giúp tránh tình trạng mô tả quá mức, đồng thời cho reviewer thấy lộ trình phát triển có kiểm soát.

## A. Hướng phát triển gần, an toàn và sát sản phẩm hiện tại

### A.1. Capability layer và deployment truth

Hiện tại frontend đã có cơ chế gate cho Policy Template Builder dựa trên backend capability, nhưng cách phát hiện chủ yếu vẫn dựa trên bề mặt API hiện có. Hướng phát triển gần là:

- bổ sung capability endpoint tường minh
- công bố rõ deployment có hỗ trợ template preview/create hay không
- giảm rủi ro mismatch giữa frontend và backend deployment

### A.2. Mở rộng Policy Template Builder ở mức an toàn

Template Builder hiện mới phù hợp cho một số mẫu policy hạn chế và có execution mapping giới hạn. Có thể mở rộng dần theo hướng:

- thêm nhiều tổ hợp template an toàn hơn
- tiếp tục giữ ràng buộc host/protocol/direction chặt chẽ
- tăng chất lượng preview và policy metadata

Điều cần tránh là biến nó thành một OpenFlow authoring engine tổng quát quá sớm.

### A.3. Tăng chiều sâu report/export

Hiện hệ thống đã có evidence, report surfaces và timeline. Hướng gần là:

- xuất báo cáo theo phiên demo
- gom evidence, verification, drift và alert vào một artifact rõ ràng hơn
- hỗ trợ lưu lại defense pack theo lần trình bày

### A.4. Cải thiện readiness và session management

Có thể mở rộng nhẹ ở phía frontend/backend để:

- đánh dấu một phiên demo mới
- phân biệt recent activity theo session
- tóm tắt readiness trước khi bắt đầu defense

### A.5. Tăng độ chính xác của freshness / staleness

Nhiều màn hình hiện đã có freshness/trust badges. Hướng gần là:

- thống nhất timestamp semantics
- phân biệt snapshot time, fetch time và source-origin time rõ hơn

## B. Hướng nghiên cứu hoặc mở rộng sâu hơn

### B.1. Controller experimental mode

Một hướng nghiên cứu có giá trị là bổ sung chế độ thử nghiệm thực thi một phần qua controller. Tuy nhiên điều này nên được xem như:

- **experimental mode**
- phạm vi hẹp
- có kiểm chứng riêng

Không nên thay ngay toàn bộ đường OVS-direct hiện tại.

### B.2. Model-driven management sâu hơn

Model Viewer hiện là YANG-lite, read-only và partial. Hướng phát triển sâu hơn gồm:

- mở rộng source lineage
- tăng chất lượng model projection
- liên kết chặt hơn giữa inventory, topology, flows và model context
- bổ sung mapping tốt hơn giữa config-like và operational-like state

### B.3. Từ read-only model view đến richer model projection

Một bước trung gian hợp lý trước khi nghĩ đến full NETCONF management là:

- thêm nhiều field model có cấu trúc hơn
- cải thiện difference hints
- mở rộng node-level context
- tăng khả năng truy ngược nguồn dữ liệu

### B.4. Timeline / audit chiều sâu hơn

Operations Timeline hiện đã hữu ích ở góc nhìn demo và audit replay cơ bản. Hướng sâu hơn:

- nhóm timeline theo session
- replay theo scenario
- export timeline thành artifact phục vụ báo cáo
- liên kết sâu hơn với report pack

### B.5. ODL plugin extension ở quy mô nhỏ

Nếu bài toán nghiên cứu thật sự yêu cầu, có thể cân nhắc một **extension nhỏ** phía OpenDaylight. Tuy nhiên đây là hướng phát triển sâu hơn vì:

- tăng chi phí build/test
- tăng độ phức tạp bảo trì
- vượt ra khỏi hướng external practical app hiện tại

Do đó, nếu thực hiện thì nên giữ phạm vi nhỏ, có mục tiêu rất cụ thể.

## C. Chưa hiện thực và không nên trình bày như năng lực hiện tại

### C.1. Full multi-vendor NETCONF

Sản phẩm hiện tại **không** phải một nền tảng full multi-vendor NETCONF management. Model Viewer mới chỉ là read-only YANG-lite projection.

### C.2. Full writable YANG datastore support

Hệ thống hiện chưa có:

- candidate/running/startup datastore workflow
- transactional config write qua model-driven API
- rollback semantics theo datastore

### C.3. Full gNMI/OpenConfig stack

Đây không phải phạm vi hiện tại của đồ án. Nếu nhắc đến, chỉ nên xem như hướng nghiên cứu tương lai.

### C.4. ODL clustering

Chưa hiện thực. Không nên mô tả sản phẩm như một controller platform HA phân tán.

### C.5. Cloud-native / Kubernetes full platform

Sản phẩm hiện tại chạy trong bối cảnh lab thực nghiệm. Chưa có:

- container orchestration hoàn chỉnh
- multi-service production deployment
- cloud-native observability stack

### C.6. Thay thế hoàn toàn OVS-direct bằng controller-only flow pushing

Đây **không** phải trạng thái hiện tại của sản phẩm. Hướng OVS-direct đang là lựa chọn thực dụng để bảo đảm:

- demo ổn định
- evidence rõ ràng
- enforcement dễ kiểm chứng

Nếu sau này nghiên cứu controller-side execution sâu hơn, đó phải là một nhánh phát triển mới, không nên viết ngược lịch sử sản phẩm.

## 2. Kết luận

Hướng phát triển hợp lý của sản phẩm là:

1. củng cố các lớp đã có quanh capability, reporting, readiness và model projection
2. mở rộng dần các lớp cần chiều sâu như template policy, timeline, metrics
3. chỉ tiến sang các hướng lớn như controller experimental mode hoặc ODL extension khi đã có mục tiêu kỹ thuật rõ ràng

Giá trị của lộ trình này nằm ở chỗ nó giữ được tinh thần của sản phẩm hiện tại: **thực dụng, trung thực về phạm vi, và phát triển theo từng bước có kiểm soát**.
