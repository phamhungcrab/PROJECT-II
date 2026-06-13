SHELL := /bin/bash
.RECIPEPREFIX := >

SESSION := sdn

ODL_DIR := $(HOME)/sdn/karaf-0.23.0
BACKEND_DIR := $(HOME)/sdn-app/backend
FRONTEND_DIR := $(HOME)/sdn-app/frontend

.PHONY: start attach stop restart

start:
> @command -v tmux >/dev/null || { echo "Chưa có tmux. Cài bằng: sudo apt install tmux"; exit 1; }
> @sudo -v
> @tmux has-session -t $(SESSION) 2>/dev/null && { echo "SDN session đang chạy rồi. Dùng: make attach"; exit 0; } || true
> @tmux new-session -d -s $(SESSION) -n opendaylight 'cd $(ODL_DIR) && ./bin/karaf'
> @tmux new-window -t $(SESSION): -n backend 'cd $(BACKEND_DIR) && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload'
> @tmux new-window -t $(SESSION): -n frontend 'cd $(FRONTEND_DIR) && export NVM_DIR="$$HOME/.nvm" && [ -s "$$NVM_DIR/nvm.sh" ] && . "$$NVM_DIR/nvm.sh" && nvm use 24 && export VITE_API_BASE_URL=http://127.0.0.1:8000 && npm run dev -- --host 127.0.0.1 --port 5173 --strictPort'
> @tmux new-window -t $(SESSION): -n mininet 'sleep 30 && sudo mn -c && sudo mn --controller=remote,ip=127.0.0.1,port=6653 --switch ovs,protocols=OpenFlow10 --topo single,2'
> @tmux select-window -t $(SESSION):opendaylight
> @echo "Đã chạy SDN stack."
> @echo "Xem các terminal bằng: make attach"

attach:
> @tmux attach -t $(SESSION)

stop:
> @tmux kill-session -t $(SESSION) 2>/dev/null || true
> @sudo mn -c || true
> @echo "Đã dừng SDN stack."

restart: stop start
