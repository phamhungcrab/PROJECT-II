# Luồng điều khiển và luồng dữ liệu

## 1. Mục tiêu của tài liệu

Tài liệu này mô tả vòng lặp điều khiển và dữ liệu trong sản phẩm SDN Management theo cách mà một reviewer có thể đọc liên tục và hiểu được câu chuyện vận hành của hệ thống. Trọng tâm không nằm ở một API đơn lẻ, mà ở cách toàn bộ hệ thống biến một ý định quản trị thành hành động có bằng chứng, có xác minh và có khả năng truy vết.

## 2. Câu chuyện tổng quát

Sản phẩm được xây dựng quanh một vòng lặp:

1. **Desired state** được biểu diễn bằng policy object
2. Policy được **apply** vào môi trường thực nghiệm
3. Hệ thống thu **evidence**
4. Evidence được dùng để **verify**
5. Kết quả sinh ra **compliance state**
6. Nếu có lệch, hệ thống ghi nhận **drift**
7. Drift và các tín hiệu liên quan được nâng thành **alert**
8. Operator có thể **rollback** hoặc **recover baseline**
9. Toàn bộ chuỗi được nhìn lại qua **audit replay**

Đây là điểm làm cho sản phẩm trở thành một hệ thống quản trị có nghĩa, thay vì chỉ là một tập hợp màn hình quan sát rời rạc.

## 3. Desired state: ý định quản trị bắt đầu ở đâu

Trong sản phẩm hiện tại, desired state được biểu diễn chủ yếu qua **policy object** trong Policy Center.

### 3.1. Seeded policy

Các policy seeded hiện có trong repo là:

- `baseline_forwarding`
- `block_ping_h1_h2`
- `block_http_h1_h2`
- `isolate_h1`

Chúng đóng vai trò:

- minh họa các kịch bản thực nghiệm chính
- tạo nền cho demo/defense
- cung cấp đối tượng quản trị có trạng thái và lịch sử

### 3.2. Template-created policy

Hệ thống cũng đã có hỗ trợ tạo policy từ template ở mức giới hạn và an toàn. Tuy nhiên:

- phạm vi template được ràng buộc chặt
- execution mapping chỉ tồn tại cho một số tổ hợp hỗ trợ
- frontend chỉ mở builder khi backend capability tương ứng có mặt

Vì vậy, desired state có thể đến từ policy seeded hoặc policy tạo theo template, nhưng tài liệu phải phân biệt rõ policy nào thực sự có live mapping và policy nào chỉ mang tính preview-only.

## 4. Apply: ý định được đẩy vào môi trường như thế nào

Khi operator chọn apply một policy có execution mapping hợp lệ, backend đi theo hướng thực dụng:

1. cập nhật desired state trong policy store
2. gọi lớp OVS service
3. cài flow tương ứng trên bridge thực nghiệm
4. refresh live state
5. ghi event vào event log

Các ví dụ hiện có:

- baseline -> cài flow NORMAL forwarding
- ping block -> cài drop rule ICMP hai chiều giữa h1 và h2
- HTTP block -> cài drop rule TCP/80 hai chiều giữa h1 và h2
- isolate h1 -> cài rule cô lập lưu lượng IPv4 liên quan đến h1

Điểm cần nhấn mạnh:

- đây là **OVS-direct practical control**
- sản phẩm **không tuyên bố** rằng mọi enforcement hiện đều chạy controller-only

## 5. Evidence: hệ thống lấy bằng chứng từ đâu

Sau khi apply hoặc khi người dùng chủ động refresh/verify, hệ thống cần bằng chứng để biết policy có thực sự đang hiện diện trong môi trường hay không.

### 5.1. Nguồn evidence chính

- OVS live flows
- trạng thái enforcement quan sát được trên switch
- một phần dữ liệu controller-derived khi phù hợp

### 5.2. Vì sao OVS evidence quan trọng

OVS evidence là bằng chứng kỹ thuật trực tiếp nhất trong lab hiện tại vì:

- flow được cài ngay trên switch thử nghiệm
- có thể dump và đối chiếu với policy đang bật
- dễ giải thích trong defense

### 5.3. Evidence snapshot

Evidence không chỉ được hiển thị tức thời mà còn được ghi thành snapshot gắn với policy. Điều này tạo nền cho:

- verification history
- report
- metrics
- operations timeline

## 6. Verify: từ bằng chứng đến kết luận

Verification là bước chuyển từ “có dữ liệu” sang “có kết luận”.

### 6.1. Dữ liệu đầu vào cho verify

- desired state của policy
- live state quan sát được
- evidence snapshot hoặc flow status mới nhất

### 6.2. Kết quả verify

Sau verify, backend cập nhật:

- live state
- compliance
- verification history
- policy event log

Nếu desired state là `ENABLED` nhưng evidence không ủng hộ enforcement, policy có thể bị đánh dấu drift hoặc compliance không đạt.

## 7. Compliance: hệ thống “đạt” hay “không đạt” theo nghĩa nào

Trong sản phẩm hiện tại, compliance không phải là một mô hình formal verification rất nặng. Nó là kết quả vận hành dựa trên:

- policy intent đã biết
- live status hiện có
- evidence quan sát được

Compliance trả lời câu hỏi thực dụng:

> “Trạng thái hiện tại có còn khớp với ý định quản trị đã công bố hay không?”

Kết quả compliance được dùng bởi:

- Policy Center
- Dashboard
- Metrics Center
- Alert Center

## 8. Drift: khi ý định và thực tại bắt đầu lệch nhau

Drift là một lớp diễn giải rất quan trọng trong hệ thống.

### 8.1. Drift xuất hiện khi nào

Ví dụ:

- policy mong muốn đang bật nhưng live enforcement không còn
- evidence bị thiếu hoặc stale
- trạng thái live không còn khớp policy object

### 8.2. Drift được dùng ở đâu

- Dashboard hiển thị drift watch
- Policy Center hiển thị drift summary và trạng thái từng policy
- Alert Center biến drift thành tín hiệu cần chú ý
- Metrics Center dùng drift để tính drift rate
- Operations Timeline kể lại drift như một phần của lịch sử vận hành

## 9. Alert: từ drift sang cảnh báo vận hành

Alert Center không phải hệ thống cảnh báo độc lập kiểu SIEM, nhưng là lớp fault synthesis phục vụ quản trị và defense.

### 9.1. Nguồn tạo alert

- drift summary
- controller health
- evidence gaps
- inventory/topology signals
- demo hygiene hoặc readiness signals

### 9.2. Ý nghĩa

Alert biến trạng thái kỹ thuật rời rạc thành thông tin “cần chú ý” cho operator. Nhờ đó, sản phẩm không chỉ nói “đang có flow” mà còn nói “đang có sai lệch cần xử lý”.

## 10. Recovery: quay về baseline như thế nào

Một hệ thống quản trị có giá trị phải trả lời được câu hỏi: “Nếu demo sai hoặc trạng thái bị lệch thì quay về đâu?”

Trong sản phẩm hiện tại, đường lui chính là:

- `rollback` theo policy cụ thể
- `recover baseline`

Recover baseline được dùng để:

- khôi phục trạng thái forwarding nền
- xóa tác động của các policy block/isolation đang còn ảnh hưởng
- tạo điểm bắt đầu an toàn cho vòng demo tiếp theo

Điều này xuất hiện ở:

- Dashboard
- Policy Center
- Alert Center
- Presenter Overlay

## 11. Replay / Audit: sau khi xong rồi thì xem lại bằng cách nào

Operations Timeline / Audit Replay là nơi chuỗi điều khiển và dữ liệu được kể lại theo thứ tự thời gian.

Nguồn timeline bao gồm:

- policy events đã ghi nhận
- evidence observed
- verification history
- current drift signal
- alert synthesis
- baseline/recovery context

Một số entry là **recorded event**, một số là **derived timeline entry**. Hệ thống đã gắn nhãn trung thực để tránh hiểu nhầm rằng toàn bộ đều là log lịch sử gốc.

## 12. Vai trò của Metrics Center trong control loop

Metrics Center đứng ngoài luồng điều khiển trực tiếp, nhưng rất quan trọng trong đánh giá sản phẩm. Nó trả lời:

- hệ thống đang quản lý bao nhiêu policy
- bao nhiêu policy đang enabled
- tỷ lệ compliance hiện tại là bao nhiêu
- drift rate là bao nhiêu
- coverage của evidence đến đâu
- verification runs đã có chưa
- alert hiện có bao nhiêu

Nếu Policy Center là nơi “điều khiển”, thì Metrics Center là nơi “đo lường mức độ kiểm soát”.

## 13. Vai trò của Model Viewer trong luồng dữ liệu

Model Viewer không nằm trên đường thực thi policy, nhưng nằm trên đường diễn giải dữ liệu. Nó cho phép trình bày trạng thái mạng theo ngôn ngữ model hơn:

- Config View
- Operational View
- Difference hints
- Raw JSON Inspector

Điều quan trọng là phải diễn giải đúng:

- đây là **read-only model view**
- đây là **YANG-lite**
- đây là **partial controller/device state projection**

## 14. Luồng dữ liệu từ backend đến frontend

### 14.1. Dữ liệu policy-oriented

- list policies
- policy summary
- policy events
- drift summary
- evidence per policy
- verifications per policy

Các dữ liệu này nuôi:

- Dashboard
- Policy Center
- Alert Center
- Metrics Center
- Operations Timeline

### 14.2. Dữ liệu controller-oriented

- health
- topology summary/raw
- inventory nodes
- controller flow tables

Các dữ liệu này nuôi:

- Dashboard
- Topology
- Inventory
- Flows
- Model Viewer

### 14.3. Dữ liệu switch-oriented

- OVS live flows
- enforcement status

Các dữ liệu này nuôi:

- Flows
- Dashboard
- Policy Center evidence
- Alert synthesis

## 15. Tóm tắt

Nếu phải mô tả ngắn gọn control loop của sản phẩm bằng một câu, có thể nói:

> Sản phẩm bắt đầu từ policy object, thực thi policy trên môi trường OVS thực nghiệm, thu thập evidence để verify, diễn giải compliance và drift, nâng tín hiệu thành alert/metrics, và cuối cùng kể lại toàn bộ chuỗi vận hành bằng audit replay.

Đây là lõi giá trị kỹ thuật của hệ thống SDN Management trong phiên bản hiện tại.
