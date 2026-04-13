# SDN Management Product

## Thông tin đề tài

- Sinh viên: **Phạm Ngọc Hưng**
- MSSV: **20235342**
- Phạm vi: **Sản phẩm quản trị SDN phục vụ đồ án tốt nghiệp**

## Tổng quan

Đây là một sản phẩm quản trị mạng SDN theo hướng thực dụng, được xây dựng để trình bày một vòng lặp quản trị hoàn chỉnh thay vì chỉ dừng ở mức demo thao tác rời rạc. Hệ thống kết hợp:

- **OpenDaylight Vanadium / Karaf** làm nguồn dữ liệu điều khiển và quan sát mạng qua **RESTCONF**
- **Mininet + Open vSwitch** làm môi trường thực nghiệm cho mặt phẳng dữ liệu
- **FastAPI backend** làm lớp tích hợp, điều phối trạng thái chính sách, evidence, verification, drift và alert
- **React + Vite + TypeScript frontend** làm giao diện vận hành, trình diễn và đánh giá

Trọng tâm kỹ thuật hiện tại của sản phẩm là:

- **thực thi thực dụng theo hướng OVS-direct**
- **tích hợp dữ liệu từ OpenDaylight qua RESTCONF**
- **quản lý policy object**
- **evidence và verification**
- **đánh giá compliance và drift**
- **alerting, metrics, audit replay**
- **lớp hỗ trợ thuyết trình/defense**

Sản phẩm **không tuyên bố** các khả năng chưa được hiện thực như full NETCONF multi-vendor, full controller-only enforcement, ODL clustering, full gNMI/OpenConfig stack hay nền tảng cloud-native hoàn chỉnh.

## Bài toán và định vị sản phẩm

Trong nhiều bài thực hành SDN, sinh viên thường dừng ở mức:

- xem topology
- đẩy một vài flow rule
- chụp ảnh màn hình controller
- mô tả tình huống theo kiểu minh họa

Cách tiếp cận đó chưa đủ để thể hiện một **sản phẩm quản trị SDN** có logic vận hành rõ ràng. Đồ án này giải bài toán theo hướng:

1. Biểu diễn ý định quản trị dưới dạng **policy object**
2. Cho phép **apply / verify / rollback / recover**
3. Thu thập **evidence** và đánh giá **compliance**
4. Tạo **drift summary**, **alert**, **metrics** và **audit replay**
5. Cung cấp giao diện **defense-ready** để trình bày một câu chuyện kỹ thuật hoàn chỉnh

Vì vậy, sản phẩm này không chỉ là giao diện xem controller, mà là một lớp quản trị có khả năng kể được câu chuyện vận hành: **ý định -> thực thi -> bằng chứng -> xác minh -> sai lệch -> cảnh báo -> phục hồi -> truy vết**.

## Kiến trúc tổng quát

### 1. Mặt phẳng dữ liệu và thực nghiệm

- **Mininet** tạo topo thực nghiệm
- **Open vSwitch** làm switch thực tế
- Các thao tác thực thi policy chính trong phiên bản hiện tại đi theo hướng **OVS-direct**

### 2. Mặt phẳng điều khiển và dữ liệu điều khiển

- **OpenDaylight Vanadium / Karaf**
- Kết nối **RESTCONF** qua northbound API
- Vai trò chính hiện tại:
  - cung cấp topology summary
  - cung cấp inventory node / connector
  - cung cấp controller-side flow visibility
  - cung cấp nguồn dữ liệu cho các trang Topology, Inventory, Model Viewer và một phần Dashboard

### 3. Backend tích hợp

- **FastAPI**
- Vai trò:
  - hợp nhất dữ liệu từ ODL và OVS
  - duy trì trạng thái policy center
  - lưu event log, evidence, verification history
  - tính drift summary
  - hỗ trợ alert inputs, metrics inputs và audit replay

### 4. Frontend vận hành

- **React + Vite + TypeScript**
- Vai trò:
  - giao diện operator-console
  - điều hướng các trang quản trị
  - trình bày evidence, verification, metrics, timeline
  - hỗ trợ Defense Mode và Presenter Overlay

## Các mô-đun đã hiện thực

### Dashboard

Điểm vào chính cho phiên defense/demo, tổng hợp health, controller reachability, policy summary, drift, alert, live evidence, **Final Defense Pack** và runbook thao tác.

### Policy Center

Trung tâm chính sách với policy inventory, desired/live state, compliance, preview, apply, verify, rollback, evidence workspace, comparison, report và event history.

### Demo Assistant

Lớp hỗ trợ trình diễn với các kịch bản:

- Baseline
- Ping Block Demo
- HTTP Block Demo
- Host Isolation Demo

### Flows

Quan sát flow table từ hai góc nhìn:

- controller-reported flows qua OpenDaylight
- OVS live flow dump trên switch thực nghiệm

### Topology

Tổng hợp node, link, attachment context và topology summary từ controller.

### Inventory

Hiển thị inventory node, connector state, thông tin interface/counter từ dữ liệu controller.

### Model Viewer v2

Trang **NETCONF / YANG-lite Viewer** ở chế độ **read-only**, thể hiện model snapshot theo kiểu **partial model projection** dựa trên dữ liệu controller/device hiện có. Đây **không phải** full NETCONF/YANG datastore manager.

### Alert Center

Trung tâm cảnh báo/fault dựa trên:

- policy drift
- evidence gaps
- controller health
- demo status
- inventory / OVS signals

### Metrics Center

Lớp đánh giá định lượng hệ thống, gồm compliance rate, drift rate, evidence coverage, verification coverage, alert count và readiness snapshot.

### Operations Timeline / Audit Replay

Dòng thời gian vận hành, cho phép nhìn lại:

- policy apply / verify / rollback
- evidence observed
- drift / alert signals
- recovery context

### Defense Mode và Presenter Overlay / Demo Director

Lớp hỗ trợ bảo vệ/demo giúp giảm thao tác thừa, mở nhanh các scene, hiển thị cue thuyết trình, readiness checklist và quick actions.

### Policy Template Builder

Đã được tích hợp vào Policy Center dưới dạng **template-aware policy creation** ở mức giới hạn và an toàn. Tuy nhiên giao diện builder được **gate theo backend capability**. Nếu deployment hiện tại không expose template endpoints tương ứng thì builder chỉ hiển thị trạng thái unavailable, không giả lập khả năng tạo policy live.

## Điểm nhấn kỹ thuật chính

- Thực thi policy **OVS-direct** để bảo đảm tính thực dụng trong môi trường Mininet + OVS
- Tích hợp **ODL RESTCONF** làm nguồn topology/inventory/controller visibility
- Mô hình **policy object** với desired state, live state, compliance, evidence, verification
- **Drift summary** và **alert synthesis** để lượng hóa sai lệch vận hành
- **Metrics Center** để chứng minh hệ thống có khả năng đánh giá chứ không chỉ thao tác
- **Operations Timeline / Audit Replay** để kể câu chuyện vận hành theo thời gian
- **Model Viewer v2** theo hướng **YANG-lite**, read-only, honest about partiality
- **Presenter Overlay / Demo Director** để hỗ trợ trình bày đồ án mạch lạc

## Công nghệ sử dụng

- Ubuntu 24.04.4
- OpenDaylight Vanadium / Karaf
- Mininet
- Open vSwitch
- FastAPI
- React
- Vite
- TypeScript
- RESTCONF

## Cấu trúc thư mục chính

```text
backend/
  app/
    api/routes/
    services/
    models/
  data/

frontend/
  src/
    app/
    components/
    pages/
    services/
    types/

docs/
  ARCHITECTURE_OVERVIEW.md
  FUNCTIONAL_ARCHITECTURE.md
  CONTROL_FLOW_AND_DATA_FLOW.md
  DEMO_FLOW.md
  PROJECT2_REPORT.md
  FUTURE_WORK.md
  PRODUCT_STORY.md
```

## Cách chạy

### 1. Chuẩn bị hạ tầng thực nghiệm

- Ubuntu 24.04.4
- OpenDaylight Vanadium / Karaf đang chạy
- Mininet + Open vSwitch đã khởi tạo topology thực nghiệm

### 2. Chạy backend

Repo hiện tại **chưa chuẩn hóa file `requirements.txt`**, nên backend đang được vận hành bằng môi trường `.venv` có sẵn trong cây mã nguồn. Các gói chính đã được sử dụng thực tế gồm:

- `fastapi`
- `uvicorn`
- `requests`
- `python-dotenv`
- `pydantic`

Thiết lập biến môi trường trong `backend/.env` theo deployment thực tế, tối thiểu gồm:

- `ODL_BASE_URL`
- `ODL_USERNAME`
- `ODL_PASSWORD`
- `ODL_TOPOLOGY_ID`

Chạy backend:

```bash
cd backend
./.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Chạy frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend mặc định gọi backend tại:

```text
http://127.0.0.1:8000
```

Có thể đổi qua:

```bash
VITE_API_BASE_URL=http://<backend-host>:8000
```

### 4. Kiểm tra nhanh

- Mở `http://127.0.0.1:5173`
- Kiểm tra Dashboard
- Kiểm tra Policy Center
- Kiểm tra Flows và OVS live evidence
- Kiểm tra Metrics Center và Operations Timeline

## Luồng demo đề xuất

1. Vào **Dashboard** để giới thiệu trạng thái tổng thể
2. Mở **Policy Center** để giải thích policy object, desired/live/compliance
3. Chạy một kịch bản ở **Demo Assistant** hoặc thao tác trực tiếp trong Policy Center
4. Mở **Flows** để chứng minh enforcement trên OVS
5. Mở **Metrics Center** để chứng minh khả năng đo lường
6. Mở **Operations Timeline** để chứng minh khả năng audit replay
7. Mở **Model Viewer** để giải thích định hướng model-driven, nhưng nhấn mạnh trạng thái hiện tại là read-only và partial
8. Nếu cần, bật **Defense Mode / Presenter Overlay** để trình bày mạch lạc hơn

## Hạn chế hiện tại

- Thực thi live hiện tại tập trung vào **OVS-direct**, chưa phải controller-only flow programming hoàn chỉnh
- OpenDaylight hiện đóng vai trò **data/control visibility integration**, không phải toàn bộ lớp thực thi policy duy nhất
- **Model Viewer** mới ở mức **YANG-lite**, read-only, partial snapshot
- **Policy Template Builder** chỉ hỗ trợ phạm vi hẹp và còn **phụ thuộc backend capability**
- Chưa có full NETCONF multi-vendor
- Chưa có full gNMI/OpenConfig stack
- Chưa có ODL clustering
- Chưa có kiến trúc cloud-native/Kubernetes production-grade

## Hướng phát triển

- Chuẩn hóa capability layer giữa frontend và backend
- Mở rộng model-driven management theo hướng read-only -> richer projection
- Tăng chiều sâu cho session report/export
- Nghiên cứu controller-side execution ở phạm vi hẹp và có kiểm chứng
- Cân nhắc extension nhỏ phía ODL khi bài toán thực sự yêu cầu

Chi tiết xem thêm ở [docs/FUTURE_WORK.md](/home/hung/sdn-app/docs/FUTURE_WORK.md).

## Vì sao đây không chỉ là một demo nhỏ

Sản phẩm hiện tại đã có các đặc điểm vượt qua mức “demo flow rule” đơn lẻ:

- có lớp **policy object** và vòng đời chính sách
- có **evidence** và **verification history**
- có **drift** và **alert**
- có **metrics** và **audit replay**
- có **giao diện vận hành** với nhiều trung tâm chức năng rõ ràng
- có **lớp hỗ trợ defense/presenter**

Điểm cốt lõi là sản phẩm không chỉ “điều khiển được”, mà còn **đo lường được**, **giải thích được** và **truy vết được**.

## Screenshot placeholders

Có thể bổ sung ảnh chụp các màn hình sau vào báo cáo hoặc README:

- Dashboard
- Policy Center
- Flows
- Model Viewer
- Alert Center
- Metrics Center
- Operations Timeline
- Presenter Overlay / Defense Mode

## Tài liệu bổ sung

- [Kiến trúc tổng thể](/home/hung/sdn-app/docs/ARCHITECTURE_OVERVIEW.md)
- [Kiến trúc chức năng](/home/hung/sdn-app/docs/FUNCTIONAL_ARCHITECTURE.md)
- [Luồng điều khiển và dữ liệu](/home/hung/sdn-app/docs/CONTROL_FLOW_AND_DATA_FLOW.md)
- [Kịch bản demo](/home/hung/sdn-app/docs/DEMO_FLOW.md)
- [Bản thảo báo cáo Project 2](/home/hung/sdn-app/docs/PROJECT2_REPORT.md)
- [Định hướng phát triển](/home/hung/sdn-app/docs/FUTURE_WORK.md)
- [Câu chuyện sản phẩm](/home/hung/sdn-app/docs/PRODUCT_STORY.md)
