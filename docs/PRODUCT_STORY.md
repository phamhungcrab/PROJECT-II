# Câu chuyện sản phẩm SDN Management

## Sản phẩm này là gì

Đây là một sản phẩm quản trị SDN phục vụ đồ án tốt nghiệp, được xây dựng để chứng minh rằng một hệ thống SDN không chỉ cần điều khiển được mạng, mà còn phải:

- biểu diễn được ý định quản trị
- thu được bằng chứng thực thi
- xác minh được trạng thái
- phát hiện được sai lệch
- lượng hóa được mức độ sẵn sàng
- kể lại được câu chuyện vận hành

Sản phẩm hiện thực hóa điều đó bằng một tổ hợp các trung tâm chức năng như Dashboard, Policy Center, Flows, Alert Center, Metrics Center, Operations Timeline và Model Viewer.

## Điều gì làm sản phẩm khác với một demo nhỏ

Nhiều demo SDN chỉ dừng ở việc:

- hiển thị topology
- xem inventory
- đẩy một số flow
- chụp ảnh trạng thái controller

Sản phẩm này đi xa hơn ở ba điểm:

### 1. Có policy object và vòng đời chính sách

Hệ thống không chỉ “ra lệnh” mà còn quản lý đối tượng chính sách với desired state, live state, compliance, evidence và verification.

### 2. Có vòng lặp vận hành hoàn chỉnh

Ý định quản trị được nối với apply, verify, drift, alert, recovery và report. Nhờ đó, operator có thể giải thích vì sao hệ thống kết luận một policy đang compliant hay không.

### 3. Có lớp đánh giá và trình bày

Metrics Center, Operations Timeline, Defense Mode và Presenter Overlay giúp hệ thống vừa có giá trị kỹ thuật, vừa có giá trị trình bày trong buổi bảo vệ.

## Câu chuyện vận hành mà sản phẩm kể

Nếu trình bày ngắn gọn, câu chuyện của sản phẩm là:

> Người vận hành xác lập ý định bằng policy object, hệ thống thực thi trên môi trường OVS thực nghiệm, thu evidence để verify, đánh giá compliance và drift, phát sinh alert khi có dấu hiệu bất thường, và lưu lại toàn bộ chuỗi hoạt động dưới dạng audit replay.

Đó là một câu chuyện “quản trị” hoàn chỉnh hơn rất nhiều so với việc chỉ nói rằng controller đang kết nối được với switch.

## Hướng phát triển mà sản phẩm đang đi tới

Sản phẩm không dừng ở policy và flow. Nó đang mở rộng dần theo hai hướng:

- **định lượng và truy vết**: metrics, timeline, alert, readiness
- **mô hình hóa trạng thái**: Model Viewer v2 theo hướng YANG-lite, read-only

Điều này cho thấy sản phẩm có định hướng tiến gần hơn tới một nền tảng SDN management sâu hơn trong tương lai.

## Điều gì đã được hiện thực

- Dashboard phục vụ góc nhìn tổng quan
- Policy Center phục vụ vòng đời policy
- Demo Assistant phục vụ kịch bản demo
- Flows, Topology, Inventory phục vụ quan sát
- Alert Center phục vụ fault view
- Metrics Center phục vụ evaluation view
- Operations Timeline phục vụ audit replay
- Model Viewer v2 phục vụ read-only model view
- Defense Mode và Presenter Overlay phục vụ bảo vệ

## Điều gì chưa nên nói quá

Sản phẩm hiện tại:

- **không** phải full NETCONF multi-vendor platform
- **không** phải full controller-only execution platform
- **không** phải writable YANG datastore manager
- **không** có ODL clustering
- **không** phải cloud-native production platform

Việc giữ sự trung thực này rất quan trọng vì nó làm cho giá trị hiện tại của sản phẩm rõ ràng và đáng tin hơn.

## Kết luận ngắn

SDN Management trong đồ án này là một sản phẩm thực dụng, có cấu trúc và có khả năng chứng minh giá trị kỹ thuật qua:

- điều khiển có tổ chức
- bằng chứng và xác minh
- đánh giá định lượng
- truy vết vận hành
- hỗ trợ trình bày defense

Đó là lý do nó vượt khỏi phạm vi của một bài demo SDN nhỏ và trở thành một nền tảng đồ án có định hướng phát triển tiếp.
