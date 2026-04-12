# DEMO_RUNBOOK

## 1. Demo objective

- Quản trị mạng theo cách thủ công khó theo dõi trạng thái và khó xác nhận chính sách đã thực sự áp vào switch.
- Hệ thống SDN Management giúp quan sát topology, inventory, flow và policy trên một giao diện tập trung.
- Operator có thể bật/tắt policy nhanh, chạy demo scenario nhanh và phục hồi lab về baseline an toàn.
- Hệ thống không chỉ hiển thị trạng thái logic trên dashboard mà còn có evidence thật từ OVS.

## 2. Preconditions

- OpenDaylight đang chạy ổn định.
- Backend FastAPI đang chạy.
- Frontend React đang chạy.
- Mininet đang chạy với topology lab hiện tại.
- Baseline lab reachable, `pingall` đang thông.

## 3. Demo sequence

### Step 1: Baseline

- What to click: `Dashboard` → `Recover Baseline`
- What to say: "Tôi đưa lab về trạng thái chuẩn, mọi host có thể liên lạc bình thường."
- What evidence to show: `Current Policy Status`, `Active Policy Inventory`, `Live Enforcement Evidence`, `OVS Live Flows`
- Expected result: Base Forwarding bật, các policy khác tắt, policy flow trên switch về 0 hoặc chỉ còn base flow

### Step 2: Ping Block Demo

- What to click: `Demo Scenarios` → `Ping Block Demo`
- What to say: "Tôi chặn ICMP giữa hai host nhưng không chặn toàn bộ traffic."
- What evidence to show: Dashboard báo `Block Ping = Enabled`, `Live Enforcement Evidence` có policy flow ping, `OVS Live Flows` có label `Block Ping`
- Expected result: `ping` hoặc `pingall` fail theo hướng mong muốn, nhưng baseline switching vẫn còn

### Step 3: HTTP Block Demo

- What to click: `Demo Scenarios` → `HTTP Block Demo`
- What to say: "Tôi chặn TCP port 80 để mô phỏng policy hạn chế dịch vụ web."
- What evidence to show: Dashboard báo `Block HTTP = Enabled`, `Live Enforcement Evidence` có flow HTTP, `OVS Live Flows` có label `Block HTTP`
- Expected result: `wget` hoặc request HTTP không thành công, nhưng traffic khác không nhất thiết bị chặn

### Step 4: Host Isolation Demo

- What to click: `Demo Scenarios` → `Host Isolation Demo`
- What to say: "Tôi cô lập trao đổi IPv4 giữa hai host để mô phỏng kiểm soát phân đoạn mạng."
- What evidence to show: Dashboard báo `Isolate H1 = Enabled`, `Live Enforcement Evidence` có flow isolation, `OVS Live Flows` có label `Isolate H1`
- Expected result: lưu lượng IPv4 giữa h1 và h2 bị deny rõ ràng

### Step 5: Recover to Baseline

- What to click: `Dashboard` → `Recover Baseline`
- What to say: "Sau khi áp policy, hệ thống có thể phục hồi nhanh về trạng thái vận hành chuẩn."
- What evidence to show: `Current Policy Status`, `Live Enforcement Evidence`, `Operation Log`, `pingall`
- Expected result: các policy tắt, base forwarding bật, kết nối được khôi phục

## 4. Evidence checklist

- Dashboard policy status
- Live Enforcement Evidence
- OVS Live Flows
- `pingall` / `wget` result
- Operation Log

## 5. Recovery checklist

- Nếu state bị lệch, bấm `Recover Baseline`
- Refresh Dashboard
- Refresh `Live Enforcement Evidence`
- Refresh `OVS Live Flows`
- Chạy lại `pingall` để xác nhận baseline

## 6. Short thesis talking points

- Hệ thống gom quan sát và điều khiển về một operator console
- Policy không chỉ là trạng thái UI, có evidence thật từ OVS
- Demo có cả apply, verify và recover
- Flow inspection giúp giải thích vì sao traffic bị chặn
- Operation Log hỗ trợ theo dõi thao tác của operator
- Scenario button rút ngắn thời gian thao tác khi demo
- Recovery nhanh giúp hệ thống thực dụng hơn khi vận hành
- Kiến trúc tách frontend, backend và switch enforcement rõ ràng
