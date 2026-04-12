# DEMO_STARTUP_CHECKLIST

## 1. Bring-up order

1. OpenDaylight
2. Backend
3. Frontend
4. Mininet

## 2. Exact startup commands

### OpenDaylight

```bash
cd ~/sdn/karaf-0.23.0
./bin/karaf
```

### Backend

```bash
cd ~/sdn-app/backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd ~/sdn-app/frontend
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24
export VITE_API_BASE_URL=http://192.168.1.4:8000
npm run dev -- --host 0.0.0.0
```

### Mininet

```bash
sudo mn -c
sudo mn --controller=remote,ip=127.0.0.1,port=6653 --switch ovs,protocols=OpenFlow10 --topo single,2
```

## 3. 60-second smoke test

- Mở Dashboard
- Check health hiển thị `OK`
- Check policy status load được
- Bấm `Recover Baseline`
- Trong Mininet chạy `pingall`
- Expected: `0% dropped`

## 4. Fast recovery commands

- Nếu lệch state:
  - bấm `Recover Baseline`
  - refresh Dashboard
  - refresh OVS flows
- Nếu cần verify bằng terminal:

```bash
curl -s -X POST http://127.0.0.1:8000/api/policies/demo/recover-baseline
curl -s http://127.0.0.1:8000/api/policies/demo/block-ping/status
sudo ovs-ofctl -O OpenFlow10 dump-flows s1
```

## 5. Expected baseline evidence

- Base Forwarding = Enabled
- Ping / HTTP / Isolation = Disabled
- OVS flow có `0x1001`
- Không còn policy flow
- `pingall` success

## 6. Demo-day notes

- Dùng Chrome fullscreen
- Mở sẵn Dashboard + Flows + terminal Mininet
- Nếu lệch state thì recover trước rồi mới nói tiếp
