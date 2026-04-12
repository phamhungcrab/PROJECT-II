# SDN Management Dashboard Frontend

React + Vite frontend for the SDN graduation-project dashboard. The UI connects directly to the existing FastAPI backend and surfaces controller health, topology, inventory, and flow-table data from OpenDaylight, Mininet, and Open vSwitch.

## Local development

```bash
npm install
npm run dev
```

The frontend uses `http://127.0.0.1:8000` by default.

To override the backend URL:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

## Production build

```bash
npm run build
npm run preview
```
