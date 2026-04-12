# DEMO_SPEAKER_SCRIPT

## Opening

Trong vận hành mạng truyền thống, việc cấu hình và kiểm tra thủ công rất mất thời gian, khó theo dõi trạng thái thật của hệ thống. Đồ án này xây dựng một SDN Management console giúp quan sát topology, thao tác policy nhanh và phục hồi hệ thống dễ hơn. Điểm quan trọng là giao diện không chỉ hiển thị logic quản trị, mà còn cho thấy evidence thật từ flow trên OVS.

## Demo narration

### 1. Baseline

Tôi bấm `Recover Baseline`. Ở bước này tôi đưa lab về trạng thái chuẩn để mọi host liên lạc bình thường. Mọi người nhìn vào `Current Policy Status` và `Live Enforcement Evidence` để thấy chỉ còn trạng thái baseline.

### 2. Ping Block Demo

Tiếp theo tôi bấm `Ping Block Demo`. Ở đây hệ thống áp policy chặn ICMP giữa hai host. Mọi người nhìn vào `Active Policy Inventory`, `Live Enforcement Evidence` và kết quả `ping` để thấy policy đã có hiệu lực.

### 3. HTTP Block Demo

Bây giờ tôi bấm `HTTP Block Demo`. Mục tiêu là chặn lưu lượng TCP port 80. Mọi người nhìn vào `Live Enforcement Evidence`, `OVS Live Flows` và kết quả `wget` để thấy flow chặn HTTP đã nằm trên switch.

### 4. Host Isolation Demo

Tiếp theo tôi bấm `Host Isolation Demo`. Ở bước này hệ thống cô lập trao đổi IPv4 giữa hai host. Mọi người nhìn vào `Quick Live Verification`, `Active Policy Inventory` và các flow enforcement trên switch.

### 5. Recover Baseline

Cuối cùng tôi bấm lại `Recover Baseline`. Đây là bước recovery để đưa hệ thống về trạng thái vận hành an toàn. Mọi người nhìn vào `Operation Log`, `Policy Status` và kiểm tra kết nối để thấy trạng thái đã được phục hồi.

## Closing

Điểm chính của đồ án là hệ thống không chỉ quan sát mà còn có khả năng quản trị thật. Operator có thể áp policy, kiểm tra trạng thái và phục hồi hệ thống ngay trên một giao diện tập trung. Ngoài ra, mọi thay đổi đều có bằng chứng flow thật trên switch OVS. Đây là giá trị thực tế để hỗ trợ vận hành và demo SDN một cách rõ ràng, trực quan.
