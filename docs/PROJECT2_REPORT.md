# BÁO CÁO DỰ THẢO PROJECT 2

## 1. Thông tin sinh viên

- Họ và tên: **Phạm Ngọc Hưng**
- MSSV: **20235342**
- Tên hướng đề tài: **Xây dựng sản phẩm SDN Management phục vụ quản trị, đánh giá và trình bày đồ án**

## 2. Tóm tắt đề tài

Đề tài tập trung xây dựng một sản phẩm quản trị SDN theo hướng thực dụng trên nền OpenDaylight, Mininet và Open vSwitch. Thay vì chỉ triển khai các thao tác minh họa đơn lẻ như quan sát topology hay cài một số flow rule, hệ thống được thiết kế như một lớp quản trị hoàn chỉnh hơn, có khả năng biểu diễn chính sách dưới dạng policy object, thực thi trên môi trường thử nghiệm, thu thập evidence, xác minh mức độ tuân thủ, phát hiện drift, tổng hợp alert, lượng hóa các chỉ số đánh giá và cung cấp khả năng audit replay.

Kiến trúc hiện tại sử dụng OpenDaylight Vanadium / Karaf làm nguồn dữ liệu điều khiển thông qua RESTCONF, còn enforcement thực tế tập trung theo hướng OVS-direct trên Open vSwitch trong môi trường Mininet. FastAPI đóng vai trò backend tích hợp, còn frontend React + Vite + TypeScript đảm nhiệm lớp giao diện vận hành, defense và trình bày.

Kết quả của Project 2 không phải một hệ thống SDN quy mô công nghiệp hoàn chỉnh, nhưng đã hình thành được một sản phẩm có logic vận hành rõ ràng, có thể sử dụng để demo, defense và làm nền cho giai đoạn phát triển tiếp theo của đồ án tốt nghiệp.

## 3. Bối cảnh và bài toán

Trong nhiều bài thực hành SDN, trọng tâm thường tập trung vào việc kết nối controller với một topology thử nghiệm, sau đó quan sát node/link hoặc đẩy thử một số flow. Cách làm này giúp minh họa công nghệ, nhưng chưa tạo thành một sản phẩm quản trị có khả năng trả lời các câu hỏi quan trọng như:

- Ý định quản trị hiện tại là gì?
- Chính sách nào đang được bật?
- Bằng chứng nào cho thấy chính sách đã được thực thi?
- Hệ thống có xác minh được trạng thái thực tế hay không?
- Có sai lệch nào giữa ý định và thực tại không?
- Có thể phục hồi về baseline một cách an toàn không?
- Có thể kể lại chuỗi hoạt động vận hành sau buổi demo không?

Vì vậy, bài toán của đồ án không chỉ là “điều khiển SDN”, mà là xây dựng một lớp **SDN Management** có khả năng quản trị vòng đời, đo lường, quan sát, giải thích và trình bày.

## 4. Mục tiêu của đồ án

Mục tiêu chính của Project 2 là xây dựng được một sản phẩm SDN Management ở mức đủ rõ để:

1. Trình bày các policy thực nghiệm dưới dạng đối tượng quản trị có cấu trúc
2. Thực thi một số chính sách điển hình trên môi trường Mininet + OVS
3. Tích hợp dữ liệu từ OpenDaylight thông qua RESTCONF
4. Thu thập evidence và verification history cho các policy
5. Đánh giá compliance và drift
6. Hiển thị alert, metrics và audit replay
7. Cung cấp giao diện hỗ trợ defense/demo mạch lạc

## 5. Phạm vi thực hiện

### 5.1. Phạm vi đã thực hiện

- Xây dựng backend FastAPI cho lớp tích hợp SDN Management
- Xây dựng frontend React nhiều trang theo hướng operator-console
- Tích hợp OpenDaylight qua RESTCONF để lấy topology, inventory và flow visibility
- Thực thi policy theo hướng OVS-direct trên switch thực nghiệm
- Xây dựng Policy Center với apply, verify, rollback, evidence, report
- Xây dựng Dashboard, Demo Assistant, Flows, Topology, Inventory
- Xây dựng Model Viewer v2 ở mức YANG-lite, read-only
- Xây dựng Alert Center, Metrics Center, Operations Timeline
- Bổ sung Defense Mode và Presenter Overlay phục vụ trình bày

### 5.2. Phạm vi chưa thực hiện

- full NETCONF multi-vendor management
- full writable YANG datastore
- full controller-only enforcement
- ODL clustering
- full gNMI/OpenConfig stack
- nền tảng cloud-native/Kubernetes

## 6. Kiến trúc hệ thống

Kiến trúc hệ thống gồm bốn lớp chính:

### 6.1. Lớp thực nghiệm mạng

- Mininet tạo topo thử nghiệm
- Open vSwitch đóng vai trò switch
- bridge `s1` là nơi quan sát và thực thi flow thực tế

### 6.2. Lớp controller

- OpenDaylight Vanadium / Karaf
- northbound API dùng RESTCONF
- cung cấp topology, inventory, flow visibility và dữ liệu nguồn cho model snapshot

### 6.3. Lớp backend

- FastAPI
- tập hợp dữ liệu từ controller và switch
- duy trì policy state
- ghi event, evidence, verification
- tính drift summary và cung cấp dữ liệu cho alert/metrics/timeline

### 6.4. Lớp frontend

- React + Vite + TypeScript
- nhiều trung tâm chức năng tương ứng các nhu cầu vận hành và defense

## 7. Thiết kế backend

Backend là thành phần quyết định việc sản phẩm có trở thành một hệ thống quản trị hay không.

### 7.1. Vai trò của backend

- làm API layer thống nhất
- tách frontend khỏi chi tiết kết nối ODL / OVS
- lưu trữ trạng thái policy center
- cung cấp business logic cho apply / verify / rollback
- hợp nhất dữ liệu để sinh drift, alert input, metrics input và timeline input

### 7.2. Các nhóm API chính

- `/api/health`
- `/api/topology/*`
- `/api/inventory/*`
- `/api/flows/*`
- `/api/policies/*`

### 7.3. Policy center backend

Policy Center phía backend quản lý:

- policy list
- policy summary
- policy events
- drift summary
- evidence per policy
- verifications per policy
- apply / preview / verify / rollback
- baseline recovery

Các policy seeded hiện có gồm:

- baseline forwarding
- block ping h1-h2
- block HTTP h1-h2
- isolate h1

Ngoài ra backend đã được mở rộng để hiểu policy tạo từ template trong phạm vi hạn chế. Tuy nhiên execution mapping vẫn chỉ tồn tại cho một số tổ hợp an toàn và frontend phải gate theo capability.

### 7.4. OVSFlowService

Lớp này đóng vai trò thực thi thực tế trên môi trường OVS. Đây là một lựa chọn kiến trúc thực dụng vì:

- phù hợp với môi trường Mininet + OVS
- dễ lấy evidence live
- dễ verify
- giúp reviewer nhìn thấy rõ tác động kỹ thuật

## 8. Thiết kế frontend

Frontend được tổ chức theo hướng sản phẩm vận hành, không phải một trang demo đơn lẻ.

### 8.1. Shell chung

- sidebar điều hướng nhiều mô-đun
- shell scroll và overflow đã được polish để dùng tốt hơn trên các trang dài
- route registry đồng bộ giữa route và navigation

### 8.2. Dashboard

Dashboard tổng hợp trạng thái controller, policy posture, drift, alert, evidence, operation log, Final Defense Pack và runbook. Nó vừa là điểm vào chính, vừa là màn hình defense-ready.

### 8.3. Policy Center

Đây là trung tâm quan trọng nhất của frontend vì nó biểu diễn policy object và vòng đời chính sách. Mọi khái niệm như desired state, live state, compliance, evidence, verification đều được quy tụ tại đây.

### 8.4. Các mô-đun bổ sung

- Demo Assistant: hỗ trợ kịch bản trình diễn
- Flows: chứng minh enforcement bằng flow table
- Topology / Inventory: cung cấp ngữ cảnh thiết bị và kết nối
- Model Viewer: hướng nhìn YANG-lite/read-only
- Alert Center: fault view
- Metrics Center: evaluation view
- Operations Timeline: audit replay view
- Presenter Overlay: lớp hỗ trợ trình bày

## 9. Tích hợp OpenDaylight / RESTCONF / OVS / Mininet

### 9.1. OpenDaylight và RESTCONF

OpenDaylight được tích hợp theo cách an toàn và rõ ràng qua RESTCONF. Sản phẩm sử dụng dữ liệu từ controller để:

- lấy topology
- lấy inventory
- xem flow tables phía controller
- tạo nền cho model snapshot

### 9.2. OVS và Mininet

OVS trong môi trường Mininet là nơi enforcement thực tế diễn ra. Việc này tạo ra một đường kiểm chứng trực tiếp, đặc biệt hữu ích trong đồ án:

- có thể dump flow
- có thể so khớp policy intent với rule thật
- có thể phục hồi baseline

### 9.3. Vì sao không chọn full controller-only

Việc không ép toàn bộ hệ thống sang controller-only execution trong Project 2 là có chủ đích:

- giảm rủi ro kỹ thuật
- tăng khả năng kiểm chứng
- giữ phạm vi phù hợp với thời gian và mục tiêu đồ án
- vẫn cho phép dùng controller như nguồn dữ liệu quan trọng

## 10. Trung tâm chính sách và cơ chế thực thi

Policy Center là nơi chuyển từ “ý tưởng demo” sang “đối tượng quản trị có cấu trúc”.

### 10.1. Các thuộc tính cốt lõi

- id
- name
- target
- desired state
- live state
- compliance
- created / updated time
- version

Với template policy, hệ thống còn có thể mang thêm:

- template type
- source host
- destination host
- protocol
- port
- direction
- action
- execution status

### 10.2. Các thao tác vòng đời

- preview
- apply
- verify
- rollback
- recover baseline

### 10.3. Tính trung thực

Hệ thống phân biệt rõ:

- policy đã có live execution mapping
- policy chỉ ở trạng thái preview-only

Điều này tránh việc mô tả quá mức so với năng lực thực tế.

## 11. Cơ chế verification / evidence / drift

### 11.1. Verification

Sau mỗi lần apply hoặc theo yêu cầu operator, backend đối chiếu desired state với evidence hiện có và trạng thái enforcement live.

### 11.2. Evidence

Evidence chủ yếu đến từ:

- OVS live flows
- trạng thái enforcement hiện hành
- một phần tín hiệu controller-derived

### 11.3. Drift

Drift xuất hiện khi live state không còn phù hợp với desired state hoặc evidence không hỗ trợ kết luận mong muốn.

Ba lớp này là nền tảng để tạo nên giá trị “quản trị”, thay vì chỉ “điều khiển”.

## 12. Alert / Metrics / Timeline / Model Viewer

### 12.1. Alert Center

Tổng hợp các tín hiệu fault/attention phục vụ quan sát vận hành.

### 12.2. Metrics Center

Lượng hóa trạng thái sản phẩm thông qua compliance rate, drift rate, evidence coverage, verification coverage, alert count và readiness snapshot.

### 12.3. Operations Timeline

Kể lại chuỗi event theo thời gian để tăng auditability và khả năng giải thích.

### 12.4. Model Viewer

Model Viewer v2 là bước chuyển sang cách nhìn model-driven, nhưng chỉ ở mức:

- read-only
- partial
- YANG-lite
- controller/device state projection

## 13. Chế độ demo / presenter / defense support

Một điểm khác biệt của sản phẩm là lớp hỗ trợ defense được phát triển thành một phần giao diện thực sự.

### 13.1. Defense Mode

- tạo ngữ cảnh trình bày
- hỗ trợ dùng sản phẩm theo logic defense

### 13.2. Presenter Overlay / Demo Director

- scene shortcuts
- narration cues
- quick actions
- readiness checklist
- freeze/live helper

Lớp này không thay đổi dữ liệu backend, mà tối ưu trải nghiệm trình bày.

## 14. Kết quả đạt được

Project 2 đã đạt được các kết quả đáng kể:

- hình thành một sản phẩm SDN Management nhiều mô-đun
- có policy lifecycle tương đối hoàn chỉnh
- có evidence, verification, drift, alert, metrics, audit replay
- có Model Viewer read-only phục vụ câu chuyện model-driven
- có lớp hỗ trợ demo/defense
- có giao diện sản phẩm tương đối đồng bộ, không chỉ là tập hợp các trang thử nghiệm

## 15. Điểm mạnh kỹ thuật

- kiến trúc thực dụng, phù hợp lab thực nghiệm
- enforcement dễ kiểm chứng bằng OVS live flows
- OpenDaylight được tích hợp đúng vai trò dữ liệu điều khiển
- frontend tổ chức được nhiều góc nhìn vận hành khác nhau
- khả năng kể chuyện kỹ thuật tốt cho defense

## 16. Giới hạn hiện tại

- chưa chuẩn hóa file phụ thuộc backend thành `requirements.txt`
- chưa có capability endpoint chuẩn hóa riêng giữa frontend và backend
- chưa có full controller-only execution
- template policy còn bị giới hạn phạm vi
- Model Viewer mới ở mức partial projection
- chưa có full NETCONF/gNMI/OpenConfig
- chưa có clustering hoặc production deployment scale-out

## 17. Future work

Các hướng phát triển tiếp theo gồm:

- chuẩn hóa deployment truth và capability layer
- mở rộng template policy execution mapping
- tăng độ sâu của report/export
- nghiên cứu controller-side execution có kiểm chứng
- mở rộng model-driven management từng bước
- cân nhắc extension nhỏ phía ODL khi thật sự cần

## 18. Kết luận

Project 2 đã tạo ra một nền tảng sản phẩm SDN Management có cấu trúc rõ ràng và có giá trị cao hơn một bài demo SDN thông thường. Dù chưa hướng tới đầy đủ các đặc tính của một nền tảng quản trị SDN công nghiệp, hệ thống đã thể hiện được các năng lực cốt lõi:

- quản lý policy object
- thực thi trên môi trường thực nghiệm
- thu evidence
- verify trạng thái
- đánh giá drift và compliance
- tạo alert, metrics và audit replay
- hỗ trợ defense bằng giao diện chuyên biệt

Điểm quan trọng nhất là sản phẩm đã đặt được một nền tảng kỹ thuật và trình bày đủ mạnh để mở rộng thành giai đoạn đồ án tiếp theo, đồng thời vẫn giữ được tính trung thực về phạm vi và mức độ hoàn thiện hiện tại.
