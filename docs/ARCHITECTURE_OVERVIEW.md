# Kiến trúc tổng thể của sản phẩm SDN Management

## 1. Mục tiêu kiến trúc

Kiến trúc của sản phẩm được thiết kế để phục vụ một mục tiêu rất cụ thể: xây dựng một hệ thống quản trị SDN có thể **điều khiển**, **quan sát**, **xác minh**, **đánh giá** và **trình bày** được trong môi trường đồ án tốt nghiệp. Vì vậy, kiến trúc không đi theo hướng phức tạp hóa bằng các thành phần lớn chưa cần thiết, mà ưu tiên:

- khả năng chạy thực nghiệm ổn định
- khả năng chứng minh enforcement trên OVS
- khả năng tận dụng dữ liệu controller qua RESTCONF
- khả năng trình bày thành câu chuyện vận hành hoàn chỉnh

## 2. Sơ đồ kiến trúc mức cao

```text
+-------------------------+        RESTCONF         +---------------------------+
| OpenDaylight Vanadium   | <---------------------> | FastAPI Backend           |
| / Karaf                 |                         | - data integration        |
| - topology              |                         | - policy center           |
| - inventory             |                         | - evidence / verification |
| - controller flows      |                         | - drift / alerts / report |
+-------------------------+                         +-------------+-------------+
                                                                  |
                                                                  | HTTP / JSON
                                                                  v
                                                     +---------------------------+
                                                     | React + Vite Frontend     |
                                                     | - Dashboard               |
                                                     | - Policy Center           |
                                                     | - Flows / Topology        |
                                                     | - Model Viewer            |
                                                     | - Alert / Metrics / Audit |
                                                     | - Presenter Overlay       |
                                                     +-------------+-------------+
                                                                   |
                                                                   | OVS control / evidence
                                                                   v
                                                     +---------------------------+
                                                     | Mininet + Open vSwitch    |
                                                     | - switch s1               |
                                                     | - host h1, h2             |
                                                     | - live enforcement        |
                                                     +---------------------------+
```

## 3. Vai trò của từng thành phần

### 3.1. OpenDaylight / RESTCONF

Trong sản phẩm hiện tại, OpenDaylight không được mô tả như một bộ máy thực thi duy nhất cho toàn bộ policy. Vai trò thực tế của nó là:

- cung cấp **topology summary**
- cung cấp **inventory state**
- cung cấp **controller-side flow visibility**
- làm nguồn dữ liệu cho các trang Dashboard, Topology, Inventory, Flows và Model Viewer

Kết nối được thực hiện qua **RESTCONF**. Đây là hướng tiếp cận phù hợp với đồ án vì:

- dễ tích hợp
- rõ ràng về ranh giới kỹ thuật
- không cần can thiệp vào lõi Java plugin của OpenDaylight

### 3.2. Open vSwitch / Mininet

Đây là nơi diễn ra enforcement thực tế trong sản phẩm hiện tại. OVS được dùng để:

- cài flow baseline
- chặn ping
- chặn HTTP
- cô lập host h1
- dump live flows để thu evidence

Việc dùng **OVS-direct** thay vì cố ép toàn bộ execution qua controller mang lại các lợi ích thực tế:

- dễ kiểm chứng
- sát với lab thực nghiệm
- giảm rủi ro phụ thuộc controller pipeline
- tạo được evidence rõ ràng cho đồ án

Đây là một quyết định kiến trúc có chủ đích, không phải thiếu sót ngẫu nhiên.

### 3.3. FastAPI backend

Backend là lớp trung tâm của sản phẩm. Nó đóng vai trò:

- hợp nhất dữ liệu từ OpenDaylight và OVS
- quản lý **policy object**
- duy trì **desired state**, **live state**, **compliance**
- ghi nhận **event log**
- lưu **evidence snapshots**
- lưu **verification history**
- tính **drift summary**
- cung cấp dữ liệu cho **alert synthesis**, **metrics** và **audit replay**

Backend cũng là nơi biến các thao tác rời rạc thành một vòng lặp vận hành có ý nghĩa.

### 3.4. Frontend React

Frontend không chỉ làm chức năng “hiển thị đẹp”, mà còn tổ chức trải nghiệm quản trị theo các trung tâm chức năng:

- Dashboard
- Policy Center
- Demo Assistant
- Flows
- Topology
- Inventory
- Model Viewer v2
- Alert Center
- Metrics Center
- Operations Timeline
- Presenter Overlay / Defense Mode

Lớp frontend được tổ chức theo hướng operator-console: nhiều mặt quan sát, ít thao tác thừa, phục vụ cả vận hành lẫn trình bày defense.

## 4. Ranh giới thành phần

### 4.1. Ranh giới controller layer

- đọc topology
- đọc inventory
- đọc controller-reported flows
- cung cấp partial model view inputs

Không nên diễn giải lớp này thành full model-driven controller management trong trạng thái hiện tại.

### 4.2. Ranh giới execution layer

- enforcement hiện tại tập trung ở OVS-direct
- backend gọi lớp OVS service để apply / rollback / recover baseline
- verification dựa trên evidence live từ OVS kết hợp trạng thái policy đã biết

### 4.3. Ranh giới presentation layer

- frontend chỉ sử dụng các API read-only hoặc safe control hiện có
- Presenter Overlay là lớp hỗ trợ demo, không phải workflow engine mới
- Metrics Center và Operations Timeline được xây dựng trên dữ liệu sẵn có, không tạo backend engine riêng

## 5. Vì sao sản phẩm dùng OVS-direct

Đây là điểm cần giải thích rõ với reviewer.

### 5.1. Lý do thực tiễn

- Môi trường thực nghiệm dùng Mininet + OVS cho phép kiểm chứng flow trực tiếp
- `ovs-ofctl` giúp chứng minh enforcement bằng dữ liệu cụ thể
- Việc kiểm tra lại trạng thái từ switch dễ tạo evidence rõ ràng

### 5.2. Lý do kỹ thuật

- Giảm phụ thuộc vào cách controller ánh xạ flow trong lab nhỏ
- Giảm độ phức tạp khi chưa phát triển plugin Java phía ODL
- Giữ kiến trúc hiện tại ở mức phù hợp với đồ án và dễ bảo trì

### 5.3. Ý nghĩa sản phẩm

Sản phẩm vẫn là hệ thống quản trị SDN vì nó:

- dùng controller làm nguồn trạng thái mạng
- tổ chức policy object ở lớp quản trị
- có vòng lặp verify/evidence/drift/alert
- có hướng mở rộng về model-driven management

## 6. Evidence, verification, drift, alert và metrics nằm ở đâu

### Evidence

Evidence là bằng chứng live hoặc snapshot hóa cho policy/object hiện tại. Nguồn evidence chủ yếu đến từ:

- OVS live flow state
- trạng thái enforcement quan sát được
- controller-derived state khi phù hợp

### Verification

Verification là thao tác đối chiếu giữa:

- desired state
- live enforcement
- evidence hiện có

Kết quả verification được lưu lại thành lịch sử riêng.

### Drift

Drift là lớp diễn giải sai lệch giữa ý định và trạng thái hiện tại. Drift summary được dùng bởi:

- Dashboard
- Policy Center
- Alert Center
- Metrics Center
- Operations Timeline

### Alert

Alert không phải một engine SIEM đầy đủ, nhưng là lớp fault/attention hợp nhất các tín hiệu:

- drift
- evidence gaps
- controller availability
- demo hygiene
- inventory/topology inconsistencies khi có

### Metrics

Metrics Center dùng dữ liệu sẵn có để lượng hóa:

- tổng số policy
- enabled policy
- compliance ratio
- drift rate
- evidence coverage
- verification runs
- active alerts
- recent control activity

## 7. Luồng dữ liệu tổng quát

### Luồng đọc từ controller

1. Frontend gọi backend
2. Backend gọi OpenDaylight qua RESTCONF
3. Backend chuẩn hóa dữ liệu topology / inventory / flow view
4. Frontend hiển thị thành Topology, Inventory, Model Viewer, Flows và một phần Dashboard

### Luồng thực thi policy

1. Operator tạo/chọn policy object
2. Backend cập nhật desired state
3. Backend dùng OVS service để thực thi nếu policy có execution mapping
4. Backend refresh evidence và live state
5. Frontend hiển thị compliance, drift, evidence và timeline

### Luồng đánh giá và trình bày

1. Policy event được ghi lại
2. Evidence và verification được tích lũy
3. Drift và alert được suy diễn từ trạng thái hiện tại
4. Metrics Center tổng hợp góc nhìn định lượng
5. Operations Timeline kể lại chuỗi vận hành
6. Presenter Overlay hỗ trợ trình bày câu chuyện này trong defense

## 8. Tương tác giữa các mô-đun

### Dashboard

Làm điểm vào để nhìn bức tranh toàn cục và dẫn người dùng sang:

- Policy Center
- Demo Assistant
- Metrics Center
- Operations Timeline
- Alert Center

### Policy Center

Là trung tâm của vòng lặp control và compliance:

- policy object
- preview
- apply
- verify
- rollback
- evidence
- report

### Flows

Đóng vai trò chứng minh live enforcement, đặc biệt ở lớp OVS.

### Metrics Center

Chứng minh hệ thống có khả năng đánh giá định lượng.

### Operations Timeline

Chứng minh hệ thống có khả năng audit replay.

### Model Viewer

Chứng minh hệ thống đang tiến dần theo hướng model-driven management, nhưng vẫn ở trạng thái read-only và partial.

## 9. Implemented now vs future extension

### 9.1. Đã hiện thực trong phiên bản hiện tại

- Dashboard đa bề mặt
- Policy Center với lifecycle tương đối đầy đủ
- Demo Assistant
- Flows / Topology / Inventory
- Model Viewer v2 read-only
- Alert Center
- Metrics Center
- Operations Timeline / Audit Replay
- Defense Mode
- Presenter Overlay / Demo Director
- Policy Template Builder có gate theo capability

### 9.2. Hướng mở rộng trong tương lai

- capability endpoint rõ ràng hơn giữa frontend và backend
- mở rộng phạm vi template policy execution mapping
- sâu hơn về model-driven management
- báo cáo phiên làm việc/export tốt hơn
- thí nghiệm controller-side execution ở phạm vi nhỏ

### 9.3. Chưa hiện thực và không nên tuyên bố là đã có

- full NETCONF multi-vendor management
- full writable YANG datastore support
- full gNMI/OpenConfig stack
- ODL clustering
- cloud-native/Kubernetes platform hoàn chỉnh
- thay thế hoàn toàn OVS-direct bằng controller-only execution
