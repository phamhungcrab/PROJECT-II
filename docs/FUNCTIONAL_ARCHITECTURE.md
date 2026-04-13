# Kiến trúc chức năng của sản phẩm

## 1. Mục đích tài liệu

Tài liệu này mô tả các mô-đun chức năng hiện có trong sản phẩm SDN Management, bao gồm mục tiêu, đầu vào, đầu ra và giá trị vận hành thực tế của từng trang hoặc lớp giao diện.

## 2. Danh sách mô-đun hiện có

### 2.1. Dashboard

**Mục đích**

- Cung cấp góc nhìn tổng thể về trạng thái hệ thống
- Là điểm vào chính cho operator và reviewer
- Tổng hợp điều khiển, evidence, drift, alert và readiness

**Đầu vào chính**

- `/api/health`
- `/api/topology/summary`
- `/api/inventory/nodes`
- `/api/policies/summary`
- `/api/policies/events`
- `/api/policies/drift`
- dữ liệu OVS evidence và demo status từ backend

**Đầu ra / hiển thị chính**

- Final Defense Pack
- controller status
- fabric footprint
- policy compliance summary
- drift watch
- alert summary
- defense summary
- quick policy actions
- active policy inventory
- live enforcement evidence
- operation log
- links sang Metrics Center và Operations Timeline

**Giá trị vận hành**

- Cho phép đánh giá nhanh trạng thái của môi trường demo
- Rút ngắn thời gian chuẩn bị defense
- Làm “bảng điều khiển chiến thuật” trước khi đi sâu vào từng mô-đun

### 2.2. Policy Center

**Mục đích**

- Quản trị policy object và vòng đời chính sách
- Hiển thị desired/live/compliance state
- Tổ chức evidence, verification và report

**Đầu vào chính**

- `/api/policies`
- `/api/policies/summary`
- `/api/policies/events`
- `/api/policies/drift`
- `/api/policies/{policy_id}`
- `/api/policies/{policy_id}/evidence`
- `/api/policies/{policy_id}/verifications`
- các endpoint apply / verify / rollback / preview
- template capability và template endpoints nếu deployment hỗ trợ

**Đầu ra / hiển thị chính**

- policy inventory
- policy detail
- preview trạng thái thực thi
- evidence workspace
- verification history
- comparison / report surfaces
- drift và compliance summary
- template builder availability hoặc unavailable state

**Giá trị vận hành**

- Biến ý định quản trị thành đối tượng có thể theo dõi
- Tạo vòng lặp quản trị có kiểm chứng
- Là mô-đun cốt lõi của sản phẩm

### 2.3. Demo Assistant

**Mục đích**

- Hỗ trợ người trình bày trong defense/demo
- Chuẩn hóa các scenario và cue nói

**Đầu vào chính**

- policy summary
- policy actions
- verification/evidence signals
- scene definitions trong frontend

**Đầu ra / hiển thị chính**

- scenario inventory
- speaker assist
- recommended defense flow
- quick actions theo scenario

**Giá trị vận hành**

- Giảm sai sót khi demo
- Làm rõ mối liên hệ giữa thao tác và bằng chứng
- Hỗ trợ trình bày mạch lạc hơn

### 2.4. Flows

**Mục đích**

- Quan sát flow rule trên mạng SDN
- So sánh góc nhìn controller và OVS live

**Đầu vào chính**

- `/api/flows/{node_id}`
- `/api/flows/ovs`

**Đầu ra / hiển thị chính**

- controller flow tables
- OVS live flow dump
- filter/search
- metadata theo flow, match, action, counters

**Giá trị vận hành**

- Chứng minh enforcement trên switch
- Cung cấp bằng chứng kỹ thuật rõ ràng khi verify policy

### 2.5. Topology

**Mục đích**

- Hiển thị cấu trúc topo hiện tại

**Đầu vào chính**

- `/api/topology/summary`
- `/api/topology/raw`

**Đầu ra / hiển thị chính**

- topology nodes
- topology links
- attachment context
- topology composition summary

**Giá trị vận hành**

- Giúp reviewer hiểu môi trường thử nghiệm
- Cung cấp bối cảnh cho các thao tác policy và evidence

### 2.6. Inventory

**Mục đích**

- Hiển thị trạng thái inventory từ controller

**Đầu vào chính**

- `/api/inventory/nodes`

**Đầu ra / hiển thị chính**

- danh sách node
- connector state
- interface/counter visibility

**Giá trị vận hành**

- Bổ sung góc nhìn thiết bị và cổng kết nối
- Là nguồn đầu vào cho Model Viewer và Alert Center

### 2.7. Model Viewer v2

**Mục đích**

- Trình bày trạng thái model-driven ở mức read-only
- Minh họa hướng phát triển YANG-lite / model-centric

**Đầu vào chính**

- topology summary
- inventory nodes
- controller/device-derived state
- snapshot metadata từ frontend aggregation

**Đầu ra / hiển thị chính**

- selected node context
- source lineage
- freshness / trust / scope badges
- Config View
- Operational View
- difference hints
- Model Explorer v2
- Raw JSON Inspector

**Giá trị vận hành**

- Chứng minh sản phẩm đang đi theo hướng quản trị dựa trên mô hình
- Cung cấp góc nhìn có cấu trúc hơn là chỉ xem raw JSON

**Lưu ý trung thực**

- Đây là **YANG-lite**, **read-only**, **partial model projection**
- Không phải full NETCONF/YANG datastore platform

### 2.8. Alert Center

**Mục đích**

- Tập trung hóa fault/attention signals

**Đầu vào chính**

- health
- policy summary
- drift summary
- demo status
- OVS evidence
- inventory signals
- recent policy events

**Đầu ra / hiển thị chính**

- alert watch summary
- top active faults
- recent policy events
- alert feed
- quick action / recovery links

**Giá trị vận hành**

- Cung cấp lớp quan sát lỗi/sai lệch dễ trình bày
- Kết nối giữa drift, evidence gap và hành động khắc phục

### 2.9. Metrics Center

**Mục đích**

- Lượng hóa mức độ hoàn thiện và trạng thái vận hành của hệ thống

**Đầu vào chính**

- policy list
- policy summary
- verification history
- evidence snapshots
- drift summary
- alert synthesis inputs
- recent events

**Đầu ra / hiển thị chính**

- total policies
- enabled policies
- total verification runs
- compliance rate
- drift rate
- evidence coverage
- alert count
- recent activity snapshot
- product readiness snapshot

**Giá trị vận hành**

- Chứng minh hệ thống có khả năng đo lường
- Hữu ích trong đánh giá sản phẩm ở góc nhìn học thuật và vận hành

### 2.10. Operations Timeline / Audit Replay

**Mục đích**

- Kể lại chuỗi hoạt động vận hành theo thời gian

**Đầu vào chính**

- recorded policy events
- evidence snapshots
- verification history
- drift summary
- alert synthesis
- demo status

**Đầu ra / hiển thị chính**

- latest-first feed
- grouped by policy
- grouped by category
- recent activity window
- derived vs recorded labels
- cross-links sang các trung tâm khác

**Giá trị vận hành**

- Tăng tính auditability của sản phẩm
- Hỗ trợ defense bằng câu chuyện vận hành có thứ tự thời gian

### 2.11. Presenter Overlay / Defense Mode

**Mục đích**

- Hỗ trợ trình bày defense/demo với ít thao tác hơn

**Đầu vào chính**

- route hiện tại
- scene definitions
- health/policy/evidence/alert/readiness inputs
- presenter refresh event

**Đầu ra / hiển thị chính**

- Presenter Rail
- scene shortcuts
- narration cues
- readiness checklist
- spotlight mode
- freeze/live overlay state
- quick actions

**Giá trị vận hành**

- Làm sản phẩm “demo-ready”
- Giảm thời gian chuyển trang và nói lại cùng một nội dung

### 2.12. Shared shell / navigation / presentation layer

**Mục đích**

- Đồng bộ route, navigation và shell behavior
- Hỗ trợ sidebar scroll độc lập
- Duy trì trải nghiệm nhất quán giữa các mô-đun

**Đầu vào chính**

- route registry
- navigation metadata
- local UI state như defense mode và presenter mode

**Đầu ra / hiển thị chính**

- sidebar điều hướng
- top shell metadata
- sticky/collapsible presenter surface

**Giá trị vận hành**

- Tránh lỗi route/sidebar drift
- Cải thiện khả năng dùng khi số lượng trang tăng lên

## 3. Quan hệ giữa các mô-đun

### 3.1. Dashboard là điểm vào

Dashboard dẫn hướng sang các trung tâm chuyên sâu hơn như Policy Center, Alert Center, Metrics Center và Operations Timeline.

### 3.2. Policy Center là lõi vận hành

Các mô-đun còn lại thường tiêu thụ hoặc diễn giải dữ liệu xoay quanh policy state:

- Dashboard tóm tắt
- Alert Center cảnh báo
- Metrics Center lượng hóa
- Operations Timeline kể lại
- Flows chứng minh live enforcement

### 3.3. Model Viewer là lớp định hướng tương lai

Model Viewer không thay thế Policy Center hay Flows, mà bổ sung hướng nhìn theo cấu trúc dữ liệu/model.

### 3.4. Presenter layer là lớp phục vụ bảo vệ

Presenter Overlay không thay đổi logic backend; nó chỉ tổ chức lại thao tác và ngữ cảnh trình bày.

## 4. Tóm tắt giá trị chức năng

Sản phẩm hiện tại mang lại bốn giá trị chính:

1. **Điều khiển có cấu trúc** qua policy object và lifecycle
2. **Quan sát và kiểm chứng** qua evidence, verification, OVS/ODL visibility
3. **Đánh giá và cảnh báo** qua drift, alerts, metrics
4. **Trình bày và truy vết** qua Operations Timeline, Defense Mode và Presenter Overlay
